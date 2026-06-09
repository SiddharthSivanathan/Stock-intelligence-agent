# Free Deployment Runbook (Path B — Vercel + Render + Supabase + Upstash)

This is the step-by-step guide for deploying the Stock Intelligence System to
free cloud tiers. Total time: ~45 minutes of clicking. Cost: ₹0 forever.

## Architecture after deploy

```
   Browser
      │
      ▼
   Vercel (frontend, static)  ──API calls──> Render (backend, Fastify)
                                              │  │
                                              │  ├──> Supabase (Postgres free)
                                              │  └──> Upstash  (Redis free)
                                              │
                                              ▼
                                          Gemini API (LLM)
```

## What's intentionally not deployed (and why)

| Component | Reason | What you lose |
|---|---|---|
| ChromaDB | No free hosted Chroma | RAG (PDF upload + Q&A) — disabled via `CHROMA_ENABLED=false` |
| Background workers | Render free sleeps services | Auto-fire alerts, live price ticks | 
| Ollama | Can't host LLM free | Switch to Gemini |

The core app (auth, search, analysis, watchlist, portfolio, manual alerts) all work.

---

## Step 1 — Push code to GitHub (skip if already there)

```powershell
cd C:\Users\ASUS\OneDrive\Dokumen\Desktop\stock-intelligence-system
git add .
git commit -m "Add Render + Vercel deploy configs"
git push
```

If not yet on GitHub:
```powershell
git remote add origin https://github.com/SiddharthSivanathan/Stock-intelligence-agent.git
git branch -M main
git push -u origin main
```

---

## Step 2 — Supabase (Postgres database)

1. Go to https://supabase.com → **Start your project** → sign in with GitHub
2. **New project**:
   - Name: `stock-intel`
   - DB password: generate a strong one — **save it**
   - Region: **Mumbai (ap-south-1)** for best latency
   - Plan: **Free**
3. Wait ~2 min for the project to provision
4. **Project Settings** → **Database** → **Connection string** → **URI**
5. Copy the connection string. It looks like:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres
   ```
6. **Replace `[YOUR-PASSWORD]` with the actual password.**
7. **Save this — you need it for Render.** Label it `DATABASE_URL`.

---

## Step 3 — Upstash (Redis)

1. Go to https://upstash.com → sign in with GitHub
2. **Create Database**:
   - Name: `stock-intel-redis`
   - Region: **AP-South** (closest to India)
   - Type: **Regional**
   - Plan: **Free** (10k commands/day — plenty for demo)
3. Open the new database → scroll to **Connect to your database**
4. Copy these three values from the **Node** tab:
   - `host` (e.g. `eu1-cool-bird-12345.upstash.io`)
   - `port` (always `6379` or `6380` for TLS)
   - `password` (long random string)
5. **Save these — you need them for Render.**

---

## Step 4 — Google AI Studio (Gemini API key)

⚠️ **Important:** your previous Google account is at 0 quota. You need to either:
- Sign in with a **different Google account**, OR
- Enable billing on the existing Google Cloud project (still free up to 1500 req/day)

Steps:
1. Go to https://aistudio.google.com/apikey
2. Sign in with your Google account
3. **Create API key** → **Create API key in new project**
4. Copy the key (starts with `AIza...` or `AQ.Ab...`)
5. **Save it — label `GEMINI_API_KEY`.**

Test it works before proceeding:
```powershell
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=YOUR_KEY" `
  -H "Content-Type: application/json" `
  -d '{"contents":[{"parts":[{"text":"reply OK"}]}]}'
```
If you get back JSON with "OK" or similar text → key works.
If you get 429 quota exceeded → use a different Google account.

---

## Step 5 — Render (backend)

1. Go to https://render.com → sign in with GitHub
2. **New** → **Blueprint** → **Connect** your `Stock-intelligence-agent` repo
3. Render reads `backend-ts/render.yaml` and pre-fills service config
4. Click **Apply** → service starts creating
5. Once it shows "Build", go to **Environment** tab and fill in the `sync: false` vars:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | The Supabase string from Step 2 |
   | `REDIS_HOST` | Upstash `host` value |
   | `REDIS_PORT` | `6379` |
   | `REDIS_PASSWORD` | Upstash password |
   | `REDIS_TLS` | `true` |
   | `CHROMA_ENABLED` | `false` |
   | `GEMINI_API_KEY` | From Step 4 |
   | `JWT_SECRET` | run `openssl rand -hex 32` and paste output — must be ≥32 chars |
   | `CORS_ORIGINS` | `["https://stock-intel.vercel.app"]` — update after Step 6 with your real Vercel URL |
   | `FINNHUB_API_KEY` | `d8h594hr01qhjpmqllr0d8h594hr01qhjpmqllrg` |
   | `NEWSAPI_KEY` | `d814bff9d3aa4a0896bcac77afa93878` |
   | `SMTP_HOST` | `smtp.gmail.com` |
   | `SMTP_USERNAME` | `siddharthsivanathan4141@gmail.com` |
   | `SMTP_PASSWORD` | `udsd yyyh elcx zzmd` |
   | `SMTP_FROM` | `siddharthsivanathan4141@gmail.com` |

6. **Save changes** → Render redeploys with the new env (takes ~5 min first build)
7. When deploy succeeds, note the URL: `https://stock-intel-backend.onrender.com`
8. Verify: open `https://stock-intel-backend.onrender.com/api/v1/health` in browser. Should return JSON.
9. **The first request after idle takes 30-60 seconds** — this is the cold start.

### Seed the stocks master

In Render dashboard → **Shell** tab → run:
```bash
npx tsx src/scripts/syncStocks.ts
```
This populates 2,375 NSE + US stocks. Takes ~10 seconds.

---

## Step 6 — Vercel (frontend)

1. Go to https://vercel.com → sign in with GitHub
2. **Add New** → **Project** → import `Stock-intelligence-agent`
3. Vercel detects Vite. Configure:
   - **Root Directory**: `frontend`
   - **Framework Preset**: Vite (auto-detected)
   - **Build Command**: `npm run build` (auto)
   - **Output Directory**: `dist` (auto)
4. **Environment Variables** — click "Add":
   | Name | Value |
   |---|---|
   | `VITE_API_BASE_URL` | `https://stock-intel-backend.onrender.com/api/v1` |
   | `VITE_WS_URL` | `wss://stock-intel-backend.onrender.com/api/v1/ws` |
5. **Deploy** — takes ~2 min
6. When done, copy the deployment URL (e.g. `https://stock-intel.vercel.app`)

---

## Step 7 — Update CORS on Render

1. Go back to Render → backend service → Environment
2. Update `CORS_ORIGINS` to your actual Vercel URL:
   ```
   ["https://stock-intel.vercel.app"]
   ```
3. Save — backend redeploys with new CORS

---

## Step 8 — Test end-to-end

1. Open your Vercel URL in incognito
2. Wait 30-60 sec if backend is cold-starting (Render free-tier sleep)
3. Sign up with any email
4. Search "TCS" → autocomplete works
5. Click TCS → live chart loads
6. Click "Run full analysis" → ~30-60 sec on Gemini
7. See the recommendation

---

## What if something breaks?

| Symptom | Fix |
|---|---|
| Frontend loads, login fails | CORS_ORIGINS in Render doesn't match Vercel URL — fix and redeploy |
| 502 / cold start | Wait 60 sec and retry — Render free tier wakeup |
| `DATABASE_URL` errors in Render logs | Supabase password mistyped or special chars unescaped |
| Gemini 429 | Quota exceeded — switch to a different Google account's key |
| Frontend loads but shows blank | Check browser console for the actual error |

---

## Updating the app

```powershell
# Make code changes locally
git add .
git commit -m "your message"
git push
```

Vercel auto-deploys frontend (~30 sec).
Render auto-deploys backend (~5 min).

---

## Future: paying ~$7/mo to remove cold starts

If you want zero cold starts and the background workers (auto-alerts), upgrade Render web service to **Starter** ($7/mo). Then set `DISABLE_BACKGROUND_WORKERS=false` and the producer runs 24/7.
