import { AiDemo } from "@/components/ai-demo";
import { getHealth } from "@/lib/health";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function Home() {
  const health = getHealth();
  return (
    <main className="mx-auto max-w-xl space-y-6 p-8">
      <h1 className="text-3xl font-bold">Hackathon starter</h1>
      <div className="flex gap-2">
        <Badge variant={health.ok ? "default" : "destructive"}>API</Badge>
        <Badge variant={health.supabaseConfigured ? "default" : "secondary"}>
          Supabase
        </Badge>
        <Badge variant={health.aiConfigured ? "default" : "secondary"}>
          Claude
        </Badge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Claude demo</CardTitle>
        </CardHeader>
        <CardContent>
          <AiDemo />
        </CardContent>
      </Card>
    </main>
  );
}
