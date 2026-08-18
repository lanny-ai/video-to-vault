"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/ui";

/**
 * Capture: paste a link, nothing else. The coaching card is the cheap feature
 * that makes everything downstream better.
 */
export default function CapturePage() {
  const router = useRouter();
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!source.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/capture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: source.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Capture failed.");
      router.push(`/workflows/${data.workflowId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Capture failed.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-8 pt-8">
      <div className="text-center">
        <h1 className="text-[28px] font-semibold tracking-tight">New recording</h1>
        <p className="mt-1 text-[15px] text-muted">
          Record the process once, narrating as you go. Paste the link here.
        </p>
      </div>

      <Card className="p-6">
        <label htmlFor="source" className="text-sm font-medium text-ink">
          Recording link
        </label>
        <input
          id="source"
          type="text"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="https://loom.com/share/… or fixture://invoice-intake"
          className="mt-2 w-full rounded-lg border border-hairline bg-canvas px-3.5 py-2.5 text-[15px] text-ink outline-none transition-colors placeholder:text-faint focus:border-accent"
        />
        {error && <p className="mt-3 text-sm text-fail">{error}</p>}
        <button
          onClick={submit}
          disabled={busy || !source.trim()}
          className="mt-4 w-full rounded-full bg-accent py-2.5 text-[15px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy ? "Watching the recording…" : "Build the operating map"}
        </button>
      </Card>

      <Card className="p-6">
        <p className="text-sm font-medium text-ink">Before you record</p>
        <ul className="mt-3 space-y-2 text-sm text-muted">
          <li>Say why you do each step, not just what you click.</li>
          <li>Mention what goes wrong and what you do when it does.</li>
          <li>Use one real example from start to finish.</li>
          <li>Think out loud on the weird ones. The exceptions are the gold.</li>
        </ul>
      </Card>
    </div>
  );
}
