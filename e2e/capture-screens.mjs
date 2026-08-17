import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "/home/user/One/screenshots";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1512, height: 950 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
await page.screenshot({ path: `${OUT}/01-login.png` });

await page.fill('input[type="email"]', "founder@example.com");
await page.fill('input[type="password"]', "demo1234");
await page.click('button[type="submit"]');
await page.waitForURL("**/office", { timeout: 20000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/02-office.png` });

// 成果物モーダル
const confirm = page.getByRole("button", { name: "確認する" }).first();
if (await confirm.count()) {
  await confirm.click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/03-artifact-modal.png` });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
}

// 社員 Inspector
const firstEmployee = page.locator("aside button").first();
await firstEmployee.click();
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/04-office-inspector.png` });

for (const [name, path] of [
  ["05-tasks-kanban", "/tasks"],
  ["06-employees", "/employees"],
  ["07-projects", "/projects"],
  ["08-knowledge", "/knowledge"],
  ["09-usage", "/usage"],
  ["10-integrations", "/integrations"],
  ["11-settings", "/settings"],
  ["12-admin", "/admin"],
]) {
  await page.goto(`http://localhost:3000${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

// タスク詳細モーダル
await page.goto("http://localhost:3000/tasks", { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await page.locator('[role="button"]').first().click();
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/13-task-detail.png` });

// レスポンシブ（モバイル）
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, storageState: await ctx.storageState() });
const mp = await mobile.newPage();
await mp.goto("http://localhost:3000/office", { waitUntil: "networkidle" });
await mp.waitForTimeout(2000);
await mp.screenshot({ path: `${OUT}/14-office-mobile.png` });
await mp.goto("http://localhost:3000/tasks", { waitUntil: "networkidle" });
await mp.waitForTimeout(1000);
await mp.screenshot({ path: `${OUT}/15-tasks-mobile.png` });

// 横スクロール（レイアウト崩れ）チェック
const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log("mobile horizontal overflow px:", overflow);

// オンボーディング（新規ユーザー）
const fresh = await browser.newContext({ viewport: { width: 1512, height: 950 }, deviceScaleFactor: 2 });
const fp = await fresh.newPage();
fp.on("pageerror", (e) => errors.push(`onboarding pageerror: ${e.message}`));
await fp.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
await fp.click('button:has-text("新規登録")');
await fp.fill('input[type="email"]', `new-${Date.now()}@example.com`);
await fp.fill('input[type="password"]', "testpass1234");
const textInputs = fp.locator('input[type="text"], input:not([type])');
await textInputs.nth(0).fill("テスト太郎");
await textInputs.nth(1).fill("テストカンパニー");
await fp.click('button[type="submit"]');
await fp.waitForURL("**/onboarding", { timeout: 20000 });
await fp.waitForTimeout(1000);
await fp.screenshot({ path: `${OUT}/16-onboarding-step1.png` });

await fp.fill("textarea", "個人経営の美容室向けに、予約と集客を支援するSaaSを作りたい。市場を調査して、集客戦略とLPデザイン、実装まで進めたい。");
await fp.click('button:has-text("次へ")');
await fp.waitForTimeout(700);
await fp.screenshot({ path: `${OUT}/17-onboarding-step2.png` });

await fp.click('button:has-text("統括AIに相談する")');
await fp.waitForTimeout(2500);
await fp.screenshot({ path: `${OUT}/18-onboarding-proposals.png`, fullPage: true });

await fp.click('button:has-text("実行する")');
await fp.waitForURL("**/office", { timeout: 25000 });
await fp.waitForTimeout(3000);
await fp.screenshot({ path: `${OUT}/19-office-after-execute.png` });

console.log("console errors:", errors.length ? errors : "none");
await browser.close();
