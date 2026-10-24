// Keep structurally identical to RuleChunk in src/claude/types.ts.
export type RuleChunk = {
  id: string;
  source_id: string;
  title: string;
  page: number;
  text: string;
  score?: number;
};

export type RuleIndex = {
  chunks: RuleChunk[];
  embeddings: number[][] | null;
  model: string | null;
};
