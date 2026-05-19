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

  // Split: process rules go at top, MATCH goes at end
  const processRules = allRules.filter((r) => !r.startsWith("MATCH,"));
  const matchRules = allRules.filter((r) => r.startsWith("MATCH,"));

  // Inject process rules at the top (after "rules:\n")
  if (processRules.length) {
    const block =
      MARKER_BEGIN +
      "\n" +
      processRules.map((r) => `- ${r}`).join("\n") +
      "\n" +
      MARKER_END;
    text = text.replace(/^(rules:\s*\n)/m, `$1${block}\n`);
  }

  // Replace the existing trailing MATCH rule, or append MATCH at end of rules
  if (matchRules.length) {
    const matchLine = `- ${matchRules[0]}`;
    if (/^[ \t]*- MATCH,/.test(text)) {
      // Use a multiline approach: replace the last MATCH line
      const lines = text.split("\n");
      for (let i = lines.length - 1; i >= 0; i--) {
        if (/^[ \t]*- MATCH,/.test(lines[i])) {
          lines[i] = matchLine;
          break;
        }
      }
      text = lines.join("\n");
    } else {
      // Append after the last rule line (before next top-level key)
      text = text.replace(
        /(\n[ \t]*- [^\n]+)(\n\w)/,
        `$1\n${matchLine}$2`
      );
    }
  }

  writeFileSync(clashYaml, text);

  // Script file — put process rules before existing rules, MATCH at end
  const scriptPath = getActiveScript();
  if (scriptPath) {
    const jsProcessRules = processRules.map((r) => `"${r}"`).join(",\n    ");
    const jsMatchRules = matchRules.map((r) => `"${r}"`).join(",\n    ");
    const jsContent = `// BEGIN HAPPY_APP_ROUTER
function main(config, profileName) {
  config["find-process-mode"] = "always";
  const processRules = [
    ${jsProcessRules},
  ];
  const matchRules = [
    ${jsMatchRules},
  ];
  // Remove existing process rules and MATCH from Happy Router
  config.rules = (config.rules || []).filter(
    (r) => !r.startsWith("PROCESS-PATH-REGEX,") && !r.startsWith("PROCESS-NAME,")
  );
  // Process rules go first, then existing rules, then MATCH
  config.rules = [
    ...processRules,
    ...config.rules.filter((r) => r !== "MATCH,DIRECT" && !r.startsWith("MATCH,")),
    ...matchRules,
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
