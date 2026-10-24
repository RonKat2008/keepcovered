import { writeFileSync } from "node:fs";
import path from "node:path";
import { loadChunks } from "../src/rag/chunk";
import { embedTexts, VOYAGE_TEXT_MODEL } from "../src/embeddings/voyage";
import type { RuleIndex } from "../src/rag/types";

async function main() {
  const chunks = loadChunks();
  let embeddings: number[][] | null = null;
  try {
    embeddings = await embedTexts(
      chunks.map((c) => `${c.title}\n${c.text}`),
      "document",
    );
  } catch (e) {
    console.warn("embedding failed, writing BM25-only index:", (e as Error).message);
  }
  const index: RuleIndex = { chunks, embeddings, model: embeddings ? VOYAGE_TEXT_MODEL : null };
  const out = path.join(process.cwd(), "data", "rules", "index.json");
  writeFileSync(out, JSON.stringify(index));
  console.log(`indexed ${chunks.length} chunks; embeddings=${embeddings ? "yes" : "no (keyless)"} -> ${out}`);
}
main();
