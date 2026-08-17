import { test as setup, expect } from "@playwright/test";
import { STORAGE_STATE } from "./constants";

/**
 * ログインは 1 回だけ行い、セッションを全テストで共有する。
 * （/api/auth/login はレート制限（既定 10 回/分）が有効なため、
 *   テストごとにログインすると意図した制限に自分でかかる）
 */
setup("ログインしてセッションを保存する", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[type="email"]', "founder@example.com");
  await page.fill('input[type="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/office");
  await expect(page.getByPlaceholder("統括AIに相談する", { exact: false })).toBeVisible();
  await page.context().storageState({ path: STORAGE_STATE });
});
