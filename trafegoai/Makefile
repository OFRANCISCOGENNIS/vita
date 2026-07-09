.PHONY: up down logs seed api web worker

up: ## Sobe toda a stack (web, api, worker, redis, postgres)
	docker compose up --build

down:
	docker compose down

logs:
	docker compose logs -f --tail=100

seed: ## Reexecuta o seed de demonstração
	docker compose exec api npx ts-node prisma/seed.ts

api: ## API em modo dev (requer postgres/redis locais)
	cd apps/api && npm run dev

web:
	cd apps/web && npm run dev

worker:
	cd apps/api && npm run build && npm run worker
