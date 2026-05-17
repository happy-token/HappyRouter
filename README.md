# Happy App Router

Per-app proxy routing for Clash Verge Rev on macOS. Web UI to select apps, assign proxy policies, and apply rules with one click.

## Prerequisites

- macOS with [Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev) installed
- TUN mode enabled (required for per-process rules)
- Node.js 22+

## Quick Start

```bash
# CLI mode — opens browser automatically
npx happy-router

# Desktop app — native macOS window
npm run electron

# Web only — visit http://localhost:3456
npm start
```

## Usage

1. **Pick an app** — search in the left panel, click to select
2. **Pick a proxy** — choose a proxy group or individual node (with live latency)
3. **Choose mode** — prepend rules or selected-only (all others go DIRECT)
4. **Apply** — writes rules to clash-verge.yaml, hot-reloads via API

Rules take effect immediately. No manual config editing needed.

## Routing Modes

| Mode | Behavior |
|------|----------|
| Prepend | Selected apps → proxy, other traffic → original Clash rules |
| Selected Only | Selected apps → proxy, other traffic → DIRECT |

## Development

```bash
npm install
npm start          # Web mode
npm run electron   # Desktop mode
npm run dist:mac   # Package signed DMG
```

## Release

### Local build (signed + notarized DMG)

```bash
source .env && npm run dist:mac
```

### CI auto-build (GitHub Actions)

```bash
git tag v1.0.0 && git push origin v1.0.0
```

Pushing a tag triggers GitHub Actions to build a signed + notarized DMG and publish it to the [Releases](https://github.com/happy-token/HappyRouter/releases) page.

### npm publish

```bash
npm login --registry https://registry.npmjs.org --auth-type=web
npm publish --access public --registry https://registry.npmjs.org
```

Then anyone can run: `npx @yourname/happy-router`

## Signing & Notarization

Uses the shared config scripts at `~/workspace/config/scripts/`:

```bash
# One-time setup
~/workspace/config/scripts/setup-env.sh /path/to/HappyRouter
~/workspace/config/scripts/setup-github-secrets.sh owner/repo .env

# Local build
source .env && npm run dist:mac
```

Requires an Apple Developer account and Developer ID Application certificate in Keychain.

## Important

- **TUN mode must be enabled** — PROCESS-NAME and PROCESS-PATH-REGEX rules only work in TUN mode
- Before applying, a backup of `clash-verge.yaml` is always created
- Rules are wrapped in `# BEGIN/END HAPPY_APP_ROUTER` markers for safe removal
- No sudo required, system config is never modified

## License

MIT
