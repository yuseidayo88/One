import { chromium } from "@playwright/test";
import fs from "node:fs";

/**
 * 画面構成の変更を確認するためのスクリーンショット。
 *
 *  before: プロジェクト開始前（統括AIが中央）
 *  after : プロジェクト開始後（統括AIが右パネル、中央は実務タブ）
 */

const OUT = "/home/user/One/screenshots";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({
  viewport: { width: 1512, height: 950 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
await page.fill('input[type="email"]', "founder@example.com");
await page.fill('input[type="password"]', "demo1234");
await page.click('button[type="submit"]');
await page.waitForURL("**/office", { timeout: 20000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/20-office-roster.png` });

// ── before: 開始前（統括AIが中央）─────────────────────
await page.goto("http://localhost:3000/projects/new", { waitUntil: "networkidle" });
await page.getByLabel("業務名").fill("美容室向け予約SaaS の集客立ち上げ");
await page.getByRole("button", { name: "統括AIに相談する" }).click();
await page.waitForURL(/\/projects\/[0-9a-f-]+$/, { timeout: 20000 });
await page.waitForLoadState("networkidle");

await page
  .getByPlaceholder("統括AIに相談する")
  .fill("開業3か月の美容室の集客を増やしたい。市場を調べて、LPを作って、SNSの運用計画も立ててほしい。");
await page.getByRole("button", { name: "送信", exact: true }).click();
await page.getByText("提案（複数選択できます）").first().waitFor({ timeout: 25000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/21-orchestrator-center-before.png` });

// ── after: 実行後（統括AIが右パネル）───────────────────
await page.getByRole("button", { name: "実行する" }).click();
await page.locator('[data-orchestrator-placement="right"]').waitFor({ timeout: 25000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/22-orchestrator-right-after.png` });

// モバイル: 右パネルの代わりに下からのシート
const url = page.url();
const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  storageState: await ctx.storageState(),
});
const mp = await mobile.newPage();
await mp.goto(url, { waitUntil: "networkidle" });
await mp.waitForTimeout(1200);
await mp.getByTestId("orchestrator-sheet-open").click();
await mp.waitForTimeout(800);
await mp.screenshot({ path: `${OUT}/23-orchestrator-sheet-mobile.png` });

const overflow = await mp.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
console.log("mobile horizontal overflow px:", overflow);
console.log("console errors:", errors.length ? errors : "none");

await browser.close();
