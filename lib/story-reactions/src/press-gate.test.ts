import assert from "node:assert/strict";
import test from "node:test";
import { createReactionPressGate } from "./press-gate";

test("rapid taps cannot immediately undo a settled like; later taps remain reversible", () => {
  let time = 0;
  const claim = createReactionPressGate(() => time);
  assert.equal(claim(), true);
  time = 100;
  assert.equal(claim(), false);
  time = 449;
  assert.equal(claim(), false);
  time = 450;
  assert.equal(claim(), true);
});

test("separate screens are independent and a clock correction does not lock the button", () => {
  let time = 1000;
  const first = createReactionPressGate(() => time);
  const second = createReactionPressGate(() => time);
  assert.equal(first(), true);
  assert.equal(second(), true);
  time = 500;
  assert.equal(first(), true);
  assert.equal(first(), false);
});
