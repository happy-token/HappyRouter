# Happy App Router PRD

## 1. Overview

Happy App Router is a local desktop utility for managing per-application proxy routing for Mihomo/Clash-compatible clients.

The first target is Clash Verge Rev on macOS. The app provides a visual interface to select installed applications, choose a proxy policy, preview generated rules, and apply them through Clash Verge Rev profile enhancement files.

The product exists because raw `PROCESS-NAME` and `PROCESS-PATH` rules are powerful but painful to manage manually, especially for Electron apps whose network process may be a helper process rather than the main executable.

## 2. Goals

- Let users choose apps from a visual list instead of writing YAML or JavaScript rules.
- Generate correct Mihomo process rules for selected apps.
- Support common routing modes:
  - selected apps use a proxy group, everything else follows the existing Clash rules
  - selected apps use a proxy group, everything else goes `DIRECT`
- Read proxy groups from the active Clash Verge Rev generated profile.
- Show a safe preview before writing any config file.
- Avoid requiring administrator permission inside Happy App Router.
- Keep generated config easy to inspect, revert, and disable.

## 3. Non-Goals

- Happy App Router does not implement a proxy core.
- Happy App Router does not replace Clash Verge Rev, FlClash, or v2rayN.
- Happy App Router does not install or manage TUN service permissions.
- Happy App Router does not silently rewrite subscription files.
- Happy App Router does not promise perfect per-app routing when TUN is disabled.

## 4. Target Users

- macOS users running Clash Verge Rev with Mihomo.
- Developers who want Codex, Cursor, Chrome, Terminal, or other apps to use specific proxy routes.
- Users who want Proxifier-like app selection but prefer to keep using Clash/Mihomo rules.

## 5. Core Use Cases

### 5.1 Route Codex Through Proxy

User selects `Codex.app`, selects proxy group `🔰节点选择`, chooses `Only selected apps use proxy; others direct`, previews rules, and applies.

Generated rules should cover the app bundle, not only the main executable:

```yaml
- PROCESS-PATH-REGEX,^/Applications/Codex\.app/.*,🔰节点选择
- PROCESS-NAME,Codex,🔰节点选择
- MATCH,DIRECT
```

### 5.2 Keep Existing Clash Rules, Force One App Through Proxy

User selects `Google Chrome.app`, selects a proxy group, chooses `Prepend rules only`, and applies.

Generated rules are inserted before existing rules:

```yaml
- PROCESS-PATH-REGEX,^/Applications/Google Chrome\.app/.*,🔰节点选择
```

Existing Clash rules remain after generated app rules.

### 5.3 Temporarily Disable App Routing

User toggles `Enabled` off. Happy App Router removes or bypasses only the block it previously generated.

## 6. Product Requirements

### 6.1 App Discovery

The app scans:

- `/Applications`
- `~/Applications`

For each `.app`, read:

- app display name
- bundle path
- bundle identifier
- executable name from `Contents/Info.plist`
- icon when available

The UI must allow search by app name, bundle id, and path.

### 6.2 Proxy Client Detection

MVP supports Clash Verge Rev.

Default config directory:

```text
~/Library/Application Support/io.github.clash-verge-rev.clash-verge-rev
```

The app detects:

- `profiles.yaml`
- active profile id
- active profile enhancement script id
- generated config `clash-verge.yaml`
- available proxy groups

If detection fails, show a setup screen with manual path selection.

### 6.3 Proxy Group Selection

The app reads proxy groups from generated config:

```yaml
proxy-groups:
  - name: 🔰节点选择
```

The UI presents:

- proxy group name
- group type if available
- fallback option `DIRECT`
- fallback option `REJECT` only in advanced mode

### 6.4 Routing Modes

MVP supports three modes.

#### Mode A: Prepend App Rules

Selected app rules are inserted before the original rule list.

Effect:

```text
selected apps -> chosen proxy group
all other traffic -> original Clash rules
```

#### Mode B: Selected Apps Only

Selected app rules are generated first, followed by `MATCH,DIRECT`.

Effect:

```text
selected apps -> chosen proxy group
all other traffic -> DIRECT
```

#### Mode C: Disable Generated Rules

Generated routing is removed or bypassed.

### 6.5 Rule Generation

For macOS `.app` bundles, prefer:

```yaml
PROCESS-PATH-REGEX,^/Applications/AppName\.app/.*,ProxyGroup
```

Also generate a secondary executable-name rule when useful:

```yaml
PROCESS-NAME,ExecutableName,ProxyGroup
```

Rationale:

- Electron apps often use helper processes under the app bundle.
- Bundle regex catches `Codex`, `Codex Helper`, `Codex Helper (Renderer)`, and network service helpers.

Generated rules must escape regex metacharacters in paths.

### 6.6 Config Writing

Happy App Router writes only to enhancement files it owns or explicitly manages.

Preferred MVP approach:

- Modify the active profile script enhancement file.
- Preserve user-authored content only if it is outside a clearly marked generated block.

Generated block example:

```js
// BEGIN HAPPY_APP_ROUTER
// generated content
// END HAPPY_APP_ROUTER
```

If an existing script does not match the expected shape, create a backup before writing:

```text
filename.js.bak-YYYYMMDD-HHMMSS
```

The app must show a diff preview before applying.

### 6.7 Reload Guidance

MVP does not need to control Clash Verge Rev through private APIs.

After applying config, show:

```text
Rules saved. Please click Reload Profile in Clash Verge Rev.
```

Future versions may support automatic reload if a stable local API is available.

### 6.8 Safety

The app must:

- Never request sudo.
- Never install TUN service.
- Never edit subscription remote profile YAML directly unless user explicitly chooses advanced mode.
- Always backup files before modification.
- Always provide rollback.
- Clearly warn that process rules require TUN mode in Clash Verge Rev.

## 7. UX Requirements

### 7.1 Main Screen

Layout:

- left panel: detected proxy client and active profile
- center: searchable app list
- right panel: selected apps and routing mode
- bottom: generated rules preview and apply button

### 7.2 App Selection

Each app row shows:

- icon
- app name
- bundle id
- path
- checkbox

### 7.3 Routing Panel

Controls:

- proxy group dropdown
- routing mode segmented control
- enable/disable toggle
- preview button
- apply button
- rollback button

### 7.4 Warnings

Show non-blocking warnings:

- TUN appears disabled
- no proxy groups found
- active profile script not found
- generated rules not currently present in runtime config

## 8. Technical Proposal

Recommended stack:

- Tauri for desktop shell
- React + TypeScript for UI
- Rust backend for file scanning, plist parsing, safe writes, and backups

Reasons:

- Clash Verge Rev is already Tauri-based, so the ecosystem is familiar.
- Rust is good for local filesystem and plist handling.
- The app stays lightweight and local-first.

Alternative stack:

- Electron + React for faster prototyping
- Node.js backend for plist/YAML parsing

MVP recommendation: Tauri + React + TypeScript.

## 9. Data Model

### 9.1 App Route

```ts
type AppRoute = {
  id: string;
  appName: string;
  bundleId?: string;
  bundlePath: string;
  executableName?: string;
  policy: string;
  enabled: boolean;
};
```

### 9.2 Router Config

```ts
type RouterConfig = {
  client: "clash-verge-rev";
  clientConfigDir: string;
  mode: "prepend" | "selected_only" | "disabled";
  routes: AppRoute[];
};
```

## 10. Generated Script Shape

MVP generated script can replace a simple enhancement file with:

```js
function main(config, profileName) {
  config["find-process-mode"] = "always";

  const happyAppRouterRules = [
    "PROCESS-PATH-REGEX,^/Applications/Codex\\.app/.*,🔰节点选择",
    "PROCESS-NAME,Codex,🔰节点选择",
  ];

  config.rules = [
    ...happyAppRouterRules,
    ...(config.rules || []),
  ];

  return config;
}
```

For selected-only mode:

```js
config.rules = [
  ...happyAppRouterRules,
  "MATCH,DIRECT",
];
```

## 11. Acceptance Criteria

MVP is complete when:

- App scans `/Applications` and `~/Applications`.
- App detects Clash Verge Rev config directory.
- App reads active profile and proxy groups.
- User can select one or more apps.
- User can select proxy group and routing mode.
- App generates correct process rules.
- App shows diff preview.
- App writes enhancement script with backup.
- App can rollback last change.
- App clearly warns when TUN is disabled.

## 12. Milestones

### Milestone 1: CLI Prototype

- Scan apps.
- Detect Clash Verge Rev config.
- Print generated rules for selected app.
- No UI.

### Milestone 2: Desktop MVP

- Tauri shell.
- App picker UI.
- Proxy group selector.
- Rule preview.
- Safe apply with backup.

### Milestone 3: Runtime Validation

- Detect whether generated rules reached `clash-verge.yaml`.
- Show whether TUN is enabled.
- Show connection hints for selected app.

### Milestone 4: Multi-Client Support

- Add FlClash config detection.
- Add manual Mihomo config path support.

## 13. Open Questions

- Should the app modify the active script enhancement, or maintain a dedicated merge/script profile and ask the user to attach it?
- Should automatic Clash Verge reload be supported in MVP?
- Should the app support domain-based fallback rules for apps that cannot be matched by process?
- Should app routes be stored only inside Clash enhancement scripts, or also in a Happy App Router local config file?

## 14. Recommended MVP Decision

Build a local Tauri app that manages Clash Verge Rev script enhancement files safely.

Default behavior:

- no sudo
- no TUN installation
- no automatic service changes
- no direct subscription edits
- generate app process rules
- show preview
- backup before apply

This keeps the product useful while avoiding the fragile system-permission path that caused friction during manual setup.
