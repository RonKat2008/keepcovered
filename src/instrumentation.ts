// Next.js instrumentation hook: runs once per server instance, before requests are served.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startTelemetry } = await import("./lib/otel");
    await startTelemetry();
  }
}
