// Portal agent contract. The agent FILLS the county portal form and uploads the proof packet,
// then STOPS. Only the human (via submitPortal, called by our API route) ever clicks Submit.

export type FieldDiff = { field: string; packet: string; form: string; ok: boolean };

export type PortalEvent =
  /** Despite the name, the bytes are JPEG (≤1280px wide). Render as `data:image/jpeg;base64,...`. */
  | { type: "screenshot"; png_base64: string; action: string }
  | { type: "step"; text: string; simulated: boolean }
  | { type: "ready_to_submit"; summary: string; diff: FieldDiff[] }
  | { type: "error"; message: string };

export type PortalRunResult = { status: "ready_to_submit" | "failed"; summary: string; diff: FieldDiff[] };

/**
 * "dom": our own strict custom tools (default; most reliable).
 * "browser": Anthropic's browser_toolset_20260801 driven by Playwright (Claude API only).
 * "scripted": deterministic offline planner over the DOM tools (no API key / DEMO_MODE).
 */
export type PortalMode = "dom" | "browser" | "scripted";

/** Synthetic applicant identity typed into the portal. CaseResult carries no name or case number. */
export type Applicant = { full_name: string; case_number: string };
export const DEMO_APPLICANT: Applicant = { full_name: "Demo Driver", case_number: "DEMO-0000" };

/**
 * Stable element ids the /portal-demo page must expose (id === name; aria-label set).
 * Every value field is read back by code for the diff, either from the input itself or,
 * once the form is off-screen, from `#review-<field>` on the Review step.
 */
export const PORTAL_FIELDS = {
  full_name: "full_name",
  case_number: "case_number",
  report_month: "report_month",
  income_amount: "income_amount",
  hours_worked: "hours_worked",
  platforms: "platforms",
} as const;
export type PortalFieldId = keyof typeof PORTAL_FIELDS;
export const VALUE_FIELD_IDS = Object.keys(PORTAL_FIELDS) as PortalFieldId[];

export const PORTAL_IDS = {
  loginContinue: "login-continue",
  reportNext: "report-next",
  fileInput: "proof_packet",
  uploadNext: "upload-next",
  reviewBack: "review-back",
  submit: "portal-submit",
  confirmation: "confirmation-number",
  reviewPrefix: "review-",
} as const;

/** Clicks on anything whose text/name/id/aria-label/value/title matches this are refused for the agent. */
export const BLOCKED_CLICK_RE = /submit|enviar|sign|firmar|confirm|confirmar/i;
/** Ids the agent may never click, whatever their label says. */
export const BLOCKED_IDS: ReadonlySet<string> = new Set([PORTAL_IDS.submit]);

export const PORTAL_PATH = "/portal-demo";

/**
 * The only buttons/links the agent may click. Everything else that is clickable (other than form
 * fields) is refused, so a page-injected "Finish" button that secretly submits is also blocked.
 */
export const AGENT_CLICKABLE_IDS: ReadonlySet<string> = new Set([
  PORTAL_IDS.loginContinue,
  PORTAL_IDS.reportNext,
  PORTAL_IDS.uploadNext,
  PORTAL_IDS.reviewBack,
]);
