# mind-shell — blank runner, card installed at runtime via CARD_REPO env var.
# No mind is baked in. Any drwn card can be loaded at docker run time.
#
# Build:
#   cd packages/mind-shell/docker
#   DOCKER_BUILDKIT=0 docker build -t mind-shell .
#
# Run (interactive chat):
#   docker run --rm -it --entrypoint node \
#     -e CARD_REPO="git+https://github.com/curation-labs/harari-mind.git#v1.2.1" \
#     -e OPENROUTER_API_KEY="sk-or-..." \
#     mind-shell /opt/mastra-runtime/start.mjs
#
# Optionally override model:
#   -e MIND_MODEL="anthropic/claude-opus-4-5"

FROM docker.io/cloudflare/sandbox:0.9.1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       bubblewrap curl ca-certificates git \
    && rm -rf /var/lib/apt/lists/*

ENV HOME=/opt/cli-home
ENV MIND_ROOT=/opt/mind
ENV MASTRA_RUNTIME_ROOT=/opt/mastra-runtime

RUN mkdir -p "$HOME" "$MIND_ROOT"

# ── drwn CLI ──────────────────────────────────────────────────────────────────
RUN npm install -g darwinian-harness

# ── Mastra runtime ────────────────────────────────────────────────────────────
RUN mkdir -p "$MASTRA_RUNTIME_ROOT/agents"
WORKDIR $MASTRA_RUNTIME_ROOT
RUN npm init -y \
    && npm pkg set type=module \
    && npm install --omit=dev \
       @mastra/core@1.36.0 \
       @ai-sdk/anthropic@3.0.78 \
       @openrouter/ai-sdk-provider@2.9.0 \
       @ai-sdk/openai@3.0.65 \
       json-schema-to-zod@2.8.1 \
       zod@4.4.3

COPY harness-assets-mastra/runtime/start.mjs         $MASTRA_RUNTIME_ROOT/start.mjs
COPY harness-assets-mastra/runtime/server-shell.js   $MASTRA_RUNTIME_ROOT/server-shell.js
COPY harness-assets-mastra/runtime/schema-to-zod.js  $MASTRA_RUNTIME_ROOT/schema-to-zod.js
RUN chmod +x $MASTRA_RUNTIME_ROOT/start.mjs $MASTRA_RUNTIME_ROOT/server-shell.js

# ── generate-agent.js (runs at container start, not build time) ───────────────
COPY harness-assets-mastra/generate-agent.js /tmp/generate-agent.js

WORKDIR $MIND_ROOT
