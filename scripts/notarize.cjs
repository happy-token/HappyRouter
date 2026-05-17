require("dotenv").config();
const { notarize } = require("@electron/notarize");
const { execSync } = require("child_process");

exports.default = async (context) => {
  if (context.electronPlatformName !== "darwin") return;

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env;
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    console.warn("Skipping notarization: missing env vars");
    return;
  }

  const appPath = `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`;
  console.log(`Notarizing: ${appPath}`);

  await notarize({
    tool: "notarytool",
    appPath,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
    teamId: APPLE_TEAM_ID,
  });

  console.log("Notarization complete");

  try {
    execSync(`xcrun stapler staple "${appPath}"`, { stdio: "inherit" });
    console.log("Stapling complete");
  } catch {
    console.warn("Stapling failed (app may still work)");
  }

  try {
    execSync(`spctl --assess --type execute --verbose "${appPath}"`, { stdio: "inherit" });
    console.log("Gatekeeper verification passed");
  } catch {
    console.warn("Gatekeeper check did not pass (normal in CI)");
  }
};
