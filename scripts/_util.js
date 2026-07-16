/**
 * Shared helpers for the developer tooling scripts.
 *
 * Pure Node (CommonJS), zero dependencies — runs with the repo's Node 20+.
 * Everything here runs on the HOST machine (macOS/Linux), talking to Docker
 * via `docker compose` and to services over HTTP.
 */
const { execSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

// Project root = one level up from this scripts/ dir. All docker commands run
// from here so `docker compose` finds docker-compose.yml regardless of cwd.
const ROOT = path.resolve(__dirname, "..");

// ---- ANSI styling -------------------------------------------------------
const useColor = process.stdout.isTTY && process.env.NO_COLOR === undefined;
const c = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const style = {
  green: c("32"),
  red: c("31"),
  yellow: c("33"),
  cyan: c("36"),
  gray: c("90"),
  bold: c("1"),
  dim: c("2"),
};
const CHECK = style.green("✓");
const CROSS = style.red("✗");
const DOT = style.yellow("•");

// ---- logging ------------------------------------------------------------
function log(msg = "") {
  process.stdout.write(msg + "\n");
}
/** Aligned "Label   ✓ value" status line. */
function statusLine(label, okState, value = "") {
  const mark = okState ? CHECK : CROSS;
  const name = (okState ? style.bold(label) : style.red(label)).padEnd(
    useColor ? 20 : 12,
  );
  log(`  ${label.padEnd(12)} ${mark} ${okState ? style.green(value || "OK") : style.red(value || "FAILED")}`);
  void name;
}
function heading(title) {
  log("");
  log(style.bold(style.cyan(title)));
}

// ---- shell --------------------------------------------------------------
/** Run a command, capturing output. Never throws; returns {code, out}. */
function capture(cmd) {
  try {
    const out = execSync(cmd, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out: out.toString().trim() };
  } catch (e) {
    return {
      code: e.status ?? 1,
      out: ((e.stdout?.toString() || "") + (e.stderr?.toString() || "")).trim(),
    };
  }
}
/** Run a command inheriting stdio (for interactive / streaming). Returns code. */
function run(cmd, args = []) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", shell: false });
  return r.status ?? 1;
}
/** `docker compose <args...>` capturing output. */
function compose(args) {
  return capture(`docker compose ${args}`);
}

// ---- docker -------------------------------------------------------------
function dockerRunning() {
  return capture("docker info").code === 0;
}
/**
 * Health of a container by name → 'healthy' | 'starting' | 'unhealthy' |
 * 'running' (no healthcheck) | 'missing'.
 */
function containerHealth(name) {
  const r = capture(
    `docker inspect -f "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" ${name}`,
  );
  if (r.code !== 0) return "missing";
  return r.out || "missing";
}

// ---- http ---------------------------------------------------------------
/** GET url; resolve to HTTP status code, or 0 on network error/timeout. */
async function httpStatus(url, timeoutMs = 3000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.status;
  } catch {
    return 0;
  }
}
/** GET url and parse JSON; null on any failure. */
async function httpJson(url, timeoutMs = 3000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ---- .env ---------------------------------------------------------------
function readEnv() {
  const file = path.join(ROOT, ".env");
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

// ---- service config (single source of truth for the scripts) ------------
const SERVICES = {
  postgres: { name: "sis_postgres", label: "Postgres", kind: "docker" },
  redis: { name: "sis_redis", label: "Redis", kind: "docker" },
  chroma: {
    name: "sis_chroma",
    label: "ChromaDB",
    kind: "http",
    url: "http://localhost:8001/api/v1/heartbeat",
  },
  backend: {
    name: "sis_backend",
    label: "Backend",
    kind: "http",
    url: "http://localhost:8000/api/v1/health",
  },
  frontend: {
    name: "sis_frontend",
    label: "Frontend",
    kind: "http",
    url: "http://localhost:5173/",
  },
};

const URLS = {
  frontend: "http://localhost:5173",
  backend: "http://localhost:8000",
  ollama: process.env.OLLAMA_HOST_URL || "http://localhost:11434",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = {
  ROOT,
  style,
  CHECK,
  CROSS,
  DOT,
  log,
  statusLine,
  heading,
  capture,
  run,
  compose,
  dockerRunning,
  containerHealth,
  httpStatus,
  httpJson,
  readEnv,
  SERVICES,
  URLS,
  sleep,
};
