# Nightmagic — nightmagic.ai

Record a business process once, narrating as you go. Nightmagic turns the recording into a reviewed, evaluated, progressively deployed automated workflow, following the forward deployed engineer loop: **Audit → Evals → Deployment**, where each phase earns the right to the next.

## The idea

A screen recording captures intent, not just clicks. The narration carries the business rules that never appear on screen ("anything over five hundred dollars has to go to Sarah"). Nightmagic extracts those rules into an **operating map**, closes the gaps with a one-question-at-a-time **interview**, proves reliability on a **test bench** of historical examples, and deploys behind a **trust ladder**: shadow mode first, human approval on every external action, and per-step graduation to autonomy only after a clean approval record.

## Quick start

```bash
cd nightmagic
npm install
npm run db:seed     # loads a complete demo workflow (invoice intake)
npm run dev         # http://localhost:3000
```

The seed drives the bundled fixture through the whole lifecycle: mapped, interviewed, benched (19/24 failing, then 24/24 after corrections), deployed to shadow with three runs and a working approval inbox.

To process a fresh copy of the demo recording yourself: **New recording** → `fixture://invoice-intake`.

### Real recordings

The easiest path is the **in-app recorder**: click Record on the capture page, narrate your process (screen and voice, mic required — the narration is the gold), stop, and the map starts building. No Loom, no download, no upload step.

The second path is the **drop zone**: download any recording (Loom's Download button works for every Loom you own, private or not) and drop the file. Uploads stream to disk, so long recordings are fine. Links are the third, best-effort path: public YouTube, public Loom, and Google Drive files shared as "anyone with the link" (the large-file virus-scan interstitial is handled). Private links fail with a guided recovery, never raw tool output.

Processing real video requires:

```bash
brew install yt-dlp ffmpeg     # link fetching and frames (yt-dlp only needed for links)
pip install openai-whisper     # transcription when no captions exist
```

And an Anthropic API key for map generation and judgment steps:

```bash
cp .env.example .env   # set ANTHROPIC_API_KEY
```

Without a key the app runs in **demo mode**: deterministic map generation and a rule interpreter stand in for the model, and every artifact labels itself as demo-generated. Nothing is faked silently.

## The surfaces

| Surface | What it does |
| --- | --- |
| **Capture** | Record in the browser (screen + voice), drop a video file, or paste a link (best-effort). Live stage progress while processing. Guided recovery on every failure. A 30-second coaching card improves the raw material. |
| **Review** | The operating map with receipts: every step links to its moment in the recording. Classification chips (`deterministic / AI judgment / human decision`), decision rules, failure modes, redaction flags, go/no-go recommendation. |
| **Interview** | One question at a time, never more. Voice button on every question. The AI leads with its best guess; you confirm or correct. |
| **Test bench** | Golden dataset (CSV import: `name,input_*,expected_*` columns) run against the compiled workflow. Categorized failure report says what to fix. 90% over 20+ cases opens the deployment gate. |
| **Inbox** | Drafts waiting at approval gates. Approve, edit, or reject; edits become golden cases automatically. Steps with a clean approval record earn a graduation prompt. |
| **Run timeline** | Every run readable as a story, with a complete audit trail. |
| **Reports** | The Sprint Report (sellable audit deliverable) and the Defend Pack (engineer and VP versions), print-ready. |

## Deploying

Nightmagic needs container hosting with a persistent volume (Railway, Render, Fly.io), not serverless (Vercel/Workers). The Dockerfile bakes in ffmpeg, yt-dlp, and whisper; `NIGHTMAGIC_PASSWORD` gates the whole app. Full steps: `docs/DEPLOY.md`. The static nightmagic.ai launch page deploys separately via `site/deploy.sh`.

## Commands

```bash
npm run dev        # start the app
npm run db:seed    # seed the demo workflow (idempotent)
npm test           # vitest: unit + golden-path + unhappy-path suites
npm run lint       # eslint
npm run typecheck  # tsc
npm run check      # all three
npm run build      # production build
```

Data lives in `./data/nightmagic.db` (SQLite). Delete it to start over.

## Documentation

- `docs/ARCHITECTURE.md` — how the pieces fit
- `docs/PRODUCT_SPEC.md` — what this product is and why
- `docs/DESIGN_PRINCIPLES.md` — the look-and-feel rules
- `DECISIONS.md` — implementation decisions and their reasoning
