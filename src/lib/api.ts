// Typed browser client for the KeepCovered backend.
// The UI falls back to fixtures/demo-case.json when NEXT_PUBLIC_UI_FIXTURE=1
// or when an endpoint is missing (404) or unreachable, so the demo always renders.
import { z } from "zod";
import {
  AgentEvent,
  CaseResult,
  UserQuestion,
  type ExemptionAnswers,
  type Lang,
} from "@/lib/schemas";

export const FIXTURE_CASE_ID = "demo-maria";

export function fixtureForced(): boolean {
  return process.env.NEXT_PUBLIC_UI_FIXTURE === "1";
}

/** Thrown when the backend route does not exist yet (404) or the network failed. Callers fall back to fixtures. */
export class BackendUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackendUnavailableError";
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request(input: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (err) {
    throw new BackendUnavailableError(err instanceof Error ? err.message : "network error");
  }
  if (res.status === 404 || res.status === 501) {
    throw new BackendUnavailableError(`${input} returned ${res.status}`);
  }
  if (!res.ok) {
    throw new ApiError(`${input} returned ${res.status}`, res.status);
  }
  return res;
}

// ---------- Cases ----------

export interface CreateCaseInput {
  files: File[];
  answers: ExemptionAnswers;
  lang: Lang;
  /** Ask the backend to use its bundled demo documents instead of uploads. */
  demo?: "maria";
}

const CreateCaseResponse = z.object({ id: z.string().min(1) });

export async function createCase(input: CreateCaseInput): Promise<{ id: string }> {
  if (fixtureForced()) return { id: FIXTURE_CASE_ID };
  const body = new FormData();
  for (const file of input.files) body.append("files", file, file.name);
  body.append("answers", JSON.stringify(input.answers));
  body.append("lang", input.lang);
  if (input.demo) body.append("demo", input.demo);
  try {
    const res = await request("/api/cases", { method: "POST", body });
    return CreateCaseResponse.parse(await res.json());
  } catch (err) {
    if (err instanceof BackendUnavailableError) return { id: FIXTURE_CASE_ID };
    throw err;
  }
}

export async function getCase(id: string): Promise<CaseResult> {
  const res = await request(`/api/cases/${encodeURIComponent(id)}`);
  return CaseResult.parse(await res.json());
}

export async function postAnswer(id: string, questionId: string, value: string): Promise<void> {
  await request(`/api/cases/${encodeURIComponent(id)}/answers`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question_id: questionId, value }),
  });
}

export function packetUrl(id: string): string {
  return `/api/cases/${encodeURIComponent(id)}/packet.pdf`;
}

export function deadlinesUrl(id: string): string {
  return `/api/cases/${encodeURIComponent(id)}/deadlines.ics`;
}

// ---------- Screener questions ----------

export const ScreenerQuestion = z.object({
  id: z.string(),
  question_en: z.string(),
  question_es: z.string(),
});
export type ScreenerQuestion = z.infer<typeof ScreenerQuestion>;

/** Used when GET /api/questions is not available. Wording from data/rules/work_rules.json. */
export const FALLBACK_QUESTIONS: readonly ScreenerQuestion[] = [
  {
    id: "parent_caretaker_child_13_or_under",
    question_en: "Are you a parent, guardian, or caregiver of a child who is 13 years old or younger?",
    question_es: "¿Es usted padre, madre, tutor o cuidador de un niño de 13 años o menos?",
  },
  {
    id: "pregnant_postpartum",
    question_en: "Are you pregnant, or did a pregnancy end in the last 12 months?",
    question_es: "¿Está embarazada, o terminó un embarazo en los últimos 12 meses?",
  },
  {
    id: "medicare",
    question_en: "Do you have Medicare Part A or Part B?",
    question_es: "¿Tiene Medicare Parte A o Parte B?",
  },
  {
    id: "caregiver_of_disabled_person",
    question_en: "Do you take care of a family member or someone you live with who has a disability?",
    question_es: "¿Cuida a un familiar o a alguien con quien vive que tiene una discapacidad?",
  },
  {
    id: "medically_frail",
    question_en:
      "Do you have a disability, a serious or long-term health condition, a mental health condition, or a substance use problem that makes daily life or work hard?",
    question_es:
      "¿Tiene una discapacidad, una enfermedad grave o de largo plazo, un problema de salud mental o de uso de sustancias que le hace difícil la vida diaria o trabajar?",
  },
  {
    id: "american_indian_alaska_native",
    question_en: "Are you American Indian or Alaska Native, or can you get care from the Indian Health Service?",
    question_es:
      "¿Es usted indígena americano o nativo de Alaska, o puede recibir atención del Servicio de Salud Indígena (IHS)?",
  },
];

export async function getQuestions(lang: Lang): Promise<ScreenerQuestion[]> {
  if (fixtureForced()) return [...FALLBACK_QUESTIONS];
  try {
    const res = await request(`/api/questions?lang=${lang}`);
    return z.array(ScreenerQuestion).parse(await res.json());
  } catch {
    return [...FALLBACK_QUESTIONS];
  }
}

// ---------- Server-Sent Events ----------

/**
 * Parse an SSE response body. Each event's `data:` lines are joined and JSON-parsed.
 * Works for GET streams and POST streams (EventSource cannot POST).
 */
export async function readSSE(
  res: Response,
  onData: (data: unknown) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!res.body) throw new BackendUnavailableError("stream has no body");
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  const flush = (block: string) => {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n");
    if (!data) return;
    try {
      onData(JSON.parse(data));
    } catch {
      // A non-JSON keepalive or comment line. Ignore it.
    }
  };
  try {
    while (!signal?.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? "";
      blocks.forEach(flush);
    }
    if (buffer.trim()) flush(buffer);
  } finally {
    reader.releaseLock();
  }
}

/** Messages on GET /api/cases/{id}/events. */
export const CaseStreamMessage = z.union([
  z.object({ type: z.literal("result"), result: CaseResult }),
  z.object({ type: z.literal("question"), question: UserQuestion }),
  AgentEvent,
]);
export type CaseStreamMessage = z.infer<typeof CaseStreamMessage>;

export async function openCaseEvents(id: string, signal: AbortSignal): Promise<Response> {
  return request(`/api/cases/${encodeURIComponent(id)}/events`, {
    headers: { accept: "text/event-stream" },
    signal,
  });
}

// ---------- Portal agent ----------

export const PortalAction = z
  .object({
    type: z.string().optional(),
    description: z.string().optional(),
    field: z.string().optional(),
    value: z.string().optional(),
    /** Pointer position in screenshot pixels, when the action targets a point. */
    x: z.number().optional(),
    y: z.number().optional(),
  })
  .passthrough();
export type PortalAction = z.infer<typeof PortalAction>;

export const PortalDiffRow = z.object({
  field: z.string(),
  packet: z.string(),
  form: z.string(),
  ok: z.boolean(),
});
export type PortalDiffRow = z.infer<typeof PortalDiffRow>;

export const PortalMessage = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("screenshot"),
    /** Despite the name, the backend sends JPEG bytes. Render as data:image/jpeg;base64. */
    png_base64: z.string(),
    action: z.union([PortalAction, z.string()]).nullish(),
    width: z.number().optional(),
    height: z.number().optional(),
  }),
  z.object({ type: z.literal("step"), text: z.string(), simulated: z.boolean().optional() }),
  z.object({ type: z.literal("ready_to_submit"), summary: z.string(), diff: z.array(PortalDiffRow) }),
  z.object({ type: z.literal("error"), message: z.string() }),
  z.object({ type: z.literal("submitted"), confirmation: z.string() }),
]);
export type PortalMessage = z.infer<typeof PortalMessage>;

export async function startPortal(id: string, signal: AbortSignal): Promise<Response> {
  return request(`/api/portal/${encodeURIComponent(id)}/start`, {
    method: "POST",
    headers: { accept: "text/event-stream" },
    signal,
  });
}

/** User-initiated submit. Returns the confirmation if the backend sends it in the body (else it arrives on the stream). */
export async function submitPortal(id: string): Promise<string | null> {
  const res = await request(`/api/portal/${encodeURIComponent(id)}/submit`, { method: "POST" });
  if (res.status === 204) return null;
  try {
    const body: unknown = await res.json();
    const parsed = z.object({ confirmation: z.string() }).safeParse(body);
    return parsed.success ? parsed.data.confirmation : null;
  } catch {
    return null;
  }
}
