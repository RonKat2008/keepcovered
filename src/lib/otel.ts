// Tracing: Azure Monitor when APPLICATIONINSIGHTS_CONNECTION_STRING is set, no-op otherwise.
import { SpanStatusCode, trace } from "@opentelemetry/api";
import { redact } from "@/lib/redact";

const TRACER_NAME = "keepcovered";

export type SpanAttrs = Record<string, string | number | boolean | undefined>;

/** Minimal structural SpanProcessor (avoids a direct dependency on sdk-trace-base). */
export interface RedactingSpanProcessor {
  onStart(): void;
  onEnd(span: { attributes: Record<string, unknown> }): void;
  forceFlush(): Promise<void>;
  shutdown(): Promise<void>;
}

/** Redacts string attribute values just before export. */
export function createRedactingSpanProcessor(): RedactingSpanProcessor {
  return {
    onStart() {},
    onEnd(span) {
      const attrs = span.attributes;
      for (const key of Object.keys(attrs)) {
        const v = attrs[key];
        if (typeof v === "string") attrs[key] = redact(v);
        else if (Array.isArray(v)) attrs[key] = v.map((x) => (typeof x === "string" ? redact(x) : x));
      }
    },
    forceFlush: () => Promise.resolve(),
    shutdown: () => Promise.resolve(),
  };
}

let started = false;

/** Idempotent. Returns true when Azure Monitor was started. */
export async function startTelemetry(): Promise<boolean> {
  const connectionString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
  if (!connectionString || started) return started;
  const { useAzureMonitor } = await import("@azure/monitor-opentelemetry");
  useAzureMonitor({
    azureMonitorExporterOptions: { connectionString },
    // Processor mutates attributes at span end, before the batch exporter reads them.
    spanProcessors: [createRedactingSpanProcessor() as never],
  });
  started = true;
  return true;
}

/** Runs fn inside a span named `name`. Attribute strings are redacted. No-op tracer when OTel is not configured. */
export async function withSpan<T>(name: string, attrs: SpanAttrs, fn: () => Promise<T>): Promise<T> {
  const tracer = trace.getTracer(TRACER_NAME);
  return tracer.startActiveSpan(name, async (span) => {
    try {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === undefined) continue;
        span.setAttribute(k, typeof v === "string" ? redact(v) : v);
      }
      return await fn();
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: redact(err instanceof Error ? err.message : String(err)) });
      throw err;
    } finally {
      span.end();
    }
  });
}
