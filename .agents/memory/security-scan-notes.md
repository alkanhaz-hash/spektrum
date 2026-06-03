---
name: Security scan notes (SPEKTRUM)
description: How to triage runSastScan/runDependencyAudit findings here — Firebase web key false positive and nosemgrep placement.
---

# Security scan triage

## Firebase web API key flagged as "secret" (red/HIGH) — false positive
runSastScan reports 4 HIGH findings on `.replit` (detected-generic-api-key, detected-google-api-key, detected-google-cloud-api-key, gitleaks gcp-api-key). All point at the single `VITE_FIREBASE_API_KEY` value in `[userenv.shared]`.

**Why it's not a real leak:** Firebase web API keys are public by design — they ship inside every visitor's client bundle and cannot be hidden. Data is protected by Firestore/Storage security rules + Firebase Auth, not key secrecy.

**How to apply:** Do NOT do a risky vault-move / removal to "fix" these (gains no real security, can break Firebase init — app needs the key at build time). Leave as-is. Real optional hardening is user-side: restrict the key by HTTP referrer in Google Cloud Console. The user already chose "leave as-is."

## nosemgrep placement
A `// nosemgrep: <rule-id>` comment only suppresses when it is on the line **immediately above** the offending line (or inline same line). If other comment lines sit between the directive and the code line, it is NOT applied — re-scan will still show the finding. Put the human justification ABOVE the `// nosemgrep:` line, and keep `// nosemgrep:` as the last line before the code.

**Where used:** moderation.ts `buildKeywordPattern` (detect-non-literal-regexp — keywords static/escaped, no backtracking) and mockup-sandbox `App.tsx` (unsafe-dynamic-method — dev-only preview, lookups constrained to generated module map).

## qs transitive vuln
GHSA-q8mj-m7cp-5q26 lives in `qs@6.15.1` pulled transitively via express/body-parser. Fixed by a `qs: "^6.15.2"` entry in `pnpm-workspace.yaml` `overrides` + `pnpm install`. No major bump, behavior unchanged.
