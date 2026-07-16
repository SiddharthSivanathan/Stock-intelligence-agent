/**
 * Ensure the local Ollama server is running (auto-start it if not).
 *
 * Only relevant when LLM_PROVIDER=ollama. Ollama runs on the HOST, so scripts
 * reach it at localhost:11434 (the backend container uses host.docker.internal).
 *
 * Exports `ensureOllama()` for dev.js/health.js; runnable standalone.
 */
const { spawn, execSync } = require("node:child_process");
const { URLS, httpJson, readEnv, style, log, sleep } = require("./_util.js");

/** Is the Ollama HTTP API answering? */
async function ollamaUp() {
  return (await httpJson(`${URLS.ollama}/api/version`, 2000)) !== null;
}

/** Locate the ollama binary, or null if not installed. */
function ollamaBin() {
  for (const cmd of ["ollama", "/opt/homebrew/opt/ollama/bin/ollama", "/usr/local/bin/ollama"]) {
    try {
      execSync(`command -v ${cmd} || test -x ${cmd}`, { stdio: "ignore" });
      return cmd;
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Guarantee Ollama is reachable when the provider is ollama.
 * @returns {Promise<{provider:string, ok:boolean, started:boolean, installed:boolean, detail:string}>}
 */
async function ensureOllama() {
  const provider = (readEnv().LLM_PROVIDER || "ollama").toLowerCase();
  if (provider !== "ollama") {
    return { provider, ok: true, started: false, installed: true, detail: `provider=${provider}` };
  }

  if (await ollamaUp()) {
    return { provider, ok: true, started: false, installed: true, detail: "already running" };
  }

  const bin = ollamaBin();
  if (!bin) {
    return {
      provider,
      ok: false,
      started: false,
      installed: false,
      detail: "not installed — run:  brew install ollama",
    };
  }

  // Auto-start, bound to all interfaces so the Docker container can reach it.
  log(style.dim("  starting Ollama server…"));
  const child = spawn(bin, ["serve"], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, OLLAMA_HOST: "0.0.0.0:11434" },
  });
  child.unref();

  for (let i = 0; i < 20; i++) {
    await sleep(500);
    if (await ollamaUp()) {
      return { provider, ok: true, started: true, installed: true, detail: "auto-started" };
    }
  }
  return { provider, ok: false, started: true, installed: true, detail: "failed to become ready" };
}

module.exports = { ensureOllama, ollamaUp, ollamaBin };

if (require.main === module) {
  ensureOllama().then((r) => {
    log(r.ok ? style.green(`Ollama OK (${r.detail})`) : style.red(`Ollama unavailable: ${r.detail}`));
    process.exit(r.ok ? 0 : 1);
  });
}
