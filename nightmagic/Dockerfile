# Nightmagic production image: Next.js server plus the full media toolchain
# (ffmpeg, yt-dlp, whisper). Built for Railway/Render/Fly-style container
# hosting with a persistent volume mounted at /data.
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg python3 python3-venv make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Media tools live in a venv on PATH so the pipeline's `whisper` and `yt-dlp`
# invocations work verbatim. CPU-only torch keeps the image from doubling.
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir --upgrade pip \
  && pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
  && pip install --no-cache-dir openai-whisper yt-dlp

# Bake the base model so the first capture never stalls on a model download.
RUN python3 -c "import whisper; whisper.load_model('base')"

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV NIGHTMAGIC_DATA_DIR=/data
EXPOSE 3000
CMD ["npm", "start"]
