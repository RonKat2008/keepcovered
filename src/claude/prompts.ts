// Cached loader for prompts/*.md. Prompts are byte-stable so the system prefix caches.
import { readFileSync } from "node:fs";
import path from "node:path";

const cache = new Map<string, string>();

export type PromptName = "system" | "triage" | "extract" | "adjudicate" | "letter" | "explain";

export function loadPrompt(name: PromptName): string {
  const hit = cache.get(name);
  if (hit !== undefined) return hit;
  const file = path.join(process.cwd(), "prompts", `${name}.md`);
  const text = readFileSync(file, "utf8").trim();
  cache.set(name, text);
  return text;
}

/** Shared safety preamble + task prompt, joined in a fixed order. */
export function systemFor(task: Exclude<PromptName, "system">): string {
  return `${loadPrompt("system")}\n\n${loadPrompt(task)}`;
}
