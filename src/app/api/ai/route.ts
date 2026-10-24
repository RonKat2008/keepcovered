import Anthropic from "@anthropic-ai/sdk";

import { cannedReply, isDemoMode, streamText } from "@/lib/demo";

const DEFAULT_MODEL = "claude-sonnet-5-5";
const MAX_PROMPT_CHARS = 8000;
const MAX_OUTPUT_TOKENS = 4096;
const TEXT_HEADERS = { "Content-Type": "text/plain; charset=utf-8" };

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const prompt =
    typeof body === "object" && body !== null && "prompt" in body
      ? (body as { prompt: unknown }).prompt
      : undefined;

  if (typeof prompt !== "string" || prompt.trim() === "") {
    return Response.json(
      { error: "`prompt` must be a non-empty string." },
      { status: 400 },
    );
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return Response.json(
      { error: `\`prompt\` must be at most ${MAX_PROMPT_CHARS} characters.` },
      { status: 400 },
    );
  }

  if (isDemoMode()) {
    return new Response(streamText(cannedReply()), { headers: TEXT_HEADERS });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY is not set. Add it to .env.local." },
      { status: 500 },
    );
  }

  const client = new Anthropic();
  const stream = client.messages.stream({
    model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: [{ role: "user", content: prompt }],
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        controller.close();
      } catch (err) {
        console.error("Anthropic stream failed:", err);
        controller.error(err);
      }
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(readable, { headers: TEXT_HEADERS });
}
