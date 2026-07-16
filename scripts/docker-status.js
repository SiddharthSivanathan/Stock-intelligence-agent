/**
 * Print a compact table of the stack's container status.
 * Backs `npm run status`.
 */
const { compose, dockerRunning, style, log } = require("./_util.js");

function main() {
  if (!dockerRunning()) {
    log(style.red("Docker is not running. Start Docker Desktop and try again."));
    process.exit(1);
  }

  const { out } = compose("ps --format json");
  if (!out) {
    log(style.yellow("No containers are running. Start them with:  npm run dev"));
    return;
  }

  // compose emits either a JSON array or newline-delimited JSON objects.
  let rows = [];
  try {
    rows = JSON.parse(out);
    if (!Array.isArray(rows)) rows = [rows];
  } catch {
    rows = out
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  log("");
  log(style.bold("  SERVICE       STATE        HEALTH       PORTS"));
  log(style.dim("  ────────────────────────────────────────────────────────────"));
  for (const r of rows) {
    const svc = (r.Service || r.Name || "?").padEnd(13);
    const state = String(r.State || "").padEnd(12);
    const health = String(r.Health || "—").padEnd(12);
    const ports = (r.Publishers || [])
      .filter((p) => p.PublishedPort)
      .map((p) => p.PublishedPort)
      .join(", ");
    const stateColored = /running|up/i.test(state) ? style.green(state) : style.yellow(state);
    const healthColored = /healthy/i.test(health)
      ? style.green(health)
      : /unhealthy/i.test(health)
        ? style.red(health)
        : style.dim(health);
    log(`  ${svc} ${stateColored} ${healthColored} ${style.dim(ports)}`);
  }
  log("");
}

main();
