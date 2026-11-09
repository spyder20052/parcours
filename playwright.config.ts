import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 60_000,
  fullyParallel: false,
  use: { baseURL: "http://localhost:3000", locale: "fr-FR", timezoneId: "Europe/Paris" },
  webServer: { command: "npm run dev", url: "http://localhost:3000/connexion", reuseExistingServer: true, timeout: 120_000 },
});
