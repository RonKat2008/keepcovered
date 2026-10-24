#!/usr/bin/env node
// Hackathon readiness check: env vars, Supabase link, Vercel link, then `npm run verify`.
// Usage: npm run preflight [-- --skip-verify]
import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "ANTHROPIC_API_KEY",
];
const ENV_FILE = ".env.local";

function readEnvKeys(path) {
  if (!existsSync(path)) return new Set();
  const keys = readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .filter((line) => line.slice(line.indexOf("=") + 1).trim() !== "")
    .map((line) => line.slice(0, line.indexOf("=")).trim());
  return new Set(keys);
}

function commandWorks(cmd) {
  try {
    execSync(cmd, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const envKeys = readEnvKeys(ENV_FILE);
const checks = [
  { name: `${ENV_FILE} exists`, ok: existsSync(ENV_FILE), fix: `cp .env.example ${ENV_FILE}` },
  ...REQUIRED_ENV.map((key) => ({
    name: `${key} is set`,
    ok: envKeys.has(key) || Boolean(process.env[key]),
    fix: `add ${key} to ${ENV_FILE}`,
  })),
  {
    name: "Supabase project linked",
    ok: existsSync("supabase/.temp/project-ref"),
    fix: "npx supabase login && npx supabase link --project-ref <ref>",
  },
  { name: "Vercel CLI installed", ok: commandWorks("vercel --version"), fix: "npm i -g vercel" },
  { name: "Vercel project linked", ok: existsSync(".vercel/project.json"), fix: "vercel link" },
];

if (!process.argv.includes("--skip-verify")) {
  console.log("Running npm run verify …");
  checks.push({ name: "npm run verify passes", ok: commandWorks("npm run verify"), fix: "npm run verify (read the errors)" });
}

for (const check of checks) {
  console.log(`${check.ok ? "✅" : "❌"} ${check.name}${check.ok ? "" : `  →  ${check.fix}`}`);
}

const failed = checks.filter((check) => !check.ok).length;
console.log(failed === 0 ? "\nReady to hack." : `\n${failed} check(s) failing.`);
process.exit(failed === 0 ? 0 : 1);
