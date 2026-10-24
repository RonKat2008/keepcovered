import { isSupabaseConfigured } from "@/lib/supabase/config";

export function getHealth() {
  return {
    ok: true,
    supabaseConfigured: isSupabaseConfigured,
    aiConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
  };
}
