import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const SOCKET_PATH = "/tmp/verge/verge-mihomo.sock";
const VERGE_DIR = join(
  homedir(),
  "Library/Application Support/io.github.clash-verge-rev.clash-verge-rev"
);

export function getDelays() {
  if (!existsSync(SOCKET_PATH)) return {};
  try {
    const raw = execSync(
      `curl -s --unix-socket ${SOCKET_PATH} http://localhost/proxies`,
      { timeout: 5000, maxBuffer: 200 * 1024 }
    );
    const data = JSON.parse(raw.toString());
    const delays = {};
    for (const [name, info] of Object.entries(data.proxies || {})) {
      const history = info.history;
      if (history && history.length > 0) {
        delays[name] = history[history.length - 1].delay;
      }
    }
    return delays;
  } catch {
    return {};
  }
}

export function reloadConfig(configPath) {
  if (!existsSync(SOCKET_PATH)) return false;
  try {
    execSync(
      `curl -s --unix-socket ${SOCKET_PATH} -X PUT -H "Content-Type: application/json" ` +
        `-d '${JSON.stringify({ path: configPath })}' ` +
        `http://localhost/configs?force=true`,
      { timeout: 5000 }
    );
    return true;
  } catch {
    return false;
  }
}

export function checkTunMode() {
  const result = { enabled: false, vergeEnabled: false, mismatch: false };

  // Check Clash Verge Rev's TUN setting from verge.yaml
  try {
    const vergeYaml = join(VERGE_DIR, "verge.yaml");
    if (existsSync(vergeYaml)) {
      const text = readFileSync(vergeYaml, "utf8");
      const m = text.match(/^enable_tun_mode:\s*(true|false)$/m);
      result.vergeEnabled = m ? m[1] === "true" : false;
    }
  } catch {}

  // Check actual mihomo TUN state via unix socket
  if (!existsSync(SOCKET_PATH)) return result;
  try {
    const raw = execSync(
      `curl -s --unix-socket ${SOCKET_PATH} http://localhost/configs`,
      { timeout: 3000 }
    );
    const data = JSON.parse(raw.toString());
    result.enabled = data?.tun?.enable === true;
  } catch {}

  result.mismatch = result.vergeEnabled && !result.enabled;
  return result;
}

export function fixTunMode() {
  if (!existsSync(SOCKET_PATH)) {
    return { ok: false, error: "mihomo socket not found" };
  }

  // 1. Enable TUN at runtime via mihomo PATCH API
  let runtimeOk = false;
  try {
    execSync(
      `curl -s --unix-socket ${SOCKET_PATH} -X PATCH ` +
        `-H "Content-Type: application/json" ` +
        `-d '{"tun":{"enable":true}}' ` +
        `http://localhost/configs`,
      { timeout: 5000 }
    );
    runtimeOk = true;
  } catch (e) {
    return { ok: false, error: `PATCH failed: ${e.message}` };
  }

  // 2. Persist to config files so change survives restart
  const files = ["config.yaml", "clash-verge.yaml"];
  const patched = [];
  for (const name of files) {
    const p = join(VERGE_DIR, name);
    try {
      if (existsSync(p)) {
        let text = readFileSync(p, "utf8");
        text = text.replace(
          /^(\s*enable:\s*)false(\s*#.*)?$/m,
          "$1true$2"
        );
        writeFileSync(p, text);
        patched.push(name);
      }
    } catch {}
  }

  return { ok: runtimeOk, patched };
}
