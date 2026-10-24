// The only path that clicks Submit on the portal: a human tap in the UI.
import { PortalSubmitError, submitPortal } from "@/agent/portal";

export const runtime = "nodejs";

export async function POST(_req: Request, ctx: RouteContext<"/api/portal/[id]/submit">) {
  const { id } = await ctx.params;
  try {
    const { confirmation } = await submitPortal(id);
    return Response.json({ type: "submitted", confirmation });
  } catch (err) {
    const status = err instanceof PortalSubmitError ? 409 : 500;
    return Response.json({ error: err instanceof Error ? err.message : "Submit failed" }, { status });
  }
}
