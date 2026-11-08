import assert from "node:assert/strict";
import { rm } from "node:fs/promises";

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:18081",
  "Refusing cleanup without the explicit loopback emulator.");
for (const project of ["demo-spektrum-qa", "demo-spektrum-qa-web", "demo-spektrum-qa-rules"]) {
  assert.ok(project.startsWith("demo-"));
  const response = await fetch(`http://127.0.0.1:18081/emulator/v1/projects/${project}/databases/(default)/documents`, {
    method: "DELETE",
  });
  assert.equal(response.ok, true);
  const auth = await fetch(`http://127.0.0.1:19099/emulator/v1/projects/${project}/accounts`, { method: "DELETE" });
  assert.equal(auth.ok, true);
}
await rm("/tmp/spektrum-qa-browser-fixture.json", { force: true });
console.log("Disposable demo projects, Auth accounts and temporary credential manifest removed.");
