"use client";

import { useEffect, useState } from "react";

/**
 * The wait is the audit. One quiet line at a time, rotating while the pipeline
 * watches the recording: half of these are what the tool genuinely does, half
 * are the jokes only someone who has lived a real business process gets.
 * Ambient flavor only; no fake step counts, no invented progress.
 */
const LINES = [
  "Watching your recording. Every frame, no skipping.",
  "Listening for the part where you say “usually.”",
  "Noting everything that happens right after “this part’s easy.”",
  "Counting the ways this could go wrong. A thousand and one so far.",
  "The documented process and the real process are arguing. The real one is winning.",
  "Finding the rules that only live in your head.",
  "Writing down the thing Sarah apparently has to approve.",
  "Separating what you do from what you say you do.",
  "Treating your exceptions like the gold they are.",
  "Rewinding the part where you sighed.",
  "Every “oh wait, actually” goes straight into the map.",
  "Estimating what a consultant would have charged for this.",
  "Pausing on the tab you switched away from a little too fast.",
  "Turning “it depends” into an actual rule.",
];

const ROTATE_MS = 3600;
const FADE_MS = 400;

export function ProcessingTicker() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let swap: ReturnType<typeof setTimeout> | undefined;
    const timer = setInterval(() => {
      setVisible(false);
      swap = setTimeout(() => {
        setIndex((i) => (i + 1) % LINES.length);
        setVisible(true);
      }, FADE_MS);
    }, ROTATE_MS);
    return () => {
      clearInterval(timer);
      if (swap) clearTimeout(swap);
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
      </span>
      <p
        aria-live="polite"
        className="min-h-[1.5rem] max-w-sm text-center text-sm text-muted transition-opacity duration-300 ease-calm"
        style={{ opacity: visible ? 1 : 0 }}
      >
        {LINES[index]}
      </p>
    </div>
  );
}
