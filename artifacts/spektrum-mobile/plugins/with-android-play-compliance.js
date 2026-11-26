const { withAndroidManifest } = require("expo/config-plugins");

const NOTIFICATION_RECEIVER = "expo.modules.notifications.service.NotificationsService";
const RECORDING_SERVICE = "expo.modules.audio.service.AudioRecordingService";

/**
 * SPEKTRUM receives remote push notifications; it does not schedule local alarms.
 * expo-notifications' reboot receiver only restores locally scheduled alarms.
 * Remove those entry points, not FCM delivery or user-started media playback.
 *
 * SDK 54 expo-audio also declares a microphone service even when recording is
 * disabled. Remove that unused component, leaving AudioControlsService intact.
 * See https://github.com/expo/expo/issues/41627.
 */
function applyPlayCompliance(manifest) {
  const root = manifest.manifest;
  const app = root.application?.[0];
  if (!app) throw new Error("Android manifest must contain an application.");
  root.$ = { ...root.$, "xmlns:tools": "http://schemas.android.com/tools" };

  // tools:node=replace is necessary: simply filtering generated entries would
  // allow the library manifest to merge all its BOOT_COMPLETED actions back in.
  app.receiver = (app.receiver ?? []).filter(
    receiver => receiver.$?.["android:name"] !== NOTIFICATION_RECEIVER,
  );
  app.receiver.push({
    $: {
      "android:name": NOTIFICATION_RECEIVER,
      "android:enabled": "true",
      "android:exported": "false",
      "tools:node": "replace",
    },
    "intent-filter": [{
      $: { "android:priority": "-1" },
      action: [{ $: { "android:name": "expo.modules.notifications.NOTIFICATION_EVENT" } }],
    }],
  });

  app.service = (app.service ?? []).filter(
    service => service.$?.["android:name"] !== RECORDING_SERVICE,
  );
  app.service.push({
    $: { "android:name": RECORDING_SERVICE, "tools:node": "remove" },
  });
  return manifest;
}

module.exports = function withAndroidPlayCompliance(config) {
  return withAndroidManifest(config, mod => {
    mod.modResults = applyPlayCompliance(mod.modResults);
    return mod;
  });
};
module.exports.applyPlayCompliance = applyPlayCompliance;
