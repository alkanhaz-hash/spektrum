/** Ignore accidental double taps, even if the first network request settles quickly. */
export function createReactionPressGate(now: () => number = Date.now) {
  let last = -Infinity;
  return () => {
    const time = now();
    const elapsed = time - last;
    if (elapsed >= 0 && elapsed < 450) return false;
    last = time;
    return true;
  };
}
