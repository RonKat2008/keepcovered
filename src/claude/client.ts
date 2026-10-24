// Claude client router. Clients are created lazily, never at module top level.
import Anthropic from "@anthropic-ai/sdk";
import { AnthropicFoundry } from "@anthropic-ai/foundry-sdk";

export type Provider = "foundry" | "anthropic";
/** Foundry lacks Batches, Files and Models API, so only "runtime" calls may go there. */
export type ClientPurpose = "runtime" | "batch" | "files";

/** Foundry's client has no `messages.batches`, so it is not assignable to `Anthropic`. */
export type ClaudeClient = Anthropic | AnthropicFoundry;
type Entry = { client: ClaudeClient; provider: Provider };

const cache = new Map<Provider, Entry>();

function hasFoundry(): boolean {
  return Boolean(process.env.ANTHROPIC_FOUNDRY_API_KEY && process.env.ANTHROPIC_FOUNDRY_RESOURCE);
}

export function getClaude(purpose: "batch" | "files"): { client: Anthropic; provider: "anthropic" } | null;
export function getClaude(purpose: ClientPurpose): Entry | null;
export function getClaude(purpose: ClientPurpose): Entry | null {
  const useFoundry = purpose === "runtime" && hasFoundry();
  const provider: Provider | null = useFoundry ? "foundry" : process.env.ANTHROPIC_API_KEY ? "anthropic" : null;
  if (!provider) return null;

  const cached = cache.get(provider);
  if (cached) return cached;

  const client: ClaudeClient =
    provider === "foundry"
      ? new AnthropicFoundry({
          apiKey: process.env.ANTHROPIC_FOUNDRY_API_KEY,
          resource: process.env.ANTHROPIC_FOUNDRY_RESOURCE,
        })
      : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const entry: Entry = { client, provider };
  cache.set(provider, entry);
  return entry;
}

/** True when a real model call should be made (credentials present and not in DEMO_MODE). */
export function isLive(purpose: ClientPurpose = "runtime"): boolean {
  return process.env.DEMO_MODE !== "true" && getClaude(purpose) !== null;
}

/** Test hook: drop cached clients after env changes. */
export function resetClaudeClients(): void {
  cache.clear();
}
