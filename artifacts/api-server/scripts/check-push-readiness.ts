// Read-only cloud inspection. Never print credentials, access tokens, or native config keys.
import { adminAuth } from "../src/lib/firebase-admin";
import { getMessaging } from "firebase-admin/messaging";
const app = adminAuth().app;
const token = await app.options.credential!.getAccessToken();
const project = (app.options.credential as unknown as { projectId?: string }).projectId;
if (!project) throw new Error("Firebase proje kimliği bulunamadı.");
for (const [label, url] of [
  ["androidApps", `https://firebase.googleapis.com/v1beta1/projects/${project}/androidApps`],
  ["billing", `https://cloudbilling.googleapis.com/v1/projects/${project}/billingInfo`],
]) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token.access_token}` } });
  const data = await response.json();
  if (!response.ok) { console.log(JSON.stringify({ check: label, status: response.status, reason: data.error?.status })); continue; }
  if (label === "billing") console.log(JSON.stringify({ check: label, billingEnabled: data.billingEnabled }));
  else console.log(JSON.stringify({ check: label, apps: (data.apps ?? []).map((a: { name: string; packageName: string }) => ({ name: a.name, packageName: a.packageName })) }));
}
try {
  // validate_only + a fake token: never contacts a real device.
  await getMessaging(app).send({ token: "disposable-validation-token-not-a-real-device", notification: { title: "SPEKTRUM", body: "Validation only" } }, true);
  console.log(JSON.stringify({ check: "fcmValidateOnly", accepted: true }));
} catch (e) {
  console.log(JSON.stringify({ check: "fcmValidateOnly", code: (e as { code?: string }).code ?? "unknown" }));
}
