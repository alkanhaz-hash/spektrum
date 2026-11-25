import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const app = JSON.parse(readFileSync(new URL("artifacts/spektrum-mobile/app.json", root), "utf8"));
const forbidden = [
  "READ_MEDIA_IMAGES",
  "READ_MEDIA_VIDEO",
  "READ_MEDIA_VISUAL_USER_SELECTED",
  "READ_EXTERNAL_STORAGE",
  "WRITE_EXTERNAL_STORAGE",
];
for (const name of forbidden) {
  const permission = `android.permission.${name}`;
  assert(!app.expo.android.permissions.includes(permission), `${name} must not be requested`);
  assert(app.expo.android.blockedPermissions.includes(permission), `${name} must be blocked`);
}

const screens = [
  "components/MobileStatusBar.tsx",
  "app/chat/[id].tsx",
  "app/(tabs)/write.tsx",
  "app/(tabs)/profile.tsx",
];
for (const screen of screens) {
  const path = new URL(`artifacts/spektrum-mobile/${screen}`, root);
  const source = ts.createSourceFile(fileURLToPath(path), readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let pickerCount = 0;
  const visit = (node, excludesAndroid = false) => {
    if (ts.isIfStatement(node) && node.expression.getText(source) === 'Platform.OS !== "android"') {
      visit(node.thenStatement, true);
      if (node.elseStatement) visit(node.elseStatement, excludesAndroid);
      return;
    }
    if (ts.isCallExpression(node)) {
      const name = node.expression.getText(source);
      if (name === "ImagePicker.requestMediaLibraryPermissionsAsync") {
        assert(excludesAndroid, `${screen}: Android must not request gallery permissions`);
      }
      if (name === "ImagePicker.launchImageLibraryAsync") {
        pickerCount++;
        assert(!node.arguments.some(arg => /\blegacy\s*:\s*true\b/.test(arg.getText(source))), `${screen}: use the system picker`);
      }
    }
    ts.forEachChild(node, child => visit(child, excludesAndroid));
  };
  visit(source);
  assert(pickerCount > 0, `${screen}: image selection must remain available`);
}
console.log("Android photo permission checks passed for config and all image selection screens.");
