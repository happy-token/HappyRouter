import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export const CLASH_DIR = join(
  homedir(),
  "Library/Application Support/io.github.clash-verge-rev.clash-verge-rev"
);
export const SOCKET_PATH = "/tmp/verge/verge-mihomo.sock";

export function parseYamlNames(text, blockKey) {
  const names = [];
  let inBlock = false;
  for (const line of text.split("\n")) {
    if (inBlock) {
      const m = line.match(/^\s*-\s+name:\s*(.+)/);
      if (m) {
        names.push(m[1].trim());
      } else if (/^\w/.test(line)) {
        break;
      }
    } else if (new RegExp(`^${blockKey}\\s*:`).test(line)) {
      inBlock = true;
    }
  }
  return names;
}

export function getProxyGroups(configPath) {
  const path = configPath || join(CLASH_DIR, "clash-verge.yaml");
  try {
    return parseYamlNames(readFileSync(path, "utf8"), "proxy-groups");
  } catch {
    return [];
  }
}

export function getProxies(configPath) {
  const path = configPath || join(CLASH_DIR, "clash-verge.yaml");
  try {
    return parseYamlNames(readFileSync(path, "utf8"), "proxies");
  } catch {
    return [];
  }
}

export function getActiveScript() {
  const path = join(CLASH_DIR, "profiles.yaml");
  try {
    const text = readFileSync(path, "utf8");
    const lines = text.split("\n");

    const currentM = text.match(/^current:\s*(.+)$/m);
    if (!currentM) return null;
    const currentUid = currentM[1].trim();

    let inEntry = false,
      inOption = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (new RegExp(`^\\s*-\\s+uid:\\s*${escapeRegex(currentUid)}`).test(line)) {
        inEntry = true;
        continue;
      }
      if (inEntry) {
        if (/^\s+option:/.test(line)) {
          inOption = true;
          continue;
        }
        if (inOption) {
          const m = line.match(/^\s+script:\s*(.+)/);
          if (m) {
            const scriptUid = m[1].trim();
            for (let j = 0; j < lines.length; j++) {
              if (new RegExp(`^\\s*-\\s+uid:\\s*${escapeRegex(scriptUid)}`).test(lines[j])) {
                for (let k = j + 1; k < Math.min(j + 10, lines.length); k++) {
                  const fm = lines[k].match(/^\s+file:\s*(.+)/);
                  if (fm) return join(CLASH_DIR, "profiles", fm[1].trim());
                }
                break;
              }
            }
            return null;
          }
        }
        if (/^\s*-\s+uid:/.test(line)) break;
      }
    }
  } catch {}
  return null;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
