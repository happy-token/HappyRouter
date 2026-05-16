# Happy App Router

Per-app proxy routing for Clash Verge Rev on macOS. Select apps, assign proxy policies, generate rules — no manual YAML editing.

## Prerequisites

- macOS with Clash Verge Rev installed and TUN mode enabled
- Python 3.11+ (already installed on macOS)

## Quick Start

```bash
# One-liner — venv auto-creates on first run
./run.sh

# Or run directly (zero external dependencies)
python3 happy-router.py
```

## Usage

The script runs interactively in 4 steps:

```
=== Happy App Router (CLI) ===

Found 87 apps.

Search app name (or Enter to list all): codex
  [0] Codex  (com.blacktree.Codex)
  [1] Codex Helper  (...)
Select app: 0

Found 5 proxy options.

  [0] 🔰节点选择
  [1] 🎯全球直连
  [2] 🚀国际媒体
  [3] REJECT
  [4] DIRECT
Select proxy group: 0

  [0] prepend — app -> proxy, other traffic -> original rules
  [1] selected_only — app -> proxy, other traffic -> DIRECT
Select mode [0/1]: 0

=== Generated Rules ===
  PROCESS-PATH-REGEX,^/Applications/Codex\.app/.*,🔰节点选择
  PROCESS-NAME,Codex,🔰节点选择

Apply? [y/N] y
Backup: .../happy-router.js.bak-20260516-203000
Written: .../scripts/happy-router.js
Done. Click 'Reload Profile' in Clash Verge Rev.
```

### Step by step

| Step | What you do |
|------|-------------|
| 1. Search | Type part of an app name (e.g. `codex`, `chrome`, `cursor`), or Enter to see all |
| 2. Pick app | Enter the number next to the app |
| 3. Pick proxy | Choose a proxy group from your Clash config, or `DIRECT` |
| 4. Choose mode | `0` = only selected apps use proxy, others follow existing rules. `1` = selected apps use proxy, everything else goes DIRECT |
| 5. Confirm | `y` to write config, anything else to cancel |

## Routing Modes

### Mode 0 — Prepend

Selected apps route through the chosen proxy group. All other traffic follows your existing Clash rules unchanged.

```
selected apps  ->  chosen proxy
everything else ->  original rules (as before)
```

### Mode 1 — Selected Only

Selected apps route through the chosen proxy group. Everything else bypasses proxy entirely (`DIRECT`).

```
selected apps  ->  chosen proxy
everything else ->  DIRECT
```

## What It Does

1. Scans `/Applications` and `~/Applications` for `.app` bundles
2. Reads the proxy groups from `clash-verge.yaml`
3. Generates two rules per app:
   - `PROCESS-PATH-REGEX` — matches all processes under the app bundle (catches helpers too)
   - `PROCESS-NAME` — matches by executable name
4. Writes to `~/Library/Application Support/io.github.clash-verge-rev.clash-verge-rev/scripts/happy-router.js`
5. Creates a timestamped backup before overwriting

## Rollback

Backup files are saved alongside the script:

```
scripts/
├── happy-router.js
├── happy-router.js.bak-20260516-203000
└── happy-router.js.bak-20260515-091500
```

To roll back, copy the backup over `happy-router.js` and reload the profile:

```bash
cp ~/Library/Application\ Support/io.github.clash-verge-rev.clash-verge-rev/scripts/happy-router.js.bak-* \
   ~/Library/Application\ Support/io.github.clash-verge-rev.clash-verge-rev/scripts/happy-router.js
```

## Important Notes

- **TUN mode must be enabled** in Clash Verge Rev — `PROCESS-NAME` and `PROCESS-PATH-REGEX` rules only work in TUN mode
- After applying rules, click **Reload Profile** in Clash Verge Rev to take effect
- The script only touches `happy-router.js` — it never modifies your subscription files or main config
- No sudo required, no system permission changes
