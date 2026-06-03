---
name: Firebase security rules (SPEKTRUM)
description: Durable constraints for writing Firestore/Storage rules in the SPEKTRUM Firebase app, and how moderation enforcement actually works.
---

# Firebase security rules — durable constraints

## Storage rules cannot query Firestore
Firebase **Storage** rules have no `get()`/`exists()` into Firestore (unlike Firestore rules, which can read other docs). So any owner/participant authorization for a storage path must be derivable **from the path itself**.

**How to apply:**
- DM media lives at `messages/<conversationId>/...` where `conversationId` = the two participant UIDs sorted and joined by `_` (see `getOrCreateConversation`). Enforce participant-only with `request.auth.uid in conversationId.split('_')`. Firebase UIDs never contain `_`, so the split is safe.
- Story covers must be namespaced by owner UID (`story-covers/<uid>/<storyId>.webp`) so the rule can check `request.auth.uid == uid`. A flat `covers/<storyId>/...` path is NOT enforceable (any signed-in user could overwrite any cover).

## Client-side moderation is bypassable — rules + client must agree
Image moderation runs in the browser (nsfwjs, zero credit) and text moderation is a client call to a regex endpoint. Both can be bypassed by a hostile client, so the **real** trust boundary is the Firebase rules.

**Rule:** Chapter publishing is moderator-gated. A non-moderator (story author) may only write chapter `status` of `draft` or `pending_review`; setting `published`/`rejected` is allowed only for `isModerator()`. Rules also enforce *ownership* (only the story author — looked up via `get(stories/$(storyId)).data.authorId` — or a moderator can write a chapter) and *no self-role-escalation* (a user update must keep `role` unchanged).

**Why:** an earlier version auto-published from the client the moment client text moderation returned `approved`, which is bypassable and was rejected in review as an unmoderated-publish hole. The fix requires BOTH sides to agree: `chapter-editor.tsx` submits `pending_review` (never `published`) and rejected content is not persisted at all; the moderator panel (`updateChapterStatus`) is the only path to `published`. **If you relax the rule, you must also change the client, and vice-versa — they are a matched pair.**

## Cross-user counter writes
Likes/comments/read counts are incremented by users who don't own the doc (e.g. `likeStory`, `addInlineComment`). Rules allow non-owner updates only when `request.resource.data.diff(resource.data).affectedKeys().hasOnly([...counter fields])`. Bounded counter inflation is an accepted residual risk; content tampering is blocked.

## Deployment is manual
Rules are NOT deployed from Replit. The user runs `firebase deploy --only firestore:rules,storage` from `artifacts/spektrum/` (config in `firebase.json` + `.firebaserc`, project `spektrum-5c7cc`). See `artifacts/spektrum/FIREBASE_RULES.md`.
