import test from "node:test";
import assert from "node:assert/strict";
import { cleanLaunchSummary } from "./update-launch-presentation.mjs";
import { ATTRIBUTION_NOTE } from "./launch-library.mjs";

test("removes only the legacy collection note and preserves the author's synopsis", () => {
  assert.equal(cleanLaunchSummary(`Özgün özet.\n\n${ATTRIBUTION_NOTE}`), "Özgün özet.");
  assert.equal(cleanLaunchSummary(`Yazarın güncel özeti.\n\n${ATTRIBUTION_NOTE}\n\nYeni notu.`), "Yazarın güncel özeti.\n\n\n\nYeni notu.");
});
test("summary cleanup is idempotent and never invents a synopsis", () => {
  const summary = "Yeni açıklama ve izin kelimesini içeren bir hikâye.";
  assert.equal(cleanLaunchSummary(summary), summary);
  assert.equal(cleanLaunchSummary(cleanLaunchSummary(`${summary}\n\n${ATTRIBUTION_NOTE}`)), summary);
  assert.throws(() => cleanLaunchSummary(undefined), /geçersiz/);
});
