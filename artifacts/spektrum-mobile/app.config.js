const base = require("./app.json");

module.exports = {
  expo: {
    ...base.expo,
    extra: {
      apiBase: process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : "",
    },
  },
};
