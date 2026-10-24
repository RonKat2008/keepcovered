import { describe, it, expect, beforeAll } from "vitest";
import { createHash } from "node:crypto";
import { chunkPage, loadChunks } from "@/rag/chunk";
import { BM25, tokenize } from "@/rag/bm25";
import { retrieve, retrieveForCase, rrf } from "@/rag/retrieve";
import { suggestPayers, trigrams, sparseCosine } from "@/rag/payers";
import { duplicateCandidates } from "@/rag/imageDedupe";
import { cosine, embedTexts, embedImages } from "@/embeddings/voyage";

beforeAll(() => {
  delete process.env.VOYAGE_API_KEY;
});

describe("chunking", () => {
  it("never crosses pages and keeps chunks bounded", () => {
    const chunks = loadChunks();
    expect(chunks.length).toBeGreaterThan(50);
    for (const c of chunks) {
      expect(c.page).toBeGreaterThan(0);
      expect(c.text.split(/\s+/).length).toBeLessThanOrEqual(220);
      expect(c.id).toContain(`${c.source_id}-p${c.page}-`);
    }
    expect(new Set(chunks.map((c) => c.source_id))).toEqual(
      new Set(["acwdl-25-30", "acwdl-25-31", "dhcs-hr1-implementation-plan"]),
    );
    expect(chunks.find((c) => c.source_id === "acwdl-25-30")!.title).toMatch(/ACWDL 25-30/);
  });
  it("splits long text at sentence boundaries", () => {
    const s = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} has six words.`).join(" ");
    const parts = chunkPage(s);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join(" ").split(/\s+/).length).toBe(s.split(/\s+/).length);
  });
});

describe("bm25 + retrieve (keyless)", () => {
  it("tokenizes with stopword removal", () => {
    expect(tokenize("The $580 income, de la casa!")).toEqual(["usd", "580", "income", "casa"]);
  });
  it("ranks the matching chunk first", () => {
    const b = new BM25([
      { id: "a", source_id: "s", title: "t", page: 1, text: "apples and oranges" },
      { id: "b", source_id: "s", title: "t", page: 1, text: "gross income of 580 dollars" },
    ]);
    expect(b.rank("580 income")[0].index).toBe(1);
  });
  it("rrf favors items ranked well in multiple lists", () => {
    const s = rrf([[1, 2, 3], [2, 1, 4]]);
    expect([...s].sort((a, b) => b[1] - a[1])[0][0]).toBeOneOf([1, 2]);
    expect(s.get(3)!).toBeLessThan(s.get(1)!);
  });
  it("580 query surfaces acwdl-25-30 page 7", async () => {
    const r = await retrieve("monthly income $580 minimum wage 80 hours", 6);
    expect(r.some((c) => c.source_id === "acwdl-25-30" && c.page === 7)).toBe(true);
  });
  it("dedupes and respects k", async () => {
    const r = await retrieve("exemption parent child", 4);
    expect(r.length).toBeLessThanOrEqual(4);
    expect(new Set(r.map((c) => c.id)).size).toBe(r.length);
  });
  it("retrieveForCase returns fused results", async () => {
    const r = await retrieveForCase([], 8);
    expect(r.length).toBeGreaterThan(0);
    expect(r.length).toBeLessThanOrEqual(8);
  });
});

describe("voyage keyless", () => {
  it("returns null without a key", async () => {
    expect(await embedTexts(["x"], "query")).toBeNull();
    expect(await embedImages([{ mime: "image/png", base64: "AA==" }])).toBeNull();
  });
  it("cosine basics", () => {
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([1, 2], [2, 4])).toBeCloseTo(1);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});

describe("payer suggestion (trigram kNN)", () => {
  const t = (id: string, description: string) => ({ id, date: "2026-10-01", amount: 100, description });
  it("classifies known gig descriptors", async () => {
    const r = await suggestPayers([
      t("1", "UBER TECHNOLOGIES PAYOUT"),
      t("2", "UBER *EATS PAYOUT 8005928996"),
      t("3", "LYFT INC DIRECT DEP 1234"),
      t("4", "DOORDASH DASHER DIRECT"),
      t("5", "DD DOORDASH INSTANT"),
      t("6", "MAPLEBEAR INSTACART SHOPPER"),
    ]);
    expect(r.map((x) => x.platform)).toEqual(["uber", "uber", "lyft", "doordash", "doordash", "instacart"]);
    expect(r[0].similarity).toBeGreaterThan(0.9);
  });
  it("returns null for non-income and unfamiliar descriptors", async () => {
    const r = await suggestPayers([
      t("1", "VENMO *CASHOUT JANE"),
      t("2", "ZELLE FROM CARLOS"),
      t("3", "IRS TREAS 310 TAX REF"),
      t("4", "QZXV KKJW"),
    ]);
    expect(r.every((x) => x.platform === null)).toBe(true);
  });
  it("payroll maps to other", async () => {
    const [r] = await suggestPayers([t("1", "ADP PAYROLL DEPOSIT ACME")]);
    expect(r.platform).toBe("other");
  });
  it("trigram cosine is symmetric and bounded", () => {
    const a = trigrams("UBER PAYOUT"), b = trigrams("UBER PAYMENT");
    expect(sparseCosine(a, b)).toBeCloseTo(sparseCosine(b, a));
    expect(sparseCosine(a, a)).toBeCloseTo(1);
  });
});

describe("image dedupe", () => {
  it("finds exact sha256 duplicates keyless", async () => {
    const a = new Uint8Array([1, 2, 3]);
    const out = await duplicateCandidates([
      { id: "a", mime: "image/png", bytes: a },
      { id: "b", mime: "image/png", bytes: new Uint8Array([1, 2, 3]) },
      { id: "c", mime: "image/png", bytes: new Uint8Array([9]) },
    ]);
    expect(out).toEqual([{ a: "a", b: "b", similarity: 1, method: "sha256" }]);
    expect(createHash("sha256").update(a).digest("hex")).toHaveLength(64);
  });
});
