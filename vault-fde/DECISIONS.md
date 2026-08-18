# Decisions

Implementation decisions made while building v1, with reasoning. Ambiguities were resolved toward the FDE methodology (trust earned in stages, nothing silent) and the design constraints (calm, one accent, progressive disclosure).

1. **SQLite via better-sqlite3, thin repository layer, no ORM.** Single-box deployment, synchronous reads fit server components, zero migration tooling overhead. The repository layer is the seam if Postgres is ever needed.

2. **Demo mode is a first-class path, not a mock.** The container this was built in has no ffmpeg/yt-dlp/whisper and no API key, and so will many fresh clones. Every LLM- or media-backed feature has a deterministic fallback that labels itself (the spec summary says "demo mode"; connector results carry `simulated: true`). Nothing pretends to be a model.

3. **The demo judgment connector interprets the spec's rules; it does not hardcode invoice logic.** `connectors/rules.ts` reads decision rules extracted from the recording (threshold, mismatch, category-mapping, duplicate patterns). Anything uncovered stays uncovered and fails evals — which is the product's teaching moment: the seed shows 19/24, the categorized report names the gaps (services GL code, duplicates), corrections close them, and the bench goes 24/24.

4. **The judgment step is the rule-densest step.** In deterministic mapgen, the step carrying the most extracted decision rules is designated `llm_judgment`; judgment lives at the decision point. The LLM path classifies directly and is validated by the same triage linter.

5. **Externally-visible detection uses verb-object patterns, not nouns.** Bare "email"/"invoice" mentions were gating nearly every step (15 inbox items for 3 runs). Verbs that commit something ("reply", "create the bill", "pay") gate; mentions do not. Over-gating is safe but erodes the inbox's signal.

6. **Shadow approvals do not block the run.** Shadow means nothing external executes, so gates record their drafts and continue; resolving them is training signal (approval stats, feedback loop). Live gates block and resume via checkpoint.

7. **Approval-gate values on resume.** When a live gate is approved/edited, the (edited) draft becomes the step's recorded value, and the runtime continues from the checkpoint. Rejection aborts the run with an audit event.

8. **Corrections at the inbox merge into the draft (`correction` field) rather than free-editing JSON.** The SME writes a sentence; the system stores draft + correction as a golden case. Structured field-level editing is a v2 refinement.

9. **Conditional branching is v1-light.** The runtime skips commit-style steps when the decision routed to the correction path (pattern-matched), rather than supporting a full branch graph in the spec. Documented limitation; the spec schema can grow `branch` nodes without breaking (versioned).

10. **Evals auto-pass gates on the bench.** The bench measures decision quality against hand-labeled outcomes; gating behavior is tested separately in the runtime suite. Mixing the two would make pass rates depend on simulated approvals.

11. **Reports are markdown rendered with a small purpose-built renderer.** No markdown dependency for two documents with a known shape; print CSS makes the page itself the PDF export.

12. **Voice input uses the browser SpeechRecognition API** with graceful fallback to typing (the button disables with a tooltip where unsupported, e.g. Firefox). No server-side audio pipeline for v1.

13. **Model routing per the project goal: `claude-fable-5` primary, `claude-haiku-4-5` for mechanical subtasks.** Structured outputs via JSON-only prompting + zod validation + one self-correction retry, using only the documented `messages.create` surface. Refusal stop reasons surface as typed errors.

14. **Fixture frames are generated SVG mock screens** (window chrome + description text) rather than binary images: keeps the repo small, renders crisply in both themes, and honestly represents what demo mode knows.

15. **`fuser -k <port>/tcp` in dev notes rather than `pkill -f "next start"`** — the latter matches its own invoking shell. (Recorded because it cost a debugging cycle: a stale server holding a deleted SQLite inode served pre-seed data.)

## Known limitations (v1)

- Loom URLs download via yt-dlp; Looms behind auth need a manual download + upload path (upload accepts a local file path server-side; drag-drop upload UI is v2).
- Multi-recording diffing (constants vs variables, multi-performer variance) is designed in the spec (`derivedFrom`, intake variants) but the diff tooling is not built.
- Browser-automation executor is a stub that routes to a human.
- No auth/multi-tenancy; this is a single-team deployment.
- Frame reading with vision uses text descriptions in demo mode; real image input to the model is wired conceptually but not exercised without a key.
