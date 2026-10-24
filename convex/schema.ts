import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Uploaded document bytes are never stored here; they live in server memory for the session only.
export default defineSchema({
  sessions: defineTable({
    sessionId: v.string(),
    lang: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.number(),
  }).index("by_session", ["sessionId"]).index("by_expires", ["expiresAt"]),
  events: defineTable({
    sessionId: v.string(),
    seq: v.number(),
    event: v.any(),
  }).index("by_session", ["sessionId", "seq"]),
  results: defineTable({
    sessionId: v.string(),
    result: v.any(),
  }).index("by_session", ["sessionId"]),
  vectors: defineTable({
    sourceId: v.string(),
    chunkId: v.string(),
    page: v.number(),
    text: v.string(),
    embedding: v.array(v.float64()),
  }).vectorIndex("by_embedding", {
    vectorField: "embedding",
    dimensions: 1024,
    filterFields: ["sourceId"],
  }),
});
