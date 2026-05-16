import { readFileSync, writeFileSync, copyFileSync, existsSync } from "fs";
import { CLASH_DIR, getActiveScript } from "./config.js";
import { reloadConfig } from "./mihomo-api.js";

const MARKER_BEGIN = "# BEGIN HAPPY_APP_ROUTER";
const MARKER_END = "# END HAPPY_APP_ROUTER";

export function generateRules(app, proxy) {
  const escaped = app.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "/.*";
  const rules = [`PROCESS-PATH-REGEX,^${escaped},${proxy}`];
  if (app.executable) {
    rules.push(`PROCESS-NAME,${app.executable},${proxy}`);
  }
  return rules;
}

export function applyRules(rules, mode) {
  const allRules = mode === "selected_only" ? [...rules, "MATCH,DIRECT"] : rules;

  const clashYaml = `${CLASH_DIR}/clash-verge.yaml`;
  if (!existsSync(clashYaml)) {
    return { error: `Config not found: ${clashYaml}` };
  }

  let text = readFileSync(clashYaml, "utf8");

  // Backup
  const now = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15);
  const bak = `${clashYaml}.bak-${now}`;
  copyFileSync(clashYaml, bak);

  // Remove old block
  text = text.replace(
    new RegExp(`[ \\t]*${escapeRegex(MARKER_BEGIN)}\\n[\\s\\S]*?\\n[ \\t]*${escapeRegex(MARKER_END)}\\n?`),
    ""
  );

  // Inject with 0-indentation
  const block =
    MARKER_BEGIN +
    "\n" +
    allRules.map((r) => `- ${r}`).join("\n") +
    "\n" +
    MARKER_END;
  text = text.replace(/^(rules:\s*\n)/m, `$1${block}\n`);

  writeFileSync(clashYaml, text);

  // Update script file for persistence
  const scriptPath = getActiveScript();
  if (scriptPath) {
    const jsRules = allRules.map((r) => `"${r}"`).join(",\n    ");
    const jsContent = `// BEGIN HAPPY_APP_ROUTER
function main(config, profileName) {
  config["find-process-mode"] = "always";
  config.rules = [
    ${jsRules},
    ...(config.rules || []),
  ];
  return config;
}
// END HAPPY_APP_ROUTER
`;
    writeFileSync(scriptPath, jsContent);
  }

  // Hot-reload
  const reloaded = reloadConfig(clashYaml);

  return {
    bak,
    clashYaml,
    scriptPath,
    reloaded,
    rules: allRules,
  };
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
