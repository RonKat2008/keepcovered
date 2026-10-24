import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { mapCitedResponse, parseSource } from "@/claude/citations";
import { searchResultBlocks } from "@/claude/tasks/explain";
import type { RuleChunk } from "@/claude/types";

const chunks: RuleChunk[] = [
  { id: "c1", source_id: "acwdl-25-30", title: "ACWDL 25-30", page: 7, text: "monthly income of at least $580" },
  { id: "c2", source_id: "acwdl-25-30", title: "ACWDL 25-30", page: 9, text: "At least 80 hours of work" },
];

// Hand-written response in the shape of Anthropic.ContentBlock[] with search_result_location citations.
const fakeContent = [
  { type: "thinking", thinking: "", signature: "sig" },
  { type: "text", text: "Here is what we found. ", citations: null },
  {
    type: "text",
    text: "You can earn at least $580 in a month.",
    citations: [
      {
        type: "search_result_location",
        cited_text: "monthly income of at least $580",
        search_result_index: 0,
        source: "acwdl-25-30#p7",
        title: "ACWDL 25-30 (page 7)",
        start_block_index: 0,
        end_block_index: 1,
      },
    ],
  },
  {
    type: "text",
    text: " Or work 80 hours.",
    citations: [
      {
        type: "search_result_location",
        cited_text: "At least 80 hours of work",
        search_result_index: 5,
        source: "acwdl-25-30#p9",
        title: null,
        start_block_index: 0,
        end_block_index: 1,
      },
    ],
  },
] as unknown as Anthropic.ContentBlock[];

describe("mapCitedResponse", () => {
  it("maps text blocks to spans and drops thinking blocks", () => {
    const spans = mapCitedResponse(fakeContent, chunks);
    expect(spans).toHaveLength(3);
    expect(spans[0]).toEqual({ text: "Here is what we found. ", citations: [] });
  });

  it("recovers source id and page from the matched chunk", () => {
    const [, second] = mapCitedResponse(fakeContent, chunks);
    expect(second.citations).toEqual([
      { source_id: "acwdl-25-30", title: "ACWDL 25-30 (page 7)", page: 7, cited_text: "monthly income of at least $580" },
    ]);
  });

  it("falls back to the source string when the index does not match a chunk", () => {
    const third = mapCitedResponse(fakeContent, chunks)[2];
    expect(third.citations[0]).toMatchObject({ source_id: "acwdl-25-30", page: 9, title: "acwdl-25-30" });
  });
});

describe("search_result blocks", () => {
  it("builds blocks with citations enabled and a page-tagged source", () => {
    const [block] = searchResultBlocks(chunks);
    expect(block).toMatchObject({
      type: "search_result",
      source: "acwdl-25-30#p7",
      citations: { enabled: true },
      content: [{ type: "text", text: "monthly income of at least $580" }],
    });
  });
  it("parses sources without a page", () => {
    expect(parseSource("cms-ifr")).toEqual({ source_id: "cms-ifr", page: null });
  });
});
