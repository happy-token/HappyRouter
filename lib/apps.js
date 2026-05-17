import { readdirSync, existsSync } from "fs";
import { join, basename } from "path";
import plist from "simple-plist";

function findIconPath(appPath, info) {
  const resDir = join(appPath, "Contents", "Resources");
  if (!existsSync(resDir)) return null;
  try {
    const files = readdirSync(resDir);
    let iconName = (info.CFBundleIconFile || "AppIcon").replace(/\.(icns|png)$/i, "");
    for (const f of files) {
      const ext = f.endsWith(".icns") ? ".icns" : f.endsWith(".png") ? ".png" : "";
      const base = basename(f, ext);
      if (base === iconName || base === "AppIcon" || base === "app") {
        return join(resDir, f);
      }
    }
    const icns = files.find((f) => f.endsWith(".icns"));
    if (icns) return join(resDir, icns);
  } catch {}
  return null;
}

export function scanApps(dirs) {
  if (!dirs) {
    dirs = ["/Applications", join(process.env.HOME, "Applications")];
  }
  const apps = [];
  for (const d of dirs) {
    if (!existsSync(d)) continue;
    try {
      for (const entry of readdirSync(d)) {
        if (!entry.endsWith(".app")) continue;
        const appPath = join(d, entry);
        const plistPath = join(appPath, "Contents", "Info.plist");
        if (!existsSync(plistPath)) continue;
        try {
          const info = plist.readFileSync(plistPath);
          const name =
            info.CFBundleDisplayName || info.CFBundleName || basename(entry, ".app");
          apps.push({
            name,
            path: appPath,
            executable: info.CFBundleExecutable || "",
            bundleId: info.CFBundleIdentifier || "",
            icon: findIconPath(appPath, info),
          });
        } catch {}
      }
    } catch {}
  }
  return apps.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}
