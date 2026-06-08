# Mind Chat

A local web app to chat with reconstructed minds. Currently ships with **Harari Mind** — Yuval Noah Harari's worldview distilled across Sapiens, Homo Deus, 21 Lessons, and Nexus.

Choose a container image, a model, and a response length — then chat.

![Mind Chat UI](https://img.shields.io/badge/status-local--only-blue)

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (running)
- [Node.js](https://nodejs.org/) v18+
- An [OpenRouter](https://openrouter.ai/) API key

---

## Setup

### 1. Clone

```bash
git clone https://github.com/curation-labs/mind-chat.git
cd mind-chat
```

### 2. Build images

```bash
make build
```

### 3. Add your API key

```bash
cp .env.example .env
# edit .env and add your OPENROUTER_API_KEY
```

### 4. Run

```bash
OPENROUTER_API_KEY=sk-or-... make run
```

Then open **http://localhost:4000**

---

## Container Images

Three images are available, each representing a different way of loading the mind card into a container. All three run the same Harari mind — the difference is *when* and *how* the card gets installed.

### harari-mind

The card is **baked directly into the image at build time**. Skills are pre-materialized from the local card store and copied in during `docker build`. The Mastra agent is generated once and embedded as a 248 KB ES module inside the image.

- Fastest startup (~5s) — no network calls, no card install at runtime
- Card is fixed to whatever was baked in at build time
- Best for demos and everyday use

### mind-runner

The card is **cloned from GitHub at build time** via a `--build-arg CARD_REPO` parameter. The `drwn` CLI runs inside Docker during the build, fetches the card from the specified GitHub repo + version tag, and generates the Mastra agent from the downloaded skills.

- Same fast startup as `harari-mind` (~5s) — card is already installed
- Card version is pinned per build via the `CARD_REPO` arg
- Easy to swap minds: rebuild with a different `CARD_REPO` value
- Best for CI/CD workflows where you want versioned, reproducible images

### mind-shell

The image contains **no card at all**. When you start a chat session, the container clones the card live from the `CARD_REPO` env var, installs it, generates the Mastra agent, and then starts the server — all at runtime.

- Slower startup (~35s) — card cloning and agent generation happen on first run
- Fully flexible: change `CARD_REPO` without rebuilding the image
- Best for trying different minds or testing new card versions without a rebuild

---

## Using the App

1. **Image** — pick which container to use (`harari-mind` is fastest)
2. **Model** — 8 models available across Anthropic, OpenAI, Google, DeepSeek, Meta, xAI
3. **Length** — Brief / Short / Medium / Long
4. Click **Start Chat** → container spins up → Harari introduces himself
5. Chat. Conversation history is maintained for the full session.

> **mind-shell** shows a Card Repo field — change this URL to load a different mind at runtime.

---

## Available Models

| Model | Provider |
|---|---|
| Claude Sonnet 4.5 | Anthropic |
| Claude Opus 4 | Anthropic |
| GPT-5.4 | OpenAI |
| GPT-4o | OpenAI |
| Gemini 3.5 Flash | Google |
| DeepSeek V4 Pro | DeepSeek |
| Llama 4 Scout | Meta |
| Grok 4.20 | xAI |

---

## The Card

**`@curation-labs/harari-mind@1.4.0`** — [github.com/curation-labs/harari-mind](https://github.com/curation-labs/harari-mind)

52 self-contained skills across L1–L5. All content is embedded directly — no external file reads needed at runtime.

| Layer | Count | Contents |
|---|---|---|
| L1 Soul Values | 6 | Ontological anchors — suffering as ground truth, the long view, narrative suspicion, and more |
| L2 Principles | 7 | Decision rules — defamiliarize before analyzing, follow the competitive logic, measure by suffering |
| L3 World Models | 8 | Interpretive frameworks — the intersubjective web, the algorithmic self, the luxury trap |
| L4 Reflections | 10 | Cross-cutting tensions and unresolved contradictions in Harari's thinking |
| L5 Source Impressions | 20 | Direct observations from each book: Sapiens, Homo Deus, 21 Lessons, Nexus |

---

## Stopping

Press `Ctrl+C` in the terminal. The app stops all running containers automatically.
