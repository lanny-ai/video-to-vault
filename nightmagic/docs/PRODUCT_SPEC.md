# Product Spec: Nightmagic

## What this is

A web application that converts a screen recording of a person performing a business process into a reviewed, evaluated, progressively deployable automated workflow. It operationalizes the forward deployed engineer methodology — Audit, Evals, Deployment, each phase earning the right to the next — so one Loom becomes an operating map, an eval report, a gated automation, and the client-facing artifacts that sell the work.

## Who it serves

- **The operator** (an FDE, consultant, or Build Room member): sees specs, evals, compiler internals, and exports the deliverables.
- **The SME/client** (the person who recorded the process and approves the agent's work): sees plain language, one question at a time, and an approval inbox. Never JSON, never the word "eval".

## The core positions

1. **Capture intent, not clicks.** The narration carries the conditionals and exceptions that never appear on screen. Those rules are the product.
2. **Video → spec → automation, never video → automation.** The operating map is the reviewable, versioned intermediate artifact. When a workflow breaks, you fix the spec, not the video.
3. **The map is an operating map, not a transcript.** As-is and to-be, with restructuring notes where an API replaces a UI path.
4. **Judgment triage.** Most steps compile to deterministic execution; the model runs only genuine judgment points; humans own thresholds and sign-offs.
5. **The tool can say no.** ROI scoring in the three buckets that matter (revenue uplift, risk mitigation, cost savings) against build cost and automation risk, with a real no-go path.
6. **Evals earn deployment.** A golden dataset (target 20+ historical cases), categorized failure reports, and a 90% gate. One recording is one example; the dataset is the evidence.
7. **Draft → approve → execute.** An approval gate sits before every externally visible action by default. Autonomy is earned per step through a clean approval record and granted only by a human.
8. **Every correction feeds back.** Inbox edits become golden cases; interview corrections become decision rules. The system hardens with use.
9. **The audit trail is a feature.** Every run reads as a story a non-engineer can follow.
10. **The deliverables sell the work.** The Sprint Report (audit deliverable) and the Defend Pack (engineer and VP framings) generate automatically from what the system actually measured.

## Interaction rules (absolute)

- One interview question on screen at a time. Never two.
- A press-and-speak voice button on every question.
- Every question leads with the AI's proposed answer; the primary action is Confirm, the secondary is Correct. The tool does the thinking; the person supplies judgment where the assumption is wrong.
- Assumptions are always visibly labeled until confirmed. Never silent guessing; nothing fabricated anywhere.

## Lifecycle

`captured → mapped → interviewing → evals → shadow → live`, with `no_go` as a first-class outcome. Transitions are enforced server-side: compile refuses open assumptions; shadow requires the eval gate; live requires shadow.

## v1 scope notes

- Executors: real HTTP/webhook transport; simulated system connectors that produce their drafts (which is what shadow mode means); browser automation stubbed behind the same interface.
- Demo mode (no API key, no media tools) is a first-class path: bundled fixture recordings, deterministic map generation, and a rule interpreter for judgment steps — always labeled as such.
