# Happy Router

Per-app proxy routing for Clash Verge Rev on macOS. A native desktop app (Electron) with Web UI to select apps, assign proxy policies, and apply rules with one click.

## 🚀 Install with NPM

You can now install Happy App Router as a global command:

```bash
npm install -g @happytokenai/happy-router
```

After installation, you can use the command `happy-router` directly from anywhere in your terminal.

## 🖥️ Usage

Both CLI and Web UI are included and fully functional:

### 1. Web UI (Recommended)
Launch the beautiful, modern Web interface to manage all your rules visually:
```bash
happy-router --web
```
*Alternatively, use `npx @happytokenai/happy-router --web` without installing.*

### 2. CLI Interface
Step-by-step interactive command line guide:
```bash
happy-router
```

## 🖥️ Desktop App

Happy Router is also available as a native macOS desktop application with a system tray icon. The desktop app runs in the background, accessible from the menu bar at any time.

- **Tray icon** — Quick access to the app from the macOS menu bar
- **Native look** — macOS-native title bar with vibrancy and glass effects
- **Persistent** — Keeps running in the tray when the window is closed

### Download

Download the latest `.dmg` from the [Releases](https://github.com/happy-token/HappyRouter/releases) page.

### Build from Source

```bash
npm run dist:mac
```

The `.dmg` will be generated in the `dist/` directory.

## 🛠️ Prerequisites

- macOS with [Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev) installed
- **TUN mode enabled** (required for per-process rules)
- Node.js 22+

## 📖 Key Features

- **Desktop App** — Native macOS Electron app with tray icon and vibrancy effects.
- **Pick an app** — Search and select from all installed macOS applications.
- **Pick a proxy** — Choose a proxy group or individual node with live latency display.
- **i18n Support** — Chinese and English interface with one-click language switching.
- **Theme Switching** — Light, dark, and system-follow theme support.
- **Modern Design** — High-end UI with transparency effects, icon-only controls, and elegant animations.
- **One-click Apply** — Writes rules to `clash-verge.yaml` and hot-reloads via API automatically.

## 🚦 Routing Modes

| Mode | Behavior |
|------|----------|
| **Append (追加规则)** | Selected apps → proxy, other traffic follows original Clash rules. |
| **Exclusive (仅选中直连)** | Selected apps → proxy, ALL other traffic goes DIRECT. |
## 📦 Development & Testing

If you want to contribute or test changes locally:

1. **Clone & Install**:
   ```bash
   git clone https://github.com/happytokenai/HappyRouter.git
   cd HappyRouter
   npm install
   ```

2. **Local Linking (Development Mode)**:
   Link the package to your system to test the `happy-router` command globally without publishing:
   ```bash
   npm link
   ```
   Now, any changes you make in the code will be immediately reflected when you run `happy-router`.

3. **Running Interfaces**:
   - Web UI: `npm run web`
   - CLI: `npm start`
   - Desktop: `npm run electron`

## 🚢 Publishing to NPM

To publish a new version to the NPM registry:

1. **Login** (if not already):
   ```bash
   npm login --registry https://registry.npmjs.org
   ```

2. **Update Version**:
   Increment the version in `package.json` (e.g., from `1.0.0` to `1.0.1`).

3. **Publish**:
   ```bash
   npm publish --access public
   ```

## ⚠️ Important

- **TUN mode must be enabled** — PROCESS-NAME rules only work in TUN mode.
- **Auto Backup** — A backup of your `clash-verge.yaml` is created before every change.
- **Safe Markers** — Rules are wrapped in `# BEGIN/END HAPPY_APP_ROUTER` markers for safe removal.

## 📄 License

MIT
