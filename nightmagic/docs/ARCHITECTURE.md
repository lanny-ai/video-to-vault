# Architecture

Next.js 14 (App Router) + TypeScript + Tailwind. SQLite (better-sqlite3) behind a repository layer. Server components read repositories directly; client components mutate through API routes. Every page is `force-dynamic`; nothing is statically baked.

## The pipeline (Audit phase)

```
recording ──> frames (ffmpeg scene detection) ──┐
         └──> transcript (captions or whisper) ──┴──> mapgen ──> workflow spec
```

- `src/lib/pipeline/media.ts` — yt-dlp download, ffmpeg scene-change frame extraction (`select='gt(scene,0.1)'`, one frame per screen change), whisper fallback. Every tool checked before use; missing tools produce actionable errors, not stack traces.
- `src/lib/pipeline/vtt.ts` — WebVTT parsing with auto-sub dedup.
- `src/lib/pipeline/mapgen.ts` — two paths behind one interface: the primary model (claude-fable-5) when a key is configured, and a deterministic path (cue segmentation, rule extraction, hedge-word assumptions) for demo mode and tests. Both only claim what the recording supports.
- `src/lib/pipeline/redact.ts` — PII/credential flags surfaced in review.
- `src/lib/pipeline/fixture.ts` — bundled recordings (transcript + frame descriptions rendered as SVG mock screens) that make everything runnable offline.

## The workflow spec

`src/lib/spec/schema.ts` — the canonical intermediate representation, versioned and zod-validated on every save. Everything downstream consumes the spec, never the video. Key fields per step: classification (`deterministic | llm_judgment | human_approval`), executor (API-first ladder: `api > webhook > human`, browser stubbed), decision rules with evidence timestamps, failure modes with explicit handling, `externallyVisible`, trust level, and approval stats.

- `src/lib/spec/triage.ts` — judgment triage heuristics and the spec linter (advisory findings, never silent rewrites).
- `src/lib/spec/gonogo.ts` — the go/no-go gate over the three ROI buckets (revenue uplift, risk mitigation, cost savings) minus build cost and automation risk. The tool can and does recommend not automating.
- `src/lib/spec/edit.ts` — explicit review-screen patches (add rule, reclassify, resolve redaction).

## Interview

`src/lib/interview/engine.ts` — a queue over open assumptions. One question at a time is enforced by the engine (`nextQuestion` returns exactly one). Confirm accepts the proposed answer; a correction becomes a decision rule on its step; harvest questions accept historical examples straight into the golden dataset. Interview completion transitions the workflow to the evals stage.

## Evals

`src/lib/evals/runner.ts` — runs every golden case through the compiled plan (gates auto-pass on the bench), compares against hand-labeled expectations, and categorizes each failure (`missing_data`, `wrong_gl_code`, `uncovered_case`, ...) so the report names what to fix. Per-case safety matrix: right data, required steps, matches an expert, safe to act on.

## Compiler and runtime (Deployment phase)

- `src/lib/compiler/index.ts` — spec to executable plan. Refuses to compile with open assumptions or a no-go verdict (each phase earns the next). Inserts an approval gate before every externally visible step unless the step has graduated to `auto`.
- `src/lib/runtime/engine.ts` — executes plans with per-node checkpointing (`runs.checkpoint_index`), one retry for transient failures, explicit failure routing (route-to-human by default, abort only when a failure mode says so), and a full audit trail (`audit_events`). Live runs block at gates; shadow runs record drafts and continue. Approval resolutions update per-step trust stats; **edits become golden cases automatically**. Graduation candidates (10+ clean approvals, zero edits/rejections) get a prompt in review; graduating is always a human choice.
- `src/lib/connectors/index.ts` — the executor interface. `llm.judge` runs judgment (model, or the rule interpreter in demo mode — `src/lib/connectors/rules.ts`, which interprets only rules present in the spec); `http`/`webhook` are real transports with timeouts; everything else simulates and produces its draft; browser automation is a stub that routes to a human.

## Deployment gates

`deploymentGate()`: 20+ golden cases and a 90%+ pass rate on the latest bench run open shadow deployment. Live requires shadow first. Both live in `src/lib/runtime/engine.ts` and are enforced server-side, not in the UI.

## LLM usage

`src/lib/llm/client.ts` — Anthropic SDK wrapper. Cost routing: `claude-fable-5` for map generation and judgment, `claude-haiku-4-5` for mechanical subtasks (frame descriptions). Structured output via JSON-only prompting, zod validation, and one self-correction retry. Refusals surface as typed errors. No key → demo mode, loudly labeled.

## Testing

- `tests/mapgen.test.ts` — extraction: rules, thresholds, hedges, intake variants, redaction.
- `tests/golden-path.test.ts` — the full lifecycle: map → interview → failing bench with categorized report → corrections → passing bench → shadow → feedback loop → graduation → live run through gates, with the audit trail asserted.
- `tests/unhappy-paths.test.ts` — the thousand ways it goes wrong: no-go compile refusal, double answers, empty datasets, gate violations, rejections aborting runs, connector failure routing, malformed VTT, missing fixtures.
