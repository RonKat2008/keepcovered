// Written against convex/server generics so it typechecks before `npx convex dev` generates _generated/.
import { mutationGeneric, queryGeneric, internalMutationGeneric, anyApi } from "convex/server";
import { v } from "convex/values";

const TTL_MS = 60 * 60 * 1000;
const internalRefs = anyApi as any;

export const create = mutationGeneric({
  args: { sessionId: v.string(), lang: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const now = Date.now();
    await ctx.db.insert("sessions", { sessionId: a.sessionId, lang: a.lang, createdAt: now, expiresAt: now + TTL_MS });
    await ctx.scheduler.runAfter(TTL_MS, internalRefs.sessions.purge, { id: a.sessionId });
  },
});

export const appendEvent = mutationGeneric({
  args: { sessionId: v.string(), seq: v.number(), event: v.any() },
  handler: async (ctx, a) => {
    await ctx.db.insert("events", a);
  },
});

export const setResult = mutationGeneric({
  args: { sessionId: v.string(), result: v.any() },
  handler: async (ctx, a) => {
    const prev = await ctx.db.query("results").withIndex("by_session", (q) => q.eq("sessionId", a.sessionId)).first();
    if (prev) await ctx.db.patch(prev._id, { result: a.result });
    else await ctx.db.insert("results", a);
  },
});

export const getResult = queryGeneric({
  args: { sessionId: v.string() },
  handler: async (ctx, a) => {
    const r = await ctx.db.query("results").withIndex("by_session", (q) => q.eq("sessionId", a.sessionId)).first();
    return r?.result ?? null;
  },
});

export const listEvents = queryGeneric({
  args: { sessionId: v.string() },
  handler: async (ctx, a) => {
    const rows = await ctx.db.query("events").withIndex("by_session", (q) => q.eq("sessionId", a.sessionId)).collect();
    return rows.map((r) => r.event);
  },
});

async function wipe(ctx: { db: any }, sessionId: string) {
  for (const table of ["sessions", "events", "results"] as const) {
    const rows = await ctx.db.query(table).withIndex("by_session", (q: any) => q.eq("sessionId", sessionId)).collect();
    for (const r of rows) await ctx.db.delete(r._id);
  }
}

export const remove = mutationGeneric({
  args: { sessionId: v.string() },
  handler: async (ctx, a) => wipe(ctx, a.sessionId),
});

/** Scheduled one hour after create; also called by the hourly cron sweep. */
export const purge = internalMutationGeneric({
  args: { id: v.string() },
  handler: async (ctx, a) => wipe(ctx, a.id),
});

export const purgeExpired = internalMutationGeneric({
  args: {},
  handler: async (ctx) => {
    const old = await ctx.db.query("sessions").withIndex("by_expires", (q) => q.lt("expiresAt", Date.now())).collect();
    for (const s of old) await wipe(ctx, s.sessionId);
    return old.length;
  },
});
