"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (response.ok) {
      router.push("/");
      router.refresh();
      return;
    }
    const data = await response.json().catch(() => ({}));
    setError(data.error ?? "That password is not right.");
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-sm pt-24">
      <div className="text-center">
        <h1 className="text-[24px] font-semibold tracking-tight">Nightmagic</h1>
        <p className="mt-1 text-sm text-muted">Enter the password to continue.</p>
      </div>
      <Card className="mt-8 p-6">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Password"
          autoFocus
          className="w-full rounded-lg border border-hairline bg-canvas px-3.5 py-2.5 text-[15px] text-ink outline-none transition-colors placeholder:text-faint focus:border-accent"
        />
        {error && <p className="mt-3 text-sm text-fail">{error}</p>}
        <button
          onClick={submit}
          disabled={busy || !password}
          className="mt-4 w-full rounded-full bg-accent py-2.5 text-[15px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy ? "Checking…" : "Continue"}
        </button>
      </Card>
    </div>
  );
}
