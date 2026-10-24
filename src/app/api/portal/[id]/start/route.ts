// Starts the portal agent for a finished case and streams its progress as SSE. The agent
// fills the demo county portal and stops; only /submit (a human tap) can send it.
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runPortalAgent, type PortalEvent } from "@/agent/portal";
import { buildPacket } from "@/pdf/packet";
import { getStore } from "@/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request, ctx: RouteContext<"/api/portal/[id]/start">) {
  const { id } = await ctx.params;
  const store = getStore();
  const result = await store.getResult(id);
  if (!result) return Response.json({ error: "Case not found, expired, or still running." }, { status: 404 });

  const docs = await store.getDocs(id);
  const pdf = await buildPacket({ result, docs, lang: result.lang, generatedAt: new Date().toISOString().slice(0, 10) });
  const dir = await mkdtemp(join(tmpdir(), "keepcovered-"));
  const packetPath = join(dir, "proof-packet.pdf");
  await writeFile(packetPath, pdf);

  const baseUrl = new URL(request.url).origin;
  const encoder = new TextEncoder();
  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort());

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: PortalEvent | { type: string; [k: string]: unknown }) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          // client went away
        }
      };
      try {
        const run = await runPortalAgent({ sessionId: id, baseUrl, result, packetPath, lang: result.lang, onEvent: send, signal: abort.signal });
        if (run.status === "failed") send({ type: "error", message: run.summary });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "Portal agent failed" });
      } finally {
        controller.close();
      }
    },
    cancel() {
      abort.abort();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform" } });
}
