import { buildPacket } from "@/pdf/packet";
import { getStore } from "@/store";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: RouteContext<"/api/cases/[id]/packet.pdf">) {
  const { id } = await ctx.params;
  const store = getStore();
  const result = await store.getResult(id);
  if (!result) return Response.json({ error: "Case not found, expired, or still running." }, { status: 404 });
  const docs = await store.getDocs(id);
  const pdf = await buildPacket({ result, docs, lang: result.lang, generatedAt: new Date().toISOString().slice(0, 10) });
  return new Response(pdf.buffer as ArrayBuffer, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="keepcovered-proof-packet.pdf"' },
  });
}
