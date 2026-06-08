.PHONY: build build-harari build-runner build-shell run help

CARD_REPO ?= git+https://github.com/curation-labs/harari-mind.git\#v1.4.0

help:
	@echo ""
	@echo "  make build          Build all three images"
	@echo "  make build-harari   Build harari-mind image only"
	@echo "  make build-runner   Build mind-runner image only"
	@echo "  make build-shell    Build mind-shell image only"
	@echo "  make run            Start the app  (requires OPENROUTER_API_KEY)"
	@echo ""
	@echo "  Example:"
	@echo "    make build"
	@echo "    OPENROUTER_API_KEY=sk-or-... make run"
	@echo ""

build: build-harari build-runner build-shell

build-harari:
	DOCKER_BUILDKIT=0 docker build -t harari-mind images/harari-mind/

build-runner:
	DOCKER_BUILDKIT=0 docker build \
	  --build-arg CARD_REPO="$(CARD_REPO)" \
	  -t mind-runner images/mind-runner/

build-shell:
	DOCKER_BUILDKIT=0 docker build -t mind-shell images/mind-shell/

run:
	@if [ -z "$(OPENROUTER_API_KEY)" ]; then \
	  echo "Error: OPENROUTER_API_KEY is not set"; \
	  echo "Usage: OPENROUTER_API_KEY=sk-or-... make run"; \
	  exit 1; \
	fi
	cd app && npm install --silent && OPENROUTER_API_KEY=$(OPENROUTER_API_KEY) node server.mjs
