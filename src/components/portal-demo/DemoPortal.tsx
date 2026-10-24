"use client";

import { useState } from "react";

// A generic, clearly labeled DEMO county portal. No real agency name, seal, or branding.
// The portal agent drives this page with Playwright. Contract (do not rename):
//   every element below has id === name and an aria-label;
//   sign-in:  login-continue (label must not contain "Sign")
//   report:   full_name, case_number, report_month (YYYY-MM), income_amount, hours_worked,
//             platforms (comma-separated text), report-next
//   upload:   proof_packet (file), upload-next
//   review:   review-full_name, review-case_number, review-report_month, review-income_amount,
//             review-hours_worked, review-platforms, review-proof_packet, review-back, portal-submit
//   done:     confirmation-number
// portal-submit is only ever clicked by user-initiated code, never by the agent.

type Step = "signin" | "report" | "upload" | "review" | "submitted";

const STEPS: { id: Exclude<Step, "submitted">; label: string }[] = [
  { id: "signin", label: "Start" },
  { id: "report", label: "Work activity" },
  { id: "upload", label: "Documents" },
  { id: "review", label: "Review" },
];

type Report = {
  full_name: string;
  case_number: string;
  report_month: string;
  income_amount: string;
  hours_worked: string;
  platforms: string;
};

const EMPTY: Report = {
  full_name: "",
  case_number: "",
  report_month: "",
  income_amount: "",
  hours_worked: "",
  platforms: "",
};

const FIELDS: { key: keyof Report; label: string; type?: string; placeholder?: string; hint?: string; inputMode?: "decimal" }[] = [
  { key: "full_name", label: "Full name" },
  { key: "case_number", label: "Case number", placeholder: "DEMO-0000", hint: "Starts with DEMO- followed by digits." },
  { key: "report_month", label: "Month", type: "month", hint: "Format YYYY-MM." },
  { key: "income_amount", label: "Gross income ($)", type: "number", inputMode: "decimal", hint: "Before app fees." },
  { key: "hours_worked", label: "Hours worked", type: "number", inputMode: "decimal" },
  { key: "platforms", label: "Employers or platforms", placeholder: "Uber, Lyft", hint: "Separate with commas." },
];

const fieldCls =
  "mt-1 block w-full rounded border border-slate-400 bg-white px-3 py-2.5 text-[1rem] text-slate-900 focus:border-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-700/40";
const labelCls = "block text-[0.95rem] font-semibold text-slate-800";
const primary =
  "inline-flex min-h-12 items-center justify-center rounded bg-sky-900 px-6 font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50";
const secondary =
  "inline-flex min-h-12 items-center justify-center rounded border border-slate-500 bg-white px-6 font-semibold text-slate-800 hover:bg-slate-50";

export function DemoPortal() {
  const [step, setStep] = useState<Step>("signin");
  const [report, setReport] = useState<Report>(EMPTY);
  const [fileName, setFileName] = useState("");
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const set = (key: keyof Report, value: string) => setReport((r) => ({ ...r, [key]: value }));

  const submit = () => {
    const n = Math.floor(100000 + Math.random() * 900000);
    setConfirmation(`DEMO-CONF-${n}`);
    setStep("submitted");
  };

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const review: { key: string; label: string; value: string }[] = [
    { key: "full_name", label: "Full name", value: report.full_name },
    { key: "case_number", label: "Case number", value: report.case_number },
    { key: "report_month", label: "Month", value: report.report_month },
    { key: "income_amount", label: "Gross income", value: report.income_amount },
    { key: "hours_worked", label: "Hours worked", value: report.hours_worked },
    { key: "platforms", label: "Employers or platforms", value: report.platforms },
    { key: "proof_packet", label: "Proof packet", value: fileName },
  ];

  return (
    <div className="min-h-full bg-slate-100 font-sans text-slate-900" data-portal="demo">
      <header className="border-b-4 border-sky-900 bg-white">
        <div role="note" className="bg-amber-300 px-4 py-2 text-center text-[0.9rem] font-bold text-slate-900">
          Demo county portal — not a real government site. Nothing here is sent to any agency.
        </div>
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <span className="grid size-10 place-items-center rounded bg-sky-900 text-lg font-bold text-white" aria-hidden>
            D
          </span>
          <div>
            <p className="text-[1.1rem] font-bold leading-tight">Demo County Benefits Portal</p>
            <p className="text-[0.85rem] text-slate-600">Health coverage: report work activity</p>
          </div>
        </div>
      </header>

      <main id="portal-main" data-step={step} className="mx-auto max-w-3xl px-4 py-8">
        {step !== "submitted" && (
          <ol className="mb-6 flex flex-wrap gap-2 text-[0.85rem]" aria-label="Progress">
            {STEPS.map((s, i) => (
              <li
                key={s.id}
                aria-current={s.id === step ? "step" : undefined}
                className={
                  i === stepIndex
                    ? "rounded bg-sky-900 px-3 py-1 font-semibold text-white"
                    : i < stepIndex
                      ? "rounded bg-sky-100 px-3 py-1 text-sky-900"
                      : "rounded bg-slate-200 px-3 py-1 text-slate-600"
                }
              >
                {i + 1}. {s.label}
              </li>
            ))}
          </ol>
        )}

        <div className="rounded border border-slate-300 bg-white p-5 shadow-sm sm:p-8">
          <section hidden={step !== "signin"} aria-labelledby="h-signin" className="space-y-5">
            <h1 id="h-signin" className="text-[1.5rem] font-bold">
              Welcome
            </h1>
            <p className="text-slate-700">This demo has no real accounts. Continue as the demo user.</p>
            <button
              id="login-continue"
              name="login-continue"
              aria-label="Continue as demo user"
              type="button"
              className={primary}
              onClick={() => setStep("report")}
            >
              Continue as demo user
            </button>
          </section>

          <section hidden={step !== "report"} aria-labelledby="h-report" className="space-y-5">
            <h1 id="h-report" className="text-[1.5rem] font-bold">
              Report work activity
            </h1>
            <p className="text-slate-700">Report one month at a time.</p>
            <div className="grid gap-5 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <div key={f.key} className={f.key === "full_name" || f.key === "platforms" ? "sm:col-span-2" : undefined}>
                  <label htmlFor={f.key} className={labelCls}>
                    {f.label}
                  </label>
                  <input
                    id={f.key}
                    name={f.key}
                    aria-label={f.label}
                    type={f.type ?? "text"}
                    inputMode={f.inputMode}
                    step={f.type === "number" ? "any" : undefined}
                    min={f.type === "number" ? 0 : undefined}
                    placeholder={f.placeholder}
                    aria-describedby={f.hint ? `${f.key}-hint` : undefined}
                    autoComplete="off"
                    className={fieldCls}
                    value={report[f.key]}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                  {f.hint && (
                    <p id={`${f.key}-hint`} className="mt-1 text-[0.85rem] text-slate-600">
                      {f.hint}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <button
              id="report-next"
              name="report-next"
              aria-label="Next: upload documents"
              type="button"
              className={primary}
              onClick={() => setStep("upload")}
            >
              Next
            </button>
          </section>

          <section hidden={step !== "upload"} aria-labelledby="h-upload" className="space-y-5">
            <h1 id="h-upload" className="text-[1.5rem] font-bold">
              Upload documents
            </h1>
            <p className="text-slate-700">Add your proof packet (PDF).</p>
            <div>
              <label htmlFor="proof_packet" className={labelCls}>
                Proof packet
              </label>
              <input
                id="proof_packet"
                name="proof_packet"
                aria-label="Proof packet"
                type="file"
                accept="application/pdf,image/*"
                className="mt-2 block w-full text-[0.95rem] file:mr-3 file:min-h-11 file:rounded file:border-0 file:bg-sky-900 file:px-4 file:font-semibold file:text-white"
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
              />
            </div>
            <button
              id="upload-next"
              name="upload-next"
              aria-label="Next: review"
              type="button"
              className={primary}
              onClick={() => setStep("review")}
            >
              Next
            </button>
          </section>

          <section hidden={step !== "review"} aria-labelledby="h-review" className="space-y-5">
            <h1 id="h-review" className="text-[1.5rem] font-bold">
              Review your report
            </h1>
            <dl className="divide-y divide-slate-200 border-y border-slate-200">
              {review.map((r) => (
                <div key={r.key} className="grid grid-cols-[9rem_1fr] gap-3 py-2.5 sm:grid-cols-[12rem_1fr]">
                  <dt className="font-semibold text-slate-700">{r.label}</dt>
                  <dd id={`review-${r.key}`} aria-label={r.label} className="break-words">
                    {r.value}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-wrap gap-3">
              <button
                id="review-back"
                name="review-back"
                aria-label="Back to documents"
                type="button"
                className={secondary}
                onClick={() => setStep("upload")}
              >
                Back
              </button>
              <button
                id="portal-submit"
                name="portal-submit"
                aria-label="Submit report"
                type="button"
                className={primary}
                onClick={submit}
              >
                Submit
              </button>
            </div>
          </section>

          {step === "submitted" && confirmation && (
            <section className="space-y-3" role="status" aria-labelledby="h-done">
              <h1 id="h-done" className="text-[1.5rem] font-bold">
                Report received
              </h1>
              <p>
                Confirmation number:{" "}
                <strong id="confirmation-number" aria-label="Confirmation number">
                  {confirmation}
                </strong>
              </p>
              <p className="text-slate-700">This is a demo. Nothing was sent to a real county.</p>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
