import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Clean demo screens: no floating dev badge.
  devIndicators: false,
  // Let phones on the same Wi-Fi load the dev server (dev only).
  allowedDevOrigins: ["10.0.14.126", "*.local"],
  // Server-only packages with native or dynamic requires: keep them out of the bundle.
  serverExternalPackages: ["playwright", "playwright-core", "unpdf", "@azure/monitor-opentelemetry"],
  // The rules config, rule text index and demo fixtures are read from disk at runtime.
  outputFileTracingIncludes: {
    "/api/**": ["./data/rules/**", "./fixtures/**", "./public/demo/**", "./prompts/**"],
  },
};

export default nextConfig;
