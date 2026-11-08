import { test } from "node:test";
import assert from "node:assert/strict";
import { audioServiceFailureMessage } from "../src/lib/chapter-audio-core";

test("disabled storage returns an actionable message without exposing account details", () => {
  const message = audioServiceFailureMessage(new Error(
    "The billing account for the owning project is disabled in state delinquent",
  ));
  assert.match(message, /depolama hizmeti kapalı/);
  assert.doesNotMatch(message, /Tekrar dene|billing|delinquent/);
});

test("unrelated errors keep the safe fallback instead of claiming storage is disabled", () => {
  for (const error of [new Error("Permission denied"), new Error("Network timeout"), null, {}]) {
    assert.equal(audioServiceFailureMessage(error), "Ses yüklenemedi. Tekrar dene.");
  }
});
