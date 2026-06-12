---
name: Mobile workflow health check failure
description: Expo (kind=mobile) artifacts on this project cannot pass restart_workflow health check — platform-level networking issue with port 24811.
---

## The Rule
When a new Expo (mobile) artifact is created, its port MUST be added to the `[[ports]]` section of `.replit`. Without this, `restart_workflow` consistently fails with `DIDNT_OPEN_A_PORT` — the Replit health check cannot reach the container port from the host network.

**Why:** Replit only exposes ports listed in `.replit`'s `[[ports]]` table to the host network. The health check runs from the host side and needs the port exposed. `createArtifact` for web/API artifacts adds the entry automatically, but the mobile artifact's port (24811) was missing.

**Fix that worked:** Add `[[ports]]` entry to `.replit` via `verifyAndReplaceDotReplit`:
```toml
[[ports]]
localPort = 24811
externalPort = 4000
```

**How to apply:** Any time a new Expo artifact is created and `restart_workflow` fails with DIDNT_OPEN_A_PORT, check `.replit`'s `[[ports]]` section first. If the artifact's port is missing, add it via `verifyAndReplaceDotReplit`. Use `externalPort` that doesn't conflict with existing mappings (8080, 80, 3000 are taken in this project).

**Proxy wrapper:** `artifacts/spektrum-mobile/scripts/start.js` — binds $PORT immediately (proxy), starts Metro on $PORT+1 in background. Available tools: `fuser`, `ss`, `lsof`, `netstat` are ALL absent in this Replit environment.
</thinking>
