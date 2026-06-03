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

## Ownership fields must be immutable on update, not just checked on create
Checking `resource.data.authorId == request.auth.uid` on a story/chapter update only proves you owned the OLD doc — it does not stop you reassigning the doc to someone else. A chapter update validated only on `resource.data.storyId` lets a hostile client change `request.resource.data.storyId` to another user's story (ownership-transfer / integrity bypass).

**How to apply:** for non-moderator updates, also assert the ownership/parent field is unchanged: `request.resource.data.storyId == resource.data.storyId` (chapters) and `request.resource.data.authorId == resource.data.authorId` (stories). Moderators are exempt.

## Participant/membership lists and "self-only" array mutations must be constrained
A "participant in conversation" update rule that only checks membership lets a participant ADD strangers to `participants`, who then pass the messages read rule — a visibility-escalation hole. Likewise a `likedBy` update that only checks `hasOnly(['likeCount','likedBy'])` lets anyone add/remove other users' likes.

**How to apply:** restrict conversation updates to non-membership fields via `changedKeys().hasOnly(['lastMessage','lastMessageAt','unreadCount'])` (participants becomes immutable). For self-only array toggles, require the symmetric set-difference to equal exactly the caller: `before.toSet().difference(after.toSet()).union(after.toSet().difference(before.toSet())) == [request.auth.uid].toSet()`.

## Cross-user counter writes — must bound the delta, not just the field set
Likes/comments/read counts are incremented by users who don't own the doc (e.g. `likeStory`, `addInlineComment`). `hasOnly([...counter fields])` alone lets any signed-in user set a counter to an ARBITRARY value (fake 9999 likes). Constrain the magnitude too: a `counterDeltaOk(f)` rule helper requires each changed counter to stay equal or move by exactly ±1 (`request.resource.data.get(f,0) == resource.data.get(f,0) (±1)`). All client increments are `increment(±1)`, so this is non-breaking.

**Why:** field-set checks stop content tampering but not metric fraud. **How to apply:** any non-owner counter path (stories like/comment/read, chapters read, inlineComments like, talentPortfolios like) must AND `counterDeltaOk('<field>')` for every counter in its `hasOnly` list.

## Public reads must be status-gated; reader queries must match the rule
`chapters` was world-readable (`allow read: if true`), leaking drafts/pending/rejected content. Gate it: `status=='published' || isModerator() || (signedIn && storyAuthor==uid)`. **Firestore rejects a list query if ANY potentially-returned doc would be unreadable** — so the matching client query must filter to the readable set. `getChaptersByStory(storyId, publishedOnly)` passes `true` from reader pages (story.tsx, read.tsx) and `false` from author pages (chapter-editor, write — the author clause covers their own drafts). Order the rule with `status=='published'` first so `||` short-circuits and anonymous reads skip the `storyAuthor` get().

## Never store PII (email) in a publicly-readable doc
`users` docs are `read: if true` (needed for public profile name/avatar/bio), but they also stored `email` — so anyone, even logged-out, could scrape every user's email. Firestore reads are all-or-nothing per doc (can't hide one field), so the fix is to NOT put PII there: email/emailVerified were removed from `users` entirely. The owner's own email is always available via Firebase Auth (`auth.currentUser.email`); no other user needs it. `ensureUserProfile` strips legacy `email`/`emailVerified` from existing docs via `deleteField()` on next login (covers already-stored data without a manual migration).

## Deployment is manual
Rules are NOT deployed from Replit. The user runs `firebase deploy --only firestore:rules,storage` from `artifacts/spektrum/` (config in `firebase.json` + `.firebaserc`, project `spektrum-5c7cc`). See `artifacts/spektrum/FIREBASE_RULES.md`.
