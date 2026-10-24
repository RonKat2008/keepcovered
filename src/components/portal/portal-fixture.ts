// Offline stand-in for POST /api/portal/{id}/start, used when the backend is not connected.
import type { PortalDiffRow } from "@/lib/api";

export type SketchField = { key: string; label: string; value: string };

export const SKETCH_FIELDS: SketchField[] = [
  { key: "full_name", label: "Full name", value: "María Ejemplo" },
  { key: "case_number", label: "Case number", value: "DEMO-48213" },
  { key: "report_month", label: "Month", value: "2026-11" },
  { key: "income_amount", label: "Gross income ($)", value: "1240.75" },
  { key: "hours_worked", label: "Hours worked", value: "63.5" },
  { key: "platforms", label: "Employers or platforms", value: "Uber, Lyft, Instacart" },
  { key: "proof_packet", label: "Proof packet", value: "keepcovered-packet.pdf" },
];

export type FixtureStep =
  | { kind: "page"; page: "signin" | "report" | "upload" | "review"; text: string; delay: number }
  | { kind: "fill"; field: string; text: string; delay: number };

export const FIXTURE_STEPS: FixtureStep[] = [
  { kind: "page", page: "signin", text: "Opened the demo county portal", delay: 700 },
  { kind: "page", page: "report", text: "Clicked “Continue as demo user”", delay: 1100 },
  ...SKETCH_FIELDS.slice(0, 6).map<FixtureStep>((f) => ({
    kind: "fill",
    field: f.key,
    text: `Typed ${f.label.toLowerCase()}: ${f.value}`,
    delay: 900,
  })),
  { kind: "page", page: "upload", text: "Clicked Next", delay: 800 },
  { kind: "fill", field: "proof_packet", text: "Attached keepcovered-packet.pdf", delay: 1000 },
  { kind: "page", page: "review", text: "Opened the review page and stopped before Submit", delay: 1000 },
];

export const FIXTURE_SUMMARY =
  "November 2026 work report for María Ejemplo (DEMO-48213): $1,240.75 gross from Uber, Lyft and Instacart, 63.5 hours. Proof packet attached.";

export const FIXTURE_DIFF: PortalDiffRow[] = SKETCH_FIELDS.map((f) => ({
  field: f.label,
  packet: f.value,
  form: f.value,
  ok: true,
}));
