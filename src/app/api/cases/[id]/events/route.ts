// Server-Sent Events: replays past agent events, then streams new ones, pending questions,
// and the final result.
import { onQuestion, pendingQuestions } from "@/agent/questions";
import type { AgentEvent, UserQuestion } from "@/lib/schemas";
import { getStore } from "@/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15_000;
const RESULT_POLL_MS = 500;

export async function GET(request: Request, ctx: RouteContext<"/api/cases/[id]/events">) {
  const { id } = await ctx.params;
  const store = getStore();
  if (!(await store.get(id))) return Response.json({ error: "Case not found or expired." }, { status: 404 });

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (payload: unknown) => {
        if (!closed) controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      const sentQuestions = new Set<string>();
      const sendQuestion = (q: UserQuestion) => {
        if (sentQuestions.has(q.id)) return;
        sentQuestions.add(q.id);
        send({ type: "question", question: q });
      };

      store.events(id).forEach((ev: AgentEvent) => send(ev));
      pendingQuestions(id).forEach(sendQuestion);
      const unsubEvents = store.subscribe(id, (ev) => send(ev));
      const unsubQuestions = onQuestion(id, sendQuestion);
      const heartbeat = setInterval(() => !closed && controller.enqueue(encoder.encode(": ping\n\n")), HEARTBEAT_MS);
      const poll = setInterval(async () => {
        const result = await store.getResult(id);
        const failed = store.events(id).some((e) => e.kind === "error" && e.step === "handoff");
        if (result || failed) {
          if (result) send({ type: "result", result });
          cleanup();
          controller.close();
        }
      }, RESULT_POLL_MS);

      cleanup = () => {
        if (closed) return;
        closed = true;
        unsubEvents();
        unsubQuestions();
        clearInterval(heartbeat);
        clearInterval(poll);
      };
      request.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
