---
name: watch-to-vault
description: Watch a video (YouTube URL or local file), extract frames + transcript, and file a structured source note into an Obsidian vault. Use when someone shares a YouTube URL, local video, or says "watch this."
argument-hint: <video-url-or-path> [optional focus, e.g. --start 2:00 --end 6:00 or "focus on the install steps"]
user-invocable: true
disable-model-invocation: false
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# /watch-to-vault

Full-treatment video processing: download, extract frames, read every frame with vision, transcribe, and write a structured linked note into your Obsidian vault.

## CONFIG

Set these to match your vault before first use:

- VAULT_ROOT: `~/obsidian-vault` (change to your vault path)
- SOURCE_FOLDER: `sources/videos` (change to where you want video notes)

If a `.watch-to-vault.config` file exists in your home directory, read it for overrides:

```bash
# ~/.watch-to-vault.config (optional)
VAULT_ROOT="$HOME/my-vault"
SOURCE_FOLDER="knowledge/sources/videos"
```

## Requirements

Install these if missing:

```bash
brew install yt-dlp ffmpeg
```

## Step 1 — Prepare workspace

```bash
rm -rf /tmp/watch-to-vault && mkdir -p /tmp/watch-to-vault/frames
```

## Step 2 — Get the video

### YouTube URL:

```bash
# Get metadata
yt-dlp --print "%(title)s|||%(channel)s|||%(duration_string)s|||%(upload_date)s|||%(webpage_url)s" --no-download "$URL"

# Download video (720p max for frame extraction)
yt-dlp -f "bestvideo[height<=720]+bestaudio/best[height<=720]" \
  --merge-output-format mp4 \
  -o "/tmp/watch-to-vault/video.mp4" "$URL"

# Grab auto-subtitles
yt-dlp --write-auto-sub --sub-lang en --skip-download \
  -o "/tmp/watch-to-vault/video" "$URL"
```

### Local file:

Copy or symlink to `/tmp/watch-to-vault/video.mp4`.

If the user passed `--start` / `--end`, trim with ffmpeg before frame extraction.

## Step 3 — Extract frames

```bash
DURATION=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 /tmp/watch-to-vault/video.mp4)
ffmpeg -i /tmp/watch-to-vault/video.mp4 \
  -vf "fps=1/30,scale=1024:-1" -q:v 2 \
  /tmp/watch-to-vault/frames/frame_%04d.jpg
```

## Step 4 — Transcribe

If a VTT/SRT file was downloaded, parse it into clean timestamped text.

If no subtitle file exists, extract audio and transcribe:

```bash
ffmpeg -i /tmp/watch-to-vault/video.mp4 -vn -ar 16000 -ac 1 /tmp/watch-to-vault/audio.wav
```

Then use Whisper or another transcription tool on the audio file.

## Step 5 — Read every frame

Use the Read tool on ALL extracted frame images. Focus on on-screen text: slides, terminals, code, dollar figures, benchmark numbers, URLs, version numbers.

Do not summarize from the title or transcript alone. The frames are the reason this skill exists.

If the video is longer than 10 minutes and no `--start`/`--end` was given, still read all frames but note in the final report that a focused re-run may catch more detail.

## Step 6 — Extract knowledge (four categories)

1. **Spoken content** from the transcript.
2. **On-screen content the narrator never said**: figures, dollar amounts, byte counts, benchmarks, commands, URLs, library names, version numbers. Be thorough.
3. **Every tool, skill, command, model, library, or product named.**
4. **Concrete action items or steps** to reproduce what was shown.

## Step 7 — Write the note

Create a new file at: `VAULT_ROOT/SOURCE_FOLDER/YYYY-MM-DD-slugified-title.md`

Use the video's upload date. Slug the title (lowercase, hyphens, no special chars). If the file exists, append `-2`, `-3`, etc.

```markdown
---
title: "{video title}"
source: "{url-or-local-path}"
creator: "{channel or speaker}"
duration: "{HH:MM:SS}"
watched: "{today's date YYYY-MM-DD}"
type: video-source
status: inbox
tags: [source/video]
---

# {video title}

## TL;DR
- Three to five bullets. What it is, why it matters, single most useful takeaway.

## On-screen specifics
Numbers, commands, URLs, versions, benchmarks that appeared on screen but were not spoken. Include timestamp like `[04:12]` for each. If nothing visual mattered, write "Transcript-only, no critical on-screen detail."

## Walkthrough
Clean, ordered summary of what happened. Group by section or topic, not timestamp dump.

## Tools and commands mentioned
- `tool or command` - one line on what it does and where it fit in.

## How this applies to my work
What's relevant to your projects, business, or learning. Adapt this section to your context.

## Next experiments
- Action items. Things to try, build, or test.

## Links
Obsidian backlinks to people, projects, topics. Only link entities that exist in your vault. Check with Glob or Grep against VAULT_ROOT before creating a link. Note missing entities under Next experiments rather than creating broken links.
```

## Step 8 — Report back

Print:
- Full path of the note created.
- List of backlinks added.
- Whether a focused re-run with `--start`/`--end` would likely surface more on-screen detail.

## Writing rules (hard)

- Never use em dashes. Use commas, parentheses, or rewrite.
- Plain, direct language. No mic-drop closers.
- Keep direct quotes short and timestamped. Paraphrase by default.
- Do not fabricate numbers or links. If you didn't see it or hear it, don't write it.

## Cleanup

```bash
rm -rf /tmp/watch-to-vault
```
