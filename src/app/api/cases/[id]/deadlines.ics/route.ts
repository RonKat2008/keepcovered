import { toIcs } from "@/rules";
import { getStore } from "@/store";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: RouteContext<"/api/cases/[id]/deadlines.ics">) {
  const { id } = await ctx.params;
  const result = await getStore().getResult(id);
  if (!result) return Response.json({ error: "Case not found, expired, or still running." }, { status: 404 });
  return new Response(toIcs(result.deadlines, result.lang, new Date().toISOString()), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="keepcovered-deadlines.ics"' },
  });
}
