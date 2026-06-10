"""Generate the Stock Intelligence System pitch PDF.

Run:  python scripts/build_pitch_pdf.py
Output: ./StockIntel_Pitch.pdf
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether,
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY

# -----------------------------------------------------------------------------
# Theme colors — match the app's gold/green dark palette as best we can in print
# -----------------------------------------------------------------------------
ACCENT = colors.HexColor("#10b981")   # emerald (Live indicator color)
DARK   = colors.HexColor("#0f172a")   # slate-900
MUTED  = colors.HexColor("#64748b")   # slate-500
RULE   = colors.HexColor("#e2e8f0")   # slate-200
PILL   = colors.HexColor("#f1f5f9")   # slate-100

# -----------------------------------------------------------------------------
# Styles
# -----------------------------------------------------------------------------
def make_styles():
    base = getSampleStyleSheet()
    s = {}
    s["Cover"] = ParagraphStyle(
        "Cover", parent=base["Title"], fontName="Helvetica-Bold", fontSize=42,
        leading=46, alignment=TA_CENTER, textColor=DARK, spaceAfter=12,
    )
    s["CoverSub"] = ParagraphStyle(
        "CoverSub", parent=base["Normal"], fontName="Helvetica", fontSize=15,
        leading=20, alignment=TA_CENTER, textColor=MUTED, spaceAfter=30,
    )
    s["CoverTag"] = ParagraphStyle(
        "CoverTag", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=11,
        leading=14, alignment=TA_CENTER, textColor=ACCENT, spaceAfter=80,
    )
    s["H1"] = ParagraphStyle(
        "H1", parent=base["Heading1"], fontName="Helvetica-Bold", fontSize=22,
        leading=26, textColor=DARK, spaceBefore=18, spaceAfter=10,
    )
    s["H2"] = ParagraphStyle(
        "H2", parent=base["Heading2"], fontName="Helvetica-Bold", fontSize=14,
        leading=18, textColor=DARK, spaceBefore=14, spaceAfter=6,
    )
    s["H3"] = ParagraphStyle(
        "H3", parent=base["Heading3"], fontName="Helvetica-Bold", fontSize=11,
        leading=14, textColor=ACCENT, spaceBefore=10, spaceAfter=4,
    )
    s["Body"] = ParagraphStyle(
        "Body", parent=base["BodyText"], fontName="Helvetica", fontSize=10.5,
        leading=15, alignment=TA_JUSTIFY, textColor=DARK, spaceAfter=8,
    )
    s["Bullet"] = ParagraphStyle(
        "Bullet", parent=base["BodyText"], fontName="Helvetica", fontSize=10.5,
        leading=15, leftIndent=18, bulletIndent=6, textColor=DARK, spaceAfter=4,
    )
    s["Quote"] = ParagraphStyle(
        "Quote", parent=base["BodyText"], fontName="Helvetica-Oblique", fontSize=12,
        leading=18, alignment=TA_CENTER, textColor=ACCENT, spaceBefore=10,
        spaceAfter=10, leftIndent=20, rightIndent=20,
    )
    s["Mono"] = ParagraphStyle(
        "Mono", parent=base["BodyText"], fontName="Courier", fontSize=9,
        leading=12, leftIndent=12, textColor=DARK, spaceAfter=6,
    )
    s["Footer"] = ParagraphStyle(
        "Footer", parent=base["Normal"], fontName="Helvetica", fontSize=8,
        textColor=MUTED, alignment=TA_CENTER,
    )
    return s


# -----------------------------------------------------------------------------
# Reusable layout helpers
# -----------------------------------------------------------------------------
def make_pill_table(label, value, S):
    t = Table(
        [[Paragraph(f"<b>{label}</b>", S["Body"]),
          Paragraph(value, S["Body"])]],
        colWidths=[5*cm, 11.5*cm],
    )
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), PILL),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("BOX", (0, 0), (-1, -1), 0.5, RULE),
    ]))
    return t


def bullet_list(items, S):
    out = []
    for txt in items:
        out.append(Paragraph(f"<font color='#10b981'>▸</font>&nbsp;{txt}", S["Bullet"]))
    return out


def section_divider():
    """A thin horizontal rule."""
    t = Table([[" "]], colWidths=[17*cm], rowHeights=[1])
    t.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.5, RULE)]))
    return t


# -----------------------------------------------------------------------------
# Page templates
# -----------------------------------------------------------------------------
def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    # footer
    canvas.drawCentredString(A4[0] / 2, 1.2 * cm,
                             f"Stock Intelligence System  ·  Page {doc.page}")
    # accent line
    canvas.setStrokeColor(ACCENT)
    canvas.setLineWidth(1.2)
    canvas.line(2*cm, A4[1] - 1.6*cm, A4[0] - 2*cm, A4[1] - 1.6*cm)
    canvas.setFont("Helvetica-Bold", 9)
    canvas.setFillColor(ACCENT)
    canvas.drawString(2*cm, A4[1] - 1.4*cm, "STOCK INTELLIGENCE")
    canvas.setFont("Helvetica", 9)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(A4[0] - 2*cm, A4[1] - 1.4*cm, "Pitch Document  ·  v1.0")
    canvas.restoreState()


# -----------------------------------------------------------------------------
# Content sections
# -----------------------------------------------------------------------------
def cover(S):
    story = []
    story.append(Spacer(1, 110))
    story.append(Paragraph("Stock Intelligence", S["Cover"]))
    story.append(Paragraph("System", S["Cover"]))
    story.append(Paragraph(
        "A multi-agent AI platform that analyzes any NSE / BSE / US stock<br/>"
        "across news, technicals, fundamentals, sentiment, and risk —<br/>"
        "then produces a transparent Buy / Hold / Sell verdict.",
        S["CoverSub"]))
    story.append(Paragraph("BUILT WITH TYPESCRIPT  ·  REACT  ·  GEMINI  ·  POSTGRES", S["CoverTag"]))
    story.append(Spacer(1, 60))
    # cover footer table
    t = Table(
        [["Prepared for", "Clients & Investors"],
         ["Author", "Siddharth Sivanathan"],
         ["Document version", "v1.0"]],
        colWidths=[5*cm, 9*cm],
    )
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("TEXTCOLOR", (0, 0), (0, -1), MUTED),
        ("TEXTCOLOR", (1, 0), (1, -1), DARK),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, 0), (-1, -1), 0.3, RULE),
    ]))
    story.append(t)
    story.append(PageBreak())
    return story


def executive_summary(S):
    story = [Paragraph("Executive Summary", S["H1"])]
    story.append(Paragraph(
        "<b>Stock Intelligence</b> is a full-stack AI platform that turns retail "
        "investment research from a multi-hour, multi-tab chore into a single "
        "click. The user types any company name &mdash; <i>TCS, Reliance, Apple, "
        "Waaree Energies</i> &mdash; and five specialist AI agents go to work in "
        "parallel, analyzing news, technical indicators, fundamentals, social "
        "sentiment, and risk. A sixth agent synthesizes their outputs into a "
        "single <b>Buy / Hold / Sell</b> recommendation with confidence scoring "
        "and complete reasoning.", S["Body"]))
    story.append(Paragraph(
        "Built end-to-end in TypeScript with a multi-agent LangGraph-style "
        "orchestration, Retrieval Augmented Generation over uploaded filings, "
        "real-time WebSocket price streaming, paper trading, and a configurable "
        "alert engine. Indexes 2,300+ NSE/BSE/US listings with fuzzy search.",
        S["Body"]))
    story.append(Spacer(1, 8))
    story.append(Paragraph(
        "&ldquo;Bloomberg-grade analysis for the price of a Netflix subscription.&rdquo;",
        S["Quote"]))
    story.append(Spacer(1, 8))
    # Stats row
    stats = [
        ["2,375+", "Stocks indexed (NSE + US)"],
        ["5", "AI agents per analysis"],
        ["~2 min", "End-to-end recommendation time"],
        ["12", "Production-grade phases shipped"],
    ]
    t = Table([[Paragraph(f"<b><font size=18 color='#10b981'>{a}</font></b>", S["Body"]),
                Paragraph(b, S["Body"])] for a, b in stats],
              colWidths=[3.5*cm, 12.5*cm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("BACKGROUND", (0, 0), (0, -1), PILL),
        ("BOX", (0, 0), (-1, -1), 0.5, RULE),
        ("INNERGRID", (0, 0), (-1, -1), 0.3, RULE),
    ]))
    story.append(t)
    story.append(PageBreak())
    return story


def problem_solution(S):
    story = [Paragraph("The Problem", S["H1"])]
    story.append(Paragraph(
        "Retail stock research is broken. To answer a single question &mdash; "
        "<i>should I buy this stock?</i> &mdash; a serious investor today juggles:",
        S["Body"]))
    story.extend(bullet_list([
        "<b>Moneycontrol / Screener</b> for fundamentals",
        "<b>TradingView</b> for technicals and charting",
        "<b>Twitter, Reddit, Telegram</b> for sentiment",
        "<b>Bloomberg / ET / Mint</b> for news",
        "<b>Tickertape / Trendlyne</b> for risk metrics",
        "<b>ChatGPT</b> to summarize what they just read",
    ], S))
    story.append(Paragraph(
        "Even a disciplined analyst spends <b>30&ndash;60 minutes per stock</b> "
        "switching tabs, copy-pasting, and mentally reconciling contradictory signals. "
        "Most retail investors don&rsquo;t. They make decisions on tips, vibes, "
        "and YouTube influencers &mdash; and lose money predictably.",
        S["Body"]))

    story.append(Paragraph("The Solution", S["H1"]))
    story.append(Paragraph(
        "<b>One search box. One click. One verdict.</b> Stock Intelligence collapses "
        "the whole research workflow into a single AI-orchestrated pipeline:",
        S["Body"]))
    story.extend(bullet_list([
        "<b>Search</b> any of 2,375+ Indian and US listed companies by name or symbol",
        "<b>Five AI agents</b> analyze the stock in parallel (news, technical, fundamentals, sentiment, risk)",
        "<b>A recommendation agent</b> synthesizes their outputs with confidence scoring and a reflection loop",
        "<b>Receive a verdict</b> &mdash; Buy, Hold, or Sell &mdash; with full transparent reasoning and a citable trace",
        "<b>Continuous monitoring</b> &mdash; real-time price alerts via WebSocket and email, paper-trading portfolio",
        "<b>Deep dive</b> &mdash; upload company filings (PDF) and chat with them via Retrieval Augmented Generation",
    ], S))
    story.append(PageBreak())
    return story


def product_overview(S):
    story = [Paragraph("Product Overview", S["H1"])]
    story.append(Paragraph(
        "The platform is a single web application with 9 user-facing pages, each "
        "powered by a domain-specific subsystem. Everything ties back to one "
        "central search bar &mdash; the user&rsquo;s entire research workflow.",
        S["Body"]))

    pages = [
        ("Dashboard", "Live-updating watchlist, recent recommendations, alert feed"),
        ("Stock Analysis", "TradingView-grade candle chart, company profile, one-click full analysis"),
        ("AI Insights", "Recommendation history with per-agent breakdown and reflection traces"),
        ("Agent Monitor", "Replay every AI run; see timing, status, success/failure per agent"),
        ("Market", "Index ETFs (SPY, QQQ, NIFTY, SENSEX) and top movers from your universe"),
        ("RAG Chat", "Upload 10-Ks, annual reports, transcripts; ask questions with inline citations"),
        ("Sentiment", "Reddit crowd mood, topic trends, distinct from professional sentiment"),
        ("Risk", "Volatility, drawdown, beta, leverage radar chart"),
        ("Alerts", "Price-change rules with WebSocket toasts + email + auto re-analysis"),
        ("Portfolio", "Paper trading from $100k cash, live P&amp;L, full trade history"),
    ]
    t = Table([[Paragraph(f"<b>{n}</b>", S["Body"]), Paragraph(d, S["Body"])] for n, d in pages],
              colWidths=[4.5*cm, 11.5*cm])
    t.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LINEBELOW", (0, 0), (-1, -1), 0.3, RULE),
        ("BACKGROUND", (0, 0), (0, -1), PILL),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(t)
    story.append(PageBreak())
    return story


def ai_workflow(S):
    story = [Paragraph("The Multi-Agent AI Workflow", S["H1"])]
    story.append(Paragraph(
        "This is the heart of the product. When the user clicks <i>Run Analysis</i> "
        "on a stock, this happens:",
        S["Body"]))

    # Stage 1
    story.append(Paragraph("Stage 1 &mdash; Parallel Fanout", S["H2"]))
    story.append(Paragraph(
        "Five specialist agents launch <b>in parallel</b>, each focused on one dimension. "
        "Total wall time = the slowest agent, not the sum. Each agent has the same "
        "skeleton: pull real data, ground a structured prompt, call the LLM in JSON "
        "mode, validate against a Zod schema, persist the result.",
        S["Body"]))

    agents = [
        ("News Agent", "Fetches recent headlines from NewsAPI + Finnhub, scores impact and sentiment"),
        ("Technical Agent", "Computes RSI, MACD, Bollinger Bands, SMAs in Python, LLM interprets pattern"),
        ("Fundamentals Agent", "Pulls PE, PEG, ROE, debt/equity; optionally augments with RAG over filings"),
        ("Sentiment Agent", "Reads Reddit crowd discussion, gauges mood and discussion volume"),
        ("Risk Agent", "Volatility, drawdown, beta, leverage &mdash; score is inverted (+1 = safest)"),
    ]
    t = Table([[Paragraph(f"<b>{n}</b>", S["Body"]), Paragraph(d, S["Body"])] for n, d in agents],
              colWidths=[4*cm, 12*cm])
    t.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LINEBELOW", (0, 0), (-1, -1), 0.3, RULE),
        ("BACKGROUND", (0, 0), (0, -1), PILL),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(t)

    # Stage 2
    story.append(Paragraph("Stage 2 &mdash; Recommendation Synthesis", S["H2"]))
    story.append(Paragraph(
        "A sixth <b>Recommendation Agent</b> receives all five outputs (and any "
        "errors) and produces a single verdict: Buy, Hold, or Sell &mdash; with a "
        "confidence score in [0, 1], a 1-line summary, and multi-sentence reasoning. "
        "It also lists <i>contributing signals</i> &mdash; how much weight each agent's "
        "output got and why.",
        S["Body"]))

    # Stage 3
    story.append(Paragraph("Stage 3 &mdash; Reflection Loop", S["H2"]))
    story.append(Paragraph(
        "If confidence is below 0.40, the agent re-runs with the same data plus "
        "a self-correction hint &mdash; up to 2 reflections. This is a poor-man's "
        "chain-of-thought: either the second pass commits more strongly, or it "
        "honestly stays uncertain. Either is useful information.",
        S["Body"]))

    # Stage 4
    story.append(Paragraph("Stage 4 &mdash; Persistence + Replay", S["H2"]))
    story.append(Paragraph(
        "Every run &mdash; success or failure &mdash; is written to the database with "
        "per-node timings, raw agent outputs, and the full trace. The Agent Monitor "
        "page is a complete replay tool. Crucial for trust: every verdict is "
        "auditable, never a black box.",
        S["Body"]))

    story.append(Spacer(1, 6))
    story.append(Paragraph(
        "Failure-tolerance is built in: if 1&ndash;2 agents fail (e.g., Reddit "
        "rate-limited the sentiment agent), the workflow continues. The "
        "Recommendation Agent is told which signals are missing, factors that into "
        "confidence, and still produces a verdict. The system degrades gracefully &mdash; "
        "it never just crashes.",
        S["Body"]))
    story.append(PageBreak())
    return story


def architecture(S):
    story = [Paragraph("Technical Architecture", S["H1"])]
    story.append(Paragraph(
        "End-to-end TypeScript stack. One language across frontend, backend, agents, "
        "and ORM. Single dependency tree, fully type-safe from database column to "
        "React component.",
        S["Body"]))

    story.append(Paragraph("System Topology", S["H2"]))
    # ASCII diagram in monospace
    diag = (
        "                    Browser (React SPA)\n"
        "                         |\n"
        "                         |  HTTPS REST + WebSocket\n"
        "                         v\n"
        "         +---------------------------------+\n"
        "         |   Fastify + TypeScript Backend  |\n"
        "         |                                 |\n"
        "         |  Auth . Routes . AI Agents .    |\n"
        "         |  Workflow . Background Workers  |\n"
        "         +-------+--------+--------+-------+\n"
        "                 |        |        |\n"
        "          +------+        |        +------+\n"
        "          v               v               v\n"
        "      PostgreSQL       Redis          ChromaDB\n"
        "      (Prisma)      (cache+streams)   (vectors)\n"
        "                                            |\n"
        "                                            v\n"
        "                                       Gemini /\n"
        "                                       OpenAI /\n"
        "                                       Ollama LLM"
    )
    story.append(Paragraph(diag.replace("\n", "<br/>"), S["Mono"]))

    story.append(Paragraph("Data Flow &mdash; Real-time Price Pipeline", S["H2"]))
    story.append(Paragraph(
        "Every 15 seconds, a background producer fetches live quotes for the union "
        "of all watchlist symbols + all active alert symbols + all WebSocket "
        "subscribers. Quotes are written to a Redis Stream (at-least-once delivery, "
        "replay buffer) and simultaneously broadcast to connected WebSocket clients. "
        "An alert evaluator runs in the same loop: any rule whose direction and "
        "threshold match the tick fires immediately &mdash; emitting a WebSocket toast, "
        "an email, and optionally kicking off a fresh full-stack re-analysis.",
        S["Body"]))

    story.append(PageBreak())
    return story


def tech_stack(S):
    story = [Paragraph("Technology Stack", S["H1"])]
    story.append(Paragraph(
        "Every choice is deliberate. We picked tools that are mature, type-safe, "
        "and have minimal vendor lock-in.",
        S["Body"]))

    story.append(Paragraph("Frontend", S["H2"]))
    rows = [
        ["React 18", "Component model + ecosystem"],
        ["TypeScript", "End-to-end type safety; same language as backend"],
        ["Vite", "Sub-second HMR for developer velocity"],
        ["Tailwind CSS + shadcn/ui", "Utility-first styling; no CSS files to manage"],
        ["lightweight-charts", "TradingView's open-source charting library"],
        ["TanStack Query", "Async server-state management with caching"],
        ["Zustand", "Tiny global state for auth/stream stores"],
    ]
    story.append(tech_table(rows, S))

    story.append(Paragraph("Backend", S["H2"]))
    rows = [
        ["Fastify 4", "High-performance HTTP server, plugin ecosystem"],
        ["TypeScript (Node 20)", "Same language as frontend; ESM modules"],
        ["Prisma 5", "Type-safe ORM with auto-generated TypeScript types"],
        ["Zod", "Runtime validation = single source of truth for types"],
        ["jsonwebtoken + bcrypt", "Stateless JWT auth, standard bearer flow"],
        ["@fastify/websocket", "Persistent WS hub with auto-subscribe"],
        ["ioredis", "Battle-tested Redis client supporting Streams + pub/sub"],
        ["nodemailer", "SMTP delivery for alert emails"],
    ]
    story.append(tech_table(rows, S))

    story.append(PageBreak())

    story.append(Paragraph("Data & Storage", S["H2"]))
    rows = [
        ["PostgreSQL 16", "Transactional store; 11 tables, JSONB for agent outputs"],
        ["Redis 7", "Sub-millisecond cache + Streams for at-least-once delivery"],
        ["ChromaDB 0.5", "Open-source vector store for RAG"],
        ["Supabase (prod)", "Managed Postgres with connection pooling"],
        ["Upstash (prod)", "Managed serverless Redis with TLS"],
    ]
    story.append(tech_table(rows, S))

    story.append(Paragraph("AI / LLM Layer", S["H2"]))
    rows = [
        ["Google Gemini 2.0", "Primary LLM provider; 1500 free requests/day"],
        ["Provider abstraction", "Same code runs against Gemini, OpenAI, or local Ollama"],
        ["text-embedding-004", "Gemini's embedding model for RAG vector indexing"],
        ["Custom workflow", "Hand-rolled DAG (no LangGraph.js dependency)"],
        ["technicalindicators npm", "Pure-JS RSI, MACD, Bollinger, SMA computation"],
        ["yahoo-finance + Finnhub", "Multi-source market data with automatic fallback"],
        ["NewsAPI", "Headline aggregation for the News Agent"],
    ]
    story.append(tech_table(rows, S))

    story.append(Paragraph("Infrastructure & DevOps", S["H2"]))
    rows = [
        ["Docker Compose", "Whole stack with one command for local dev"],
        ["nginx", "Reverse proxy + TLS termination in production"],
        ["Vercel (free)", "Global CDN frontend hosting with GitHub auto-deploy"],
        ["Render (free)", "Backend hosting with auto-deploy from main branch"],
        ["Cloudflare Tunnel", "Optional secure tunnel for laptop demos"],
        ["GitHub", "Source control with the entire repo at SiddharthSivanathan/Stock-intelligence-agent"],
    ]
    story.append(tech_table(rows, S))

    story.append(PageBreak())
    return story


def tech_table(rows, S):
    """Format a uniform 2-column tool/why-we-chose-it table."""
    formatted = []
    for tool, why in rows:
        formatted.append([
            Paragraph(f"<b>{tool}</b>", S["Body"]),
            Paragraph(why, S["Body"]),
        ])
    t = Table(formatted, colWidths=[5*cm, 11*cm])
    t.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("BACKGROUND", (0, 0), (0, -1), PILL),
        ("LINEBELOW", (0, 0), (-1, -1), 0.3, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return t


def features(S):
    story = [Paragraph("Standout Features", S["H1"])]

    feats = [
        ("Universal Stock Search",
         "2,375+ Indian and US stocks indexed from the official NSE EQUITY_L.csv. "
         "Fuzzy search by name (\"reliance\", \"tata\") or symbol (TCS, AAPL, ^NSEI). "
         "Results ranked by exact match > prefix > substring > market cap boost."),
        ("Multi-Agent AI Workflow",
         "Five specialist LLM agents run in parallel, then a sixth synthesizes. "
         "Self-corrects via reflection loop when initial confidence is low. "
         "Every run is fully replayable from the Agent Monitor page."),
        ("Retrieval Augmented Generation",
         "Upload a company's 10-K or annual report (PDF). Ask questions in natural "
         "language: \"What did management say about margin pressure?\" Get back an "
         "answer with inline citations to the exact source chunks."),
        ("Real-time Price Streaming",
         "WebSocket hub auto-subscribes each user to their watchlist symbols. "
         "Background producer ticks every 15 seconds, broadcasts via WS, and "
         "evaluates alert rules in the same loop."),
        ("Configurable Alert Engine",
         "Define rules like \"AAPL moves above +2%, cooldown 1 hour.\" Choose "
         "WebSocket toast, email, or auto re-analysis. Producer auto-includes "
         "alert symbols even when not in watchlist &mdash; no silent dormancy."),
        ("Paper Trading Portfolio",
         "$100,000 virtual cash, buy/sell at live quotes, real-time P&L "
         "computation with cost-basis tracking, full trade history. Reset anytime. "
         "Test the AI's recommendations risk-free."),
        ("Multi-Provider LLM Abstraction",
         "Same code runs against Google Gemini, OpenAI, or local Ollama Mistral. "
         "Switched by a single environment variable. No vendor lock-in."),
        ("Production-Grade Audit Trail",
         "Every agent run writes a row with input, output, timing, status, model, "
         "and provider. Crucial for trust: every AI verdict is auditable. Never a "
         "black box."),
    ]
    for name, desc in feats:
        story.append(Paragraph(name, S["H3"]))
        story.append(Paragraph(desc, S["Body"]))
        story.append(Spacer(1, 4))
    story.append(PageBreak())
    return story


def market(S):
    story = [Paragraph("Market Opportunity", S["H1"])]
    story.append(Paragraph(
        "India has crossed 150 million demat accounts (NSE data, 2024). The vast "
        "majority of these investors have no professional research support. The "
        "informal advisory market &mdash; YouTube finfluencers, Telegram tipsters, "
        "WhatsApp groups &mdash; is large, unregulated, and often predatory.",
        S["Body"]))

    story.append(Paragraph("Market Size", S["H2"]))
    rows = [
        ["TAM", "Global retail investor research: ~$8B annually (Bloomberg + Reuters + Tickertape segment)"],
        ["SAM", "Indian retail investors actively researching: 30M+ users, growing 20% YoY"],
        ["SOM", "Tech-savvy retail in tier-1 cities, willing to pay $5-10/month: ~3M users by 2027"],
    ]
    story.append(tech_table(rows, S))

    story.append(Paragraph("Competitive Landscape", S["H2"]))
    rows = [
        ["Tickertape (India)",
         "Strong fundamentals data but no AI synthesis; user must interpret"],
        ["Trendlyne (India)",
         "Quant scoring but black-box, no transparent reasoning, no chat"],
        ["TradingView",
         "Best-in-class charting but technicals-only, no fundamentals or AI"],
        ["Bloomberg Terminal",
         "Gold standard, but $20,000/year and not accessible to retail"],
        ["ChatGPT (general)",
         "Has knowledge but no real-time data, no structured output, no audit trail"],
    ]
    story.append(tech_table(rows, S))

    story.append(Paragraph("Our Differentiation", S["H2"]))
    story.extend(bullet_list([
        "<b>Multi-agent transparency.</b> Every verdict shows its work &mdash; "
        "which agent contributed what, with what confidence, and why.",
        "<b>Indian-first.</b> NSE/BSE listings from the actual official CSV. "
        "Symbol aliases (NIFTY, SENSEX, BankNifty) work out of the box.",
        "<b>End-to-end open architecture.</b> No vendor lock-in &mdash; LLM, "
        "database, and hosting are all swappable. Self-hostable.",
        "<b>RAG over filings.</b> Upload an annual report; ask questions of it. "
        "No competitor in the retail space offers this.",
    ], S))
    story.append(PageBreak())
    return story


def business_model(S):
    story = [Paragraph("Business Model", S["H1"])]
    story.append(Paragraph(
        "A clean three-tier SaaS structure. Cost-to-serve is dominated by LLM "
        "tokens; gross margin improves materially when self-hosted on cheap "
        "compute with smaller open-source models for routine analyses.",
        S["Body"]))

    rows = [
        ["Free", "₹0/mo",
         "10 analyses/month, 1 watchlist (10 symbols), email alerts only, no RAG"],
        ["Pro", "₹499/mo",
         "Unlimited analyses, 5 watchlists, RAG (5 docs), live WS, priority queue"],
        ["Pro+", "₹1,999/mo",
         "Everything in Pro + API access + portfolio backtesting + dedicated quota"],
        ["Enterprise", "Custom",
         "White-label, on-prem deployment, custom agents, SLA"],
    ]
    story.append(tech_table_3col(rows, S))

    story.append(Paragraph("Unit Economics (illustrative)", S["H2"]))
    story.append(Paragraph(
        "Each full analysis costs roughly ₹1&ndash;3 in Gemini API tokens "
        "(varies by stock data size). At ₹499/mo Pro, an average user running "
        "20 analyses/month costs us ₹20&ndash;60 &mdash; gross margin "
        "~88&ndash;96%. Self-hosted open-source models drop this to near zero with "
        "modest infra cost.",
        S["Body"]))

    story.append(Paragraph("Other Revenue Streams (later)", S["H2"]))
    story.extend(bullet_list([
        "<b>API access</b> &mdash; quants and small hedge funds pay for the "
        "endpoint, not the UI",
        "<b>Broker partnerships</b> &mdash; embed the analysis engine inside "
        "broker apps for affiliate fees",
        "<b>Premium data resale</b> &mdash; offer paid-tier data (Bloomberg, "
        "Reuters) as add-on",
        "<b>White-label</b> &mdash; rebrand for advisory firms, RIAs, family offices",
    ], S))
    story.append(PageBreak())
    return story


def tech_table_3col(rows, S):
    """3-column table: tier / price / features."""
    formatted = [[Paragraph("<b>Tier</b>", S["Body"]),
                  Paragraph("<b>Price</b>", S["Body"]),
                  Paragraph("<b>What's included</b>", S["Body"])]]
    for a, b, c in rows:
        formatted.append([
            Paragraph(f"<b>{a}</b>", S["Body"]),
            Paragraph(b, S["Body"]),
            Paragraph(c, S["Body"]),
        ])
    t = Table(formatted, colWidths=[3*cm, 2.5*cm, 10.5*cm])
    t.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("BACKGROUND", (0, 0), (-1, 0), DARK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, 1), (1, -1), PILL),
        ("LINEBELOW", (0, 0), (-1, -1), 0.3, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return t


def roadmap(S):
    story = [Paragraph("Roadmap", S["H1"])]
    story.append(Paragraph("What's shipped (v1.0)", S["H2"]))
    story.extend(bullet_list([
        "Multi-agent AI workflow with reflection loop",
        "2,375-stock universal NSE/BSE/US master with fuzzy search",
        "RAG over PDF uploads with inline citations",
        "Real-time WebSocket price streaming and alerts",
        "Paper-trading portfolio with live P&amp;L",
        "Multi-provider LLM abstraction (Gemini, OpenAI, Ollama)",
        "Production deployment on Vercel + Render free tiers",
    ], S))

    story.append(Paragraph("Next 90 days (Q1)", S["H2"]))
    story.extend(bullet_list([
        "<b>Indian fundamentals depth</b> &mdash; ROCE, promoter holding, "
        "institutional holdings via paid data integration (Tickertape API)",
        "<b>Mobile app</b> &mdash; React Native, share core TypeScript with web",
        "<b>Scheduled background sync</b> &mdash; daily stock master refresh, "
        "fundamentals snapshots, news caching",
        "<b>User authentication 2.0</b> &mdash; Google OAuth, email verification, "
        "password reset",
        "<b>Production-grade observability</b> &mdash; Sentry error tracking, "
        "structured logging, request tracing",
    ], S))

    story.append(Paragraph("6&ndash;12 months", S["H2"]))
    story.extend(bullet_list([
        "<b>Backtesting engine</b> &mdash; replay agents on historical data; "
        "measure recommendation hit rate; show users \"the AI would have said "
        "X six months ago\"",
        "<b>Custom agents</b> &mdash; let users build their own specialist "
        "agents (\"ESG agent\", \"value-investor agent\") with no code",
        "<b>Multi-asset</b> &mdash; crypto, FX, commodities; the architecture "
        "supports it &mdash; just needs symbol routing",
        "<b>Community layer</b> &mdash; share recommendation traces, vote on "
        "verdicts, follow other users' watchlists",
        "<b>API tier</b> &mdash; public REST endpoints for the analysis engine; "
        "billed per call",
    ], S))

    story.append(Paragraph("Long term (12+ months)", S["H2"]))
    story.extend(bullet_list([
        "<b>Auto-trading integration</b> &mdash; connect to Zerodha Kite, "
        "Upstox; execute the AI's verdict with one tap (with safeguards)",
        "<b>Fine-tuned LLM</b> &mdash; train a small specialist model on our "
        "captured agent traces; drop inference cost by 10x",
        "<b>Enterprise white-label</b> &mdash; advisory firms rebrand and "
        "deploy on their own infra",
    ], S))
    story.append(PageBreak())
    return story


def closing(S):
    story = [Paragraph("Why Now", S["H1"])]
    story.append(Paragraph(
        "Three trends are converging that make this product inevitable today, "
        "where it wasn't even two years ago:",
        S["Body"]))
    story.extend(bullet_list([
        "<b>LLMs hit the quality threshold</b> for structured financial "
        "reasoning. Gemini 2.0 and GPT-4 can read filings and produce "
        "audit-grade analysis at <i>milliseconds-per-dollar</i> cost.",
        "<b>India retail investor base 3x'd</b> in five years &mdash; 50M to "
        "150M demat accounts. Most without research support.",
        "<b>Open-source ML tooling matured.</b> LangGraph, Prisma, Zod, "
        "shadcn/ui &mdash; the velocity to build a production system like this "
        "is now weeks, not years.",
    ], S))

    story.append(Paragraph("Ask", S["H1"]))
    story.append(Paragraph(
        "We're seeking partners &mdash; advisors, design partners, early "
        "customers, and capital &mdash; to take this from a working production "
        "platform to a category-defining business.",
        S["Body"]))

    story.append(Paragraph("Demo & Repo", S["H2"]))
    story.append(make_pill_table("Live demo",
        "<font color='#10b981'>https://stock-intelligence-agent.vercel.app</font>", S))
    story.append(Spacer(1, 4))
    story.append(make_pill_table("Source code",
        "<font color='#10b981'>github.com/SiddharthSivanathan/Stock-intelligence-agent</font>", S))
    story.append(Spacer(1, 4))
    story.append(make_pill_table("Contact",
        "siddharthsivanathan4141@gmail.com", S))

    story.append(Spacer(1, 40))
    story.append(Paragraph(
        "&ldquo;The best AI products feel like they read your mind. Stock "
        "Intelligence reads <i>the market's</i>.&rdquo;",
        S["Quote"]))
    return story


# -----------------------------------------------------------------------------
# Build
# -----------------------------------------------------------------------------
def build_pdf(path):
    S = make_styles()
    doc = SimpleDocTemplate(
        path, pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2.5*cm, bottomMargin=2*cm,
        title="Stock Intelligence System — Pitch",
        author="Siddharth Sivanathan",
    )
    story = []
    story += cover(S)
    story += executive_summary(S)
    story += problem_solution(S)
    story += product_overview(S)
    story += ai_workflow(S)
    story += architecture(S)
    story += tech_stack(S)
    story += features(S)
    story += market(S)
    story += business_model(S)
    story += roadmap(S)
    story += closing(S)
    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
    print(f"Wrote {path}")


if __name__ == "__main__":
    import sys, os
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(os.path.dirname(here), "StockIntel_Pitch.pdf")
    build_pdf(out)
