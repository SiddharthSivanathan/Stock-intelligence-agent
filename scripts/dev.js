/**
 * `npm run dev` — one command to prepare the whole development environment.
 *
 *   1. verify Docker is running
 *   2. ensure Ollama is up (auto-start) + the model is present
 *   3. start all containers detached (never streams logs)
 *   4. wait until every service is healthy / reachable
 *   5. print a success summary + URLs, then return control to the terminal
 *
 * Exits 0 when everything is ready, non-zero otherwise. Never blocks on logs.
 */
const {
  compose,
  dockerRunning,
  httpJson,
  readEnv,
  URLS,
  style,
  log,
  sleep,
} = require("./_util.js");
const { ensureOllama } = require("./check-ollama.js");
const { checkModel } = require("./check-model.js");
const { waitForServices } = require("./wait-for-services.js");

function fail(msg) {
  log("");
  log(style.red("✗ " + msg));
  log("");
  process.exit(1);
}

async function main() {
  const env = readEnv();
  const provider = (env.LLM_PROVIDER || "ollama").toLowerCase();

  log("");
  log(style.bold(style.cyan("  Stock Intelligence — starting development environment")));
  log("");

  // 1) Docker daemon
  if (!dockerRunning()) {
    fail("Docker is not running. Open Docker Desktop, wait for it to start, then re-run `npm run dev`.");
  }
  log(`  ${style.green("✓")} Docker daemon`);

  // 2) Ollama + model (best-effort; only for the ollama provider)
  let ollama = { ok: true, detail: `provider=${provider}` };
  let model = { ok: true, model: null };
  if (provider === "ollama") {
    ollama = await ensureOllama();
    if (ollama.ok) {
      log(`  ${style.green("✓")} Ollama ${style.dim(`(${ollama.detail})`)}`);
      model = await checkModel();
      if (model.ok) log(`  ${style.green("✓")} Model ${style.dim(`(${model.model})`)}`);
      else log(`  ${style.yellow("•")} Model ${style.yellow(model.detail)}`);
    } else if (!ollama.installed) {
      log(`  ${style.yellow("•")} Ollama ${style.yellow(ollama.detail)}`);
    } else {
      log(`  ${style.yellow("•")} Ollama ${style.yellow(ollama.detail)}`);
    }
  }

  // 3) Start containers detached (build if images are missing).
  log("");
  log(style.dim("  starting containers (detached)…"));
  const up = compose("up -d --remove-orphans");
  if (up.code !== 0) {
    log(style.dim(up.out.split("\n").slice(-8).join("\n")));
    fail("`docker compose up -d` failed — see the output above.");
  }

  // 4) Wait for readiness.
  log("");
  const { ok, results } = await waitForServices({ timeoutMs: 150_000 });

  // 5) Success summary.
  const ver = provider === "ollama" && ollama.ok ? await httpJson(`${URLS.ollama}/api/version`) : null;
  printSummary({ results, provider, ollama, model, ollamaVersion: ver, allReady: ok });

  process.exit(ok ? 0 : 1);
}

function printSummary({ results, provider, ollama, model, ollamaVersion, allReady }) {
  const row = (label, okState, value) => {
    const mark = okState ? style.green("✓") : style.red("✗");
    const val = okState ? style.green(value) : style.red(value || "not ready");
    log(`  ${style.bold(label.padEnd(12))} ${mark} ${val}`);
  };

  log("");
  log(style.bold(style.cyan("  ── Service Status ─────────────────────────")));
  row("Backend", results.backend?.ready, "Running");
  row("Frontend", results.frontend?.ready, "Running");
  row("Postgres", results.postgres?.ready, "Healthy");
  row("Redis", results.redis?.ready, "Healthy");
  row("ChromaDB", results.chroma?.ready, "Connected");
  if (provider === "ollama") {
    row("Ollama", ollama.ok, ollama.ok ? `Connected${ollamaVersion ? ` (v${ollamaVersion.version})` : ""}` : ollama.detail);
    row("Model", model.ok, model.ok ? model.model : model.detail);
  } else {
    row("LLM", true, `provider: ${provider}`);
  }

  log("");
  if (allReady && (provider !== "ollama" || (ollama.ok && model.ok))) {
    log(style.bold(style.green("  ✓ Application Ready")));
  } else if (allReady) {
    log(style.bold(style.yellow("  • App running — AI needs attention (see Ollama/Model above)")));
  } else {
    log(style.bold(style.red("  ✗ Some services did not become ready — run `npm run logs`")));
  }
  log("");
  log(`  ${style.bold("Frontend")}  ${style.cyan(URLS.frontend)}`);
  log(`  ${style.bold("Backend")}   ${style.cyan(URLS.backend + "/api/v1")}`);
  log("");
  log(style.dim("  Next:  npm run logs   ·   npm run health   ·   npm run stop"));
  log("");
}

main().catch((e) => fail(e.message));
