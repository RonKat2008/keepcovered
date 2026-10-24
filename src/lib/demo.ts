// DEMO_MODE: serve canned responses so the live demo survives bad Wi-Fi or API rate limits.

const DEFAULT_CANNED_REPLY =
  "This is a canned DEMO_MODE reply. Replace it in src/lib/demo.ts with a realistic answer from your demo script.";
const STREAM_CHUNK_CHARS = 12;
const STREAM_CHUNK_DELAY_MS = 20;

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}

/** Canned AI replies keyed by feature id. Add one per AI feature in docs/SPEC.md §4. */
export const CANNED_AI_REPLIES: Readonly<Record<string, string>> = {
  default: DEFAULT_CANNED_REPLY,
};

export function cannedReply(feature = "default"): string {
  return CANNED_AI_REPLIES[feature] ?? DEFAULT_CANNED_REPLY;
}

/** Streams text in small chunks so canned replies look like a live model response. */
export function streamText(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (offset >= text.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(text.slice(offset, offset + STREAM_CHUNK_CHARS)));
      offset += STREAM_CHUNK_CHARS;
      await new Promise((resolve) => setTimeout(resolve, STREAM_CHUNK_DELAY_MS));
    },
  });
}
