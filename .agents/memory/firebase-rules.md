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

## Client-side moderation is bypassable — but don't let rules break the app
Image moderation runs in the browser (nsfwjs, zero credit) and text moderation is a client call to a regex endpoint. Both can be bypassed by a hostile client, so the **real** trust boundary is the Firebase rules.

**Why / the tension:** SPEKTRUM auto-publishes a chapter from the client the moment client text moderation returns `approved` (`chapter-editor.tsx` maps moderation `approved` → chapter status `published`). A rule that restricts `status: "published"` to moderators therefore **breaks normal publishing**.

**How to apply:** Rules enforce *ownership* (only the story author — looked up via `get(stories/$(storyId)).data.authorId` — or a moderator can write a chapter) and *no self-role-escalation* (a user update must keep `role` unchanged; only moderators/admins change roles). They do **not** force a moderator-approval gate on publish, because the product is author-driven publish. If you ever want true moderator-gated publish, you must also change `chapter-editor.tsx` to submit `pending_review` instead of `published`.

## Cross-user counter writes
Likes/comments/read counts are incremented by users who don't own the doc (e.g. `likeStory`, `addInlineComment`). Rules allow non-owner updates only when `request.resource.data.diff(resource.data).affectedKeys().hasOnly([...counter fields])`. Bounded counter inflation is an accepted residual risk; content tampering is blocked.

## Deployment is manual
Rules are NOT deployed from Replit. The user runs `firebase deploy --only firestore:rules,storage` from `artifacts/spektrum/` (config in `firebase.json` + `.firebaserc`, project `spektrum-5c7cc`). See `artifacts/spektrum/FIREBASE_RULES.md`.
