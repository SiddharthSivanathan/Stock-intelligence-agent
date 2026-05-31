# Interview pack

Condensed talking points per module. Use as a study sheet before whiteboarding.

---

## Recurring patterns (every subsystem uses these)

- **Abstract base + adapters + factory.** LLMs, embedders, vector stores, news fetchers, market data providers, notifiers, stream buses — all share the same shape. The factory reads `settings` and returns the configured implementation; agent code only sees the interface. Means: swap providers without touching agents, inject fakes in tests, no vendor lock-in.
- **Service layer is framework-free.** Anything under `app/services/` has no FastAPI imports. The same code that powers HTTP routes is reused by the LangGraph nodes, the alert evaluator, and (potential) background workers.
- **Pydantic at the HTTP boundary, ORM nowhere else.** Routes accept and return Pydantic; ORM objects never leak. Prevents accidental N+1 in serializers, decouples DB schema evolution from API contract.
- **JSONB for agent outputs.** Each agent has its own schema; their outputs go into `insights.data` JSONB. Denormalized fields (`sentiment`, `confidence`, `score`, `summary`) get columns for cheap list queries. Best of both.
- **Every node opens its own AsyncSession** inside the LangGraph workflow. Async SQLAlchemy sessions are NOT coroutine-safe — sharing one across parallel branches corrupts state.

---

## Auth

- **bcrypt directly, not passlib.** passlib 1.7.x bickers with bcrypt 4.x. Calling bcrypt is two functions; not worth the dep.
- **PyJWT over python-jose** — actively maintained, cleaner API.
- **Access + refresh tokens with `type` claim.** `get_current_user` rejects refresh tokens used as access tokens — closes a common foot-gun.
- **Frontend: single-flight refresh-on-401.** Concurrent requests during refresh get queued onto the in-flight refresh, then re-fired with the new token. Otherwise a burst of 401s triggers N parallel refresh calls and races.

## Market data

- **Provider interface, op-by-op routing.** Quote uses Finnhub when configured (real-time), else yfinance. History always yfinance (Finnhub free tier dropped candles). Profile prefers Finnhub for the logo URL. One env var, three policies.
- **yfinance in `asyncio.to_thread`.** It's a sync lib; running on the event-loop would block every concurrent request.
- **TTL per operation, not global.** Quote 30 s, intraday history 60 s, daily history 5 min, profile 24 h. Match cache lifetime to data volatility.

## RAG

- **One Chroma collection, multi-tenant via metadata filter.** Tens of thousands of per-user collections would explode index counts; single collection + `user_id` + `symbol` metadata is the Chroma-recommended pattern.
- **Page-aware chunking.** PDFs extracted as `[(page_num, text), ...]`, chunked per page, page number stored in metadata so citations deep-link to "Document X, page 7".
- **Background ingestion via FastAPI BackgroundTasks.** Embedding 500 chunks is 20–60 s on CPU. We create the `Document` row with `status="processing"`, return immediately, and finish embedding after the response.
- **One repair turn for invalid LLM JSON.** Small local models occasionally wrap JSON in prose. The parser strips fences and extracts the outermost object; if validation still fails, we re-prompt once with the validation error attached and `temperature=0.0`. Two attempts is the right cost/quality trade-off.

## Agents

- **`BaseAgent[InputT, OutputT]` generic.** Enforces the lifecycle (gather → reason → validate → persist → log). Each new agent is ~80 lines of agent-specific logic.
- **Prompts as `.md` files**, loaded by filename. Versioning prompts in git is critical — small wording changes shift agent behavior dramatically.
- **`Insight` and `AgentLog` are separate.** Insights are what the user sees on the dashboard. Logs are what engineers see when debugging. Conflating them creates a table that's both noisy and incomplete.
- **`AgentLog` is written even on failure.** So the Agent Monitor page can show "this run crashed, here's the error" instead of pretending it never happened.

## Indicators (Technical / Risk agents)

- **LLMs never do math.** Every indicator (SMA / EMA / RSI / MACD / Bollinger / volatility / max-drawdown) is computed in pure pandas in `app/ai/tools/indicators.py`. The LLM only labels and narrates.
- **`passthrough_evidence_keys`.** Output schemas omit the raw numbers. Base agent merges them into the persisted JSONB after LLM validation. Saves tokens AND eliminates the hallucinated-numbers failure mode entirely.
- **Risk Agent's score is inverted** (+1 = safe, −1 = risky). Documented in the prompt + schema. Recommendation Agent can sum scores directionally without special-casing.

## Multi-agent workflow (LangGraph)

- **Fan-out + barrier.** 5 signal agents from `START` execute concurrently; all 5 join at `recommendation`. Wall time = max(agent), not sum.
- **`Annotated[list, operator.add]` reducers** on `trace` and `errors` so parallel branches accumulate instead of fighting over last-write-wins.
- **Reflection as a self-loop with counter.** `route_reflection` checks `confidence < 0.4 AND attempts < 2`. The Recommendation node bumps the counter; the prompt detects reflection attempts and tells the LLM "be more decisive."
- **`db` stays out of graph state.** Sessions aren't JSON-serializable. `user_id` is captured in closure when nodes are built.
- **Partial-failure tolerance.** A node catches its own exceptions and writes `None` for its insight + an entry to `errors`. The Recommendation prompt explicitly handles "fewer than 3 agents produced results → hold with low confidence."

## Real-time streaming

- **Redis Streams over Pub/Sub.** Pub/Sub is fire-and-forget; slow consumers drop messages. Streams give durable storage (within MAXLEN), consumer groups, ACK + PEL for at-least-once.
- **Two consumer groups, one stream.** `ws_broadcasters` and `alert_evaluators` each get an independent copy of every tick with their own PEL. Single responsibility per consumer.
- **`MAXLEN ~ 10000`** on every `XADD`. Approximate trimming is O(1) (Redis trims at a radix boundary). Streams grow forever otherwise.
- **WSHub: `asyncio.Lock` + snapshot-then-send.** Holding the lock during `ws.send_json` would serialize all broadcasts; a single stalled client would block every other client's tick.
- **JWT in query string for WS auth.** Browsers can't easily set Authorization headers on WS. Trade-off acknowledged: tokens may end up in server logs.
- **Alert evaluator opens its own session per tick.** Short-lived transactions return to the pool quickly; long-lived sessions hold connections.

## Frontend

- **Zustand for client state, TanStack Query for server state.** Three pieces of global state (auth, prices, alerts) — Redux is overkill. TanStack Query handles cache invalidation, refetching, deduplication out of the box.
- **WS overlay on REST snapshot.** First paint is instant from cached REST; live ticks merge over the top. No flash, no spinner-after-spinner.
- **`localStorage` tokens (Phase 11), httpOnly cookies (Phase 12+).** Pragmatic dev choice; XSS risk acknowledged. Phase 12 left as a documented hardening item.
- **`lightweight-charts` over Chart.js for OHLC.** Same engine TradingView uses, free, small bundle, financial-time-series-first.
- **Polling for RAG ingest status, not WS.** Once-per-document low-frequency event with a finite end-state. WS subscription per document would be more code for no UX gain.

## Production

- **Multi-stage Dockerfiles.** Builder installs deps; runtime copies only the venv + source. Smaller image, smaller attack surface, no compilers in prod.
- **Non-root user in the runtime image.** UID 1000 to match common host user IDs.
- **nginx reverse proxy** with proper `Upgrade` header mapping for WebSockets and a longer `proxy_read_timeout` on the API path for `/analyze`-style long requests.
- **CORS NOT `*` in prod.** Startup checks fail-fast if it is.
- **`JWT_SECRET ≥ 32 chars` enforced at startup** when `APP_ENV=prod`.
- **`docs_url`/`redoc_url`/`openapi.json` disabled** in prod by default. Re-enable for a dev/staging env.
- **Swagger / health distinction.** `/health` is cheap (process alive), `/ready` pings every dependency. Docker uses `/health`; load balancers use `/ready`.

---

## Trade-offs deliberately deferred

- **Function-calling LLMs.** Our LLM interface exposes `chat()` + `stream()` only. Tool-using agents (Phase 11's deferred chatbot) would extend this with a `tools` arg. Doable; we wanted the basic shape first.
- **Per-replica streams.** Single backend process handles one consumer per group right now. Horizontal scaling means spinning up more replicas; LangGraph workflow still runs in-process, but the producer should move to its own service to avoid duplicate ticks across replicas.
- **Token storage hardening.** localStorage works and is simple. Production-grade move: httpOnly + Secure + SameSite=Lax cookies + CSRF token on mutating routes.
- **Recommendation explainability beyond JSON.** Trace graph shows timings + status. Phase 13+ idea: step-by-step animation that walks through each agent's reasoning, hover for full prompt + response.
- **Cost telemetry.** Token counts per agent run aren't logged. Easy to add: capture from the LLM response, persist on `AgentLog`.

---

## Closing questions you might get

- **"How would you add a new agent?"** Subclass `BaseAgent`, declare `name`/`output_schema`/`prompt_filename`, implement `gather_evidence` + `build_messages`. Drop a `<name>.md` in `app/ai/prompts/`. Add a route. Add a node in `app/ai/graph/nodes.py` and wire it into `workflow.py`. Subclass tests inherit the pattern.
- **"How would you scale this to 10,000 users?"** Move the price producer out of the backend container (single global producer is fine — quotes are cached, not per-user). Add Redis pub/sub layer in front of the WSHub so multiple backend replicas can share fan-out. Move LangGraph runs to a Celery/Arq worker pool with a Postgres-backed queue. Cap concurrent `/analyze` requests with a semaphore.
- **"What's the biggest risk in production?"** LLM provider outages (OpenAI rate limits, Ollama crashes) — the agent layer handles per-agent failure gracefully but a fully-down provider means all `/analyze` calls fail. Mitigation: keep two providers configured, fall back to the secondary on persistent errors.
