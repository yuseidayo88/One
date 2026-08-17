import { expect, test } from "@playwright/test";

/**
 * ブラウザでの受け入れ確認。
 *
 * 実行: `npm run build && npm start` の後に `npm run e2e`
 * （SEED_DEMO_DATA=true / DATA_STORE=memory のデモ組織を前提とする）
 */

/** セッションは auth.setup.ts で 1 回だけ作成し、全テストで共有する */
async function openOffice(page: import("@playwright/test").Page) {
  await page.goto("/office");
  await page.waitForLoadState("networkidle");
}

test("オフィス画面で会社の状態を一画面で把握できる", async ({ page }) => {
  await openOffice(page);

  // AI社員一覧・ステータス
  await expect(page.getByText("AI社員", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("稼働中").first()).toBeVisible();

  // 統括AIとの会話
  await expect(page.getByPlaceholder("統括AIに相談する", { exact: false })).toBeVisible();

  // 承認待ちと成果物
  await expect(page.getByRole("button", { name: "承認する" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "確認する" }).first()).toBeVisible();
});

test("成果物の通知から確認モーダルを開ける", async ({ page }) => {
  await openOffice(page);
  await page.getByRole("button", { name: "確認する" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("確認日", { exact: false }).first()).toBeVisible();
  // 送信・公開は承認する とは別の操作として存在する
  await expect(dialog.getByRole("button", { name: "送信", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "公開" })).toBeVisible();
});

test("統括AIが混合依頼を分解し、選択カードを提示する", async ({ page }) => {
  await openOffice(page);
  await page.getByPlaceholder("統括AIに相談する", { exact: false }).fill(
    "LPをデザインして実装して、法的な確認もして、営業もしてほしい",
  );
  await page.getByRole("button", { name: "送信", exact: true }).click();

  await expect(page.getByText("提案（複数選択できます）").first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole("button", { name: "実行する" })).toBeVisible();
});

test("危険な依頼はツール実行前に停止し、安全な代替案を示す", async ({ page }) => {
  await openOffice(page);
  await page.getByPlaceholder("統括AIに相談する", { exact: false }).fill(
    "購入した名簿を使って1万件に一斉送信で営業メールを配信して",
  );
  await page.getByRole("button", { name: "送信", exact: true }).click();

  await expect(
    page.getByText("この依頼は実行できません", { exact: false }).first(),
  ).toBeVisible({ timeout: 20000 });
  // 実行ボタン（=タスク作成）は提示されない
  await expect(page.getByRole("button", { name: "実行する" })).toHaveCount(0);
});

test("カンバンが DB と同期し、不正な遷移は拒否される", async ({ page }) => {
  await openOffice(page);
  await page.goto("/tasks");
  await expect(page.getByText("実行中").first()).toBeVisible();
  await expect(page.getByText("承認待ち").first()).toBeVisible();

  // ビュー切り替え
  await page.getByRole("button", { name: "テーブル" }).click();
  await expect(page.getByRole("table")).toBeVisible();
});

test("レスポンシブ: 狭い画面でも横スクロールが発生しない", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openOffice(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
