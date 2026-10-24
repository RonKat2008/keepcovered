// Deterministic offline planner: drives the same DOM tools a model would, so the demo works without
// an API key. It ignores page text entirely, so injected instructions cannot steer it.
import { PORTAL_IDS, VALUE_FIELD_IDS } from "./types";
import { executeDomTool, type DomToolOutcome } from "./tools";
import { type PageSnapshot, type PortalSession } from "./executor";

const MAX_STEPS = 12;

export type PlannerHooks = {
  onAction: (outcome: DomToolOutcome, tool: string) => Promise<void>;
  signal?: AbortSignal;
};

export async function runScriptedPlanner(
  session: PortalSession,
  expected: Record<string, string>,
  lang: "en" | "es",
  hooks: PlannerHooks,
): Promise<{ summary: string } | { error: string }> {
  const call = async (tool: string, input: Record<string, unknown>): Promise<DomToolOutcome> => {
    if (hooks.signal?.aborted) throw new Error("aborted");
    const out = await executeDomTool(session, tool, input, expected);
    await hooks.onAction(out, tool);
    return out;
  };
  const snapshot = async (): Promise<PageSnapshot> => {
    const out = await call("read_page", {});
    return JSON.parse(out.content.split("\n")[0]) as PageSnapshot;
  };
  const has = (snap: PageSnapshot, id: string) => snap.buttons.some((b) => b.id === id) || snap.fields.some((f) => f.id === id);

  for (let i = 0; i < MAX_STEPS; i++) {
    const snap = await snapshot();
    if (snap.on_review_page) {
      const summary =
        lang === "es"
          ? `Llené el informe de ${expected.report_month} (ingresos $${expected.income_amount}, ${expected.hours_worked} horas) y subí su paquete de pruebas. Revise y toque Enviar usted mismo.`
          : `I filled the ${expected.report_month} report (income $${expected.income_amount}, ${expected.hours_worked} hours) and uploaded your proof packet. Review it and tap Submit yourself.`;
      const out = await call("request_human_submit", { summary });
      return { summary: out.handoffSummary ?? summary };
    }
    if (has(snap, PORTAL_IDS.loginContinue)) {
      await call("click", { element_id: PORTAL_IDS.loginContinue });
      continue;
    }
    const fieldIds = VALUE_FIELD_IDS.filter((id) => snap.fields.some((f) => f.id === id));
    if (fieldIds.length > 0 && has(snap, PORTAL_IDS.reportNext)) {
      for (const id of fieldIds) {
        const current = snap.fields.find((f) => f.id === id)?.value ?? "";
        if (current !== expected[id]) {
          const out = await call("fill_field", { field_id: id, value: expected[id] });
          if (out.isError) return { error: out.content };
        }
      }
      await call("click", { element_id: PORTAL_IDS.reportNext });
      continue;
    }
    if (has(snap, PORTAL_IDS.fileInput) && has(snap, PORTAL_IDS.uploadNext)) {
      const up = await call("upload_file", { field_id: PORTAL_IDS.fileInput, file: "packet" });
      if (up.isError) return { error: up.content };
      await call("click", { element_id: PORTAL_IDS.uploadNext });
      continue;
    }
    return { error: `Could not recognise the portal page (${snap.headings.join(" / ") || snap.url}).` };
  }
  return { error: "Step limit reached before the Review page." };
}
