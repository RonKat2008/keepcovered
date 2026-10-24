// Voyage AI REST client. Returns null when VOYAGE_API_KEY is unset so callers fall back to keyless paths.
// Docs: https://docs.voyageai.com/docs/embeddings , https://docs.voyageai.com/reference/multimodal-embeddings-api

export const VOYAGE_TEXT_MODEL = "voyage-4";
export const VOYAGE_IMAGE_MODEL = "voyage-multimodal-3.5";
export const EMBEDDING_DIMENSIONS = 1024;
const BASE_URL = "https://api.voyageai.com/v1";
const TEXT_BATCH = 128;
const IMAGE_BATCH = 16;
const TIMEOUT_MS = 30_000;

export function hasVoyageKey(): boolean {
  return Boolean(process.env.VOYAGE_API_KEY);
}

interface VoyageResponse {
  data: Array<{ embedding: number[]; index: number }>;
}

async function post(path: string, body: unknown): Promise<VoyageResponse> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.VOYAGE_API_KEY}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Voyage ${path} failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as VoyageResponse;
}

function ordered(r: VoyageResponse): number[][] {
  return [...r.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export async function embedTexts(texts: string[], inputType: "query" | "document"): Promise<number[][] | null> {
  if (!hasVoyageKey()) return null;
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += TEXT_BATCH) {
    const batch = texts.slice(i, i + TEXT_BATCH);
    const r = await post("/embeddings", { input: batch, model: VOYAGE_TEXT_MODEL, input_type: inputType });
    out.push(...ordered(r));
  }
  return out;
}

export async function embedImages(images: { mime: string; base64: string }[]): Promise<number[][] | null> {
  if (!hasVoyageKey()) return null;
  const out: number[][] = [];
  for (let i = 0; i < images.length; i += IMAGE_BATCH) {
    const batch = images.slice(i, i + IMAGE_BATCH);
    const inputs = batch.map((im) => ({
      content: [{ type: "image_base64", image_base64: `data:${im.mime};base64,${im.base64}` }],
    }));
    const r = await post("/multimodalembeddings", { inputs, model: VOYAGE_IMAGE_MODEL });
    out.push(...ordered(r));
  }
  return out;
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}
