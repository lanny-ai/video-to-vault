"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { Card } from "@/components/ui";
import { ProcessingTicker } from "@/components/processing-ticker";

/**
 * Capture. The drop zone is the primary path: it works for every video the
 * person can get onto their machine, private Looms included. Links are the
 * secondary, best-effort path. Failures always land in a guided recovery with
 * the drop zone one gesture away.
 */

type Phase =
  | { name: "idle" }
  | { name: "uploading"; percent: number; fileName: string }
  | { name: "processing"; label: string }
  | { name: "error"; message: string; hint: string | null };

const ACCEPT = ".mp4,.mov,.webm,.mkv,.m4v,.avi";

export default function CapturePage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [link, setLink] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const busy = phase.name === "uploading" || phase.name === "processing";

  async function buildMap(source: string) {
    setPhase({ name: "processing", label: "Watching the recording…" });
    const response = await fetch("/api/capture", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source }),
    });
    const data = await response.json();
    if (!response.ok) {
      setPhase({
        name: "error",
        message: data.error ?? "Capture failed.",
        hint: data.hint ?? null,
      });
      return;
    }
    router.push(`/workflows/${data.workflowId}`);
  }

  const uploadFile = useCallback((file: File) => {
    setPhase({ name: "uploading", percent: 0, fileName: file.name });
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", "/api/upload");
    xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        setPhase({
          name: "uploading",
          percent: Math.round((event.loaded / event.total) * 100),
          fileName: file.name,
        });
      }
    };
    xhr.onerror = () => {
      setPhase({
        name: "error",
        message: "The upload did not go through.",
        hint: "Check your connection and drop the file again.",
      });
    };
    xhr.onload = () => {
      let data: { ref?: string; error?: string; hint?: string } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // fall through to the generic error below
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.ref) {
        void buildMap(data.ref);
      } else {
        setPhase({
          name: "error",
          message: data.error ?? "The upload did not go through.",
          hint: data.hint ?? null,
        });
      }
    };
    xhr.send(file);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragOver(false);
    if (busy) return;
    const file = event.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }

  function submitLink() {
    const trimmed = link.trim();
    if (!trimmed || busy) return;
    void buildMap(trimmed);
  }

  return (
    <div className="mx-auto max-w-xl space-y-8 pt-8">
      <div className="text-center">
        <h1 className="text-[28px] font-semibold tracking-tight">New recording</h1>
        <p className="mt-1 text-[15px] text-muted">
          Record the process once, narrating as you go. Then bring the video here.
        </p>
      </div>

      {phase.name === "error" && (
        <Card className="border border-fail/20 bg-fail-soft p-5">
          <p className="text-sm font-medium text-ink">{phase.message}</p>
          {phase.hint && <p className="mt-1.5 text-sm text-muted">{phase.hint}</p>}
        </Card>
      )}

      <Card
        className={`p-2 transition-colors ${dragOver ? "bg-accent-soft" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <button
          type="button"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
          className={`flex w-full flex-col items-center justify-center rounded-[10px] border-2 border-dashed px-6 py-12 text-center transition-colors ${
            dragOver ? "border-accent" : "border-hairline hover:border-faint"
          } ${busy ? "cursor-default" : "cursor-pointer"}`}
        >
          {phase.name === "uploading" ? (
            <div className="w-full max-w-xs">
              <p className="truncate text-sm font-medium text-ink">{phase.fileName}</p>
              <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-canvas">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-300 ease-calm"
                  style={{ width: `${phase.percent}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-muted">Uploading, {phase.percent}%</p>
            </div>
          ) : phase.name === "processing" ? (
            <ProcessingTicker />
          ) : (
            <>
              <p className="text-[17px] font-medium text-ink">Drop your video here</p>
              <p className="mt-1 text-sm text-muted">or click to browse</p>
              <p className="mt-4 text-xs text-faint">
                Works with any recording you can download, private Looms included. mp4,
                mov, webm, mkv.
              </p>
            </>
          )}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadFile(file);
            e.target.value = "";
          }}
        />
      </Card>

      <Card className="p-6">
        <label htmlFor="link" className="text-sm font-medium text-ink">
          Or paste a link
        </label>
        <p className="mt-0.5 text-xs text-muted">
          Public YouTube, Loom, or Google Drive links. Private videos need the drop zone
          above.
        </p>
        <div className="mt-3 flex gap-2">
          <input
            id="link"
            type="text"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitLink()}
            disabled={busy}
            placeholder="https://…"
            className="w-full rounded-lg border border-hairline bg-canvas px-3.5 py-2.5 text-[15px] text-ink outline-none transition-colors placeholder:text-faint focus:border-accent disabled:opacity-50"
          />
          <button
            onClick={submitLink}
            disabled={busy || !link.trim()}
            className="shrink-0 rounded-full bg-accent px-5 py-2.5 text-[15px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Fetch
          </button>
        </div>
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
