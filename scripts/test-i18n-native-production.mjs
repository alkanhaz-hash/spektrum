import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../artifacts/spektrum-mobile");
const mobileRequire = createRequire(path.join(mobileRoot, "package.json"));
const nativeRequire = createRequire(mobileRequire.resolve("react-native/package.json"));
const babel = mobileRequire("@babel/core");
const translations = {
  Hikayeler: "Stories",
  "Burada Yaşar": "Come to life here",
  Profil: "Profile",
};

function productionModule(source, filename, locale = "tr") {
  const translate = value => locale === "en" ? translations[value] ?? value : value;
  const code = babel.transformSync(source, {
    filename,
    configFile: path.join(mobileRoot, "babel.config.js"),
    babelrc: false,
    envName: "production",
    caller: { name: "metro", platform: "android", supportsStaticESM: false },
  }).code;
  const mocks = {
    "@/contexts/LocaleContext": {
      useLocale: () => ({ locale, t: translate }),
      useUiTranslation: () => ({ locale, ui: translate }),
    },
    "react-native": {
      View: "View", Text: "Text", TouchableOpacity: "TouchableOpacity",
      FlatList: "FlatList", Image: "Image", RefreshControl: "RefreshControl",
      ActivityIndicator: "ActivityIndicator", ScrollView: "ScrollView",
      StyleSheet: { create: value => value },
      Dimensions: { get: () => ({ width: 400, height: 800 }) },
    },
    "expo-linear-gradient": { LinearGradient: "LinearGradient" },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    "expo-router": { router: { push() {} } },
    "@expo/vector-icons": { Feather: "Feather" },
    "@/hooks/useColors": { useColors: () => ({ primary: "#000", border: "#ddd" }) },
    "@/contexts/AuthContext": { useAuth: () => ({ user: null }) },
    "@/lib/firestore-service": { GENRES: [] },
    "@/components/MobileStatusBar": { __esModule: true, default: "MobileStatusBar" },
    "@workspace/spektrum-i18n": { translateGenre: (_locale, genre) => genre },
  };
  const result = { exports: {} };
  new Function("require", "module", "exports", code)(
    id => Object.hasOwn(mocks, id) ? mocks[id] :
      id.startsWith("@babel/runtime/") ? nativeRequire(id) : mobileRequire(id),
    result,
    result.exports,
  );
  return result.exports;
}

function textOf(element) {
  if (element == null || typeof element === "boolean") return "";
  if (typeof element !== "object") return String(element);
  if (Array.isArray(element)) return element.map(textOf).join("");
  return textOf(element.props?.children);
}

test("real home hero renders after the full Expo production transform", () => {
  const filename = path.join(mobileRoot, "app/(tabs)/index.tsx");
  const source = `${readFileSync(filename, "utf8")}\nexport { HeroSection };`;
  for (const locale of ["tr", "en"]) {
    const { HeroSection } = productionModule(source, filename, locale);
    const rendered = HeroSection();
    assert.match(textOf(rendered), locale === "tr" ? /Hikayeler Burada Yaşar/ : /Stories Come to life here/);
  }
});

test("injected translation hook survives Expo CommonJS and destructuring transforms", () => {
  const filename = path.join(mobileRoot, "app/i18n-production-fixture.tsx");
  const { Screen } = productionModule(`
    import { Text } from "react-native";
    export function Screen() { return <Text>Profil</Text>; }
  `, filename, "en");
  assert.equal(textOf(Screen()), "Profile");
});
