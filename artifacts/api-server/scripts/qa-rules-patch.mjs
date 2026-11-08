/** Build a Q&A-only release without replacing unrelated live permissions. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const BEGIN = "    // BEGIN SPEKTRUM MANAGED Q&A";
export const END = "    // END SPEKTRUM MANAGED Q&A";
export const digest = text => createHash("sha256").update(text).digest("hex");

// Rules contain path captures, quoted strings and comments. Do not use a
// greedy regex to find a match/function body or it can consume other rules.
function balancedEnd(source, opening) {
  let depth = 0, quote = "", comment = "";
  for (let i = opening; i < source.length; i++) {
    const c = source[i], next = source[i + 1];
    if (comment === "line") { if (c === "\n") comment = ""; continue; }
    if (comment === "block") { if (c === "*" && next === "/") { comment = ""; i++; } continue; }
    if (quote) { if (c === "\\") i++; else if (c === quote) quote = ""; continue; }
    if (c === "/" && next === "/") { comment = "line"; i++; continue; }
    if (c === "/" && next === "*") { comment = "block"; i++; continue; }
    if (c === "'" || c === '"') { quote = c; continue; }
    if (c === "{") depth++;
    if (c === "}" && --depth === 0) return i + 1;
  }
  throw new Error("Unbalanced rule block; refusing a production patch.");
}
function findBlock(source, expression) {
  const matches = [...source.matchAll(new RegExp(expression, "gm"))];
  assert.equal(matches.length, 1, "Expected exactly one rule block.");
  const found = matches[0], opening = found.index + found[0].lastIndexOf("{");
  return { start: found.index, end: balancedEnd(source, opening) };
}
const matchExpression = name => `^    match /${name}/\\{[^}]+\\}\\s*\\{`;
const functionExpression = name => `^    function ${name}\\([^)]*\\)\\s*\\{`;
function extract(source, expression) {
  const range = findBlock(source, expression);
  return source.slice(range.start, range.end);
}
function qaRange(source) {
  if (source.includes(BEGIN) || source.includes(END)) {
    assert.equal(source.split(BEGIN).length, 2);
    assert.equal(source.split(END).length, 2);
    const start = source.indexOf(BEGIN), end = source.indexOf(END) + END.length;
    assert.ok(start < end);
    return { start, end };
  }
  return findBlock(source, matchExpression("anonymousQuestions"));
}
export function withoutQa(source) {
  const { start, end } = qaRange(source);
  return source.slice(0, start) + "<Q&A_ONLY>" + source.slice(end);
}

export function buildQaPatch(live, local) {
  const range = qaRange(live), outside = withoutQa(live);
  assert.ok(!/function qa(SenderAllowed|RateAllowed|DeploymentAccountIsActive|DeploymentIsBanned)\b/.test(outside));
  for (const name of ["anonymousQuestionsV2", "anonymousQuestionIdentities", "anonymousQuestionLimits"]) {
    assert.ok(!new RegExp(`match /${name}/`).test(outside), "Unmanaged Q&A rules require manual review.");
  }
  const scoped = text => text
    .replace(/\baccountIsActive\(/g, "qaDeploymentAccountIsActive(")
    .replace(/\bisBanned\(/g, "qaDeploymentIsBanned(");
  const blocks = [
    extract(local, functionExpression("accountIsActive")),
    extract(local, functionExpression("isBanned")),
    extract(local, functionExpression("qaSenderAllowed")),
    extract(local, functionExpression("qaRateAllowed")),
    ...["anonymousQuestions", "anonymousQuestionsV2", "anonymousQuestionIdentities", "anonymousQuestionLimits"]
      .map(name => extract(local, matchExpression(name))),
  ].map(scoped);
  const managed = [BEGIN, ...blocks, END].join("\n\n");
  const candidate = live.slice(0, range.start) + managed + live.slice(range.end);
  assert.equal(withoutQa(candidate), outside, "Non-Q&A permissions changed.");
  return candidate;
}
