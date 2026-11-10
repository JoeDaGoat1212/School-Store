// Extra build settings on top of app.json.
const fs = require("fs");
const path = require("path");
const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");

// The release build shrinks the code (R8). WorkManager, which runs the
// background message check, makes its database by reflection, so tell the
// shrinker to keep it (without this the app closes as soon as it opens).
const KEEP = `
# Firebirds Nest: WorkManager (expo-background-task) builds its Room database by reflection.
-keep class androidx.work.** { *; }
-keep class * extends androidx.room.RoomDatabase { <init>(); }
-keep class androidx.room.** { *; }
`;

const withKeepRules = (config) =>
  withDangerousMod(config, [
    "android",
    async (c) => {
      const file = path.join(c.modRequest.platformProjectRoot, "app", "proguard-rules.pro");
      const now = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
      if (!now.includes("Firebirds Nest: WorkManager")) fs.writeFileSync(file, now + KEEP);
      return c;
    },
  ]);

// For automated tests only: when APP_TEST_API is set (the test branch's build),
// the app talks to a fake store on the test computer instead of the real
// website. Real builds (from main) never set it.
const withTestServer = (config, url) =>
  withAndroidManifest({ ...config, extra: { ...config.extra, apiUrl: url } }, (m) => {
    m.modResults.manifest.application[0].$["android:usesCleartextTraffic"] = "true";
    return m;
  });

// Instant notifications: Firebase's settings file for this app, when it's been
// added (mobile/google-services.json, from the Firebase console). Without it
// the app still works and checks for messages itself.
const withFirebase = (config) => {
  const file = path.join(__dirname, "google-services.json");
  return fs.existsSync(file) ? { ...config, android: { ...config.android, googleServicesFile: "./google-services.json" } } : config;
};

module.exports = ({ config }) => {
  const withRules = withKeepRules(withFirebase(config));
  const test = process.env.APP_TEST_API;
  return test ? withTestServer(withRules, test) : withRules;
};
