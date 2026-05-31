# Production runbook

The first-time deploy + the day-to-day ops you'll actually do.

---

## First deploy to a Linux VPS

Assumes a fresh Ubuntu 22.04+ box with Docker installed.

```bash
# 1. Clone
git clone <your-fork-url> stock-intelligence-system
cd stock-intelligence-system

# 2. Configure
cp .env.prod.example .env.prod
# REQUIRED edits:
#   - JWT_SECRET (generate: python -c "import secrets; print(secrets.token_hex(32))")
#   - POSTGRES_PASSWORD (random)
#   - CORS_ORIGINS — your real frontend URL
#   - OPENAI_API_KEY (or other LLM provider)
#   - SMTP_* if you want real email alerts
nano .env.prod

# 3. Build + start
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# 4. Confirm
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
curl http://localhost/api/v1/health
curl http://localhost/api/v1/ready
```

Migrations are applied automatically by the backend's startup hook when
`RUN_MIGRATIONS_ON_START=true` (the default in `.env.prod.example`).

---

## TLS

The included nginx config terminates on `:80` only. For HTTPS, pick one:

**Option A — terminate at a CDN / cloud LB** (Cloudflare, AWS ALB, Caddy in front)
Leave nginx as-is. Set `CORS_ORIGINS` and any cookie domain accordingly.

**Option B — terminate at nginx** with Let's Encrypt + certbot
Mount certs into `infra/nginx/certs` and add an `:443` server block to
`infra/nginx/nginx.conf` with `ssl_certificate` directives, then uncomment the
443 port mapping in `docker-compose.prod.yml`.

---

## Zero-downtime updates

For a single-replica deploy, `docker compose up -d --build` already does a
graceful restart of changed services. To minimize WS disconnects:

```bash
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml build backend frontend
# Roll backend first (frontend tolerates 1 missed poll)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d backend
# Wait for it to be healthy
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps backend
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d frontend nginx
```

For multi-replica setups, run migrations manually first
(`RUN_MIGRATIONS_ON_START=false`) and use a real orchestrator
(Kubernetes / Nomad / ECS) with a rolling-update strategy.

---

## Day-to-day ops

### Logs
```bash
# Tail everything
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f

# Just one service
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f backend
```

### Database shell
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec postgres \
  psql -U stockai -d stockai
```

### Redis shell
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec redis redis-cli
> XLEN stream:prices
> XINFO GROUPS stream:prices
> XPENDING stream:prices ws_broadcasters
```

### Manual migration
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend \
  alembic upgrade head
```

### Force-rebuild without cache
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache backend
```

---

## Rollback

```bash
git revert <bad-commit>      # or git checkout <good-commit>
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build backend
```

If the bad release shipped a migration:

```bash
# Inspect history
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend \
  alembic history --verbose

# Step back one rev
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend \
  alembic downgrade -1
```

If the migration was non-reversible, restore from your latest pg_dump.

---

## Backups

A minimal cron job (run on the host, NOT in the container):

```bash
# Add to root crontab — daily 3 a.m.
0 3 * * * docker compose -f /srv/sis/docker-compose.yml -f /srv/sis/docker-compose.prod.yml exec -T postgres pg_dump -U stockai stockai | gzip > /var/backups/sis_$(date +\%F).sql.gz
```

Keep 30 days. Mirror off-box weekly.

---

## Common incidents

| Symptom | Likely cause | Fix |
|---|---|---|
| `/api/v1/ready` returns 503 with `postgres: error` | Postgres container restarted | `docker compose ... restart postgres` then wait 10s |
| WebSocket disconnects every minute | Idle proxy timeout | Already mitigated — nginx config has `proxy_read_timeout 86400s` |
| `/agents/analyze` 504 timeout | Slow LLM | Increase nginx `proxy_read_timeout` in `infra/nginx/nginx.conf` |
| Streams growing unbounded | Trimming disabled | `XADD` has `MAXLEN ~ 10000` baked in; verify with `XLEN stream:prices` |
| Backend OOMs after a week | fastembed cache grew unboundedly | `docker volume inspect stock-intelligence-system_fastembed_cache`; should be ~150 MB |
| Email alerts stop arriving | SMTP creds rotated | Check `backend` logs for `Failed to send email`; update `.env.prod` and restart backend |
| 502 from nginx after deploy | Backend not healthy yet | `docker compose ... ps`; wait for the backend's HEALTHCHECK to pass (~40s) |

---

## Safe-to-do checks (don't break anything)

```bash
# Verify all services running and healthy
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps

# Hit health from outside
curl https://stocks.your-domain.com/api/v1/health
curl https://stocks.your-domain.com/api/v1/ready

# Stream depth
docker compose ... exec redis redis-cli XLEN stream:prices

# Count documents/insights
docker compose ... exec postgres psql -U stockai -d stockai -c "
  select agent_name, count(*) from agent_logs
   where created_at > now() - interval '1 day'
   group by agent_name;
"
```
