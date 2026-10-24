import { getStore } from "@/store";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: RouteContext<"/api/cases/[id]">) {
  const { id } = await ctx.params;
  const store = getStore();
  if (!(await store.get(id))) return Response.json({ error: "Case not found or expired." }, { status: 404 });
  const result = await store.getResult(id);
  if (!result) return Response.json({ error: "Case is still running." }, { status: 409 });
  return Response.json(result);
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/cases/[id]">) {
  const { id } = await ctx.params;
  await getStore().delete(id);
  return new Response(null, { status: 204 });
}
