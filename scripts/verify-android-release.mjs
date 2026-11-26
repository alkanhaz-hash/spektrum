import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// Read the compiled AAB, not app.json. AAB manifests use aapt2's XmlNode
// protobuf schema (frameworks/base/tools/aapt2/Resources.proto).
const [aab, expectedVersion = "2.0.7", expectedCode = "28"] = process.argv.slice(2);
if (!aab) throw new Error("Usage: node scripts/verify-android-release.mjs <release.aab> [version] [versionCode]");
const names = execFileSync("unzip", ["-Z1", aab], { encoding: "utf8" }).trim().split("\n");
const extract = name => execFileSync("unzip", ["-p", aab, name], { maxBuffer: 150 * 1024 * 1024 });

function varint(data, offset) {
  let value = 0n;
  for (let shift = 0n; shift <= 63n; shift += 7n) {
    assert(offset < data.length, "Truncated protobuf varint");
    const byte = data[offset++];
    value |= BigInt(byte & 127) << shift;
    if (!(byte & 128)) return [Number(value), offset];
  }
  throw new Error("Invalid protobuf varint");
}
function fields(data) {
  const result = [];
  let offset = 0;
  while (offset < data.length) {
    let tag, value;
    [tag, offset] = varint(data, offset);
    const wire = tag & 7;
    assert(tag >>> 3, "Invalid protobuf field");
    if (wire === 0) [value, offset] = varint(data, offset);
    else if (wire === 2) {
      let size;
      [size, offset] = varint(data, offset);
      assert(offset + size <= data.length, "Truncated protobuf field");
      value = data.subarray(offset, offset + size);
      offset += size;
    } else if (wire === 1 || wire === 5) {
      const size = wire === 1 ? 8 : 4;
      assert(offset + size <= data.length);
      value = data.subarray(offset, offset + size);
      offset += size;
    } else throw new Error(`Unsupported protobuf wire type ${wire}`);
    result.push({ number: tag >>> 3, value });
  }
  return result;
}
const get = (message, number) => message.find(f => f.number === number)?.value;
const all = (message, number) => message.filter(f => f.number === number).map(f => f.value);
const string = bytes => bytes?.toString("utf8") ?? "";
function xmlNode(data) {
  const element = get(fields(data), 1);
  if (!element) return null; // text nodes
  const message = fields(element);
  const attributes = {};
  for (const attrBytes of all(message, 4)) {
    const attr = fields(attrBytes);
    const ns = string(get(attr, 1));
    const name = string(get(attr, 2));
    let value = get(attr, 3);
    if (value !== undefined) value = string(value);
    else {
      const item = get(attr, 6);
      const primitive = item && get(fields(item), 7);
      const primitiveFields = primitive && fields(primitive);
      value = primitiveFields ? String(get(primitiveFields, 6) ?? get(primitiveFields, 7) ?? get(primitiveFields, 8)) : "";
    }
    attributes[ns === "http://schemas.android.com/apk/res/android" ? `android:${name}` : name] = value;
  }
  return { name: string(get(message, 3)), attributes, children: all(message, 5).map(xmlNode).filter(Boolean) };
}
const manifests = names.filter(n => n.endsWith("/manifest/AndroidManifest.xml")).map(n => ({ name: n, root: xmlNode(extract(n)) }));
assert(manifests.length, "No Android manifests in AAB");
const base = manifests.find(m => m.name === "base/manifest/AndroidManifest.xml")?.root;
assert.equal(base?.name, "manifest", "Compiled protobuf manifest must decode");
assert.equal(base.attributes.package, "com.alkanhaz.spektrum");
assert.equal(base.attributes["android:versionName"], expectedVersion);
assert.equal(base.attributes["android:versionCode"], expectedCode);
const flatten = node => [node, ...node.children.flatMap(flatten)];
const elements = manifests.flatMap(m => flatten(m.root));
const permissions = elements.filter(e => e.name.startsWith("uses-permission")).map(e => e.attributes["android:name"]);
const forbidden = [
  "READ_MEDIA_IMAGES", "READ_MEDIA_VIDEO", "READ_MEDIA_VISUAL_USER_SELECTED",
  "READ_EXTERNAL_STORAGE", "WRITE_EXTERNAL_STORAGE", "RECEIVE_BOOT_COMPLETED",
  "RECORD_AUDIO", "FOREGROUND_SERVICE_MICROPHONE",
];
for (const p of forbidden) assert(!permissions.includes(`android.permission.${p}`), `Compiled AAB requests ${p}`);
for (const p of ["INTERNET", "CAMERA", "POST_NOTIFICATIONS", "FOREGROUND_SERVICE", "FOREGROUND_SERVICE_MEDIA_PLAYBACK"]) {
  assert(permissions.includes(`android.permission.${p}`), `Missing needed ${p}`);
}
const actions = elements.filter(e => e.name === "action").map(e => e.attributes["android:name"]);
assert(!actions.some(a => /BOOT_COMPLETED|QUICKBOOT_POWERON|\.REBOOT$/.test(a)), "AAB must not receive reboot broadcasts");
const services = elements.filter(e => e.name === "service");
assert(!services.some(s => s.attributes["android:name"].endsWith(".AudioRecordingService")), "Unused recording service remains");
assert(services.some(s => s.attributes["android:name"] === "expo.modules.audio.service.AudioControlsService"
  && s.attributes["android:foregroundServiceType"] === "mediaPlayback"), "Media playback service must remain");
assert(services.some(s => s.attributes["android:name"] === "expo.modules.notifications.service.ExpoFirebaseMessagingService"), "FCM service must remain");
assert(actions.includes("com.google.firebase.MESSAGING_EVENT"), "Push delivery action must remain");
assert(actions.includes("expo.modules.notifications.NOTIFICATION_EVENT"), "Notification handling must remain");

// A mapping alone is not a runtime test, but proves the native release actually
// ran R8 and renamed code. Never substitute an app.json flag for binary evidence.
const mappingName = names.find(n => /\/proguard\.map$/.test(n));
assert(mappingName, "No R8 obfuscation mapping in compiled AAB");
const mapping = extract(mappingName).toString("utf8");
const classMappings = [...mapping.matchAll(/^(\S+) -> (\S+):$/gm)];
assert(classMappings.length, "Empty R8 mapping");
const renamedClasses = classMappings.filter(([, original, renamed]) => original !== renamed).length;
assert(renamedClasses > 100, "Expected meaningful native code obfuscation");
const dexNames = names.filter(n => /\/dex\/classes\d*\.dex$/.test(n));
assert(dexNames.length, "No native DEX code");
let dexBytes = 0;
const critical = new Map([
  ["Lexpo/modules/kotlin/types/AnyTypeCache;", false],
  ["Lexpo/modules/kotlin/AppContext;", false],
  ["Lexpo/modules/audio/AudioModule;", false],
  ["Lexpo/modules/notifications/NotificationsPackage;", false],
]);
for (const name of dexNames) {
  const dex = extract(name);
  assert(dex.subarray(0, 4).equals(Buffer.from("dex\n")), "Invalid DEX magic");
  dexBytes += dex.length;
  // Validate type definitions, not just arbitrary string occurrences.
  const stringCount = dex.readUInt32LE(56), stringOffset = dex.readUInt32LE(60);
  const typeCount = dex.readUInt32LE(64), typeOffset = dex.readUInt32LE(68);
  const classCount = dex.readUInt32LE(96), classOffset = dex.readUInt32LE(100);
  for (let i = 0; i < classCount; i++) {
    const typeIndex = dex.readUInt32LE(classOffset + 32 * i);
    assert(typeIndex < typeCount);
    const stringIndex = dex.readUInt32LE(typeOffset + 4 * typeIndex);
    assert(stringIndex < stringCount);
    const dataOffset = dex.readUInt32LE(stringOffset + 4 * stringIndex);
    const [, start] = varint(dex, dataOffset); // DEX ULEB128 UTF-16 string length
    const end = dex.indexOf(0, start);
    assert(end >= start);
    const descriptor = dex.toString("utf8", start, end);
    if (critical.has(descriptor)) critical.set(descriptor, true);
  }
}
for (const [name, present] of critical) assert(present, `Native startup class stripped or renamed: ${name}`);
console.log(JSON.stringify({
  status: "passed",
  package: base.attributes.package,
  version: expectedVersion,
  versionCode: expectedCode,
  sha256: createHash("sha256").update(readFileSync(aab)).digest("hex"),
  permissions,
  rebootActions: [],
  recordingService: false,
  mediaPlaybackService: true,
  remotePushService: true,
  r8Mapping: mappingName,
  renamedClasses,
  totalMappedClasses: classMappings.length,
  dexBytes,
  startupClassDefinitions: Object.fromEntries(critical),
  limitation: "Play Console scores, device startup, gallery selection, push delivery and background audio still require runtime/store verification.",
}, null, 2));
