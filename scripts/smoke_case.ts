// End-to-end backend smoke test without the web server: runs the orchestrator on the demo
// documents, answers deposit questions like a member would, and prints the month table.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { runCase } from "@/agent/orchestrator";
import { pendingQuestions } from "@/agent/questions";
import { truthPathFor } from "@/agent/truthIndex";
import { getStore } from "@/store";

async function main() {
  const store = getStore();
  const dir = "public/demo";
  const docs = readdirSync(dir)
    .filter((f) => f.endsWith(".png"))
    .map((name) => {
      const bytes = new Uint8Array(readFileSync(join(dir, name)));
      return { id: randomUUID(), name, mime: "image/png", bytes, truthPath: truthPathFor(bytes) };
    });
  console.log(`docs: ${docs.length}, with truth: ${docs.filter((d) => d.truthPath).length}`);
  const id = await store.create({ lang: "es" });
  await store.putDocs(id, docs);
  const answering = setInterval(() => {
    for (const q of pendingQuestions(id)) {
      const answer = /VENMO|ZELLE/i.test(q.prompt_en) ? "not_driving" : "driving";
      console.log(`Q: ${q.prompt_en} -> ${answer}`);
      void store.setAnswer(id, q.id, answer);
    }
  }, 50);
  const result = await runCase({ sessionId: id, lang: "es", answers: {}, bankRef: "demo-maria", today: "2026-11-24" });
  clearInterval(answering);
  for (const ev of store.events(id)) console.log(`[${ev.step}/${ev.kind}] ${ev.title}${ev.model ? ` (${ev.model}, $${ev.cost_usd?.toFixed(4)})` : ""}`);
  console.log(JSON.stringify(result.months.map((m) => ({ m: m.month, gross: m.gross_income, net: m.net_income, active: m.active_hours, overall: m.overall, reasons: m.reasons.map((r) => r.code) })), null, 1));
  console.log("letter:", result.letter?.response_deadline, result.letter?.months_requested);
  console.log("dupes:", JSON.stringify(result.reconcile.duplicates));
  console.log("explanation:", result.explanation.map((s) => s.text + (s.citations.length ? ` [${s.citations.map((c) => `${c.source_id} p${c.page}`).join(",")}]` : "")).join(""));
  console.log("navigator:", result.navigator_reasons);
  console.log("deadlines:", result.deadlines.map((d) => `${d.date} ${d.title_en}`));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
