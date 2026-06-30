# Plano de deploy — Forex Cockpit

## Opção A — Docker Compose (recomendado para começar)

```bash
cp .env.example .env        # ajuste provider/pares/risco
docker compose up --build
# web em http://localhost:8080  (nginx servindo o build do Vite + proxy /api e /ws -> server)
```

Serviços do `docker-compose.yml`:
- **server** — Node, expõe 8787 (REST + WS). Lê `.env`.
- **web** — build estático do Vite servido por nginx, proxy de `/api` e `/ws`.
- **redis** — cache de ticks (opcional; sem ele o server usa memória).
- **(postgres)** — comentado; habilite e troque `DB_DRIVER=postgres` para produção.

## Opção B — Sem container (dev)

```bash
npm install                 # raiz (workspaces)
npm test                    # valida o motor de sinais
npm run dev                 # server (8787) + web (5173) juntos
# abra http://localhost:5173
```

## Opção C — Produção gerenciada

- **Backend**: Render / Railway / Fly.io / VPS com PM2.
  - `npm i -g pm2 tsx && pm2 start "tsx packages/server/src/index.ts" --name forex-server`
  - Redis gerenciado (Upstash/Redis Cloud) → `REDIS_URL`.
  - Postgres gerenciado (Neon/Supabase/RDS) → `DB_DRIVER=postgres` + `DATABASE_URL` (implementar `PgStore` análogo ao `SqliteStore`).
- **Frontend**: Vercel/Netlify/Cloudflare Pages servindo `packages/web/dist`.
  - Configure o proxy/origem do `/api` e `/ws` para a URL pública do backend
    (variável de ambiente ou reescrita de rota), pois o cliente usa `location.host`.
- **TLS/WSS**: atrás de um proxy (nginx/Caddy/Cloudflare). O cliente já escolhe
  `wss` quando a página está em `https`.

## Escala e custos

- O loop é O(pares × timeframes) por ciclo. Com 7 pares × 5 TFs e `POLL=15s`,
  são ~35 fetches/ciclo. Yahoo é gratuito porém sem SLA — para produção séria,
  migre para OANDA/TwelveData/Polygon (ver README → custos).
- Cache de backtest (30 min) e de candles por ciclo reduzem chamadas.
- Para muitos pares, aumente `POLL_INTERVAL_MS` ou separe o loop por worker.

## Checklist de produção

- [ ] `.env` com provider pago + chaves (nunca commitar)
- [ ] Redis e Postgres gerenciados
- [ ] Implementar `PgStore` (interface `Store` já pronta)
- [ ] Rate-limit/retry no provider (429)
- [ ] HTTPS/WSS no proxy
- [ ] Monitorar idade do tick (já exposta na UI e em `/api/health`)
- [ ] Banner de disclaimer **permanece** (requisito)
