import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { initDb } from "@/lib/db";
import { listPendingApprovals } from "@/lib/db/repo";

export const metadata: Metadata = {
  title: "Nightmagic",
  description:
    "Record a process once. Get a reviewed, evaluated, progressively deployed workflow.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  initDb();
  let pendingCount = 0;
  try {
    pendingCount = listPendingApprovals().length;
  } catch {
    // A fresh database has no tables yet on first paint; the nav shows zero.
  }
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <header className="no-print sticky top-0 z-10 border-b border-hairline bg-surface/80 backdrop-blur-xl">
          <nav className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
            <Link href="/" className="text-[15px] font-semibold tracking-tight text-ink">
              Nightmagic
            </Link>
            <div className="flex items-center gap-6">
              <Link href="/" className="text-sm text-muted transition-colors hover:text-ink">
                Workflows
              </Link>
              <Link
                href="/inbox"
                className="flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
              >
                Inbox
                {pendingCount > 0 && (
                  <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent">
                    {pendingCount}
                  </span>
                )}
              </Link>
              <Link
                href="/capture"
                className="rounded-full bg-accent px-3.5 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                New recording
              </Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
