# Video-to-Vault Skills for Claude Code

Two Claude Code skills that turn YouTube videos and channels into structured Obsidian knowledge base notes.

## What's Included

### /watch-to-vault (Full Treatment)
For videos you care about deeply. Downloads the video, extracts a frame every 30 seconds, reads every frame with vision to catch on-screen text (commands, URLs, numbers, code), transcribes, and writes a rich Obsidian note with timestamped on-screen specifics.

**Use when:** Someone shares a YouTube link or local video file you want fully analyzed.

### /channel-to-vault (Bulk Ingest)
For channels you want to catalog. Pulls every video from a channel (skips Shorts automatically), downloads transcripts only (no video/frames), summarizes each into a structured Obsidian note.

**Use when:** You want an entire channel's knowledge in your vault. Supports topic filters ("only AI videos") and time filters ("last 6 months").

## Install (30 seconds)

### 1. Install dependencies

```bash
brew install yt-dlp ffmpeg
```

### 2. Copy skills to Claude Code

```bash
cp -r watch-to-vault ~/.claude/skills/
cp -r channel-to-vault ~/.claude/skills/
```

### 3. Set your vault path

Edit the CONFIG section at the top of each SKILL.md, or create config files:

```bash
# For watch-to-vault
echo 'VAULT_ROOT="$HOME/path/to/your/vault"' > ~/.watch-to-vault.config
echo 'SOURCE_FOLDER="sources/videos"' >> ~/.watch-to-vault.config

# For channel-to-vault
echo 'VAULT_ROOT="$HOME/path/to/your/vault"' > ~/.channel-to-vault.config
echo 'SOURCE_FOLDER="sources/videos"' >> ~/.channel-to-vault.config
```

### 4. Use them

In Claude Code:

```
/watch-to-vault https://youtu.be/VIDEO_ID
/watch-to-vault https://youtu.be/VIDEO_ID --start 2:00 --end 6:00
/channel-to-vault https://www.youtube.com/@channelname
/channel-to-vault https://www.youtube.com/@channelname only AI videos, last 6 months
```

## What the Notes Look Like

Every note includes:
- YAML frontmatter (title, source, creator, duration, dates, tags)
- TL;DR bullets
- Walkthrough (grouped by topic, not timestamp dump)
- Tools and concepts mentioned
- "How this applies to my work" section
- Next experiments (action items)
- Obsidian backlinks (only to entities that exist in your vault)

**watch-to-vault** adds an "On-screen specifics" section with timestamped details that appeared on screen but were never spoken (commands, URLs, version numbers, dollar figures, benchmarks).

## Writing Standards

Both skills enforce:
- No em dashes (commas, parentheses, or rewrites instead)
- Plain, direct language
- No fabricated content
- Paraphrase by default, short timestamped quotes only when exact wording matters
- Backlinks only to confirmed vault entities

## Requirements

- Claude Code (any recent version)
- yt-dlp (`brew install yt-dlp`)
- ffmpeg (`brew install ffmpeg`) — watch-to-vault only
- An Obsidian vault (or any folder of Markdown files)
