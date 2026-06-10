#!/bin/bash
# Video-to-Vault Skills Installer for Claude Code
# By AI Momentum Labs — for Build Room members
#
# Usage: curl -fsSL https://raw.githubusercontent.com/aimomentumlabs/video-to-vault/main/install.sh | bash

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo "================================================"
echo "  Video-to-Vault Skills for Claude Code"
echo "  By AI Momentum Labs"
echo "================================================"
echo ""

# Check for Claude Code
if ! command -v claude &> /dev/null; then
    echo -e "${RED}Claude Code not found.${NC}"
    echo "Install it first: https://docs.anthropic.com/en/docs/claude-code/overview"
    exit 1
fi
echo -e "${GREEN}✓${NC} Claude Code found ($(claude --version 2>/dev/null || echo 'unknown version'))"

# Check for yt-dlp
if ! command -v yt-dlp &> /dev/null; then
    echo -e "${YELLOW}Installing yt-dlp...${NC}"
    if command -v brew &> /dev/null; then
        brew install yt-dlp
    else
        pip install yt-dlp 2>/dev/null || pip3 install yt-dlp
    fi
fi
echo -e "${GREEN}✓${NC} yt-dlp found"

# Check for ffmpeg
if ! command -v ffmpeg &> /dev/null; then
    echo -e "${YELLOW}Installing ffmpeg...${NC}"
    if command -v brew &> /dev/null; then
        brew install ffmpeg
    else
        echo -e "${RED}ffmpeg not found. Install it manually:${NC}"
        echo "  Mac: brew install ffmpeg"
        echo "  Linux: sudo apt install ffmpeg"
        exit 1
    fi
fi
echo -e "${GREEN}✓${NC} ffmpeg found"

# Create skills directory
mkdir -p ~/.claude/skills/watch-to-vault
mkdir -p ~/.claude/skills/channel-to-vault

# Download skills
REPO="https://raw.githubusercontent.com/aimomentumlabs/video-to-vault/main"

curl -fsSL "$REPO/watch-to-vault/SKILL.md" -o ~/.claude/skills/watch-to-vault/SKILL.md
echo -e "${GREEN}✓${NC} watch-to-vault installed"

curl -fsSL "$REPO/channel-to-vault/SKILL.md" -o ~/.claude/skills/channel-to-vault/SKILL.md
echo -e "${GREEN}✓${NC} channel-to-vault installed"

# Ask for vault path
echo ""
echo -e "${YELLOW}Where is your Obsidian vault?${NC}"
echo "Enter the full path (e.g., /Users/you/Documents/my-vault)"
echo "Or press Enter to set it later:"
read -r VAULT_PATH

if [ -n "$VAULT_PATH" ]; then
    # Expand tilde
    VAULT_PATH="${VAULT_PATH/#\~/$HOME}"
    
    if [ -d "$VAULT_PATH" ]; then
        # Write config files
        cat > ~/.watch-to-vault.config << EOF
VAULT_ROOT="$VAULT_PATH"
SOURCE_FOLDER="sources/videos"
EOF
        cat > ~/.channel-to-vault.config << EOF
VAULT_ROOT="$VAULT_PATH"
SOURCE_FOLDER="sources/videos"
EOF
        # Create the videos folder
        mkdir -p "$VAULT_PATH/sources/videos"
        echo -e "${GREEN}✓${NC} Vault configured: $VAULT_PATH"
        echo -e "${GREEN}✓${NC} Video notes folder created: $VAULT_PATH/sources/videos"
    else
        echo -e "${YELLOW}!${NC} Path not found. Set it later by editing ~/.watch-to-vault.config"
    fi
else
    echo -e "${YELLOW}!${NC} No vault path set. Edit the CONFIG section in each skill before use."
    echo "  Or create config files:"
    echo "    echo 'VAULT_ROOT=\"/path/to/vault\"' > ~/.watch-to-vault.config"
    echo "    echo 'VAULT_ROOT=\"/path/to/vault\"' > ~/.channel-to-vault.config"
fi

echo ""
echo "================================================"
echo -e "${GREEN}  Installation complete!${NC}"
echo "================================================"
echo ""
echo "  Usage in Claude Code:"
echo ""
echo "  Watch a single video (full analysis):"
echo "    /watch-to-vault https://youtu.be/VIDEO_ID"
echo ""
echo "  Ingest an entire channel:"
echo "    /channel-to-vault https://www.youtube.com/@channelname"
echo ""
echo "  Filter a channel:"
echo "    /channel-to-vault https://www.youtube.com/@channel only AI videos, last 6 months"
echo ""
echo "  Need help? Ask in the Build Room."
echo ""
