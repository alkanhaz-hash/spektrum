const fs = require("node:fs");
const path = require("node:path");

// Static app.json + config plugin preserves the two existing build targets.
module.exports = function withPlayExisting(config) {
  const target = process.env.SPEKTRUM_ANDROID_TARGET;
  if (!target) return config;
  if (target !== "existing-play") throw new Error("Unknown SPEKTRUM_ANDROID_TARGET");
  const versionCode = Number(process.env.SPEKTRUM_ANDROID_VERSION_CODE);
  if (!Number.isSafeInteger(versionCode) || versionCode < 21) throw new Error("Existing Play version code must be >= 21.");
  const googleServicesPath = path.resolve(__dirname, "../assets/firebase/google-services.play.json");
  const googleServices = JSON.parse(fs.readFileSync(googleServicesPath, "utf8"));
  const googleWebClientId = googleServices.client?.[0]?.oauth_client
    ?.find(client => client.client_type === 3)?.client_id;
  if (!googleWebClientId) {
    throw new Error("Google sign-in requires a web OAuth client in google-services.play.json.");
  }
  const googleAndroidClient = googleServices.client?.some(client =>
    client.client_info?.android_client_info?.package_name === "com.alkanhaz.spektrum"
    && client.oauth_client?.some(oauthClient =>
      oauthClient.client_type === 1
      && oauthClient.android_info?.package_name === "com.alkanhaz.spektrum"));
  if (!googleAndroidClient) {
    throw new Error("Missing Android OAuth client for com.alkanhaz.spektrum. Add the Play App Signing SHA-1 to the Firebase Android app and refresh google-services.play.json before building.");
  }
  config.extra = {
    ...config.extra,
    googleWebClientId,
  };
  config.android = {
    ...config.android,
    package: "com.alkanhaz.spektrum",
    versionCode,
    googleServicesFile: "./assets/firebase/google-services.play.json",
    intentFilters: [
      ...(config.android?.intentFilters ?? []),
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          { scheme: "https", host: "spektrumapp.com.tr", pathPrefix: "/ask/" },
          { scheme: "https", host: "spektrumapp.com.tr", pathPrefix: "/qa/" },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  };
  return config;
};
