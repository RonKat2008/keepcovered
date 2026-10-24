import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server-only packages with native or dynamic requires: keep them out of the bundle.
  serverExternalPackages: ["playwright", "playwright-core", "unpdf", "@azure/monitor-opentelemetry"],
  // The rules config, rule text index and demo fixtures are read from disk at runtime.
  outputFileTracingIncludes: {
    "/api/**": ["./data/rules/**", "./fixtures/**", "./public/demo/**", "./prompts/**"],
  },
};

export default nextConfig;
