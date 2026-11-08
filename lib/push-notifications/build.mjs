import { build } from "esbuild";
await build({
  entryPoints: ["src/index.ts"], outfile: "dist/index.cjs",
  platform: "node", target: "node22", format: "cjs", bundle: true,
  external: ["firebase-admin", "firebase-admin/*", "firebase-functions", "firebase-functions/*"],
});
