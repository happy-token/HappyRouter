import express from "express";
import { scanApps } from "./lib/apps.js";
import { getProxyGroups, getProxies } from "./lib/config.js";
import { getDelays, checkTunMode } from "./lib/mihomo-api.js";
import { generateRules, applyRules } from "./lib/rules.js";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.static(join(__dirname, "public")));

  app.get("/api/apps", (_req, res) => {
    const apps = scanApps();
    const q = (_req.query.q || "").toLowerCase();
    const filtered = q
      ? apps.filter(
          (a) =>
            a.name.toLowerCase().includes(q) ||
            a.bundleId.toLowerCase().includes(q)
        )
      : apps;
    res.json(filtered);
  });

  app.get("/api/proxies", (_req, res) => {
    const groups = getProxyGroups();
    const proxies = getProxies();
    const delays = getDelays();
    const q = (_req.query.q || "").toLowerCase();

    const options = [];
    for (const g of groups) {
      if (!q || g.toLowerCase().includes(q)) {
        options.push({ label: `[组] ${g}`, value: g, type: "group" });
      }
    }
    for (const p of proxies) {
      if (!q || p.toLowerCase().includes(q)) {
        const d = delays[p];
        const ds = d !== undefined ? `  (${formatDelay(d)})` : "";
        options.push({ label: `[节点] ${p}${ds}`, value: p, type: "proxy", delay: d });
      }
    }
    if (!q || "direct".includes(q)) {
      options.push({ label: "[直连] DIRECT", value: "DIRECT", type: "direct" });
    }

    const nonzero = Object.values(delays).filter((v) => v > 0).length;
    res.json({
      options,
      groupsCount: groups.length,
      proxiesCount: proxies.length,
      delaysCount: nonzero,
      delaysTotal: Object.keys(delays).length,
      tunMode: checkTunMode(),
    });
  });

  app.post("/api/apply", (req, res) => {
    const { app: appData, proxy, mode } = req.body;
    if (!appData || !proxy) {
      return res.status(400).json({ error: "Missing app or proxy" });
    }
    const rules = generateRules(appData, proxy);
    const result = applyRules(rules, mode || "prepend");
    res.json({ ...result, rules });
  });

  app.get("/api/status", (_req, res) => {
    res.json({
      tunMode: checkTunMode(),
      configExists: existsSync(
        join(
          process.env.HOME,
          "Library/Application Support/io.github.clash-verge-rev.clash-verge-rev/clash-verge.yaml"
        )
      ),
    });
  });

  return app;
}

export function startServer(port) {
  const p = port || 3456;
  return new Promise((resolve) => {
    createApp().listen(p, () => resolve(p));
  });
}

function formatDelay(ms) {
  if (ms === 0) return "---";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
