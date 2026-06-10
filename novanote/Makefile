.PHONY: docker-build docker-up docker-down docker-logs docker-ps docker-clean help

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

docker-build: ## Build the sync-server Docker image
	docker compose build sync-server

docker-up: ## Start all services (detached)
	docker compose up -d

docker-down: ## Stop and remove all containers
	docker compose down

docker-logs: ## Tail logs from all services
	docker compose logs -f

docker-ps: ## List running containers
	docker compose ps

docker-clean: ## Stop containers and remove volumes
	docker compose down -v
