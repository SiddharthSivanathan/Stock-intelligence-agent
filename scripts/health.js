/**
 * Full stack health check with clear pass/fail output.
 * Backs `npm run health`. Exit code is non-zero if anything is unhealthy.
 *
 * Checks: Backend, Frontend, PostgreSQL, Redis, ChromaDB, Ollama, LLM model.
 */
const {
  containerHealth,
  httpStatus,
  httpJson,
  readEnv,
  URLS,
  style,
  log,
  dockerRunning,
} = require("./_util.js");
const { ollamaUp } = require("./check-ollama.js");
const { checkModel } = require("./check-model.js");

function line(label, ok, detail) {
  const mark = ok ? style.green("✓") : style.red("✗");
  const val = ok ? style.green(detail || "OK") : style.red(detail || "FAILED");
  log(`  ${label.padEnd(12)} ${mark}  ${val}`);
}

async function main() {
  const env = readEnv();
  log("");
  log(style.bold(style.cyan("  Health Check")));
  log(style.dim("  ─────────────────────────────────────────────"));

  if (!dockerRunning()) {
    log(style.red("  Docker is not running. Start Docker Desktop first."));
    process.exit(1);
  }

  const checks = [];

  // Backend
  const beStatus = await httpStatus(`${URLS.backend}/api/v1/health`);
  checks.push(beStatus === 200);
  line("Backend", beStatus === 200, beStatus ? `HTTP ${beStatus} @ ${URLS.backend}` : "unreachable");

  // Frontend
  const feStatus = await httpStatus(`${URLS.frontend}/`);
  const feOk = feStatus >= 200 && feStatus < 500;
  checks.push(feOk);
  line("Frontend", feOk, feOk ? `HTTP ${feStatus} @ ${URLS.frontend}` : "unreachable");

  // Postgres
  const pg = containerHealth("sis_postgres");
  const pgOk = pg === "healthy" || pg === "running";
  checks.push(pgOk);
  line("PostgreSQL", pgOk, pg);

  // Redis
  const rd = containerHealth("sis_redis");
  const rdOk = rd === "healthy" || rd === "running";
  checks.push(rdOk);
  line("Redis", rdOk, rd);

  // ChromaDB
  const chStatus = await httpStatus("http://localhost:8001/api/v1/heartbeat");
  const chOk = chStatus >= 200 && chStatus < 500;
  checks.push(chOk);
  line("ChromaDB", chOk, chOk ? `HTTP ${chStatus}` : "unreachable");

  // Ollama + model (only meaningful for the ollama provider)
  const provider = (env.LLM_PROVIDER || "ollama").toLowerCase();
  if (provider === "ollama") {
    const up = await ollamaUp();
    checks.push(up);
    const ver = up ? await httpJson(`${URLS.ollama}/api/version`) : null;
    line("Ollama", up, up ? `connected (v${ver?.version ?? "?"})` : "not running");

    const model = await checkModel();
    checks.push(model.ok);
    line("Model", model.ok, model.ok ? model.model : model.detail);
  } else {
    line("LLM", true, `provider=${provider}`);
  }

  const allOk = checks.every(Boolean);
  log(style.dim("  ─────────────────────────────────────────────"));
  log(allOk ? style.green("  All systems healthy ✓") : style.red("  Some checks failed ✗ — see above"));
  log("");
  process.exit(allOk ? 0 : 1);
}

main();
