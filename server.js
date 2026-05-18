import { execSync } from "child_process";
import express from "express";
import { existsSync, readFileSync, unlinkSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { scanApps } from "./lib/apps.js";
import { getProxyGroups, getProxies } from "./lib/config.js";
import { getDelays, checkTunMode, fixTunMode } from "./lib/mihomo-api.js";
import { generateRules, applyRules, applyRuleSet } from "./lib/rules.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.static(join(__dirname, "public")));

  // Serve account QR images
  const accountsDir = join(process.env.HOME, "workspace", "document", "accounts");
  app.use("/api/accounts", express.static(accountsDir));

  // App list with icons
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
    res.json(filtered.map((a) => ({ ...a, hasIcon: !!a.icon })));
  });

  // Serve .app icon as PNG (converted from .icns if needed)
  app.get("/api/app-icon", (req, res) => {
    const appPath = req.query.path;
    const iconPath = req.query.icon;

    // Direct icon path from scanApps
    if (iconPath && existsSync(iconPath)) {
      return serveIconFile(iconPath, res);
    }

    // Derive from app path
    if (!appPath) return res.status(400).json({ error: "Missing path or icon" });

    const candidates = [
      join(appPath, "Contents", "Resources", "AppIcon.icns"),
      join(appPath, "Contents", "Resources", "AppIcon.png"),
      join(appPath, "Contents", "Resources", "app.icns"),
    ];
    for (const c of candidates) {
      if (existsSync(c)) return serveIconFile(c, res);
    }
    // Fallback: find any icns
    const resDir = join(appPath, "Contents", "Resources");
    if (existsSync(resDir)) {
      try {
        const icns = readdirSync(resDir).find((f) => f.endsWith(".icns"));
        if (icns) return serveIconFile(join(resDir, icns), res);
      } catch {}
    }
    res.status(404).json({ error: "No icon found" });
  });

  function serveIconFile(filePath, res) {
    if (filePath.endsWith(".png")) return res.sendFile(filePath);
    try {
      const tmpPng = `/tmp/happy-router-icon-${Date.now()}.png`;
      execSync(`sips -s format png "${filePath}" --out "${tmpPng}"`, { timeout: 3000 });
      if (existsSync(tmpPng)) {
        res.sendFile(tmpPng);
        setTimeout(() => { try { unlinkSync(tmpPng); } catch {} }, 60000);
        return;
      }
    } catch {}
    res.sendFile(filePath);
  }

  app.get("/api/proxies", (_req, res) => {
    const groups = getProxyGroups();
    const proxies = getProxies();
    const delays = getDelays();
    const q = (_req.query.q || "").toLowerCase();

    const options = [];
    for (const g of groups) {
      if (!q || g.toLowerCase().includes(q)) {
        options.push({ label: g, value: g, type: "group" });
      }
    }
    for (const p of proxies) {
      if (!q || p.toLowerCase().includes(q)) {
        const d = delays[p];
        const ds = d !== undefined ? `  (${formatDelay(d)})` : "";
        options.push({
          label: `${p}${ds}`,
          value: p,
          type: "proxy",
          delay: d,
        });
      }
    }
    if (!q || "direct".includes(q)) {
      options.push({ label: "DIRECT", value: "DIRECT", type: "direct" });
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
    const { apps, proxy, mode, rules } = req.body;
    // Dashboard mode: full rule set
    if (rules && Array.isArray(rules)) {
      const result = applyRuleSet(rules);
      return res.json(result);
    }
    // Wizard mode: single rule
    if (!apps || !apps.length || !proxy) {
      return res.status(400).json({ error: "Missing apps or proxy" });
    }
    const genRules = generateRules(apps, proxy);
    const result = applyRules(genRules, mode || "append");
    res.json({ ...result, rules: genRules });
  });

  app.get("/api/status", (_req, res) => {
    const configPath = join(
      process.env.HOME,
      "Library/Application Support/io.github.clash-verge-rev.clash-verge-rev/clash-verge.yaml"
    );
    res.json({
      tunMode: checkTunMode(),
      configExists: existsSync(configPath),
      clashInstalled: existsSync(configPath),
    });
  });

  app.post("/api/tun/fix", (_req, res) => {
    const result = fixTunMode();
    res.json(result);
  });

  return app;
}

export function startServer(port) {
  const p = port || 3456;
  const appInstance = createApp();
  return new Promise((resolve, reject) => {
    const server = appInstance.listen(p, () =>
      resolve({ port: p, server })
    );
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        setTimeout(() => {
          const retry = appInstance.listen(p, () =>
            resolve({ port: p, server: retry })
          );
          retry.on("error", (e) => reject(e));
        }, 1000);
      } else {
        reject(err);
      }
    });
  });
}

function formatDelay(ms) {
  if (ms === 0) return "---";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// Direct start: node server.js or npm run server
const isMain = process.argv[1] && (import.meta.url.endsWith(process.argv[1]) || process.argv[1].endsWith("server.js"));
if (isMain) {
  const port = process.env.PORT || 3456;
  const { port: p } = await startServer(port);
  console.log(`Server: http://localhost:${p}`);
}
