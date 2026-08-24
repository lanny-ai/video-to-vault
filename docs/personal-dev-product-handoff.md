# Handoff — B2C Personal Development Product

Read `personal-dev-product-brief.md` first for the offer, audience, and pricing.
This document covers **what already exists and what it means for the build**.

## Where this came from

Nightmagic (branch `claude/fde-workflow-brainstorm-09q52t`, PR #1, ~17K lines,
55 tests green) is a B2B product: record a business process, get a reviewed,
evaluated, progressively deployed automation. It is complete and unmerged.

This product reuses Nightmagic's *mechanism* — narrated recording in, structured
artifact out — and points it at a consumer personal development audience. Roughly a
third of the codebase transfers. A third is irrelevant. A third does not exist yet.

Nightmagic's source is **not in the working tree on this branch** (it lives on the
feature branch, which `main` has never contained). To read it:
`git show claude/fde-workflow-brainstorm-09q52t:nightmagic/<path>`.

## Reuse directly — this is the moat

| Asset | Path (on the Nightmagic branch) | Why it matters here |
| --- | --- | --- |
| **Interview engine** | `src/lib/interview/` | One question at a time, engine-enforced. Press-and-speak voice input. AI proposes an answer, user confirms or corrects. This is *exactly* how a ghostwriter interviews, and it is exactly what a non-technical 45–70 buyer can operate. Highest-value carryover by far. |
| Recording capture | `src/components/screen-recorder.tsx`, `src/lib/recorder.ts` | getDisplayMedia + mic via MediaRecorder, mime negotiation, mobile-safe naming. Note: this product is **audio-first** — people talk about what they know rather than demoing software. The mic half matters; the screen half mostly does not. |
| Upload + transcription pipeline | `src/lib/pipeline/`, `src/app/api/upload/` | Streaming upload to disk, 4GB cap, extension allowlist, traversal-proof refs; whisper transcription; guided error taxonomy with recovery hints per failure code. |
| Live progress + ticker | `src/lib/pipeline/progress.ts`, `src/components/processing-ticker.tsx` | Long AI work needs a truthful "something is happening" surface. This audience needs the reassurance more than a B2B buyer does. Real stages only — no fake progress bars. |
| LLM client | `src/lib/llm/client.ts` | Model routing, JSON-only prompting with schema validation and one self-correcting retry, refusal handling, vision. Infrastructure, no rework needed. |
| DB + repositories | `src/lib/db/` | SQLite with migrations and typed repositories. Pattern carries; see the scale warning below. |
| Deploy kit | `Dockerfile`, `railway.json`, `deploy-railway.sh`, `docs/DEPLOY.md` | Container already bakes ffmpeg, yt-dlp, and whisper. Saves days. |

## Adapt

- **Versioned zod IR** (`src/lib/spec/schema.ts`) — the *pattern* is right: one
  validated structure that everything compiles from. The content is entirely
  different. Steps, decision rules, and failure modes become chapters, frameworks,
  stories, and exercises.
- **Evals** (`src/lib/evals/`) — "does the output pass on real examples" still
  applies, but grading shifts from objectively-correct to human-judged quality.
  Worth keeping the harness shape, not the pass criteria.
- **Design system** — Nightmagic's identity is deliberately nocturnal (near-black
  ground, violet accent; see the brand guide). **Probably wrong for this audience.**
  A 45–70 personal-development buyer likely responds better to warm, light, and
  aspirational than to dark and technical. Treat the brand as a starting reference,
  not a constraint.

## Do not carry over

Judgment triage (deterministic / model / human), go/no-go ROI scoring, approval
gates, the trust ladder, the workflow compiler and connectors, run timelines, and the
Sprint Report / Defend Pack. All of it exists to make an *automation* safe to execute.
This product executes nothing — it produces a manuscript. Also drop scene-change frame
extraction and vision reading of screens; there are no screens to read.

## Must be built new

1. **The interview curriculum.** A ghostwriter's question tree — origin story,
   methodology extraction, proof and case studies, objection handling, structure.
   This is the actual IP of the product and the thing most worth obsessing over.
2. **Long-form generation.** Manuscript assembly with voice matching across chapters.
   Materially harder than Nightmagic's structured extraction; needs its own design.
3. **Output artifacts.** Manuscript export (docx/pdf), course outline, lead magnets.
4. **Consumer onboarding.** Nightmagic assumes a technical operator. This assumes
   someone who has never used a web app that records them.
5. **Accounts, payment, multi-tenancy.**

## The engineering risk that matters most

**Nightmagic has no authentication and no multi-tenancy.** API routes are open, live
progress is an in-memory registry scoped to a single process, and storage is SQLite on
one volume. That is fine for one team behind a password gate. It is a hard blocker for
a consumer launch where 1,200 buyers arrive in the same 72 hours.

This is the strongest engineering argument for the brief's recommendation to **sell a
live cohort rather than software access**: a scheduled start controls concurrency,
allows humans behind the curtain, and buys time to replace single-process assumptions
before the numbers demand it. Plan the auth and multi-tenancy work explicitly — it is
not a detail, and it is not started.

## Open questions

1. **Launch date.** Unanswered, and it gates everything. Six weeks allows a real
   product with humans backstopping gaps; two weeks means cohort one runs manually
   while the software gets finished behind it.
2. Is the JV split actually 50%?
3. Who owns the customer list afterward?
