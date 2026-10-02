"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Card, formatTimestamp } from "@/components/ui";

/**
 * The interview. Absolute rules:
 * - One question on screen. Never more.
 * - Voice first: press and speak. Typing always works too.
 * - The AI leads with its proposed answer. Confirm is the default action;
 *   correcting is one tap away. The tool thinks; the person judges.
 */

interface Question {
  assumptionId: string;
  question: string;
  proposedAnswer: string;
  evidence?: { timestampSec: number; transcriptSnippet?: string };
  harvestExamples: boolean;
  position: number;
  remaining: number;
}

interface Confidence {
  ratio: number;
  open: number;
  resolved: number;
}

export default function InterviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const workflowId = params.id;

  const [question, setQuestion] = useState<Question | null>(null);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<"confirm" | "correct">("confirm");
  const [correction, setCorrection] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/workflows/${workflowId}/interview`);
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? "Could not load the interview.");
      return;
    }
    setTitle(data.workflowTitle ?? "");
    setConfidence(data.confidence);
    if (data.question) setQuestion(data.question);
    else setDone(true);
  }, [workflowId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    setVoiceSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  function startVoice() {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    interface SpeechRecognitionLike {
      lang: string;
      interimResults: boolean;
      onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
      onend: (() => void) | null;
      onerror: (() => void) | null;
      start: () => void;
      stop: () => void;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from({ length: event.results.length }, (_, i) => event.results[i][0].transcript).join(" ");
      setMode("correct");
      setCorrection((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  async function submit(action: "confirm" | "correct") {
    if (!question || busy) return;
    if (action === "correct" && !correction.trim()) {
      setError("Say or type what actually happens, then send it.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/workflows/${workflowId}/interview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          assumptionId: question.assumptionId,
          action,
          correction: action === "correct" ? correction.trim() : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "That did not save.");
      setConfidence(data.confidence);
      setCorrection("");
      setMode("confirm");
      if (data.interviewComplete || !data.question) {
        setDone(true);
        setQuestion(null);
      } else {
        setQuestion(data.question);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-xl pt-16 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft">
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <h1 className="mt-5 text-[24px] font-semibold tracking-tight">Interview complete</h1>
        <p className="mt-2 text-[15px] text-muted">
          Every assumption is confirmed or corrected. Next: prove it on the test bench.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href={`/workflows/${workflowId}/bench`}
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Open the test bench
          </Link>
          <Link
            href={`/workflows/${workflowId}`}
            className="rounded-full border border-hairline px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-canvas"
          >
            Back to the map
          </Link>
        </div>
      </div>
    );
  }

  if (!question) {
    return <p className="pt-16 text-center text-muted">{error ?? "Loading…"}</p>;
  }

  const progress = confidence
    ? confidence.resolved / Math.max(1, confidence.resolved + confidence.open)
    : 0;

  return (
    <div className="mx-auto max-w-xl space-y-6 pt-6">
      <div className="no-print flex items-center justify-between text-sm text-muted">
        <button onClick={() => router.push(`/workflows/${workflowId}`)} className="hover:text-ink">
          ‹ {title || "Back"}
        </button>
        <span className="tabular-nums">
          {question.remaining} question{question.remaining === 1 ? "" : "s"} left
        </span>
      </div>

      <div className="h-1 overflow-hidden rounded-full bg-hairline">
        <div
          className="h-full rounded-full bg-accent transition-all duration-500 ease-calm"
          style={{ width: `${Math.max(4, progress * 100)}%` }}
        />
      </div>

      <Card className="p-8">
        {question.evidence?.transcriptSnippet && (
          <p className="text-sm italic text-muted">
            At {formatTimestamp(question.evidence.timestampSec)} you said: “
            {question.evidence.transcriptSnippet}”
          </p>
        )}
        <h1 className="mt-3 text-[22px] font-semibold leading-snug tracking-tight">
          {question.question}
        </h1>

        <div className="mt-6 rounded-xl bg-canvas p-5">
          <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-muted">
            Our best guess
          </p>
          <p className="mt-1.5 text-[15px] leading-relaxed text-ink">{question.proposedAnswer}</p>
        </div>

        {mode === "correct" && (
          <div className="mt-4">
            <textarea
              value={correction}
              onChange={(e) => setCorrection(e.target.value)}
              placeholder="What actually happens…"
              rows={3}
              autoFocus
              className="w-full rounded-xl border border-hairline bg-surface p-4 text-[15px] leading-relaxed text-ink outline-none transition-colors placeholder:text-faint focus:border-accent"
            />
          </div>
        )}

        {error && <p className="mt-3 text-sm text-fail">{error}</p>}

        <div className="mt-6 flex items-center gap-3">
          {mode === "confirm" ? (
            <>
              <button
                onClick={() => submit("confirm")}
                disabled={busy}
                className="flex-1 rounded-full bg-accent py-3 text-[15px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {busy ? "Saving…" : "That's right"}
              </button>
              <button
                onClick={() => setMode("correct")}
                disabled={busy}
                className="rounded-full border border-hairline px-5 py-3 text-[15px] font-medium text-ink transition-colors hover:bg-canvas"
              >
                Not quite
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => submit("correct")}
                disabled={busy}
                className="flex-1 rounded-full bg-accent py-3 text-[15px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {busy ? "Saving…" : "Send correction"}
              </button>
              <button
                onClick={() => {
                  setMode("confirm");
                  setCorrection("");
                }}
                disabled={busy}
                className="rounded-full border border-hairline px-5 py-3 text-[15px] font-medium text-ink transition-colors hover:bg-canvas"
              >
                Cancel
              </button>
            </>
          )}

          <button
            onClick={startVoice}
            disabled={!voiceSupported || busy}
            title={voiceSupported ? "Press and speak" : "Voice input is not available in this browser"}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition-all ${
              listening ? "scale-110 bg-accent text-white" : "border border-hairline text-ink hover:bg-canvas"
            } disabled:opacity-40`}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
              <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
              <line x1="12" y1="18" x2="12" y2="22" />
            </svg>
          </button>
        </div>
        {listening && (
          <p className="mt-3 text-center text-sm text-accent">Listening… tap the microphone to stop.</p>
        )}
        {question.harvestExamples && (
          <p className="mt-5 text-sm text-muted">
            Real examples can also be imported on the test bench as a CSV; each one strengthens the
            eval dataset.
          </p>
        )}
      </Card>
    </div>
  );
}
