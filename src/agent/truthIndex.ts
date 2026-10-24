// Maps synthetic fixture images (by sha256) to their ground-truth sidecars. Used only by the
// simulated Claude path when no API key is configured, so synthetic uploads still demo end to end.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const FIXTURE_ROOTS = ["fixtures/drivers", "public/demo"];
const IMAGE_RE = /\.(png|jpe?g|pdf)$/i;

let index: Map<string, string> | null = null;

function sidecarFor(file: string): string | null {
  const candidates = [`${file}.truth.json`, file.replace(IMAGE_RE, ".truth.json")];
  return candidates.find((c) => existsSync(c)) ?? null;
}

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (IMAGE_RE.test(name)) out.push(p);
  }
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function build(): Map<string, string> {
  const files: string[] = [];
  for (const root of FIXTURE_ROOTS) walk(join(process.cwd(), root), files);
  const map = new Map<string, string>();
  for (const file of files) {
    const truth = sidecarFor(file);
    if (truth) map.set(sha256(readFileSync(file)), truth);
  }
  // public/demo copies may lack sidecars; they hash-match the fixtures copies.
  return map;
}

export function truthPathFor(bytes: Uint8Array): string | undefined {
  index ??= build();
  return index.get(sha256(bytes));
}
