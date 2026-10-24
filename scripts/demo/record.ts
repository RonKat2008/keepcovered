// Records the backup demo video (Spanish, phone viewport) plus a short desktop trace clip.
//   npx tsx scripts/demo/record.ts            (app must already be running)
// Env: BASE_URL (default http://localhost:3100), OUT_DIR (default docs/demo)
import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const OUT = path.resolve(process.env.OUT_DIR ?? path.join(__dirname, "../../docs/demo"));
const TMP = path.join(OUT, ".tmp");
const T0 = Date.now();
const log = (m: string) => process.stdout.write(`[${((Date.now() - T0) / 1000).toFixed(1)}s] ${m}\n`);
const pause = (page: Page, ms: number) => page.waitForTimeout(ms);

const CURSOR_JS = `(() => {
  const mk = () => {
    if (document.getElementById('demo-cursor') || !document.body) return;
    const c = document.createElement('div');
    c.id = 'demo-cursor';
    c.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M5 3L19 12L12 13L9 20L5 3Z" fill="white" stroke="black" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    c.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;left:215px;top:700px;transition:left .08s linear,top .08s linear;filter:drop-shadow(1px 2px 3px rgba(0,0,0,.4))';
    document.body.appendChild(c);
    document.addEventListener('mousemove', e => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    document.addEventListener('mousedown', e => {
      const r = document.createElement('div');
      r.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;width:44px;height:44px;border-radius:50%;border:3px solid rgba(255,255,255,.9);background:rgba(30,80,200,.35);transform:translate(-50%,-50%) scale(.4);opacity:1;transition:transform .45s ease-out,opacity .45s ease-out;left:'+e.clientX+'px;top:'+e.clientY+'px';
      document.body.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = 'translate(-50%,-50%) scale(1.3)'; r.style.opacity = '0'; });
      setTimeout(() => r.remove(), 600);
    }, true);
  };
  if (document.body) mk(); else document.addEventListener('DOMContentLoaded', mk);
  document.addEventListener('readystatechange', mk);
  setInterval(mk, 500);
})();`;

/** Glide the cursor to the element's centre, then click it. */
async function tap(page: Page, loc: Locator, label: string, after = 900, fast = false): Promise<void> {
  await loc.waitFor({ state: "visible", timeout: 30_000 });
  for (let i = 0; i < 120 && !(await loc.isEnabled()); i++) await pause(page, 250);
  await loc.scrollIntoViewIfNeeded();
  await pause(page, fast ? 60 : 350);
  const box = await loc.boundingBox();
  if (!box) throw new Error(`no box for ${label}`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: fast ? 5 : 18 });
  await pause(page, fast ? 60 : 350);
  await loc.click({ timeout: 10_000 });
  log(`tap: ${label}`);
  await pause(page, after);
}

async function smoothScrollTo(page: Page, loc: Locator, block: "start" | "center" = "center"): Promise<void> {
  await loc.evaluate((el, b) => el.scrollIntoView({ behavior: "smooth", block: b as ScrollLogicalPosition }), block);
  await pause(page, 1600);
}

async function newCtx(browser: Browser, phone: boolean): Promise<BrowserContext> {
  const ctx = await browser.newContext(
    phone
      ? {
          viewport: { width: 430, height: 932 },
          deviceScaleFactor: 2,
          recordVideo: { dir: TMP, size: { width: 860, height: 1864 } },
          locale: "es-US",
        }
      : {
          viewport: { width: 1280, height: 800 },
          recordVideo: { dir: TMP, size: { width: 1280, height: 800 } },
          locale: "es-US",
        },
  );
  await ctx.addInitScript(CURSOR_JS);
  return ctx;
}

async function runQuestions(page: Page): Promise<void> {
  const heading = page.getByTestId("result-heading");
  let answeredVenmo = false;
  let usedAll = false;
  for (let i = 0; i < 240 && !(await heading.isVisible().catch(() => false)); i++) {
    const dialog = page.getByRole("dialog");
    if (await dialog.isVisible().catch(() => false)) {
      await pause(page, 1800); // let the viewer read the question
      const title = (await page.locator("#question-title").textContent().catch(() => "")) ?? "";
      const all = page.getByTestId("answer-all");
      if (!usedAll && (await all.isVisible().catch(() => false))) {
        await tap(page, all, "all DoorDash: yes", 1800);
        usedAll = true;
      } else if (/venmo|\$\s?85/i.test(title) || (await dialog.innerText()).match(/venmo/i)) {
        const no = dialog.locator("[data-option]").filter({ hasText: /^\s*no\b/i }).first();
        const target = (await no.count()) ? no : dialog.locator("[data-option]").last();
        await tap(page, target, `Venmo: ${title.slice(0, 40)}`, 1800);
        answeredVenmo = true;
      } else {
        await tap(page, dialog.locator("[data-option]").first(), `answer: ${title.slice(0, 40)}`, 1800);
      }
    }
    await pause(page, 400);
  }
  log(`questions done (usedAll=${usedAll}, venmo=${answeredVenmo})`);
}

async function phoneClip(browser: Browser): Promise<{ caseId: string; video: string }> {
  const ctx = await newCtx(browser, true);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => log(`pageerror: ${e.message}`));

  // 1. Hero
  await page.goto(`${BASE}/?lang=es`);
  await page.locator("h1").waitFor();
  log("hero");
  await pause(page, 3200);

  // 2. Demo documents, steps, questionnaire
  await tap(page, page.getByTestId("use-demo"), "Probar con documentos de ejemplo", 1200);
  await smoothScrollTo(page, page.getByRole("button", { name: "Seguir" }).first());
  await pause(page, 2500); // show the real document stack
  await tap(page, page.getByRole("button", { name: "Seguir" }).first(), "Seguir (docs)", 1500);
  await page.getByRole("radiogroup").first().waitFor();
  const noChips = page.locator('button[role="radio"][data-value="no"]');
  const n = await noChips.count();
  for (let i = 0; i < n; i++) await tap(page, noChips.nth(i), `No chip ${i + 1}`, 120, true);
  await pause(page, 800);
  await tap(page, page.getByRole("button", { name: "Seguir" }).first(), "Seguir (preguntas)", 1500);
  await tap(page, page.getByTestId("build-proof"), "Armar mi prueba", 500);
  await page.waitForURL(/\/case\//, { timeout: 30_000 });
  const caseId = page.url().split("/case/")[1].split("?")[0];
  log(`case ${caseId}`);

  // 3. Live agent timeline: linger on badges
  const badge = page.getByText(/Decidido por código|Leído por Claude/).first();
  await badge.waitFor({ timeout: 40_000 }).catch(() => log("no badge seen yet"));
  await pause(page, 3500);
  const code = page.getByText("Decidido por código").first();
  if (await code.isVisible().catch(() => false)) {
    const b = await code.boundingBox();
    if (b) await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 20 });
  }
  await pause(page, 3500);

  // 4. Questions sheet
  await runQuestions(page);

  // 5. Result
  const heading = page.getByTestId("result-heading");
  await heading.waitFor({ timeout: 90_000 });
  await smoothScrollTo(page, heading, "start");
  await pause(page, 2500);
  const months = page.locator("[data-month]");
  const mc = await months.count();
  for (let i = 0; i < mc; i++) {
    await smoothScrollTo(page, months.nth(i), "center");
    await pause(page, 1800);
  }
  const chip = page.locator('button[aria-label^="Ver fuente"]').first();
  await smoothScrollTo(page, chip);
  await tap(page, chip, "citation chip", 600);
  await page.locator("#citation-card").waitFor();
  await smoothScrollTo(page, page.locator("#citation-card"));
  await pause(page, 4000);
  await smoothScrollTo(page, page.getByText("Fechas importantes").first(), "start");
  await pause(page, 3000);
  await smoothScrollTo(page, page.getByText("Descargar paquete de prueba (PDF)").first());
  await pause(page, 2500);

  // 6. Portal agent
  await tap(page, page.getByTestId("portal-cta"), "llenar el formulario del condado", 800);
  await page.waitForURL(/\/portal/, { timeout: 20_000 });
  await page.locator("img").first().waitFor({ timeout: 30_000 }).catch(() => log("no live frame img"));
  await pause(page, 7000); // live screenshots
  const submit = page.getByTestId("user-submit");
  await submit.waitFor({ timeout: 90_000 });
  await pause(page, 3500); // green diff
  await tap(page, submit, "Enviar al condado", 500);
  await page.getByTestId("confirmation").waitFor({ timeout: 30_000 });
  await pause(page, 4000);

  const video = (await page.video()?.path()) ?? "";
  await ctx.close();
  return { caseId, video };
}

async function traceClip(browser: Browser, caseId: string): Promise<string> {
  const ctx = await newCtx(browser, false);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/trace/${caseId}?lang=es`);
  await page.locator("tbody tr").first().waitFor({ timeout: 30_000 });
  await pause(page, 1500);
  await page.mouse.move(640, 400, { steps: 20 });
  await pause(page, 4000);
  const video = (await page.video()?.path()) ?? "";
  await ctx.close();
  return video;
}

async function main(): Promise<void> {
  fs.mkdirSync(TMP, { recursive: true });
  const browser = await chromium.launch();
  try {
    const { caseId, video } = await phoneClip(browser);
    fs.copyFileSync(video, path.join(OUT, "keepcovered-demo-es.webm"));
    const tv = await traceClip(browser, caseId);
    fs.copyFileSync(tv, path.join(OUT, "keepcovered-trace-es.webm"));
    log("done");
  } finally {
    await browser.close();
    fs.rmSync(TMP, { recursive: true, force: true });
  }
}

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? e.stack : String(e)}\n`);
  process.exit(1);
});
