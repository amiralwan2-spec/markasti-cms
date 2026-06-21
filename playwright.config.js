// Playwright config for the full-app accessibility test (tests/a11y/).
// Serves the static app on :8080; the spec points the app at the Firebase
// emulators via ?emulator=1. Run via `npm run test:a11y` (wraps this in
// `firebase emulators:exec` so auth+firestore emulators are live). Needs Java.
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/a11y',
  timeout: 60000,
  use: {
    baseURL: 'http://127.0.0.1:8080',
    headless: true,
  },
  webServer: {
    command: 'npx --yes http-server public -p 8080 -s -c-1',
    url: 'http://127.0.0.1:8080',
    reuseExistingServer: true,
    timeout: 60000,
  },
});
