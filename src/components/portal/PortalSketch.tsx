"use client";

import { SKETCH_FIELDS } from "./portal-fixture";

type Props = {
  page: "signin" | "report" | "upload" | "review";
  filled: Record<string, string>;
};

/**
 * A miniature of /portal-demo drawn in the frame when no live screenshots are available.
 * Rows sit at fixed percentages so the cursor ghost can point at them.
 */
export function PortalSketch({ page, filled }: Props) {
  return (
    <div className="absolute inset-0 select-none bg-slate-100 font-sans text-slate-900" aria-hidden>
      <div className="h-[6%] bg-amber-300 text-center text-[clamp(0.45rem,1.4vw,0.7rem)] font-bold leading-[2]">
        Demo county portal — not a real government site
      </div>
      <div className="flex h-[9%] items-center gap-2 border-b-[3px] border-sky-900 bg-white px-[4%]">
        <span className="grid aspect-square h-[60%] place-items-center rounded bg-sky-900 text-[0.6rem] font-bold text-white">
          D
        </span>
        <span className="text-[clamp(0.55rem,1.6vw,0.85rem)] font-bold">Demo County Benefits Portal</span>
      </div>

      {page === "signin" && (
        <div className="absolute left-[6%] right-[6%] top-[24%] rounded border border-slate-300 bg-white p-[4%]">
          <p className="text-[clamp(0.7rem,2vw,1.1rem)] font-bold">Welcome</p>
          <p className="mt-1 text-[clamp(0.5rem,1.3vw,0.75rem)] text-slate-600">Continue as the demo user.</p>
          <span className="mt-[6%] inline-block rounded bg-sky-900 px-3 py-1.5 text-[clamp(0.5rem,1.3vw,0.75rem)] font-semibold text-white">
            Continue as demo user
          </span>
        </div>
      )}

      {page === "report" && (
        <>
          {SKETCH_FIELDS.slice(0, 6).map((f, i) => (
            <div
              key={f.key}
              className="absolute left-[6%] right-[6%] flex items-center gap-[3%]"
              style={{ top: `${20 + i * 10.5}%`, height: "8%" }}
            >
              <span className="w-[34%] text-[clamp(0.5rem,1.3vw,0.78rem)] font-semibold text-slate-700">{f.label}</span>
              <span
                className={
                  "flex h-full flex-1 items-center rounded border bg-white px-2 text-[clamp(0.55rem,1.4vw,0.85rem)] transition-colors " +
                  (filled[f.key] ? "border-sky-800 ring-2 ring-sky-700/20" : "border-slate-400")
                }
              >
                {filled[f.key] ?? ""}
              </span>
            </div>
          ))}
          <span className="absolute right-[6%] top-[85%] rounded bg-sky-900 px-3 py-1 text-[clamp(0.5rem,1.3vw,0.75rem)] font-semibold text-white">
            Next
          </span>
        </>
      )}

      {page === "upload" && (
        <div className="absolute left-[6%] right-[6%] top-[24%] rounded border border-slate-300 bg-white p-[4%]">
          <p className="text-[clamp(0.7rem,2vw,1.1rem)] font-bold">Upload documents</p>
          <div className="mt-[5%] flex items-center gap-2 text-[clamp(0.5rem,1.3vw,0.78rem)]">
            <span className="rounded bg-sky-900 px-2 py-1 font-semibold text-white">Choose file</span>
            <span className="text-slate-700">{filled.proof_packet ?? "No file chosen"}</span>
          </div>
        </div>
      )}

      {page === "review" && (
        <div className="absolute left-[6%] right-[6%] top-[19%] rounded border border-slate-300 bg-white px-[4%] py-[2%]">
          <p className="text-[clamp(0.65rem,1.8vw,1rem)] font-bold">Review your report</p>
          <dl className="mt-1">
            {SKETCH_FIELDS.map((f) => (
              <div key={f.key} className="flex gap-2 border-b border-slate-200 py-[1.2%] text-[clamp(0.45rem,1.2vw,0.72rem)]">
                <dt className="w-[40%] font-semibold text-slate-600">{f.label}</dt>
                <dd>{filled[f.key] ?? ""}</dd>
              </div>
            ))}
          </dl>
          <span className="mt-[3%] inline-block rounded bg-sky-900/40 px-3 py-1 text-[clamp(0.5rem,1.3vw,0.75rem)] font-semibold text-white">
            Submit (waiting for you)
          </span>
        </div>
      )}
    </div>
  );
}
