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
  // オフィスは「会社の状態と社員一覧」。相談欄はここには無い。
  await expect(page.getByTestId("office-employee-row").first()).toBeVisible();
  await page.context().storageState({ path: STORAGE_STATE });
});
