import { readFileSync, writeFileSync, copyFileSync, existsSync } from "fs";
import { CLASH_DIR, getActiveScript } from "./config.js";
import { reloadConfig } from "./mihomo-api.js";

const MARKER_BEGIN = "# BEGIN HAPPY_APP_ROUTER";
const MARKER_END = "# END HAPPY_APP_ROUTER";

export function generateRules(app, proxy) {
  const rules = [];
  const apps = Array.isArray(app) ? app : [app];
  for (const a of apps) {
    const escaped = a.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "/.*";
    rules.push(`PROCESS-PATH-REGEX,^${escaped},${proxy}`);
    if (a.executable) {
      rules.push(`PROCESS-NAME,${a.executable},${proxy}`);
    }
  }
  return rules;
}

export function buildRuleSet(routeRules) {
  const lines = [];
  const enabled = routeRules.filter((r) => r.enabled !== false);
  for (const rule of enabled) {
    for (const app of rule.apps) {
      const escaped = app.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "/.*";
      lines.push(`PROCESS-PATH-REGEX,^${escaped},${rule.proxy}`);
      if (app.executable) {
        lines.push(`PROCESS-NAME,${app.executable},${rule.proxy}`);
      }
    }
    if (rule.mode === "exclusive") {
      lines.push("MATCH,DIRECT");
    }
  }
  return lines;
}

export function applyRuleSet(routeRules) {
  const rules = buildRuleSet(routeRules);
  return writeRules(rules);
}

export function applyRules(rules, mode) {
  const exclusive = mode === "exclusive" || mode === "selected_only";
  const allRules = exclusive ? [...rules, "MATCH,DIRECT"] : rules;
  return writeRules(allRules);
}

function writeRules(allRules) {
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

  // Inject
  const block =
    MARKER_BEGIN +
    "\n" +
    (allRules.length ? allRules.map((r) => `- ${r}`).join("\n") : "- MATCH,DIRECT") +
    "\n" +
    MARKER_END;
  text = text.replace(/^(rules:\s*\n)/m, `$1${block}\n`);

  writeFileSync(clashYaml, text);

  // Script file
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
