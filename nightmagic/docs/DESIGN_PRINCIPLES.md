# Design Principles

The product should feel like a precision instrument, not a chatbot. Closer to Things, Linear, or Apple's own apps than to any AI tool. Calm, expensive restraint is itself the pitch: a product this composed looks trustworthy, and trust is the whole game.

## The core principle

Show one thing; hide the machinery. Every screen has one job and one primary action. The pipeline is complex; the user should never feel the complexity.

## Rules

1. **Typography does the hierarchy, not boxes.** System font stack (SF Pro on Apple hardware). Large confident headings, generous line spacing. No cards-inside-cards; no borders where whitespace can do the job.
2. **Near-monochrome with one accent.** Warm grays and true near-black (`#1d1d1f`); a single accent (`#0071e3`, Apple blue) reserved for the one action that matters per screen. Pass/fail get muted, desaturated tints only where the semantics require them (the test bench). Statuses are quiet pills, not a rainbow.
3. **Explicitly forbidden:** purple-gradient AI aesthetics, glowing orbs, sparkle iconography, dashboard widget walls, decorative animation, emoji as UI.
4. **Whitespace is a feature.** If a screen feels empty, it is working.
5. **Progressive disclosure everywhere.** The review screen defaults to the calm layer (a plain-language step list); evidence, rules, and failure modes appear on demand. Depth is available, never default.
6. **Motion as meaning.** One subtle transition where state changes (the confidence ring, the interview progress bar). Nothing decorative, nothing looping. Easing: `cubic-bezier(0.32, 0.72, 0, 1)`.
7. **Dark mode mirrors light** via `prefers-color-scheme`; same restraint, true black canvas.
8. **Print is a surface.** The reports are deliverables; `@media print` strips chrome so the page is the PDF.

## Tokens

Defined once in `src/app/globals.css` and mapped into Tailwind (`tailwind.config.ts`). Do not add a color without deleting one; the palette is a budget, not a menu.

## Writing rules

Plain, direct language everywhere, including generated artifacts. No em dashes. No hype, no mic-drop closers. Buttons say what happens ("Build the operating map", "That's right", "Put this step on auto"). Errors say what to do next, not what went wrong internally.
