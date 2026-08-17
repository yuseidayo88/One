import fs from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import { STORAGE_STATE } from "./e2e/constants";

/**
 * 同梱ブラウザがある環境ではそれを使う（再ダウンロードしない）。
 * 無い場合は Playwright の既定解決に任せる。
 */
const BUNDLED_CHROMIUM = "/opt/pw-browsers/chromium";
const executablePath = fs.existsSync(BUNDLED_CHROMIUM) ? BUNDLED_CHROMIUM : undefined;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      dependencies: ["setup"],
    },
  ],
});
