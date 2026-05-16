import { readdirSync, existsSync } from "fs";
import { join, basename } from "path";
import plist from "simple-plist";

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
          });
        } catch {}
      }
    } catch {}
  }
  return apps.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}
