"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui";
import { formatElapsed, pickRecorderMime, recordingFilename } from "@/lib/recorder";

/**
 * In-app screen recorder: screen via getDisplayMedia, narration via the mic,
 * combined into one MediaRecorder. Stop hands the finished file to the page,
 * which sends it down the exact same upload → pipeline path as a dropped file.
 *
 * The mic is required, not optional: the narration carries the business rules,
 * and a silent recording produces no map worth reviewing.
 */

type RecorderState =
  | { name: "idle" }
  | { name: "recording"; startedAt: number }
  | { name: "error"; message: string };

export function ScreenRecorder({
  disabled,
  onRecorded,
}: {
  disabled: boolean;
  onRecorded: (file: File) => void;
}) {
  const [state, setState] = useState<RecorderState>({ name: "idle" });
  const [supported, setSupported] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamsRef = useRef<MediaStream[]>([]);
  const chunksRef = useRef<Blob[]>([]);

  // Computed after mount so server render and client hydration agree.
  useEffect(() => {
    setSupported(
      typeof navigator !== "undefined" &&
        Boolean(navigator.mediaDevices?.getDisplayMedia) &&
        typeof MediaRecorder !== "undefined",
    );
  }, []);

  useEffect(() => {
    if (state.name !== "recording") return;
    const timer = setInterval(() => setElapsed(Date.now() - state.startedAt), 500);
    return () => clearInterval(timer);
  }, [state]);

  function releaseStreams() {
    for (const stream of streamsRef.current) {
      for (const track of stream.getTracks()) track.stop();
    }
    streamsRef.current = [];
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }

  // Never leave the mic or screen capture running if the page unmounts.
  useEffect(() => {
    return () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      for (const stream of streamsRef.current) {
        for (const track of stream.getTracks()) track.stop();
      }
    };
  }, []);

  async function startRecording() {
    let screen: MediaStream;
    try {
      screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    } catch (err) {
      // Cancelling the share picker is a normal exit, not an error.
      if (err instanceof DOMException && err.name === "NotAllowedError") return;
      setState({
        name: "error",
        message: "Screen capture did not start. Check your browser's screen recording permission.",
      });
      return;
    }

    let mic: MediaStream;
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      for (const track of screen.getTracks()) track.stop();
      setState({
        name: "error",
        message:
          "Microphone access is required. Your narration carries the business rules; without it there is no map worth making.",
      });
      return;
    }

    const mime = pickRecorderMime((m) => MediaRecorder.isTypeSupported(m));
    const combined = new MediaStream([...screen.getVideoTracks(), ...mic.getAudioTracks()]);
    const recorder = new MediaRecorder(combined, mime ? { mimeType: mime } : undefined);

    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      releaseStreams();
      recorderRef.current = null;
      const type = recorder.mimeType || mime || "video/webm";
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      setState({ name: "idle" });
      if (blob.size < 1000) {
        setState({ name: "error", message: "That recording came out empty. Try again." });
        return;
      }
      onRecorded(new File([blob], recordingFilename(type), { type }));
    };

    // Ending the share from the browser's own UI counts as pressing Stop.
    screen.getVideoTracks()[0]?.addEventListener("ended", stopRecording);

    streamsRef.current = [screen, mic];
    recorderRef.current = recorder;
    recorder.start(1000);
    setElapsed(0);
    setState({ name: "recording", startedAt: Date.now() });
  }

  if (!supported) return null;

  return (
    <Card className="p-6">
      {state.name === "recording" ? (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
            </span>
            <div>
              <p className="text-[15px] font-medium tabular-nums text-ink">
                Recording {formatElapsed(elapsed)}
              </p>
              <p className="text-xs text-muted">Narrate as you go. The exceptions are the gold.</p>
            </div>
          </div>
          <button
            onClick={stopRecording}
            className="rounded-full bg-accent px-5 py-2.5 text-[15px] font-medium text-white transition-opacity hover:opacity-90"
          >
            Stop recording
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[15px] font-medium text-ink">Record it right here</p>
            <p className="mt-0.5 text-xs text-muted">
              Screen and voice, no other tools. Stop when you're done and the map starts building.
            </p>
            {state.name === "error" && <p className="mt-2 text-sm text-fail">{state.message}</p>}
          </div>
          <button
            onClick={startRecording}
            disabled={disabled}
            className="shrink-0 rounded-full bg-accent px-5 py-2.5 text-[15px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Record
          </button>
        </div>
      )}
    </Card>
  );
}
