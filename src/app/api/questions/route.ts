import { getScreenerQuestions, loadWorkRules } from "@/rules";

export const runtime = "nodejs";

export function GET() {
  return Response.json(getScreenerQuestions(loadWorkRules()));
}
