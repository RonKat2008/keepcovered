// KeepCovered MCP server (stdio). Deterministic tools only: no LLM calls.
// Claude reads and explains; the pure rules engine in src/rules decides.
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  BankTransaction,
  CaseResult,
  CountyLetter,
  DepositLabel,
  EarningsRecord,
  ExemptionAnswers,
  Lang,
  MonthKey,
  IsoDate,
  OtherActivity,
  PayerSuggestion,
} from "@/lib/schemas";
import type { MonthStatus } from "@/lib/schemas";
import { reasonText } from "@/lib/i18n";
import {
  buildDeadlines,
  computeMonthlyStatus,
  getScreenerQuestions,
  loadWorkRules,
  reconcile,
  screenExemptions,
  toIcs,
} from "@/rules";
import { retrieve } from "@/rag/retrieve";
import { buildPacket } from "@/pdf/packet";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DISCLAIMER =
  "Screening and arithmetic only. The county decides whether the member meets the rule or is exempt. Never tell the member they comply or are exempt.";

type Source = { doc: string; page: number; quote: string };
type RawRules = {
  income_threshold_source: Source;
  hours_threshold_source?: Source;
  sources: Array<{ id: string; title: string; url: string; date?: string; primary?: boolean }>;
};

const text = (value: unknown) => ({
  content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
});
const fail = (message: string) => ({ isError: true as const, content: [{ type: "text" as const, text: message }] });

function plainEnglish(m: MonthStatus): string {
  const head: Record<MonthStatus["overall"], string> = {
    meets: "Looks like it meets a path (the county decides)",
    does_not_meet: "Does not appear to meet either path",
    unsure: "Unsure: depends on an open rule question",
    missing_data: "Missing records for this month",
  };
  const reasons = m.reasons.map((r) => `- ${reasonText(r.code, r.params, "en")}`).join("\n");
  return `${m.month}: ${head[m.overall]}.\n${reasons}`;
}

export function createServer(): McpServer {
  const rules = loadWorkRules();
  const raw = rules as unknown as RawRules;
  const sourceUrl = (id: string) => raw.sources.find((s) => s.id === id)?.url ?? null;
  const sourceTitle = (id: string) => raw.sources.find((s) => s.id === id)?.title ?? null;

  const server = new McpServer({ name: "keepcovered", version: "0.1.0" });

  server.registerTool(
    "compute_monthly_status",
    {
      title: "Compute monthly work-rule status",
      description:
        "Deterministic check of each month against the Medi-Cal work rule ($580 gross income OR 80 hours). Returns MonthStatus per month, plain-English text, and the rule source. Code decides; never override the result.",
      inputSchema: {
        months: z.array(MonthKey).min(1).describe("Months to evaluate, YYYY-MM"),
        records: z.array(EarningsRecord).describe("Verified earnings records"),
        labeled_income: z.array(BankTransaction).optional().describe("Bank deposits the member labeled as driving income"),
        activities: z.array(OtherActivity).optional().describe("Other qualifying activity hours"),
      },
    },
    async ({ months, records, labeled_income, activities }) => {
      const statuses = computeMonthlyStatus(
        { months, records, labeledIncome: labeled_income ?? [], activities: activities ?? [] },
        rules,
      );
      return text({
        months: statuses,
        plain_english: statuses.map(plainEnglish),
        rule_source: raw.income_threshold_source,
        rule_source_url: sourceUrl(raw.income_threshold_source.doc),
        disclaimer: DISCLAIMER,
      });
    },
  );

  server.registerTool(
    "list_screener_questions",
    {
      title: "List exemption screener questions",
      description: "Self-reportable exemption screener questions in English or Spanish. Ask the member, then call screen_exemptions.",
      inputSchema: { lang: Lang.default("en") },
    },
    async ({ lang }) =>
      text(
        getScreenerQuestions(rules).map((q) => ({
          id: q.id,
          question: lang === "es" ? q.question_es : q.question_en,
          label: lang === "es" ? q.label_es : q.label_en,
        })),
      ),
  );

  server.registerTool(
    "screen_exemptions",
    {
      title: "Screen for possible exemptions",
      description:
        'Maps answers (question id -> yes|no|not_sure) to screening outcomes. Outcomes mean "may qualify, tell the county" or "ask a navigator", never "exempt".',
      inputSchema: { answers: ExemptionAnswers },
    },
    async ({ answers }) => {
      const screens = screenExemptions(answers, rules).map((s) => ({
        ...s,
        wording:
          s.outcome === "may_qualify"
            ? "May qualify - tell the county."
            : s.outcome === "ask_navigator"
              ? "Not sure - ask a navigator."
              : "Not indicated by the answers.",
      }));
      return text({ screens, disclaimer: DISCLAIMER });
    },
  );

  server.registerTool(
    "search_rules",
    {
      title: "Search the work-rule sources",
      description: "Keyword/hybrid search over the official rule documents. Returns passages with doc, page, text and source URL so you can cite.",
      inputSchema: { query: z.string().min(1), k: z.number().int().min(1).max(20).default(5) },
    },
    async ({ query, k }) => {
      const chunks = await retrieve(query, k);
      return text(
        chunks.map((c) => ({
          source_id: c.source_id,
          title: sourceTitle(c.source_id) ?? c.title,
          page: c.page,
          text: c.text,
          score: c.score ?? null,
          url: sourceUrl(c.source_id),
        })),
      );
    },
  );

  server.registerTool(
    "reconcile_income",
    {
      title: "Reconcile earnings with bank deposits",
      description: "De-duplicates overlapping earnings records and matches payouts to bank deposits. Unmatched deposits must be labeled by the member.",
      inputSchema: {
        records: z.array(EarningsRecord),
        transactions: z.array(BankTransaction),
        labels: z.record(z.string(), DepositLabel).default({}),
        suggestions: z.array(PayerSuggestion).default([]),
      },
    },
    async ({ records, transactions, labels, suggestions }) =>
      text(reconcile({ records, transactions, labels, suggestions })),
  );

  server.registerTool(
    "build_deadlines_ics",
    {
      title: "Build deadlines and calendar file",
      description: "Computes county deadlines from a letter and today's date, and returns an .ics calendar text.",
      inputSchema: {
        letter: CountyLetter.nullable().describe("Extracted county letter, or null"),
        today: IsoDate,
        months: z.array(z.any()).default([]).describe("MonthStatus[] from compute_monthly_status (optional)"),
        lang: Lang.default("en"),
      },
    },
    async ({ letter, today, months, lang }) => {
      const deadlines = buildDeadlines({ letter, today, months: months as MonthStatus[] }, rules);
      return text({ deadlines, ics: toIcs(deadlines, lang) });
    },
  );

  server.registerTool(
    "build_packet",
    {
      title: "Build proof packet PDF",
      description: "Renders the proof packet (cover letter, summary, evidence index, deadlines) from a CaseResult. No document attachments. Writes a PDF to the temp dir and returns its path.",
      inputSchema: { case_result: CaseResult, lang: Lang.default("en") },
    },
    async ({ case_result, lang }) => {
      try {
        const bytes = await buildPacket({ result: case_result, docs: [], lang, generatedAt: new Date().toISOString() });
        const dir = await mkdtemp(path.join(os.tmpdir(), "keepcovered-packet-"));
        const file = path.join(dir, `packet-${lang}.pdf`);
        await writeFile(file, bytes);
        return text({ path: file, bytes: bytes.length });
      } catch (e) {
        return fail(`Packet build failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  );

  server.registerResource(
    "work_rules",
    "rules://work_rules",
    { title: "Work rules (JSON)", description: "data/rules/work_rules.json with per-value sources", mimeType: "application/json" },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(rules, null, 2) }] }),
  );

  server.registerResource(
    "open_questions",
    "rules://open_questions",
    { title: "Open rule questions", description: "Rule questions the sources do not settle", mimeType: "text/plain" },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/plain",
          text: rules.open_questions.map((q) => `${q.id}: ${q.text}\n  default: ${q.default_behavior}`).join("\n\n"),
        },
      ],
    }),
  );

  server.registerPrompt(
    "help_driver",
    {
      title: "Help a gig driver keep Medi-Cal",
      description: "Guardrails for assisting a navigator or driver with the Medi-Cal work rule",
    },
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "You are helping a Medi-Cal navigator or Coverage Ambassador assist a gig driver with the work and community engagement rule.",
              "Never decide compliance or exemption yourself. Do not say 'you comply' or 'you are exempt'; say what the tools report and that the county decides.",
              "Use compute_monthly_status for any month result, screen_exemptions for exemptions, reconcile_income for bank matching, build_deadlines_ics for dates, and build_packet for the proof packet.",
              "Cite rules with search_rules (doc and page). Read rules://open_questions and flag any open question that affects the answer.",
              "Never invent numbers or fill in missing months. Use synthetic or consented data only.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  return server;
}

async function main(): Promise<void> {
  process.chdir(REPO_ROOT); // retrieve() reads data/rules relative to cwd
  await createServer().connect(new StdioServerTransport());
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    process.stderr.write(`keepcovered-mcp failed: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  });
}
