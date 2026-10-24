import { describe, expect, it } from "vitest";
import { createRedactingSpanProcessor, withSpan } from "@/lib/otel";

describe("otel", () => {
  it("redacts string attributes on span end", () => {
    const span = { attributes: { a: "ssn 123-45-6789", n: 3, l: ["a@b.co", 1] } as Record<string, unknown> };
    createRedactingSpanProcessor().onEnd(span);
    expect(span.attributes).toEqual({ a: "ssn [REDACTED]", n: 3, l: ["[REDACTED]", 1] });
  });

  it("withSpan is a transparent no-op without a configured SDK", async () => {
    await expect(withSpan("x", { k: "v", u: undefined }, async () => 7)).resolves.toBe(7);
    await expect(withSpan("x", {}, async () => { throw new Error("boom a@b.co"); })).rejects.toThrow("boom");
  });
});
