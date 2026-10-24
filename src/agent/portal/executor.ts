// Playwright executor for the portal agent: one headless chromium per session, an origin allowlist,
// and the click policy enforced in code (the agent can never click Submit).
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import path from "node:path";
import {
  AGENT_CLICKABLE_IDS,
  BLOCKED_CLICK_RE,
  BLOCKED_IDS,
  PORTAL_IDS,
  PORTAL_PATH,
  VALUE_FIELD_IDS,
  type FieldDiff,
} from "./types";

const SESSION_TTL_MS = 15 * 60 * 1000;
const VIEWPORT = { width: 1280, height: 800 } as const;
const JPEG_QUALITY = 70;
const ACTION_TIMEOUT_MS = 5000;
const PAGE_TEXT_LIMIT = 3000;
const SAFE_ID_RE = /^[A-Za-z0-9_\-:.]{1,80}$/;

export type SessionStatus = "running" | "ready_to_submit" | "submitted" | "closed";

export interface PortalSession {
  id: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  origin: string;
  packetPath: string;
  createdAt: number;
  timer: ReturnType<typeof setTimeout>;
  status: SessionStatus;
  expected: Record<string, string> | null;
  diff: FieldDiff[] | null;
  /** Navigations the route guard refused (shown to the model as errors). */
  refusedNavigations: string[];
}

type SessionStore = { __kcPortalSessions?: Map<string, PortalSession> };
function sessions(): Map<string, PortalSession> {
  const g = globalThis as SessionStore;
  if (!g.__kcPortalSessions) g.__kcPortalSessions = new Map();
  return g.__kcPortalSessions;
}

/** Only the app's own origin, and only /portal-demo paths for top-level documents. */
export function isAllowedNavigation(url: string, origin: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (u.origin !== origin) return false;
  return u.pathname === PORTAL_PATH || u.pathname.startsWith(`${PORTAL_PATH}/`);
}

export async function openPortalSession(opts: {
  sessionId: string;
  baseUrl: string;
  packetPath: string;
}): Promise<PortalSession> {
  await closePortalSession(opts.sessionId);
  const origin = new URL(opts.baseUrl).origin;
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, acceptDownloads: false });
    const page = await context.newPage();
    page.setDefaultTimeout(ACTION_TIMEOUT_MS);
    const refusedNavigations: string[] = [];

    await context.route("**/*", async (route) => {
      const req = route.request();
      let reqOrigin: string;
      try {
        reqOrigin = new URL(req.url()).origin;
      } catch {
        return route.abort("blockedbyclient");
      }
      if (reqOrigin !== origin) {
        if (req.isNavigationRequest()) refusedNavigations.push(req.url());
        return route.abort("blockedbyclient");
      }
      if (req.isNavigationRequest() && req.frame() === page.mainFrame() && !isAllowedNavigation(req.url(), origin)) {
        refusedNavigations.push(req.url());
        return route.abort("blockedbyclient");
      }
      return route.continue();
    });
    // No popups: any second page is closed immediately.
    context.on("page", (p) => {
      if (p !== page) void p.close();
    });
    page.on("dialog", (d) => void d.dismiss());

    const startUrl = new URL(PORTAL_PATH, origin).toString() + new URL(opts.baseUrl).search;
    await page.goto(startUrl, { waitUntil: "domcontentloaded" });

    const timer = setTimeout(() => void closePortalSession(opts.sessionId), SESSION_TTL_MS);
    if (typeof timer === "object" && "unref" in timer) timer.unref();
    const session: PortalSession = {
      id: opts.sessionId,
      browser,
      context,
      page,
      origin,
      packetPath: path.resolve(opts.packetPath),
      createdAt: Date.now(),
      timer,
      status: "running",
      expected: null,
      diff: null,
      refusedNavigations,
    };
    sessions().set(opts.sessionId, session);
    return session;
  } catch (err) {
    await browser.close().catch(() => undefined);
    throw err;
  }
}

export function getPortalSession(sessionId: string): PortalSession | undefined {
  return sessions().get(sessionId);
}

export async function closePortalSession(sessionId: string): Promise<void> {
  const s = sessions().get(sessionId);
  if (!s) return;
  sessions().delete(sessionId);
  clearTimeout(s.timer);
  s.status = s.status === "submitted" ? "submitted" : "closed";
  await s.browser.close().catch(() => undefined);
}

export async function screenshotJpeg(page: Page): Promise<string> {
  const buf = await page.screenshot({ type: "jpeg", quality: JPEG_QUALITY });
  return buf.toString("base64");
}

export function byId(id: string): string {
  if (!SAFE_ID_RE.test(id)) throw new PortalToolError(`Invalid element id "${id}".`);
  return `[id=${JSON.stringify(id)}]`;
}

/** A tool failure the model reads as an is_error tool_result. */
export class PortalToolError extends Error {}

export type ElementInfo = {
  id: string;
  tag: string;
  type: string;
  text: string;
  name: string;
  ariaLabel: string;
  value: string;
  title: string;
  /** True for inputs/selects/textareas/labels that are not buttons. */
  isFormField: boolean;
};

export const BLOCK_MESSAGE =
  "Blocked by KeepCovered policy: the agent may only fill fields and press Next/Continue/Back. " +
  "Submitting, signing or confirming is done only by the human. When the Review page is showing, call request_human_submit with a short summary.";

/** Returns an error message if the agent may not click this element, else null. */
export function clickPolicyViolation(el: ElementInfo): string | null {
  const labels = [el.id, el.text, el.name, el.ariaLabel, el.value, el.title];
  if (BLOCKED_IDS.has(el.id) || labels.some((l) => BLOCKED_CLICK_RE.test(l))) {
    return `${BLOCK_MESSAGE} (refused: ${describe(el)})`;
  }
  if (el.isFormField) return null;
  if (!AGENT_CLICKABLE_IDS.has(el.id)) {
    return `${BLOCK_MESSAGE} (refused: ${describe(el)} is not an allowed navigation button)`;
  }
  return null;
}

function describe(el: ElementInfo): string {
  const label = (el.text || el.ariaLabel || el.value || el.name).slice(0, 60);
  return `${el.tag}${el.id ? `#${el.id}` : ""} "${label}"`;
}

/**
 * Reads the clickable element at a selector (or the nearest clickable ancestor).
 * Runs in the page; returns plain strings only.
 */
export async function elementInfo(page: Page, selector: string): Promise<ElementInfo | null> {
  return page.evaluate((sel) => {
    const raw = document.querySelector(sel);
    if (!raw) return null;
    const el = (raw.closest("button,a,[role=button],input,select,textarea,label") ?? raw) as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute("type") ?? "").toLowerCase();
    const isButtonInput = tag === "input" && ["submit", "button", "reset", "image"].includes(type);
    const isFormField = (["input", "select", "textarea", "label"].includes(tag) && !isButtonInput);
    return {
      id: el.id ?? "",
      tag,
      type,
      text: (el.innerText ?? el.textContent ?? "").trim().slice(0, 200),
      name: el.getAttribute("name") ?? "",
      ariaLabel: el.getAttribute("aria-label") ?? "",
      value: isButtonInput ? ((el as HTMLInputElement).value ?? "") : "",
      title: el.getAttribute("title") ?? "",
      isFormField,
    };
  }, selector);
}

/** Same as elementInfo, for the element under a viewport point. */
export async function elementInfoAtPoint(page: Page, x: number, y: number): Promise<ElementInfo | null> {
  const marker = await page.evaluate(
    ({ px, py }) => {
      const el = document.elementFromPoint(px, py);
      if (!el) return null;
      el.setAttribute("data-kc-probe", "1");
      return true;
    },
    { px: x, py: y },
  );
  if (!marker) return null;
  try {
    return await elementInfo(page, "[data-kc-probe]");
  } finally {
    await page.evaluate(() => document.querySelectorAll("[data-kc-probe]").forEach((n) => n.removeAttribute("data-kc-probe")));
  }
}

export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.waitForTimeout(150);
}

/** Clicks an element by id for the AGENT path: policy-checked. */
export async function agentClick(session: PortalSession, elementId: string): Promise<string> {
  const sel = byId(elementId);
  const info = await elementInfo(session.page, sel);
  if (!info) throw new PortalToolError(`No element with id "${elementId}" on this page. Call read_page.`);
  const violation = clickPolicyViolation(info);
  if (violation) throw new PortalToolError(violation);
  const before = session.refusedNavigations.length;
  await session.page.locator(sel).first().click({ timeout: ACTION_TIMEOUT_MS });
  await settle(session.page);
  if (session.refusedNavigations.length > before) {
    throw new PortalToolError("Navigation refused: only this county portal (/portal-demo) may be opened.");
  }
  return `Clicked ${elementId}.`;
}

export async function fillField(session: PortalSession, fieldId: string, value: string): Promise<string> {
  const loc = session.page.locator(byId(fieldId)).first();
  if ((await loc.count()) === 0) throw new PortalToolError(`No field with id "${fieldId}" on this page. Call read_page.`);
  const tag = await loc.evaluate((el) => `${el.tagName.toLowerCase()}:${(el.getAttribute("type") ?? "").toLowerCase()}`);
  if (tag === "select:") await loc.selectOption(value);
  else if (tag.startsWith("input:") || tag.startsWith("textarea:")) {
    if (["input:file", "input:submit", "input:button", "input:checkbox", "input:radio"].includes(tag)) {
      throw new PortalToolError(`"${fieldId}" is not a text field.`);
    }
    await loc.fill(value);
  } else throw new PortalToolError(`"${fieldId}" is not a form field.`);
  return `Filled ${fieldId}.`;
}

export async function uploadPacket(session: PortalSession, fieldId: string): Promise<string> {
  const loc = session.page.locator(byId(fieldId)).first();
  if ((await loc.count()) === 0) throw new PortalToolError(`No file input with id "${fieldId}" on this page.`);
  const isFile = await loc.evaluate((el) => el.tagName === "INPUT" && (el as HTMLInputElement).type === "file");
  if (!isFile) throw new PortalToolError(`"${fieldId}" is not a file input.`);
  await loc.setInputFiles(session.packetPath);
  await settle(session.page);
  return `Uploaded ${path.basename(session.packetPath)} to ${fieldId}.`;
}

export type PageSnapshot = {
  url: string;
  title: string;
  headings: string[];
  fields: { id: string; label: string; type: string; value: string }[];
  buttons: { id: string; text: string; allowed: boolean }[];
  on_review_page: boolean;
  untrusted_page_text: string;
};

export async function readPage(session: PortalSession): Promise<PageSnapshot> {
  const raw = await session.page.evaluate(
    ({ limit, submitId }) => {
      const visible = (el: Element) => {
        const h = el as HTMLElement;
        const r = h.getBoundingClientRect();
        const st = getComputedStyle(h);
        return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none";
      };
      const labelFor = (el: HTMLElement) => {
        const byFor = el.id ? document.querySelector(`label[for=${JSON.stringify(el.id)}]`) : null;
        return ((byFor as HTMLElement | null)?.innerText ?? el.getAttribute("aria-label") ?? "").trim();
      };
      const fields = Array.from(document.querySelectorAll("input,select,textarea"))
        .filter((e) => visible(e) || (e as HTMLInputElement).type === "file")
        .map((e) => {
          const h = e as HTMLInputElement;
          const type = h.tagName === "INPUT" ? h.type : h.tagName.toLowerCase();
          return { id: h.id, label: labelFor(h), type, value: type === "file" ? (h.files?.[0]?.name ?? "") : h.value };
        })
        .filter((f) => !["submit", "button", "reset", "image"].includes(f.type));
      const buttons = Array.from(document.querySelectorAll("button,a,[role=button],input[type=submit],input[type=button]"))
        .filter(visible)
        .map((e) => {
          const h = e as HTMLElement;
          return {
            id: h.id,
            text: ((h.innerText || (h as HTMLInputElement).value || h.getAttribute("aria-label")) ?? "").trim().slice(0, 80),
            name: h.getAttribute("name") ?? "",
            ariaLabel: h.getAttribute("aria-label") ?? "",
            title: h.getAttribute("title") ?? "",
          };
        });
      const headings = Array.from(document.querySelectorAll("h1,h2,h3"))
        .filter(visible)
        .map((h) => (h as HTMLElement).innerText.trim());
      const submit = document.getElementById(submitId);
      return {
        url: location.href,
        title: document.title,
        headings,
        fields,
        buttons,
        on_review_page: Boolean(submit && visible(submit)),
        text: (document.body?.innerText ?? "").slice(0, limit),
      };
    },
    { limit: PAGE_TEXT_LIMIT, submitId: PORTAL_IDS.submit },
  );
  return {
    url: raw.url,
    title: raw.title,
    headings: raw.headings,
    fields: raw.fields,
    buttons: raw.buttons.map((b) => ({
      id: b.id,
      text: b.text,
      allowed:
        clickPolicyViolation({ ...b, tag: "button", type: "", value: "", isFormField: false }) === null,
    })),
    on_review_page: raw.on_review_page,
    untrusted_page_text: raw.text,
  };
}

export type FormReadback = Record<string, { input: string | null; review: string | null }>;

/** Code reads back every value field (input value and Review-page text) plus the uploaded file name. */
export async function readFormValues(page: Page): Promise<FormReadback> {
  return page.evaluate(
    ({ ids, prefix, fileId }) => {
      const out: Record<string, { input: string | null; review: string | null }> = {};
      const read = (id: string) => {
        const input = document.getElementById(id) as HTMLInputElement | null;
        const review = document.getElementById(prefix + id);
        let inputVal: string | null = null;
        if (input && "value" in input) {
          inputVal = input.type === "file" ? (input.files?.[0]?.name ?? "") : String(input.value);
        }
        out[id] = { input: inputVal, review: review ? (review.textContent ?? "").trim() : null };
      };
      ids.forEach(read);
      read(fileId);
      return out;
    },
    { ids: VALUE_FIELD_IDS as string[], prefix: PORTAL_IDS.reviewPrefix, fileId: PORTAL_IDS.fileInput },
  );
}

export async function isOnReviewPage(page: Page): Promise<boolean> {
  return page.locator(byId(PORTAL_IDS.submit)).first().isVisible().catch(() => false);
}
