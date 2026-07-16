/**
 * Verify the configured Ollama model is pulled. If missing, report the exact
 * `ollama pull` command needed. Only relevant when LLM_PROVIDER=ollama.
 *
 * Exports `checkModel()`; runnable standalone.
 */
const { URLS, httpJson, readEnv, style, log } = require("./_util.js");

async function checkModel() {
  const env = readEnv();
  const provider = (env.LLM_PROVIDER || "ollama").toLowerCase();
  const model = env.OLLAMA_MODEL || "qwen2.5:3b";
  if (provider !== "ollama") {
    return { provider, model: null, ok: true, detail: `provider=${provider}` };
  }

  const tags = await httpJson(`${URLS.ollama}/api/tags`, 4000);
  if (!tags) {
    return { provider, model, ok: false, detail: "Ollama not reachable" };
  }

  const installed = (tags.models || []).map((m) => m.name);
  // Match "qwen2.5:3b" exactly or the base name if the user typed it without a tag.
  const present =
    installed.includes(model) ||
    installed.some((n) => n === model || n.split(":")[0] === model.split(":")[0] && model.split(":")[1] === undefined);

  return {
    provider,
    model,
    ok: present,
    installed,
    detail: present ? "installed" : `missing — run:  ollama pull ${model}`,
  };
}

module.exports = { checkModel };

if (require.main === module) {
  checkModel().then((r) => {
    if (r.ok) log(style.green(`Model OK: ${r.model || r.detail}`));
    else {
      log(style.red(`Model "${r.model}" ${r.detail}`));
      if (r.installed?.length) log(style.dim(`  installed: ${r.installed.join(", ")}`));
    }
    process.exit(r.ok ? 0 : 1);
  });
}
