import { z } from "zod";

import { getStore } from "@/store";

export const runtime = "nodejs";

const Body = z.object({ question_id: z.string().min(1).max(200), value: z.string().min(1).max(50) });

export async function POST(request: Request, ctx: RouteContext<"/api/cases/[id]/answers">) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Expected { question_id, value }." }, { status: 400 });
  const store = getStore();
  if (!(await store.get(id))) return Response.json({ error: "Case not found or expired." }, { status: 404 });
  await store.setAnswer(id, parsed.data.question_id, parsed.data.value);
  return new Response(null, { status: 204 });
}
