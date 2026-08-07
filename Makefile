# Fetch sede configs from the backend Postgres database.
#
# Copy .env.example to .env and fill DATABASE_URL, then run:
#   make fetch-sedes

.PHONY: fetch-sedes install help

help: ## Show this help
	@echo "Available targets:"
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'

install: ## Install Node dependencies (run once)
	npm install

fetch-sedes: ## Download full/tasks-only structuredLogic from DB into sedes/<site>/input/
	npx tsx scripts/fetch-sedes-from-db.ts
