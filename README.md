# Multi-Agent AI Stock Market Intelligence System

A production-grade platform where multiple autonomous AI agents collaborate to analyze
stocks across news, technicals, fundamentals, sentiment, and risk — then synthesize
buy / hold / sell recommendations with full reasoning traces.

**Stack:** FastAPI · LangChain · LangGraph · PostgreSQL · Redis Streams · ChromaDB ·
React · TypeScript · Tailwind · shadcn/ui · Framer Motion

---

## Status

| Phase | Description | Status |
| --- | --- | --- |
| 0 | Bootstrap (Docker, FastAPI skeleton, health) | done |
| 1 | Auth + DB + Alembic + JWT (signup/login/refresh/me) | done |
| 2 | Market data service (yfinance + Finnhub, Redis cache, watchlist CRUD) | done |
| 3 | LLM + embeddings + vector store abstraction (Ollama/OpenAI/Gemini, fastembed, Chroma) | done |
| 4 | RAG pipeline (PDF/HTML/URL ingest, chunker, retrieval + citations) | done |
| 5 | News Agent + BaseAgent pattern + insights/agent_logs persistence | done |
| 6 | Technical + Fundamentals + Sentiment + Risk agents (indicators, RAG, Reddit) | done |
| 7 | LangGraph multi-agent workflow + Recommendation agent + reflection loop | done |
| 8 | Redis Streams pipeline + WebSocket hub + alert rules | done |
| 9 | Frontend shell (Vite + React + TS + Tailwind + shadcn + WS hook) | done |
| 10 | Frontend pages (charts, agent monitor, RAG chat, alerts, all 9 pages live) | done |
| 11 | Paper-trading portfolio + email notifier + backend pytest battery | done |
| 12 | Production Dockerfiles + nginx reverse proxy + hardening + docs | **done** |

**🎉 v1.0.0 — full 12-phase build complete.** Architecture / runbook / interview prep in [`docs/`](docs/).

---

## Quick start

### Prerequisites

- **Docker Desktop** running with WSL2 backend
- **(Optional, recommended) [Ollama](https://ollama.com)** installed natively on Windows
  - Pull a model: `ollama pull llama3`
  - Ollama listens on `http://localhost:11434`; the backend reaches it via
    `http://host.docker.internal:11434` from inside Docker.

### First run

```powershell
cd C:\Users\ASUS\stock-intelligence-system
Copy-Item .env.example .env
docker compose up --build
```

In another terminal, **apply database migrations** (one-time, then any time the
schema changes):

```powershell
docker compose exec backend alembic upgrade head
```

Then open:

- API root — http://localhost:8000/
- Swagger docs — http://localhost:8000/docs
- Health check — http://localhost:8000/api/v1/health

### Verify Phase 1 auth (PowerShell)

```powershell
# 1. Sign up
$body = @{ email = "demo@example.com"; password = "supersecret123"; full_name = "Demo" } | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:8000/api/v1/auth/signup -Method POST -ContentType "application/json" -Body $body

# 2. Log in (OAuth2 password flow uses form-encoded, not JSON)
$tokens = Invoke-RestMethod -Uri http://localhost:8000/api/v1/auth/login -Method POST `
    -Body @{ username = "demo@example.com"; password = "supersecret123" }

# 3. Hit the protected /me endpoint
Invoke-RestMethod -Uri http://localhost:8000/api/v1/auth/me `
    -Headers @{ Authorization = "Bearer $($tokens.access_token)" }
```

Or use the **Authorize** button in Swagger at http://localhost:8000/docs.

### Verify Phase 2 market data + watchlist

```powershell
# Public market endpoints
Invoke-RestMethod -Uri "http://localhost:8000/api/v1/stocks/AAPL/quote"
Invoke-RestMethod -Uri "http://localhost:8000/api/v1/stocks/AAPL/history?interval=1d&range=1mo"
Invoke-RestMethod -Uri "http://localhost:8000/api/v1/stocks/AAPL/profile"

# Watchlist (requires the access token from the auth flow above)
$h = @{ Authorization = "Bearer $($tokens.access_token)" }

# Add a few tickers
"AAPL","MSFT","TSLA","NVDA" | ForEach-Object {
    Invoke-RestMethod -Uri http://localhost:8000/api/v1/watchlist -Method POST `
        -Headers $h -ContentType "application/json" -Body (@{ symbol = $_ } | ConvertTo-Json)
}

# List entries
Invoke-RestMethod -Uri http://localhost:8000/api/v1/watchlist -Headers $h

# Batch live quotes for the whole watchlist (parallel, cached for 30s each)
Invoke-RestMethod -Uri http://localhost:8000/api/v1/watchlist/quotes -Headers $h

# Remove one
Invoke-RestMethod -Uri http://localhost:8000/api/v1/watchlist/TSLA -Method DELETE -Headers $h

# Readiness check (pings Postgres + Redis + Chroma + Ollama if configured)
Invoke-RestMethod -Uri http://localhost:8000/api/v1/ready
```

### Verify Phase 3 AI subsystem

Make sure Ollama is running natively (`ollama serve`) and you've pulled the
model (`ollama pull llama3`).

```powershell
# One-shot chat against the configured provider (Ollama by default)
$body = @{
    messages = @(
        @{ role = "system"; content = "You are a terse financial assistant." },
        @{ role = "user";   content = "What is the P/E ratio in one sentence?" }
    )
    temperature = 0.2
} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Uri http://localhost:8000/api/v1/llm/chat -Method POST `
    -ContentType "application/json" -Body $body

# Embed a list of texts (first call downloads ~130 MB ONNX model — be patient)
$emb = @{ texts = @("Apple beats earnings", "Tesla recalls vehicles") } | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:8000/api/v1/llm/embed -Method POST `
    -ContentType "application/json" -Body $emb | Format-List model, dimension

# Streaming chat (raw SSE — use curl since Invoke-RestMethod buffers)
curl -N -X POST http://localhost:8000/api/v1/llm/stream `
    -H "Content-Type: application/json" `
    -d '{\"messages\":[{\"role\":\"user\",\"content\":\"Explain RSI in 2 sentences.\"}]}'
```

The `/ready` response now also reports `chroma` and (when `LLM_PROVIDER=ollama`)
`ollama` status.

### Verify Phase 4 RAG pipeline

Migrate first:

```powershell
docker compose exec backend alembic upgrade head
```

Then with your access token in `$h`:

```powershell
# 1. Ingest some text
$body = @{
    title  = "Apple Q3 2024 Earnings Summary"
    symbol = "AAPL"
    text   = "Apple reported revenue of `$85.8 billion for Q3 2024, up 5% year over year. iPhone revenue was `$39.3 billion, slightly above expectations. Services hit an all-time high of `$24.2 billion, with double-digit growth across the segment. CEO Tim Cook noted the launch of Apple Intelligence as a key driver for the upcoming iPhone cycle. Cash and marketable securities totaled `$153 billion. The board authorized an additional `$110 billion share repurchase program and raised the dividend by 4 percent."
} | ConvertTo-Json
$doc = Invoke-RestMethod -Uri http://localhost:8000/api/v1/rag/ingest/text `
    -Method POST -Headers $h -ContentType "application/json" -Body $body
$doc

# 2. Poll until status='ready' (background embedding job)
do {
    Start-Sleep -Seconds 2
    $doc = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/rag/documents/$($doc.id)" -Headers $h
    "[$($doc.status)] chunks=$($doc.chunk_count)"
} while ($doc.status -in 'pending','processing')

# 3. Ask a question — get an answer with citations
$q = @{
    question = "What was Apple's iPhone revenue and how did Services perform?"
    k        = 4
    symbol   = "AAPL"
} | ConvertTo-Json
$answer = Invoke-RestMethod -Uri http://localhost:8000/api/v1/rag/query `
    -Method POST -Headers $h -ContentType "application/json" -Body $q
$answer.answer
$answer.citations | Format-Table chunk_id, document_title, page, score

# 4. List your docs
Invoke-RestMethod -Uri http://localhost:8000/api/v1/rag/documents -Headers $h | Format-Table id, title, status, chunk_count

# 5. (Optional) Upload a real PDF
# Invoke-RestMethod -Uri http://localhost:8000/api/v1/rag/ingest/file `
#     -Method POST -Headers $h -Form @{ file = Get-Item .\some-10k.pdf; symbol = "AAPL" }

# 6. Delete a doc (also removes its chunks from Chroma)
# Invoke-RestMethod -Uri "http://localhost:8000/api/v1/rag/documents/$($doc.id)" -Method DELETE -Headers $h
```

### Verify Phase 5 News Agent

Migrate first:

```powershell
docker compose exec backend alembic upgrade head
```

With your access token in `$h`:

```powershell
# 1. Run the News Agent for a symbol (fetches headlines, scores them, persists)
$body = @{ symbol = "AAPL"; limit = 8 } | ConvertTo-Json
$insight = Invoke-RestMethod -Uri http://localhost:8000/api/v1/agents/news/run `
    -Method POST -Headers $h -ContentType "application/json" -Body $body
$insight | Select-Object symbol, sentiment, confidence, score, summary
$insight.key_themes
$insight.notable_headlines | Format-Table title, impact

# 2. List the user's stored insights
Invoke-RestMethod -Uri "http://localhost:8000/api/v1/insights?symbol=AAPL" -Headers $h |
    Format-Table id, agent_name, sentiment, confidence, created_at

# 3. Inspect the most recent agent run (success or failure)
Invoke-RestMethod -Uri "http://localhost:8000/api/v1/agents/logs?agent=news&limit=5" -Headers $h |
    Format-Table id, status, duration_ms, provider, model, error
```

A few notes:
- First run takes ~10–30 s depending on your LLM (Ollama llama3 on CPU is the slow path).
- If `LLM_PROVIDER=ollama` and you don't have `ollama serve` running, the run fails — the `agent_logs` entry shows the upstream error.
- If a small local model produces invalid JSON, the agent retries once with the validation error attached before giving up.

### Verify Phase 6 agents (Technical, Fundamentals, Sentiment, Risk)

No migration needed for Phase 6 — same `insights` + `agent_logs` tables.

```powershell
# Technical Agent — Python computes RSI/MACD/Bollinger/SMA, LLM interprets
$ta = Invoke-RestMethod -Uri http://localhost:8000/api/v1/agents/technical/run `
    -Method POST -Headers $h -ContentType "application/json" `
    -Body (@{ symbol = "AAPL"; range = "6mo"; interval = "1d" } | ConvertTo-Json)
$ta | Select-Object symbol, sentiment, trend, momentum, score, summary
$ta.signals

# Pull the persisted insight to see the indicator passthrough
$insights = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/insights?agent=technical&symbol=AAPL&limit=1" -Headers $h
$insights[0].data.indicators | Format-List

# Fundamentals Agent — ratios + RAG over your uploaded filings (if any)
Invoke-RestMethod -Uri http://localhost:8000/api/v1/agents/fundamentals/run `
    -Method POST -Headers $h -ContentType "application/json" `
    -Body (@{ symbol = "AAPL"; use_rag = $true } | ConvertTo-Json) |
    Select-Object symbol, sentiment, valuation, financial_health, summary

# Sentiment Agent — Reddit crowd mood (distinct from News directional read)
Invoke-RestMethod -Uri http://localhost:8000/api/v1/agents/sentiment/run `
    -Method POST -Headers $h -ContentType "application/json" `
    -Body (@{ symbol = "TSLA"; limit = 20 } | ConvertTo-Json) |
    Select-Object symbol, crowd_mood, discussion_volume, score, summary

# Risk Agent — volatility, drawdown, leverage. Score is INVERTED (+1=safe, -1=risky)
Invoke-RestMethod -Uri http://localhost:8000/api/v1/agents/risk/run `
    -Method POST -Headers $h -ContentType "application/json" `
    -Body (@{ symbol = "NVDA"; range = "1y" } | ConvertTo-Json) |
    Select-Object symbol, risk_level, score, summary

# Cross-cutting: all runs for a symbol (succeeds + failures)
Invoke-RestMethod -Uri "http://localhost:8000/api/v1/agents/logs?symbol=AAPL&limit=10" -Headers $h |
    Format-Table created_at, agent_name, status, duration_ms
```

Notes:
- The Technical and Risk agents compute indicators in Python before calling the LLM. The LLM never does math.
- The Fundamentals agent will pull from RAG only if you've uploaded documents tagged with the same `symbol` via `/rag/ingest/*`.
- The Sentiment agent uses Reddit's public JSON endpoint — if Reddit rate-limits (403/429), it returns an empty post list and the agent produces a low-confidence neutral output rather than failing.

### Verify Phase 7 — LangGraph multi-agent workflow

Apply the new migration first:

```powershell
docker compose exec backend alembic upgrade head
```

Then with your access token in `$h`:

```powershell
# Run the full graph: 5 agents in parallel + Recommendation + reflection
$body = @{ symbol = "AAPL" } | ConvertTo-Json
$analysis = Invoke-RestMethod -Uri http://localhost:8000/api/v1/agents/analyze `
    -Method POST -Headers $h -ContentType "application/json" -Body $body -TimeoutSec 600

# Top-level verdict
$analysis | Select-Object id, symbol, action, confidence, score, duration_ms
$analysis.summary
$analysis.reasoning

# Per-agent weights
$analysis.contributing_signals | Format-Table agent, sentiment, score, weight, note

# LangGraph node trace (timings + which nodes ran)
$analysis.trace | Format-Table node, status, duration_ms

# Each signal agent's raw insight
$analysis.insights.news       | Select-Object sentiment, confidence, score
$analysis.insights.technical  | Select-Object trend, momentum, score
$analysis.insights.fundamentals | Select-Object valuation, financial_health
$analysis.insights.sentiment  | Select-Object crowd_mood, discussion_volume
$analysis.insights.risk       | Select-Object risk_level, score

# List your past recommendations
Invoke-RestMethod -Uri "http://localhost:8000/api/v1/recommendations?limit=10" -Headers $h |
    Format-Table id, symbol, action, confidence, created_at

# Pull a single one back (full trace + insights)
Invoke-RestMethod -Uri "http://localhost:8000/api/v1/recommendations/$($analysis.id)" -Headers $h
```

Notes:
- Each signal agent runs in **parallel** in its own DB session — total wall time is ~max(agents), not sum.
- A reflection iteration triggers when the Recommendation Agent's confidence is below 0.4 (max 2 attempts). The `trace` will show two `recommendation` rows in that case.
- If 1 or 2 signal agents fail, the workflow degrades gracefully — the Recommendation Agent reasons over what's available and lowers confidence. Check `errors` in the response.
- Expect ~30–90 s end-to-end on Ollama llama3 (CPU). OpenAI is much faster.

### Verify Phase 8 — streaming, alerts, WebSocket

Apply migrations:

```powershell
docker compose exec backend alembic upgrade head
```

Watch the producer logs (should see one tick batch every 15s):

```powershell
docker compose logs -f backend | Select-String "Produced|alert|broadcaster"
```

#### Create an alert rule

```powershell
# Make sure AAPL is in your watchlist (the producer only ticks watched symbols)
Invoke-RestMethod -Uri http://localhost:8000/api/v1/watchlist -Method POST `
    -Headers $h -ContentType "application/json" `
    -Body (@{ symbol = "AAPL" } | ConvertTo-Json)

# Create an alert: fire when AAPL moves more than +/-0.01% (low threshold so it fires often during dev)
$rule = @{
    symbol = "AAPL"
    direction = "above"
    threshold = 0.01
    cooldown_seconds = 60
    notify_via_ws = $true
    re_run_analysis = $false
} | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:8000/api/v1/alerts -Method POST `
    -Headers $h -ContentType "application/json" -Body $rule

# List your rules
Invoke-RestMethod -Uri http://localhost:8000/api/v1/alerts -Headers $h

# Watch fired events
Invoke-RestMethod -Uri http://localhost:8000/api/v1/alerts/events -Headers $h |
    Format-Table fired_at, symbol, change_pct_at_fire, message
```

#### Open a WebSocket from the browser console

Open http://localhost:8000/docs in a browser, then in DevTools console:

```javascript
const token = "PASTE_YOUR_ACCESS_TOKEN_HERE";
const ws = new WebSocket(`ws://localhost:8000/api/v1/ws?token=${token}`);
ws.onmessage = (e) => console.log(JSON.parse(e.data));
ws.onopen = () => {
  // Already auto-subscribed to your watchlist on connect.
  // Add more symbols on the fly:
  ws.send(JSON.stringify({ action: "subscribe", symbols: ["MSFT", "TSLA"] }));
};
```

You should see:
- `{type:"connected", user_id:1, subscriptions:["AAPL"]}` on open
- `{type:"price", data:{symbol:"AAPL", price:..., change_percent:...}}` every 15 s
- `{type:"alert", data:{symbol:"AAPL", message:"AAPL rose above 0.01% ..."}}` when a rule fires

#### Inspect the Redis stream directly

```powershell
docker compose exec redis redis-cli XLEN stream:prices
docker compose exec redis redis-cli XINFO GROUPS stream:prices
docker compose exec redis redis-cli XRANGE stream:prices - + COUNT 5
```

Notes:
- The price producer fetches quotes only for symbols in at least one user's watchlist. Empty watchlists = no ticks.
- Two consumer groups (`ws_broadcasters`, `alert_evaluators`) read the same stream independently — each gets a copy of every tick.
- Alert cooldown defaults to 1 hour. For dev, lower it via `PATCH /alerts/{id}` body `{"cooldown_seconds": 60}`.
- `re_run_analysis: true` on a rule causes the alert evaluator to fire-and-forget a full `/agents/analyze` workflow in the background when the rule triggers.

### Verify Phase 9 — Frontend shell

```powershell
# Rebuild including the new frontend service
docker compose up -d --build

# First boot installs node_modules into the named volume (~90s); watch logs
docker compose logs -f frontend
```

Then open **http://localhost:5173** in a browser.

You should see:
- **Login page** — sign in with your existing account (or click "Create an account")
- After login → **Dashboard** with your watchlist, live-updating prices, and a recent-alerts panel
- **Sidebar** with 9 nav items (Dashboard active, the other 8 are Phase-10 placeholders)
- **Topbar** showing your email + a small green "Live" pulse when the WebSocket is connected
- Prices in the watchlist update every 15 s without a page refresh (driven by the WebSocket, not polling)

The 8 placeholder pages are routed and render a "lands in Phase 10" card so you can navigate around and feel the shell.

#### Notes
- Tokens are persisted to `localStorage` under key `sis-auth`. Clearing it logs you out.
- The axios interceptor auto-refreshes on 401 once before bouncing to `/login` — try waiting >30 min then hitting the API.
- The WebSocket reconnects automatically with exponential backoff if the backend restarts.
- If the WebSocket can't connect, check the backend's CORS config includes `http://localhost:5173` (it does by default in `.env.example`).

### Verify Phase 10 — Full UI

```powershell
# Rebuild including the new frontend deps (lightweight-charts, recharts)
docker compose up -d --build
```

The frontend will install the new packages on first start (~30 s). Then open
**http://localhost:5173** and explore:

| Route | What you'll see |
|---|---|
| `/dashboard` | Watchlist with **inline add/remove** + live prices + recent alerts |
| `/market` | Index ETFs (SPY/QQQ/DIA/IWM/VTI) + top movers from your watchlist |
| `/analysis` then a symbol | Candle chart (TradingView lightweight-charts) + profile + **Run full analysis** button |
| `/analysis/AAPL` | Direct deep-link |
| `/insights` | Recommendation cards (tab 1) + raw signal-agent insights (tab 2) |
| `/agents` | Recent runs list + animated trace graph + agent_log table |
| `/chat` | Upload PDF/HTML/text or paste, then ask questions with inline citations |
| `/sentiment` | Per-symbol Reddit crowd-mood gauges + topic chips |
| `/risk` | Per-symbol radar chart of volatility/drawdown/beta/leverage |
| `/alerts` | Create rules form + active rules list + live event feed |

Toast notifications appear in the bottom-right when an alert fires
(via the WebSocket) or when a long-running action completes
(e.g. `/agents/analyze`).

#### Notes
- Charts use `lightweight-charts` (TradingView's open-source library) — same engine as TradingView's own widget but client-side only.
- Sentiment/Risk pages read the latest insight per symbol from `/insights?agent=sentiment` (or `risk`); they appear empty until you've run those agents at least once.
- Index ETF tiles auto-subscribe to the WS while mounted so they update live.

### Verify Phase 11 — Portfolio, email alerts, tests

Apply the two new migrations:

```powershell
docker compose exec backend alembic upgrade head
```

#### Paper-trading portfolio

Open **http://localhost:5173/portfolio** in the browser. You'll see $100,000
starting cash. Place a buy:

```powershell
$h = @{ Authorization = "Bearer $($tokens.access_token)" }

# Buy 10 shares of AAPL at the live quote
$body = @{ symbol = "AAPL"; side = "buy"; qty = 10 } | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:8000/api/v1/portfolio/trade `
    -Method POST -Headers $h -ContentType "application/json" -Body $body

# See snapshot with live P&L
Invoke-RestMethod -Uri http://localhost:8000/api/v1/portfolio -Headers $h |
    Select-Object total_value, total_pnl, total_pnl_pct, cash

# History
Invoke-RestMethod -Uri http://localhost:8000/api/v1/portfolio/trades -Headers $h |
    Format-Table executed_at, symbol, side, qty, price, value

# Wipe and start over
Invoke-RestMethod -Uri http://localhost:8000/api/v1/portfolio/reset -Method POST -Headers $h
```

The Portfolio page in the UI has a Buy/Sell form, live-priced position table,
total P&L, and a trade history.

#### Email notifier

By default the `ConsoleNotifier` is active — alert emails are logged to
`docker compose logs backend`. To use SMTP, fill in `SMTP_*` in `.env` and
restart the backend. Mailtrap / Mailpit / Gmail App Passwords all work.

Enable email on a rule by ticking **Email** in the Alerts page create form, or
via the API:

```powershell
$rule = @{
    symbol = "AAPL"
    direction = "above"
    threshold = 0.01
    cooldown_seconds = 60
    notify_via_ws = $true
    notify_via_email = $true
} | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:8000/api/v1/alerts -Method POST `
    -Headers $h -ContentType "application/json" -Body $rule
```

When the rule fires, the email goes to the user's account email address.

#### Backend tests

```powershell
docker compose exec backend pytest
```

Runs the pure-unit battery: security primitives, indicator math, the JSON
output-parser, and the alert match/cooldown logic. ~30 tests, no DB or network
required, completes in <1 s.

### Verify Phase 12 — Production stack

Spin up the production overlay locally to smoke-test the build:

```powershell
# Copy and edit .env.prod
Copy-Item .env.prod.example .env.prod
# At minimum: JWT_SECRET (>=32 chars), POSTGRES_PASSWORD, an LLM key

# Build + start the prod stack (multi-stage Dockerfiles, nginx in front)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Single public ingress on port 80
curl http://localhost/api/v1/health
curl http://localhost/api/v1/ready
# UI at:
# http://localhost/
```

Things to verify:
- Internal services (postgres, redis, chroma, backend, frontend) are NOT
  exposed on the host — `docker compose ... ps` shows them with no host port.
- `/docs` and `/openapi.json` return 404 in prod (only `/` and `/api/*` work).
- `RUN_MIGRATIONS_ON_START=true` ran `alembic upgrade head` during boot —
  check `docker compose ... logs backend | Select-String alembic`.
- WebSocket works through the proxy: open the UI, login, watch the "Live"
  pulse turn green.

#### Documentation

- [`docs/architecture.md`](docs/architecture.md) — system topology + LangGraph + streaming + RAG diagrams (Mermaid, renders on GitHub)
- [`docs/runbook.md`](docs/runbook.md) — first deploy, zero-downtime updates, rollback, common incidents
- [`docs/interview.md`](docs/interview.md) — condensed talking points per module, recurring patterns, deferred trade-offs

### Stop

```powershell
docker compose down
```

### Stop and wipe data volumes

```powershell
docker compose down -v
```

---

## Project layout

```
stock-intelligence-system/
├── backend/
│   ├── alembic/              # migrations
│   ├── app/
│   │   ├── api/v1/           # versioned HTTP routes
│   │   ├── core/             # security, exceptions
│   │   ├── db/               # engine, session, models
│   │   ├── schemas/          # Pydantic DTOs
│   │   ├── services/         # business logic (framework-free)
│   │   ├── config.py
│   │   └── main.py
│   ├── alembic.ini
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                 # Phase 9+
├── infra/                    # Phase 1+
├── docs/                     # Phase 1+
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Development conventions

- All backend code is `async` end-to-end (FastAPI + SQLAlchemy 2.0 async + httpx).
- LLM and embedding providers go through abstract interfaces in `backend/app/ai/llm/`
  and `backend/app/ai/embeddings/` — never import a vendor SDK directly from agent code.
- Every agent writes a row to `agent_logs` so the Agent Monitor page can replay traces.
- Prompts live in `backend/app/ai/prompts/*.md` and are versioned — code references
  them by filename, never inline strings.
- Pydantic schemas (`app/schemas/`) are the only types the API speaks. ORM models
  (`app/db/models/`) never cross the HTTP boundary.

---

## Common DB tasks

```powershell
# Create a new migration after editing models (autogenerate)
docker compose exec backend alembic revision --autogenerate -m "add watchlists"

# Apply pending migrations
docker compose exec backend alembic upgrade head

# Roll back one revision
docker compose exec backend alembic downgrade -1

# Show current revision
docker compose exec backend alembic current

# Open a psql shell
docker compose exec postgres psql -U stockai -d stockai
```

---

## License

MIT (intended).
