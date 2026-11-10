// Adds one thing to app.json for automated tests only: when APP_TEST_API is
// set (the test branch's build), the app talks to a fake server on the test
// computer instead of the real website. Real builds (from main) never set it.
const { withAndroidManifest } = require("expo/config-plugins");

module.exports = ({ config }) => {
  const test = process.env.APP_TEST_API;
  if (!test) return config;
  const withCleartext = (c) =>
    withAndroidManifest(c, (m) => {
      m.modResults.manifest.application[0].$["android:usesCleartextTraffic"] = "true";
      return m;
    });
  return withCleartext({ ...config, extra: { ...config.extra, apiUrl: test } });
};
