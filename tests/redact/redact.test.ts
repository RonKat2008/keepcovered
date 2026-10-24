import { describe, expect, it } from "vitest";
import { redact, redactDeep } from "@/lib/redact";

const M = "[REDACTED]";

describe("redact", () => {
  it.each([
    ["SSN 123-45-6789 on file", "123-45-6789"],
    ["ssn 123456789", "123456789"],
    ["SSN 123 45 6789", "123 45 6789"],
    ["CIN 91234567A", "91234567A"],
    ["Case #: 1234567", "1234567"],
    ["Case number: 55-998877", "55-998877"],
    ["Caso: 7654321", "7654321"],
    ["número de caso DEMO-0042", "DEMO-0042"],
    ["Account 123456789012", "123456789012"],
    ["routing 021000021", "021000021"],
    ["card 4111 1111 1111 1111", "4111 1111 1111 1111"],
    ["card 4111-1111-1111-1111", "4111-1111-1111-1111"],
    ["mail maria.g@example.com now", "maria.g@example.com"],
    ["call (415) 555-1234", "(415) 555-1234"],
    ["call 415-555-1234", "415-555-1234"],
    ["call +1 415 555 1234", "415 555 1234"],
    ["lives at 1234 Mission Street", "1234 Mission Street"],
    ["vive en 55 Calle Mayor", "55 Calle Mayor"],
    ["lives at 9 N. Oak Ave.", "9 N. Oak Ave"],
    ["DOB: 03/14/1990", "03/14/1990"],
    ["Date of birth March 14, 1990", "March 14, 1990"],
    ["Fecha de nacimiento: 14/03/1990", "14/03/1990"],
    ["fecha de nacimiento 14 de marzo de 1990", "14 de marzo de 1990"],
    ["Name: Maria Garcia", "Maria Garcia"],
    ["Nombre: José Peña", "José Peña"],
  ])("masks %s", (input, secret) => {
    const out = redact(input);
    expect(out).not.toContain(secret);
    expect(out).toContain(M);
  });

  it("keeps labels and surrounding words", () => {
    expect(redact("Name: Maria Garcia")).toBe(`Name: ${M}`);
    expect(redact("Nombre: José Peña Ruiz, thanks")).toBe(`Nombre: ${M}, thanks`);
    expect(redact("DOB: 03/14/1990")).toBe(`DOB: ${M}`);
    expect(redact("Case #: 1234567")).toBe(`Case #: ${M}`);
  });

  it("stops the name mask before the next label", () => {
    const out = redact("Name: Maria Garcia Case number: 1234567");
    expect(out).not.toContain("Maria");
    expect(out).not.toContain("1234567");
  });

  it("leaves harmless text, dates, money and short numbers alone", () => {
    for (const s of [
      "Earned $1,234.50 in 2026-09 over 62.5 hours",
      "Uber payout on 2026-09-30",
      "Name: ________  Case number: ________",
      "The case study had 12 steps",
      "Meets the income rule for September",
      "Short by $120.00",
    ]) {
      expect(redact(s)).toBe(s);
    }
  });

  it("is idempotent", () => {
    const once = redact("Name: Ana Lopez, SSN 123-45-6789, ana@x.com, 12 Main St");
    expect(redact(once)).toBe(once);
  });

  it("handles multiple identifiers in one string", () => {
    const out = redact("Maria, SSN 123-45-6789, phone 415-555-1234, mail a@b.co, CIN 91234567A");
    expect(out).toBe(`Maria, SSN ${M}, phone ${M}, mail ${M}, CIN ${M}`);
  });

  it("handles empty strings", () => {
    expect(redact("")).toBe("");
  });
});

describe("redactDeep", () => {
  it("redacts nested strings without mutating the input", () => {
    const input = {
      a: "ssn 123-45-6789",
      n: 42,
      ok: true,
      none: null,
      list: ["call 415-555-1234", { deep: "Nombre: Luis Mora" }],
    };
    const snapshot = JSON.parse(JSON.stringify(input));
    const out = redactDeep(input);
    expect(input).toEqual(snapshot);
    expect(out).not.toBe(input);
    expect(out.a).toBe(`ssn ${M}`);
    expect(out.n).toBe(42);
    expect(out.none).toBeNull();
    expect(out.list[0]).toBe(`call ${M}`);
    expect((out.list[1] as { deep: string }).deep).toBe(`Nombre: ${M}`);
  });

  it("survives cycles and passes through non-plain values", () => {
    const a: Record<string, unknown> = { s: "a@b.co" };
    a.self = a;
    const out = redactDeep(a);
    expect(out.s).toBe(M);
    expect(out.self).toBe(out);
    const bytes = new Uint8Array([1, 2]);
    expect(redactDeep({ bytes }).bytes).toBe(bytes);
  });
});
