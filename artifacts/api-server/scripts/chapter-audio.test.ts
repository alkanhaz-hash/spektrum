import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { readFile } from "node:fs/promises";
import { startAudioQaServer } from "./chapter-audio-qa";
import { MAX_AUDIO_BYTES, audioMime, audioRange, canReadAudio, readAudioTicket, signAudioTicket, validAudioHeader } from "../src/lib/chapter-audio-core";

test("audio boundaries, signature tampering/expiry, formats and byte ranges", () => {
  const data = { chapterId: "chapter-1", audioId: "version-1", uid: "", expires: 5000 };
  const ticket = signAudioTicket(data, "test-only");
  assert.deepEqual(readAudioTicket(ticket, "test-only", 4999), data);
  assert.throws(() => readAudioTicket(ticket, "other", 1000));
  assert.throws(() => readAudioTicket(ticket, "test-only", 5000));
  assert.throws(() => readAudioTicket(`${ticket}.suffix`, "test-only", 1000));
  assert.equal(audioMime("ses.MP3", "audio/mpeg"), "audio/mpeg");
  assert.equal(audioMime("ses.m4a", "audio/x-m4a"), "audio/mp4");
  assert.throws(() => audioMime("ses.html", "audio/mpeg"));
  assert.throws(() => audioMime("ses.mp3", "text/html"));
  assert.equal(validAudioHeader(Buffer.from("<html>junk</html>"), "audio/mpeg"), false);
  assert.deepEqual(audioRange("bytes=10-19", 100), { start: 10, end: 19 });
  assert.deepEqual(audioRange("bytes=-10", 100), { start: 90, end: 99 });
  assert.deepEqual(audioRange("bytes=80-", 100), { start: 80, end: 99 });
  for (const range of ["bytes=100-", "bytes=8-2", "bytes=-0", "bytes=0-1,4-8", "items=0-3"]) assert.throws(() => audioRange(range, 100));
  assert.equal(canReadAudio({ status: "draft" }, { authorId: "owner", status: "published" }, ""), false);
  assert.equal(canReadAudio({ status: "draft" }, { authorId: "owner", status: "draft" }, "owner"), true);
  assert.equal(canReadAudio({ status: "published", isPaid: true }, { status: "published" }, ""), false);
});

let qa: Awaited<ReturnType<typeof startAudioQaServer>>;
let file: Buffer;
before(async () => {
  qa = await startAudioQaServer();
  file = await readFile(new URL("../../../generated-artifacts/audio-test.mp3", import.meta.url));
});
after(async () => {
  qa?.server.closeAllConnections();
  await new Promise<void>(resolve => qa?.server.close(() => resolve()));
});
const endpoint = "/api/chapter-audio/qa_audio_chapter";
const auth = (uid = "qa-audio-author") => ({ Authorization: `Bearer ${qa.tokens[uid]}` });
async function send(version: string, body = file, extra = {}) {
  return fetch(`${qa.url}${endpoint}`, { method: "PUT", headers: {
    ...auth(), "If-Match": version, "Content-Type": "audio/mpeg", "X-Audio-Name": encodeURIComponent("Deneme ses.mp3"), ...extra,
  }, body });
}
test("real emulators: upload, ownership, private storage, range, replacement, revocation and deletion", async () => {
  assert.deepEqual(await (await fetch(`${qa.url}${endpoint}`)).json(), { audio: null });
  const anonymous = await (await fetch("http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ returnSecureToken: true }),
  })).json();
  assert.equal((await fetch(`${qa.url}${endpoint}`, { headers: { Authorization: `Bearer ${anonymous.idToken}` } })).status, 200);
  const stranger = await send("none", file, auth("qa-audio-reader"));
  assert.equal(stranger.status, 403);
  const created = await send("none");
  assert.equal(created.status, 200, JSON.stringify(await created.clone().json()));
  const first = (await created.json()).audio;
  assert.equal(first.sizeBytes, file.length);
  const metadata = (await qa.db.collection("chapterAudio").doc("qa_audio_chapter").get()).data()!;
  const [objectMeta] = await qa.bucket.file(metadata.objectPath).getMetadata();
  assert.equal(objectMeta.metadata?.firebaseStorageDownloadTokens, undefined);
  const direct = await fetch(`http://127.0.0.1:19199/v0/b/demo-spektrum-qa.appspot.com/o/${encodeURIComponent(metadata.objectPath)}?alt=media`);
  assert.equal(direct.status, 403, "Direct unauthenticated Storage access must remain denied");
  const partial = await fetch(`${qa.url}${first.playbackUrl}`, { headers: { Range: "bytes=0-127" } });
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get("content-range"), `bytes 0-127/${file.length}`);
  assert.deepEqual(Buffer.from(await partial.arrayBuffer()), file.subarray(0, 128));
  const stale = await send("none");
  assert.equal(stale.status, 409);
  const invalid = await send(first.id, Buffer.from("<html>not an audio file at all</html>")).catch(() => null);
  // A streaming guard may close an incomplete HTTP upload instead of returning JSON.
  if (invalid) assert.equal(invalid.status, 415);
  assert.equal((await (await fetch(`${qa.url}${endpoint}`)).json()).audio.id, first.id);
  const oversized = await new Promise<number>(resolve => {
    const req = request(`${qa.url}${endpoint}`, { method: "PUT", headers: {
      ...auth(), "If-Match": first.id, "Content-Type": "audio/mpeg", "X-Audio-Name": "ses.mp3", "Content-Length": MAX_AUDIO_BYTES + 1,
    } }, res => { res.resume(); res.once("end", () => { resolve(res.statusCode!); req.destroy(); }); });
    req.on("error", () => {}); req.write("ID3"); req.end();
  });
  assert.equal(oversized, 413);
  const replacement = await send(first.id);
  assert.equal(replacement.status, 200);
  const second = (await replacement.json()).audio;
  assert.notEqual(second.id, first.id);
  assert.equal((await fetch(`${qa.url}${first.playbackUrl}`)).status, 404);
  assert.equal((await qa.bucket.file(metadata.objectPath).exists())[0], false);
  const publicAudio = (await (await fetch(`${qa.url}${endpoint}`)).json()).audio;
  await qa.db.collection("chapters").doc("qa_audio_chapter").update({ status: "draft" });
  assert.equal((await fetch(`${qa.url}${publicAudio.playbackUrl}`)).status, 403);
  assert.equal((await fetch(`${qa.url}${endpoint}`)).status, 403);
  assert.equal((await fetch(`${qa.url}${endpoint}`, { headers: auth() })).status, 200);
  await qa.db.collection("users").doc("qa-audio-author").update({ accountDeletionPending: true });
  assert.equal((await fetch(`${qa.url}${second.playbackUrl}`)).status, 403);
  await qa.db.collection("users").doc("qa-audio-author").update({ accountDeletionPending: false });
  assert.equal((await fetch(`${qa.url}${endpoint}`, { method: "DELETE", headers: { ...auth(), "If-Match": first.id } })).status, 409);
  assert.equal((await fetch(`${qa.url}${endpoint}`, { method: "DELETE", headers: { ...auth(), "If-Match": second.id } })).status, 204);
  assert.equal((await qa.bucket.getFiles({ prefix: "chapter-audio/qa-audio-author/" }))[0].length, 0);
  assert.equal((await fetch(`${qa.url}${second.playbackUrl}`)).status, 404);
  await qa.db.collection("chapters").doc("qa_audio_chapter").update({ status: "published" });
  assert.deepEqual(await (await fetch(`${qa.url}${endpoint}`)).json(), { audio: null });
});
