# Deploying Nightmagic

Nightmagic runs as one persistent Node server with SQLite on disk and the media
toolchain (ffmpeg, yt-dlp, whisper) alongside it. That means container hosting
with a volume — Railway, Render, Fly.io — not serverless platforms like Vercel
or Cloudflare Workers (ephemeral filesystems, no system binaries, short request
limits).

The launch page for nightmagic.ai is separate and static; see `site/deploy.sh`.

## Railway (recommended)

1. **Create the project.** In Railway: New Project → Deploy from GitHub repo →
   pick this repository. Set the service's **root directory** to `nightmagic/`
   so Railway finds the Dockerfile and `railway.json`.

2. **Attach a volume.** Service → Volumes → mount at `/data`. This holds the
   SQLite database, uploads, and extracted media. Without it, every deploy
   wipes your workflows.

3. **Set the environment variables.**

   | Variable | Value |
   | --- | --- |
   | `ANTHROPIC_API_KEY` | Your key. Without it the app runs in demo mode. |
   | `NIGHTMAGIC_PASSWORD` | The shared password guarding the whole app. Required for any public deployment. |
   | `PORT` | `3000` (Railway usually injects this; the app honors it). |

   `NIGHTMAGIC_DATA_DIR` is already set to `/data` in the image.

4. **Deploy.** Railway builds the Dockerfile (the first build is slow — the
   image bakes in torch and the whisper base model so captures never stall on
   downloads) and starts the server. The healthcheck hits `/login`.

5. **Point the domain.** Service → Settings → Networking → Custom Domain →
   `app.nightmagic.ai`. Railway shows a CNAME target; add that CNAME record in
   Cloudflare DNS (proxy status: DNS only, at least until certificates issue).

6. **Optional: seed the demo.** From the service shell (or `railway run`):
   `npm run db:seed`.

## The password gate

Setting `NIGHTMAGIC_PASSWORD` turns on a gate in front of every page and API
route: visitors get a minimal login screen, correct entry sets a 30-day
httpOnly cookie. Unset it (local dev) and the gate disappears. This is a
shared-password gate sized for a single team; real multi-user auth is a v2
concern and should come before any multi-tenant use.

## Sizing notes

- Whisper (base model, CPU) transcribes roughly in real time on a couple of
  vCPUs: a 10-minute recording takes minutes, not seconds. Scale the service up
  if transcription is the bottleneck, or switch to hosted transcription later.
- The image is large (torch). That costs build minutes, not runtime memory.
- One process serves everything; live capture progress is in-memory and
  assumes a single instance. Do not scale horizontally without revisiting it.
