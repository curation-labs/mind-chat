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

This builds three Docker images locally (~1.3 GB each, takes 3–5 min):

| Image | Card source | Startup |
|---|---|---|
| `harari-mind` | Baked in at build time | ~5s |
| `mind-runner` | Cloned from GitHub at build time | ~5s |
| `mind-shell` | Cloned from GitHub at **run** time | ~35s |

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

## Using the App

1. **Image** — pick which container to use (`harari-mind` is fastest)
2. **Model** — 8 models available across Anthropic, OpenAI, Google, DeepSeek, Meta, xAI
3. **Length** — Brief / Short / Medium / Long
4. Click **Start Chat** → container spins up → Harari introduces himself
5. Chat. The full conversation history is sent on every turn.

> **mind-shell** shows a Card Repo field — change this to load a different mind at runtime.

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

52 self-contained skills across L1–L5:
- 6 L1 Soul Values
- 7 L2 Principles
- 8 L3 World Models
- 10 L4 Reflections (cross-cutting tensions)
- 20 L5 Source Impressions (per-book observations from all 4 books)

---

## Stopping

Press `Ctrl+C` in the terminal. The app stops all running containers automatically.
