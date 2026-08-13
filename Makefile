# Fetch sede configs from the backend Postgres database.
#
# Copy .env.example to .env and fill DATABASE_URL, then run:
#   make fetch-sedes

.PHONY: fetch-sedes push-sedes install help

help: ## Show this help
	@echo "Available targets:"
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'

install: ## Install Node dependencies (run once)
	npm install

fetch-sedes: ## Download full/tasks-only structuredLogic from DB into sedes/<site>/input/
	npx tsx scripts/fetch-sedes-from-db.ts

push-sedes: ## Push final JSONs present in sede output/ to the DB (asks for confirmation)
	SEDE="$(SEDE)" CONFIRM="$(CONFIRM)" npx tsx scripts/push-sedes-to-db.ts
