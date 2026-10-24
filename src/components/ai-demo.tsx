"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function AiDemo() {
  const [prompt, setPrompt] = useState("");
  const [reply, setReply] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function send() {
    setIsLoading(true);
    setReply("");
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok || !res.body) {
        const { error } = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(error);
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        setReply((prev) => prev + value);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Request failed");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <Label htmlFor="prompt">Ask Claude</Label>
      <Textarea
        id="prompt"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Say hello..."
      />
      <Button onClick={send} disabled={isLoading || prompt.trim() === ""}>
        {isLoading ? "Streaming..." : "Send"}
      </Button>
      {reply && <p className="whitespace-pre-wrap text-sm">{reply}</p>}
    </div>
  );
}
