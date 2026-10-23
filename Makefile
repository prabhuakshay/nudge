# Common development commands. Run `make help` to list them.

.DEFAULT_GOAL := help
BACKEND := uv run --directory backend
DEV := docker compose -f compose.dev.yaml

.PHONY: help
help: ## List available commands
	@grep -E '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "} {printf "  \033[1m%-16s\033[0m %s\n", $$1, $$2}'

.PHONY: setup
setup: ## Install dependencies and git hooks
	uv sync --directory backend
	npm --prefix frontend ci
	prek install

.PHONY: dev
dev: ## Start the hot-reloading dev stack (open http://localhost:5173)
	$(DEV) up --build

.PHONY: dev-down
dev-down: ## Stop the dev stack
	$(DEV) down

.PHONY: up
up: ## Pull the release image and start the production stack in the background
	docker compose pull
	docker compose up -d

.PHONY: down
down: ## Stop the production stack
	docker compose down

.PHONY: logs
logs: ## Follow production logs
	docker compose logs -f

.PHONY: createsuperuser
createsuperuser: ## Create an admin account in the production stack
	docker compose exec web python manage.py createsuperuser

.PHONY: migrations
migrations: ## Create migrations after changing models
	NUDGE_DEBUG=true $(BACKEND) python manage.py makemigrations

.PHONY: api
api: ## Regenerate the OpenAPI schema and the frontend's API types
	NUDGE_DEBUG=true $(BACKEND) python manage.py export_openapi_schema --api config.api.api --indent 2 --output openapi.json
	npm --prefix frontend run api:generate

.PHONY: test
test: ## Run backend and frontend tests
	NUDGE_DEBUG=true $(BACKEND) pytest
	npm --prefix frontend test

.PHONY: lint
lint: ## Run every linter, formatter check and type checker (same as the git hooks)
	prek run --all-files

.PHONY: check
check: lint test ## Everything CI runs
