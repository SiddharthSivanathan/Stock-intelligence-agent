/**
 * Poll every container/service until it is healthy or reachable, with a
 * per-service timeout. Used by dev.js after `docker compose up -d`.
 *
 * Exports `waitForServices()`; runnable standalone.
 */
const {
  SERVICES,
  containerHealth,
  httpStatus,
  style,
  log,
  sleep,
} = require("./_util.js");

/** Resolve a single service's readiness right now. */
async function probe(svc) {
  if (svc.kind === "docker") {
    const h = containerHealth(svc.name);
    return { ready: h === "healthy" || h === "running", state: h };
  }
  // http services: prefer the healthcheck, fall back to a direct request.
  const status = await httpStatus(svc.url, 2500);
  return { ready: status >= 200 && status < 500, state: status ? `HTTP ${status}` : "no response" };
}

/**
 * Wait for all services. Prints a live status per service.
 * @param {object} [opts] { timeoutMs, quiet }
 * @returns {Promise<{ok:boolean, results:Record<string,{ready:boolean,state:string}>}>}
 */
async function waitForServices(opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const deadline = Date.now() + timeoutMs;
  const pending = new Map(Object.entries(SERVICES));
  const results = {};

  if (!opts.quiet) log(style.dim("  waiting for services to become ready…"));

  while (pending.size > 0 && Date.now() < deadline) {
    for (const [key, svc] of [...pending]) {
      const { ready, state } = await probe(svc);
      if (ready) {
        results[key] = { ready: true, state };
        pending.delete(key);
        if (!opts.quiet) log(`  ${style.green("✓")} ${svc.label} ready ${style.dim(`(${state})`)}`);
      }
    }
    if (pending.size > 0) await sleep(1500);
  }

  for (const [key, svc] of pending) {
    const { state } = await probe(svc);
    results[key] = { ready: false, state };
    if (!opts.quiet) log(`  ${style.red("✗")} ${svc.label} not ready ${style.dim(`(${state})`)}`);
  }

  return { ok: pending.size === 0, results };
}

module.exports = { waitForServices };

if (require.main === module) {
  waitForServices().then((r) => process.exit(r.ok ? 0 : 1));
}
