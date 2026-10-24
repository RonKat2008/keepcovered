import { MemorySessionStore } from "./memory";
import type { SessionStore } from "./types";

export * from "./types";
export { MemorySessionStore } from "./memory";

const KEY = Symbol.for("keepcovered.sessionStore");
type G = typeof globalThis & { [KEY]?: SessionStore };

/** Singleton survives Next dev HMR. Convex write-through mirror when CONVEX_URL is set. */
export function getStore(): SessionStore {
  const g = globalThis as G;
  if (!g[KEY]) {
    const memory = new MemorySessionStore();
    if (process.env.CONVEX_URL) {
      // Lazy require keeps the convex client out of the keyless path.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ConvexMirrorStore } = require("./convex") as typeof import("./convex");
      g[KEY] = new ConvexMirrorStore(memory, process.env.CONVEX_URL);
    } else g[KEY] = memory;
  }
  return g[KEY];
}
