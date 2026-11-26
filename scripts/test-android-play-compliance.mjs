import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const mobile = new URL("artifacts/spektrum-mobile/", root);
const read = path => readFileSync(new URL(path, mobile), "utf8");
const require = createRequire(new URL("package.json", mobile));
const { applyPlayCompliance } = require("./plugins/with-android-play-compliance.js");
const app = JSON.parse(read("app.json")).expo;
const buildProperties = app.plugins.find(p => Array.isArray(p) && p[0] === "expo-build-properties")[1].android;
assert.equal(buildProperties.enableMinifyInReleaseBuilds, true, "DEX must be optimized with R8");
assert.notEqual(buildProperties.enableProguardInReleaseBuilds, false);
assert(!/-dont(?:optimize|shrink|obfuscate)\b/.test(buildProperties.extraProguardRules));
assert(buildProperties.extraProguardRules.includes("-keep,allowoptimization class expo.modules.** { *; }"),
  "Keep Expo/JNI class names and members, including AnyTypeCache, while allowing optimization");
assert(!buildProperties.extraProguardRules.includes("-keep class com.facebook.react.**"),
  "React Native already ships targeted consumer rules; do not suppress optimization package-wide");
assert(app.plugins.includes("./plugins/with-android-play-compliance"));
for (const permission of ["RECEIVE_BOOT_COMPLETED", "FOREGROUND_SERVICE_MICROPHONE", "RECORD_AUDIO"]) {
  assert(app.android.blockedPermissions.includes(`android.permission.${permission}`));
}

// Exercise against a library-like manifest, not just app.json.
const receiverName = "expo.modules.notifications.service.NotificationsService";
const recordingName = "expo.modules.audio.service.AudioRecordingService";
const playback = { $: { "android:name": "expo.modules.audio.service.AudioControlsService", "android:foregroundServiceType": "mediaPlayback" } };
const fcm = { $: { "android:name": "expo.modules.notifications.service.ExpoFirebaseMessagingService" } };
const unrelatedReceiver = { $: { "android:name": "com.example.OtherReceiver" } };
const fixture = {
  manifest: {
    $: { "xmlns:android": "http://schemas.android.com/apk/res/android" },
    application: [{
      receiver: [
        unrelatedReceiver,
        { $: { "android:name": receiverName }, "intent-filter": [{ action: [{ $: { "android:name": "android.intent.action.BOOT_COMPLETED" } }] }] },
      ],
      service: [playback, fcm, { $: { "android:name": recordingName, "android:foregroundServiceType": "microphone" } }],
    }],
  },
};
applyPlayCompliance(fixture);
const applied = JSON.stringify(fixture);
applyPlayCompliance(fixture);
assert.equal(JSON.stringify(fixture), applied, "Plugin must be idempotent");
const application = fixture.manifest.application[0];
assert(application.receiver.includes(unrelatedReceiver));
assert(application.service.includes(playback), "Keep lockscreen/background playback");
assert(application.service.includes(fcm), "Keep remote push notifications");
const receiver = application.receiver.find(r => r.$["android:name"] === receiverName);
assert.equal(receiver.$["tools:node"], "replace");
assert.equal(receiver.$["android:exported"], "false");
assert.deepEqual(receiver["intent-filter"][0].action.map(a => a.$["android:name"]), ["expo.modules.notifications.NOTIFICATION_EVENT"]);
assert.equal(application.service.find(s => s.$["android:name"] === recordingName).$["tools:node"], "remove");
assert.throws(() => applyPlayCompliance({ manifest: {} }), /application/);
applyPlayCompliance({ manifest: { application: [{}] } });

// This intentionally forbids adding scheduled local notifications silently:
// they require restoring reboot rescheduling and revisiting the Android policy.
const forbiddenApi = /\b(?:scheduleNotificationAsync|useAudioRecorder|createAudioRecorder|requestRecordingPermissionsAsync)\b/;
function checkSources(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = new URL(entry.name + (entry.isDirectory() ? "/" : ""), dir);
    if (entry.isDirectory()) {
      if (!["node_modules", ".expo", "android", "ios", "dist"].includes(entry.name)) checkSources(path);
    } else if (/\.[jt]sx?$/.test(entry.name)) {
      assert(!forbiddenApi.test(readFileSync(path, "utf8")), `Revisit reboot/microphone policy before adding APIs in ${fileURLToPath(path)}`);
    }
  }
}
for (const dir of ["app/", "components/", "lib/"]) checkSources(new URL(dir, mobile));
const audio = read("components/ChapterAudioSection.tsx");
assert(audio.includes("shouldPlayInBackground: true"));
assert(audio.includes("player.setActiveForLockScreen(true"));
assert(read("lib/push-notifications.ts").includes("getDevicePushTokenAsync"));
console.log("Android Play compliance checks passed: reboot entry points, unused recorder, playback, push, and R8.");
