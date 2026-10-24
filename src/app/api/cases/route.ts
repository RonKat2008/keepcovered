import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { runCase } from "@/agent/orchestrator";
import { truthPathFor } from "@/agent/truthIndex";
import { ExemptionAnswers, Lang } from "@/lib/schemas";
import { getStore } from "@/store";

export const runtime = "nodejs";

const MAX_FILES = 12;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = /^(image\/(png|jpeg|webp|heic)|application\/pdf)$/;
const DEMO_DIR = join(process.cwd(), "public", "demo");
const DEMO_BANK_REF = "demo-maria";

interface IncomingDoc {
  id: string;
  name: string;
  mime: string;
  bytes: Uint8Array;
  truthPath?: string;
}

function demoDocs(): IncomingDoc[] {
  return readdirSync(DEMO_DIR)
    .filter((f) => /\.(png|jpe?g|pdf)$/i.test(f))
    .sort()
    .map((name) => {
      const bytes = new Uint8Array(readFileSync(join(DEMO_DIR, name)));
      return { id: randomUUID(), name, mime: name.endsWith(".pdf") ? "application/pdf" : name.endsWith(".png") ? "image/png" : "image/jpeg", bytes, truthPath: truthPathFor(bytes) };
    });
}

function todayIso(): string {
  return process.env.KC_TODAY ?? new Date().toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "Expected multipart form data." }, { status: 400 });

  const lang = Lang.safeParse(form.get("lang") ?? "en");
  if (!lang.success) return Response.json({ error: "`lang` must be en or es." }, { status: 400 });

  let answersRaw: unknown = {};
  try {
    answersRaw = JSON.parse(String(form.get("answers") ?? "{}"));
  } catch {
    return Response.json({ error: "`answers` must be JSON." }, { status: 400 });
  }
  const answers = ExemptionAnswers.safeParse(answersRaw);
  if (!answers.success) return Response.json({ error: "Invalid `answers`." }, { status: 400 });

  const isDemo = form.get("demo") === "maria";
  let docs: IncomingDoc[];
  if (isDemo) {
    docs = demoDocs();
  } else {
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) return Response.json({ error: "Upload at least one document." }, { status: 400 });
    if (files.length > MAX_FILES) return Response.json({ error: `At most ${MAX_FILES} documents.` }, { status: 400 });
    for (const f of files) {
      if (!ALLOWED_MIME.test(f.type)) return Response.json({ error: `${f.name}: unsupported file type.` }, { status: 415 });
      if (f.size > MAX_FILE_BYTES) return Response.json({ error: `${f.name}: file is larger than 10 MB.` }, { status: 413 });
    }
    docs = await Promise.all(
      files.map(async (f) => {
        const bytes = new Uint8Array(await f.arrayBuffer());
        return { id: randomUUID(), name: f.name, mime: f.type, bytes, truthPath: truthPathFor(bytes) };
      }),
    );
  }

  const store = getStore();
  const bankRef = isDemo || form.get("bank") === "demo" ? DEMO_BANK_REF : null;
  const id = await store.create({ lang: lang.data, demo: isDemo, bankRef });
  await store.putDocs(id, docs);

  void runCase({ sessionId: id, lang: lang.data, answers: answers.data, bankRef, today: todayIso() }).catch(async (err: unknown) => {
    await store.appendEvent(id, {
      id: randomUUID(),
      at: Date.now(),
      step: "handoff",
      kind: "error",
      title: "Something went wrong. A navigator can help.",
      detail: err instanceof Error ? err.message : String(err),
    });
  });

  return Response.json({ id }, { status: 201 });
}
