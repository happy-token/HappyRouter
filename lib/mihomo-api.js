import { execSync } from "child_process";
import { existsSync } from "fs";

const SOCKET_PATH = "/tmp/verge/verge-mihomo.sock";

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
  if (!existsSync(SOCKET_PATH)) return false;
  try {
    const raw = execSync(
      `curl -s --unix-socket ${SOCKET_PATH} http://localhost/configs`,
      { timeout: 3000 }
    );
    const data = JSON.parse(raw.toString());
    return data?.tun?.enable === true;
  } catch {
    return false;
  }
}
