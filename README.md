# Build Room Tools — Video-to-Vault

Private Claude Code plugin marketplace for AI Momentum Labs Build Room members.

> **New:** [Vault FDE](vault-fde/) — a web application that turns a narrated screen recording of a business process into a reviewed, evaluated, progressively deployed automated workflow (Audit → Evals → Deployment). See `vault-fde/README.md` for the quick start.

## Two Plugins

### /watch-to-vault (Full Treatment)
For videos you care about deeply. Downloads the video, extracts a frame every 30 seconds, reads every frame with vision to catch on-screen text (commands, URLs, numbers, code), transcribes, and writes a rich Obsidian note.

### /channel-to-vault (Bulk Ingest)
For channels you want to catalog. Pulls every video from a channel (skips Shorts), downloads transcripts, summarizes each into a structured Obsidian note.

## Install (2 commands)

In Claude Code:

```
/plugin marketplace add https://github.com/lanny-ai/video-to-vault
/plugin install watch-to-vault-plugin@buildroom-tools
/plugin install channel-to-vault-plugin@buildroom-tools
```

### Requirements

Before using the plugins, install these dependencies:

```bash
brew install yt-dlp ffmpeg
```

### Set Your Vault Path

Edit the CONFIG section at the top of each skill, or create config files:

```bash
echo 'VAULT_ROOT="$HOME/path/to/your/vault"' > ~/.watch-to-vault.config
echo 'SOURCE_FOLDER="sources/videos"' >> ~/.watch-to-vault.config

echo 'VAULT_ROOT="$HOME/path/to/your/vault"' > ~/.channel-to-vault.config
echo 'SOURCE_FOLDER="sources/videos"' >> ~/.channel-to-vault.config
```

## Usage

In Claude Code:

```
/watch-to-vault-plugin:watch-to-vault https://youtu.be/VIDEO_ID
/channel-to-vault-plugin:channel-to-vault https://www.youtube.com/@channelname
/channel-to-vault-plugin:channel-to-vault https://www.youtube.com/@channel only AI videos, last 6 months
```

## What the Notes Look Like

Every note includes:
- YAML frontmatter (title, source, creator, duration, dates, tags)
- TL;DR bullets
- Walkthrough (grouped by topic)
- Tools and concepts mentioned
- "How this applies to my work" section
- Next experiments (action items)
- Obsidian backlinks (only to entities that exist in your vault)

**watch-to-vault** adds an "On-screen specifics" section with timestamped details that appeared on screen but were never spoken.

---

*Built by AI Momentum Labs. Questions? Ask in the Build Room.*
