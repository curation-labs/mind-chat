# mind-runner — Mastra + OpenRouter variant
# Any drwn card baked in via --build-arg. Agent JS generated at build time.
#
# Build:
#   cd packages/mind-runner/docker
#   DOCKER_BUILDKIT=0 docker build \
#     --build-arg CARD_REPO="git+https://github.com/curation-labs/harari-mind.git#v1.4.0" \
#     -t mind-runner .
#
# Chat (interactive multi-turn):
#   docker run --rm -it --entrypoint node -e OPENROUTER_API_KEY="sk-or-..." mind-runner /opt/mastra-runtime/chat.js
#
# Single-turn (pipe a question):
#   echo 'What do you think about AI?' | docker run --rm -i --entrypoint sh -e OPENROUTER_API_KEY="sk-or-..." mind-runner -c "node /opt/mastra-runtime/run.js --agent-id mind --schema-path /opt/schema.json --output-path /tmp/out.json --events-path /tmp/events.jsonl && cat /tmp/out.json"

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

COPY harness-assets-mastra/runtime/run.js           $MASTRA_RUNTIME_ROOT/run.js
COPY harness-assets-mastra/runtime/chat.js          $MASTRA_RUNTIME_ROOT/chat.js
COPY harness-assets-mastra/runtime/server.js        $MASTRA_RUNTIME_ROOT/server.js
COPY harness-assets-mastra/runtime/schema-to-zod.js $MASTRA_RUNTIME_ROOT/schema-to-zod.js
RUN chmod +x $MASTRA_RUNTIME_ROOT/run.js $MASTRA_RUNTIME_ROOT/chat.js $MASTRA_RUNTIME_ROOT/server.js

# ── Clone card + materialize all skills at build time ─────────────────────────
ARG CARD_REPO="git+https://github.com/curation-labs/harari-mind.git#v1.4.0"

WORKDIR $MIND_ROOT
RUN drwn init --non-interactive --no-default-catalogs \
    && CLONE_OUTPUT=$(drwn card clone "$CARD_REPO") \
    && echo "$CLONE_OUTPUT" \
    && CARD_NAME=$(echo "$CLONE_OUTPUT" | grep "^Cloned " | sed 's/^Cloned \(@[^@]*\)@.*/\1/') \
    && drwn card add "$CARD_NAME" \
    && drwn write \
    && echo "Baked: $CARD_NAME"

# ── Generate Mastra agent from baked skills ───────────────────────────────────
COPY harness-assets-mastra/generate-agent.js /tmp/generate-agent.js
RUN SKILLS_DIR=$MIND_ROOT/.claude/skills \
    AGENT_OUT=$MASTRA_RUNTIME_ROOT/agents/mind/index.js \
    AGENT_NAME=mind \
    AGENT_PROVIDER=openrouter \
    AGENT_MODEL=anthropic/claude-sonnet-4-5 \
    node /tmp/generate-agent.js

# ── Output schema ─────────────────────────────────────────────────────────────
RUN printf '{"type":"object","properties":{"result":{"type":"string"}},"required":["result"]}' \
    > /opt/schema.json

WORKDIR $MIND_ROOT
