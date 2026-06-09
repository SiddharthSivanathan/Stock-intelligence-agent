# Stock Intelligence — TypeScript Backend

A TypeScript / Fastify port of the Python FastAPI backend. The React frontend
is unchanged — every route, path, error shape, and JSON field name matches the
Python original, so the frontend can talk to either backend without code changes.

## Status

| Phase | Description | Status |
|---|---|---|
| 0 | Fastify + Prisma + Zod scaffold, env validation, Dockerfile, health | done |
| 1 | Users, bcrypt, JWT, `/auth/signup|login|refresh|me` | done |
| 2 | Market data (yahoo-finance2 + Finnhub fallback), watchlist CRUD | done |
| 3 | LLM provider abstraction (Gemini default, OpenAI, Ollama) + `/llm/*` | done |
| 4 | RAG (Chroma JS + Gemini embeddings) + `/rag/ingest/*`, `/rag/query` | done |
| 5–6 | BaseAgent + News, Technical, Fundamentals, Sentiment, Risk | done |
| 7 | Multi-agent workflow + Recommendation + reflection loop | done |
| 8 | Redis Streams price producer + WebSocket hub + alert rules | done |
| 9–10 | Frontend wiring — **no code changes**, just point VITE_API_BASE_URL | done |
| 11 | Paper-trading portfolio + email notifier + vitest battery | done |
| 12 | Production multi-stage Dockerfile + nginx-ts overlay | done |

The Python backend (`../backend`) keeps working — both speak the same Postgres
schema so a swap is data-free.

## Tech stack

| Concern | Choice |
|---|---|
| HTTP server | Fastify 4 |
| ORM | Prisma 5 (maps to existing snake_case tables) |
| Validation | Zod |
| Auth | jsonwebtoken + bcryptjs (compatible JWT claims with the Python backend) |
| Market data | yahoo-finance2 npm, Finnhub fallback |
| Indicators | `technicalindicators` npm — pure JS, no Python deps |
| LLM | `@google/generative-ai` (default), `openai`, plus axios → Ollama |
| Embeddings | Gemini `text-embedding-004` (with deterministic dev fallback) |
| Vector store | ChromaDB JS client |
| Redis | ioredis |
| WebSocket | `@fastify/websocket` |
| Email | nodemailer (console fallback when SMTP_HOST blank) |
| Dev | tsx watch — hot reload on file save |
| Tests | vitest |

## Quick start

```powershell
# Dev — runs alongside the Python backend on port 8001
docker compose up -d --build backend-ts
docker compose logs -f backend-ts
```

Open the API at http://localhost:8001/api/v1/health.

Point the frontend at the TS backend (instead of the Python one):

```powershell
# In docker-compose.yml, frontend service:
#   VITE_API_BASE_URL: http://localhost:8001/api/v1
#   VITE_WS_URL:       ws://localhost:8001/api/v1/ws
docker compose up -d --build frontend
```

## Routes (drop-in for the Python backend)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/health` | liveness |
| GET | `/api/v1/ready` | postgres + redis check |
| POST | `/api/v1/auth/signup` | `{ email, password, full_name? }` |
| POST | `/api/v1/auth/login` | form `{ username, password }` → tokens |
| POST | `/api/v1/auth/refresh` | `{ refresh_token }` → tokens |
| GET | `/api/v1/auth/me` | Bearer-protected |
| GET | `/api/v1/stocks/:symbol/quote` | live quote |
| GET | `/api/v1/stocks/:symbol/history?interval=1d&range=1mo` | OHLC |
| GET | `/api/v1/stocks/:symbol/profile` | company profile |
| GET | `/api/v1/watchlist` | list user's symbols |
| GET | `/api/v1/watchlist/quotes` | batch live quotes |
| POST | `/api/v1/watchlist` | add `{ symbol, notes? }` |
| DELETE | `/api/v1/watchlist/:symbol` | remove |
| POST | `/api/v1/llm/chat` | one-shot chat |
| POST | `/api/v1/llm/embed` | embed texts |
| POST | `/api/v1/llm/stream` | SSE streaming chat |
| POST | `/api/v1/rag/ingest/text` | `{ title, text, symbol? }` |
| POST | `/api/v1/rag/ingest/url` | `{ url, symbol? }` |
| POST | `/api/v1/rag/ingest/file` | multipart PDF/text |
| POST | `/api/v1/rag/query` | `{ question, k?, symbol? }` → answer + citations |
| GET | `/api/v1/rag/documents` | list / poll status |
| DELETE | `/api/v1/rag/documents/:id` | drop doc + chunks |
| POST | `/api/v1/agents/:name/run` | run one agent |
| POST | `/api/v1/agents/analyze` | full workflow → recommendation |
| GET | `/api/v1/agents/logs` | recent runs |
| GET | `/api/v1/insights` | persisted insights |
| GET | `/api/v1/recommendations` | recommendation list |
| GET | `/api/v1/recommendations/:id` | full trace |
| GET | `/api/v1/alerts` | rules |
| POST | `/api/v1/alerts` | create rule |
| PATCH | `/api/v1/alerts/:id` | update |
| DELETE | `/api/v1/alerts/:id` | delete |
| GET | `/api/v1/alerts/events` | fired events |
| GET | `/api/v1/portfolio` | snapshot with live P&L |
| POST | `/api/v1/portfolio/trade` | buy/sell |
| GET | `/api/v1/portfolio/trades` | history |
| POST | `/api/v1/portfolio/reset` | wipe & reset cash |
| WS | `/api/v1/ws?token=<jwt>` | live prices + alerts |

## Production

```powershell
# .env.prod — same shape as .env.prod.example for the Python backend, plus
#   LLM_PROVIDER=gemini
#   GEMINI_API_KEY=AIza...
docker compose -f docker-compose.yml -f docker-compose.prod-ts.yml up -d --build
```

Single ingress on `http://your-server/` via nginx. The Python backend service
gets `profiles: ["legacy"]` so it's not started by the overlay — easy to re-enable
if you ever want a side-by-side comparison.

## Tests

```powershell
docker compose exec backend-ts npm test
```

Battery covers security primitives, symbol validation, and indicator math —
no DB or network required.

## Why "swap, not replace"

Same Postgres schema, same JWT secret, same `/api/v1/*` surface. You can:
- Start with traffic on the Python backend (port 8000), TS on the side (8001)
- Verify endpoints with `curl` against both
- Flip nginx upstream from `backend:8000` to `backend-ts:8000` when ready
- Roll back instantly if anything misbehaves
