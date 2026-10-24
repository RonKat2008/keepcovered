import { createHash } from "node:crypto";
import { cosine, embedImages, hasVoyageKey } from "../embeddings/voyage";

export const EMBEDDING_DUP_THRESHOLD = 0.95;

export type DupCandidate = { a: string; b: string; similarity: number; method: "sha256" | "embedding" };

/** Candidates only; the rules engine decides what to drop. */
export async function duplicateCandidates(
  docs: { id: string; mime: string; bytes: Uint8Array }[],
): Promise<DupCandidate[]> {
  const out: DupCandidate[] = [];
  const hashes = docs.map((d) => createHash("sha256").update(d.bytes).digest("hex"));
  const exact = new Set<string>();
  for (let i = 0; i < docs.length; i++) {
    for (let j = i + 1; j < docs.length; j++) {
      if (hashes[i] === hashes[j]) {
        out.push({ a: docs[i].id, b: docs[j].id, similarity: 1, method: "sha256" });
        exact.add(`${i}:${j}`);
      }
    }
  }
  if (!hasVoyageKey()) return out;
  const imgIdx = docs.map((d, i) => (d.mime.startsWith("image/") ? i : -1)).filter((i) => i >= 0);
  if (imgIdx.length < 2) return out;
  try {
    const vecs = await embedImages(
      imgIdx.map((i) => ({ mime: docs[i].mime, base64: Buffer.from(docs[i].bytes).toString("base64") })),
    );
    if (!vecs) return out;
    for (let x = 0; x < imgIdx.length; x++) {
      for (let y = x + 1; y < imgIdx.length; y++) {
        const i = imgIdx[x], j = imgIdx[y];
        if (exact.has(`${i}:${j}`)) continue;
        const sim = cosine(vecs[x], vecs[y]);
        if (sim >= EMBEDDING_DUP_THRESHOLD) out.push({ a: docs[i].id, b: docs[j].id, similarity: sim, method: "embedding" });
      }
    }
  } catch {
    // embedding is best-effort
  }
  return out;
}
