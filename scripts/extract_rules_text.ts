// Extracts per-page text from data/rules/*.pdf into data/rules/text/<name>.json for RAG indexing and rule review.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { extractText, getDocumentProxy } from "unpdf";

const RULES_DIR = "data/rules";
const OUT_DIR = join(RULES_DIR, "text");

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const file of readdirSync(RULES_DIR).filter((f) => f.endsWith(".pdf"))) {
    const pdf = await getDocumentProxy(new Uint8Array(readFileSync(join(RULES_DIR, file))));
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    const pages = (text as string[]).map((t, i) => ({ page: i + 1, text: t }));
    writeFileSync(join(OUT_DIR, file.replace(/\.pdf$/, ".json")), JSON.stringify({ file, totalPages, pages }, null, 1));
    console.log(`${file}: ${totalPages} pages`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
