"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-full border border-hairline px-4 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-canvas"
    >
      Export as PDF
    </button>
  );
}
