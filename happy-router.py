#!/usr/bin/env python3
"""Happy App Router - CLI prototype for per-app proxy routing with Clash Verge Rev."""

import os
import re
import shutil
import json
import plistlib
import urllib.request
from pathlib import Path
from datetime import datetime

CLASH_DIR = Path.home() / "Library/Application Support/io.github.clash-verge-rev.clash-verge-rev"


def scan_apps(dirs=None):
    if dirs is None:
        dirs = ["/Applications", str(Path.home() / "Applications")]
    apps = []
    for d in dirs:
        base = Path(d)
        if not base.exists():
            continue
        for app in base.glob("*.app"):
            plist = app / "Contents" / "Info.plist"
            if not plist.exists():
                continue
            try:
                with open(plist, "rb") as f:
                    info = plistlib.load(f)
            except Exception:
                continue
            name = info.get("CFBundleDisplayName") or info.get("CFBundleName") or app.stem
            exe = info.get("CFBundleExecutable", "")
            apps.append({
                "name": name,
                "path": str(app),
                "executable": exe,
                "bundle_id": info.get("CFBundleIdentifier", ""),
            })
    return sorted(apps, key=lambda a: a["name"].lower())


def parse_yaml_names(text, block_key):
    """Extract 'name' values from a top-level YAML block like proxies: or proxy-groups:."""
    names = []
    in_block = False
    for line in text.splitlines():
        if in_block:
            m = re.match(r"\s*-\s+name:\s*(.+)", line)
            if m:
                names.append(m.group(1).strip())
            elif re.match(r"^\w", line):
                break
        elif re.match(rf"^{block_key}\s*:", line):
            in_block = True
    return names


def get_proxy_groups(config_path=None):
    path = config_path or CLASH_DIR / "clash-verge.yaml"
    if not path.exists():
        print(f"Config not found: {path}")
        return []
    with open(path) as f:
        return parse_yaml_names(f.read(), "proxy-groups")


def get_proxies(config_path=None):
    path = config_path or CLASH_DIR / "clash-verge.yaml"
    if not path.exists():
        return []
    with open(path) as f:
        return parse_yaml_names(f.read(), "proxies")


def pick(items, prompt="Select:"):
    for i, item in enumerate(items):
        if isinstance(item, str):
            print(f"  [{i}] {item}")
        else:
            print(f"  [{i}] {item['name']}  ({item.get('bundle_id', '')})")
    while True:
        try:
            idx = int(input(f"{prompt} ").strip())
            return items[idx]
        except (ValueError, IndexError):
            print("Invalid selection, try again.")


def generate_rules(app, proxy_group):
    escaped = re.escape(app["path"]) + "/.*"
    rules = [f"PROCESS-PATH-REGEX,^{escaped},{proxy_group}"]
    if app["executable"]:
        rules.append(f"PROCESS-NAME,{app['executable']},{proxy_group}")
    return rules


def get_active_script():
    """Find the active profile's script file from profiles.yaml."""
    profiles_path = CLASH_DIR / "profiles.yaml"
    if not profiles_path.exists():
        return None
    with open(profiles_path) as f:
        text = f.read()

    # Parse current: <uid>
    current_m = re.search(r"^current:\s*(.+)$", text, re.MULTILINE)
    if not current_m:
        return None
    current_uid = current_m.group(1).strip()

    # Find the entry for current uid and extract script: under its option:
    lines = text.splitlines()
    in_entry = False
    in_option = False
    for i, line in enumerate(lines):
        if re.match(r"^\s*-\s+uid:\s*" + re.escape(current_uid), line):
            in_entry = True
            continue
        if in_entry:
            if re.match(r"^\s+option:", line):
                in_option = True
                continue
            if in_option:
                m = re.match(r"\s+script:\s*(.+)", line)
                if m:
                    script_uid = m.group(1).strip()
                    # Find the file for this script uid
                    script_file = None
                    for j, l in enumerate(lines):
                        s_m = re.match(r"^\s*-\s+uid:\s*" + re.escape(script_uid), l)
                        if s_m:
                            # Look ahead for file:
                            for k in range(j + 1, min(j + 10, len(lines))):
                                f_m = re.match(r"\s+file:\s*(.+)", lines[k])
                                if f_m:
                                    script_file = f_m.group(1).strip()
                                    return CLASH_DIR / "profiles" / script_file
                            break
                    return None
            if re.match(r"^\s*-\s+uid:", line):
                break  # next entry, didn't find script
    return None


def apply_rules(rules, mode="prepend"):
    import subprocess

    if mode == "selected_only":
        all_rules = rules + ["MATCH,DIRECT"]
    else:
        all_rules = rules

    # 1. Write directly into clash-verge.yaml for immediate effect
    clash_yaml = CLASH_DIR / "clash-verge.yaml"
    if not clash_yaml.exists():
        print(f"Config not found: {clash_yaml}")
        return

    text = clash_yaml.read_text()

    # Backup
    bak = CLASH_DIR / f"clash-verge.yaml.bak-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    shutil.copy2(clash_yaml, bak)
    print(f"Backup: {bak}")

    marker_begin = "# BEGIN HAPPY_APP_ROUTER"
    marker_end = "# END HAPPY_APP_ROUTER"

    # Remove previous generated block if exists (any indentation)
    text = re.sub(rf"[ \t]*# BEGIN HAPPY_APP_ROUTER\n.*?\n[ \t]*# END HAPPY_APP_ROUTER\n?", "", text, flags=re.DOTALL)

    # Insert rules at the beginning of the rules: section
    # Rules use 0-indentation to match the original YAML style
    generated_block = marker_begin + "\n" + "\n".join(f"- {r}" for r in all_rules) + "\n" + marker_end
    text = re.sub(r"(^rules:\s*\n)", rf"\1{generated_block}\n", text, flags=re.MULTILINE)

    clash_yaml.write_text(text)
    print(f"Written: {clash_yaml}")

    # 2. Also update the active script file for persistence across profile reloads
    script_path = get_active_script()
    if script_path:
        js_rules = ",\n    ".join(f'"{r}"' for r in all_rules)
        js_content = f"""// BEGIN HAPPY_APP_ROUTER
function main(config, profileName) {{
  config["find-process-mode"] = "always";
  config.rules = [
    {js_rules},
    ...(config.rules || []),
  ];
  return config;
}}
// END HAPPY_APP_ROUTER
"""
        script_path.write_text(js_content)
        print(f"Script updated: {script_path}")

    # 3. Hot-reload via API
    socket_path = "/tmp/verge/verge-mihomo.sock"
    if os.path.exists(socket_path):
        abs_path = str(clash_yaml.resolve())
        result = subprocess.run(
            ["curl", "-s", "--unix-socket", socket_path, "-X", "PUT",
             "-H", "Content-Type: application/json",
             "-d", json.dumps({"path": abs_path}),
             "http://localhost/configs?force=true"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0 and not result.stdout.strip():
            print("Hot-reloaded. Rules are now active.")
        elif result.stdout.strip():
            print(f"Reload response: {result.stdout.strip()}")
    else:
        print("Done. Reload Profile in Clash Verge Rev to apply.")


def get_mihomo_delays():
    """Query the Mihomo API for proxy delays via Unix socket or HTTP. Returns {name: delay_ms}."""
    import subprocess

    # Try Unix socket first (Clash Verge Rev default)
    socket_path = "/tmp/verge/verge-mihomo.sock"
    if os.path.exists(socket_path):
        try:
            result = subprocess.run(
                ["curl", "-s", "--unix-socket", socket_path, "http://localhost/proxies"],
                capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0 and result.stdout:
                data = json.loads(result.stdout)
                delays = {}
                for name, info in data.get("proxies", {}).items():
                    history = info.get("history", [])
                    if history:
                        delays[name] = history[-1]["delay"]
                return delays
        except Exception:
            pass

    # Fallback: try HTTP controller
    config_path = CLASH_DIR / "config.yaml"
    if not config_path.exists():
        return {}
    with open(config_path) as f:
        m = re.search(r"external-controller:\s*127\.0\.0\.1:(\d+)", f.read())
    if m:
        try:
            req = urllib.request.Request(f"http://127.0.0.1:{m.group(1)}/proxies")
            with urllib.request.urlopen(req, timeout=3) as resp:
                data = json.loads(resp.read())
            delays = {}
            for name, info in data.get("proxies", {}).items():
                history = info.get("history", [])
                if history:
                    delays[name] = history[-1]["delay"]
            return delays
        except Exception:
            pass

    return {}


def run_speed_test():
    """Trigger a URL test on the default proxy group to populate delay data."""
    import subprocess, urllib.parse

    socket_path = "/tmp/verge/verge-mihomo.sock"
    if not os.path.exists(socket_path):
        return {}

    # Get first proxy group name
    groups = get_proxy_groups()
    if not groups:
        return {}

    try:
        encoded = urllib.parse.quote(groups[0], safe="")
        test_url = "http://www.gstatic.com/generate_204"
        subprocess.run(
            ["curl", "-s", "--unix-socket", socket_path,
             f"http://localhost/group/{encoded}/delay?url={urllib.parse.quote(test_url, safe='')}&timeout=3000"],
            capture_output=True, timeout=15
        )
        import time
        time.sleep(3)
        return get_mihomo_delays()
    except Exception:
        return {}



def format_delay(ms):
    if ms == 0:
        return "---"
    if ms < 1000:
        return f"{ms}ms"
    return f"{ms / 1000:.1f}s"


def check_tun_mode():
    """Check if TUN mode is enabled in Clash Verge Rev."""
    verge_yaml = CLASH_DIR / "verge.yaml"
    if verge_yaml.exists():
        with open(verge_yaml) as f:
            if re.search(r"enable_tun_mode:\s*true", f.read()):
                return True
    # Also check running config
    import subprocess
    socket_path = "/tmp/verge/verge-mihomo.sock"
    if os.path.exists(socket_path):
        try:
            result = subprocess.run(
                ["curl", "-s", "--unix-socket", socket_path, "http://localhost/configs"],
                capture_output=True, text=True, timeout=3
            )
            if "tun" in result.stdout.lower():
                data = json.loads(result.stdout)
                if data.get("tun", {}).get("enable"):
                    return True
        except Exception:
            pass
    return False


def main():
    print("=== Happy App Router (CLI) ===\n")

    if not check_tun_mode():
        print("WARNING: TUN mode is OFF!")
        print("PROCESS rules (PROCESS-NAME, PROCESS-PATH-REGEX) only work in TUN mode.")
        print("Please enable TUN mode in Clash Verge Rev settings first.\n")

    apps = scan_apps()
    print(f"Found {len(apps)} apps.\n")

    query = input("Search app name (or Enter to list all): ").strip().lower()
    if query:
        apps = [a for a in apps if query in a["name"].lower() or query in a.get("bundle_id", "").lower()]
    if not apps:
        print("No apps found.")
        return

    app = pick(apps, "Select app:")

    # Try to get live delay data from Mihomo API
    print("\nChecking proxy delays...", end=" ", flush=True)
    delays = get_mihomo_delays()
    if not delays:
        print("no data, running speed test...", end=" ", flush=True)
        delays = run_speed_test()
    if delays:
        nonzero = sum(1 for v in delays.values() if v > 0)
        print(f"\nDelays: {nonzero} reachable out of {len(delays)} tested.\n")
    else:
        print("unavailable. Is Clash Verge Rev running?\n")

    # Combine proxy groups + individual proxies + DIRECT
    groups = get_proxy_groups()
    proxies = get_proxies()
    options = []
    for g in groups:
        options.append({"label": f"[组] {g}", "value": g})
    for p in proxies:
        d = delays.get(p)
        delay_str = f"  ({format_delay(d)})" if d is not None else ""
        options.append({"label": f"[节点] {p}{delay_str}", "value": p})
    options.append({"label": "[直连] DIRECT", "value": "DIRECT"})

    print(f"Found {len(groups)} groups, {len(proxies)} nodes.\n")
    query = input("Search proxy or node (e.g. '日本', '香港', or Enter for all): ").strip().lower()
    if query:
        options = [o for o in options if query in o["label"].lower()]
    if not options:
        print("No matches. Using DIRECT.")
        group = "DIRECT"
    else:
        print(f"Matching: {len(options)} items\n")
        for i, opt in enumerate(options):
            print(f"  [{i}] {opt['label']}")
        while True:
            try:
                idx = int(input("\nSelect proxy or node: ").strip())
                group = options[idx]["value"]
                break
            except (ValueError, IndexError):
                print("Invalid selection, try again.")

    print("\n  [0] prepend — app → proxy, other traffic → original rules")
    print("  [1] selected_only — app → proxy, other traffic → DIRECT")
    mode = "selected_only" if input("Select mode [0/1]: ").strip() == "1" else "prepend"

    rules = generate_rules(app, group)
    print("\n=== Generated Rules ===")
    for r in rules:
        print(f"  {r}")
    if mode == "selected_only":
        print("  MATCH,DIRECT")
    print()

    if input("Apply? [y/N] ").strip().lower() == "y":
        apply_rules(rules, mode)
        print("Done. Reload Profile in Clash Verge Rev to take effect.")
    else:
        print("Cancelled.")


if __name__ == "__main__":
    main()
