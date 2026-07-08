# CortaAí — atalhos de desenvolvimento

.PHONY: up down logs seed web api worker test clean

up:            ## Sobe toda a plataforma (web, api, worker, radar, redis, postgres, minio)
	docker compose up --build -d

down:          ## Derruba tudo
	docker compose down

logs:          ## Logs agregados
	docker compose logs -f --tail=100

seed:          ## Reexecuta o seed de demonstração
	docker compose exec api python -m app.seed

web:           ## Frontend em modo dev (fora do Docker)
	cd apps/web && npm install && npm run dev

api:           ## API em modo dev (fora do Docker)
	cd apps/api && uvicorn app.main:app --reload

worker:        ## Worker Celery local
	cd apps/api && celery -A app.workers.celery_app worker --loglevel=info

test:          ## Testes do backend
	cd apps/api && python -m pytest -q

clean:         ## Remove volumes (apaga banco e mídia local!)
	docker compose down -v
