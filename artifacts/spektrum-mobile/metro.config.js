const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const fs = require("node:fs");
const { createHash } = require("node:crypto");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// pnpm workspace: Metro'ya hem lokal hem workspace root node_modules'ü göster
config.watchFolders = [...new Set([...(config.watchFolders ?? []), workspaceRoot])];

// A local compiler change must invalidate already-transformed screen modules.
config.cacheVersion = createHash("sha256")
  .update(config.cacheVersion ?? "")
  .update(fs.readFileSync(path.join(workspaceRoot, "lib/spektrum-i18n/babel.cjs")))
  .digest("hex");

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
