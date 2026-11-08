import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { adminAuth } from "../src/lib/firebase-admin";
const app = adminAuth().app;
const project = (app.options.credential as unknown as { projectId: string }).projectId;
const access = await app.options.credential!.getAccessToken();
const origin = "https://firebase.googleapis.com/v1beta1";
async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(`${origin}/${path}`, { ...init, headers: { Authorization: `Bearer ${access.access_token}`, "Content-Type": "application/json" } });
  const body = await res.json();
  if (!res.ok) throw new Error(`Firebase management ${res.status}: ${body.error?.status ?? "unknown"}`);
  return body;
}
const packageName = "com.alkanhaz.spektrum";
const apps = await api(`projects/${project}/androidApps`);
let native = apps.apps?.find((a: { packageName: string }) => a.packageName === packageName);
if (!native) {
  if (!process.argv.includes("--create")) throw new Error("Android kaydı yok. Oluşturmak için --create gerekir.");
  let operation = await api(`projects/${project}/androidApps`, { method: "POST", body: JSON.stringify({ packageName, displayName: "SPEKTRUM Android (Play)" }) });
  for (let i = 0; !operation.done && i < 40; i++) {
    await new Promise(r => setTimeout(r, 500)); operation = await api(operation.name);
  }
  if (operation.error || !operation.done) throw new Error(`Android kaydı oluşturulamadı: ${operation.error?.code ?? "timeout"}`);
  native = operation.response;
}
const config = await api(`${native.name}/config`);
const contents = Buffer.from(config.configFileContents, "base64").toString("utf8");
const parsed = JSON.parse(contents);
if (parsed.project_info?.project_id !== project || !parsed.client?.some((c: any) => c.client_info?.android_client_info?.package_name === packageName)) throw new Error("Android/Firebase paket eşleşmesi doğrulanamadı.");
const destination = resolve("../spektrum-mobile/assets/firebase/google-services.play.json");
await mkdir(resolve(destination, ".."), { recursive: true });
await writeFile(destination, `${JSON.stringify(parsed, null, 2)}\n`);
console.log(JSON.stringify({ prepared: true, packageName, file: "assets/firebase/google-services.play.json", note: "Public native client configuration; no service-account key" }));
