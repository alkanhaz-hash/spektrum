module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
    plugins: [require.resolve("../../lib/spektrum-i18n/babel.cjs")],
  };
};
