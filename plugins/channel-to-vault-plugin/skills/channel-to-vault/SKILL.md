---
name: channel-to-vault
description: Bulk-ingest a YouTube channel into Obsidian with transcript-only structured notes. Skips Shorts automatically. Use when someone shares a channel URL or says "ingest this channel."
argument-hint: <channel-url> [optional filter, e.g. "only AI videos" or "last 6 months"]
user-invocable: true
disable-model-invocation: false
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# /channel-to-vault

Transcript-only bulk ingest of a YouTube channel. Downloads transcripts (no video, no frame analysis), writes structured Obsidian notes for each video. Always skips Shorts.

## CONFIG

Set these to match your vault before first use:

- VAULT_ROOT: `~/obsidian-vault` (change to your vault path)
- SOURCE_FOLDER: `sources/videos` (change to where you want video notes)

If a `.channel-to-vault.config` file exists in your home directory, read it for overrides:

```bash
# ~/.channel-to-vault.config (optional)
VAULT_ROOT="$HOME/my-vault"
SOURCE_FOLDER="knowledge/sources/videos"
```

## Requirements

```bash
brew install yt-dlp
```

## Step 1 — Get the channel video list

```bash
mkdir -p /tmp/channel-to-vault
yt-dlp --match-filter "duration > 60" \
  --print "%(id)s|||%(title)s|||%(duration_string)s|||%(upload_date)s|||%(webpage_url)s" \
  --no-download "$CHANNEL_URL" > /tmp/channel-to-vault/video-list.txt
```

This automatically skips Shorts (videos under 60 seconds). Always apply this filter.

Report the total count before proceeding. If > 100 videos, confirm with the user.

### Optional filters

If the user specified a time range (e.g., "last 6 months"), use `--dateafter YYYYMMDD` instead of `--flat-playlist` so dates are available for filtering.

If the user specified a topic filter (e.g., "only AI videos"), grep the video list by title keywords after pulling it.

## Step 2 — Filter already-processed videos

```bash
ls "$VAULT_ROOT/$SOURCE_FOLDER/" 2>/dev/null
```

Skip any video whose slugified title already appears as a note filename. Report how many are new vs. already filed.

## Step 3 — Process each video (transcript-only)

For each unprocessed video, in chronological order (oldest first):

**a. Download transcript only:**

```bash
yt-dlp --write-auto-sub --sub-lang en --skip-download \
  --print "%(title)s|||%(channel)s|||%(duration_string)s|||%(upload_date)s|||%(webpage_url)s" \
  -o "/tmp/channel-to-vault/%(id)s" \
  "https://www.youtube.com/watch?v=$VIDEO_ID"
```

**b. Parse the VTT/SRT** into clean text with timestamps.

**c. If no transcript is available**, note it and mark the note with `status: needs-review`. Use title and metadata only. Do not fabricate content.

**d. Summarize** the transcript into the note template. Produce a real summary, not a raw transcript dump.

## Step 4 — Write the Obsidian note

Path: `VAULT_ROOT/SOURCE_FOLDER/YYYY-MM-DD-slugified-title.md`

Use the video's upload date (not today). Slug the title (lowercase, hyphens). If file exists, skip.

```markdown
---
title: "{video title}"
source: "{youtube url}"
creator: "{channel name}"
duration: "{HH:MM:SS}"
uploaded: "{YYYY-MM-DD}"
watched: "{today's date YYYY-MM-DD}"
type: video-source
status: inbox
tags: [source/video, source/channel-ingest]
---

# {video title}

## TL;DR
- Three to five bullets summarizing core content and key takeaway.

## Walkthrough
Clean, ordered summary of the video's content. Group by topic or section.

## Tools and concepts mentioned
- `tool, concept, or term` - one line on what it is and how it was discussed.

## How this applies to my work
What's relevant to your projects, business, or learning. If nothing connects, write "General knowledge, no direct application identified yet."

## Next experiments
- Action items or ideas. Write "None" if nothing actionable.

## Links
Obsidian backlinks to people, projects, topics that exist in your vault. Check before linking.
```

## Step 5 — Batch strategy

- Process videos in batches of 10.
- After each batch, report progress: "Processed 10/47. Continuing..."
- If a video fails (no transcript, yt-dlp error), log it and continue. Do not stop.
- Report failures in the final summary.

## Step 6 — Final report

Print:
- Total videos on channel (matching filters).
- Videos processed in this run.
- Videos skipped (already had notes).
- Videos that failed (with reasons).
- Path to the source folder.

## Writing rules (hard)

- Never use em dashes. Use commas, parentheses, or rewrite.
- Plain, direct language.
- Do not fabricate content. If transcript unavailable, say so.
- Paraphrase by default. Short direct quotes with timestamps only when exact wording matters.

## Cleanup

```bash
rm -rf /tmp/channel-to-vault
```
