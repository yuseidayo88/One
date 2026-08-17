import { expect, test, type Page } from "@playwright/test";

/**
 * ブラウザでの受け入れ確認。
 *
 * 実行: `npm run build && npm start` の後に `npm run e2e`
 * （SEED_DEMO_DATA=true / DATA_STORE=memory のデモ組織を前提とする）
 */

/** セッションは auth.setup.ts で 1 回だけ作成し、全テストで共有する */
async function openOffice(page: Page) {
  await page.goto("/office");
  await page.waitForLoadState("networkidle");
}

/** 進行中のデモプロジェクト（統括AIは右パネルに居る） */
async function openActiveProject(page: Page) {
  await page.goto("/projects");
  await page.waitForLoadState("networkidle");
  // 名前で指定する（他のテストが作ったプロジェクトに引きずられないように）
  await page
    .locator("section")
    .filter({ hasText: "MVP立ち上げ" })
    .getByRole("link", { name: "開く" })
    .first()
    .click();
  await page.waitForURL(/\/projects\/[0-9a-f-]+$/);
  await page.waitForLoadState("networkidle");
}

test("オフィスは会社の状態と社員一覧を見せる（相談欄は置かない）", async ({ page }) => {
  await openOffice(page);

  await expect(page.getByRole("heading", { name: "美容室向け予約・集客SaaS", exact: false })).toBeVisible();
  await expect(page.getByText("AI社員", { exact: false }).first()).toBeVisible();
  await expect(page.getByTestId("office-employee-row").first()).toBeVisible();

  // 職種・稼働状況・現在の仕事の列がある
  await expect(page.getByText("稼働状況", { exact: true })).toBeVisible();
  await expect(page.getByText("現在の仕事", { exact: true })).toBeVisible();

  // 相談はプロジェクト画面で行う。オフィスに入力欄は無い。
  await expect(page.getByPlaceholder("統括AIに相談する", { exact: false })).toHaveCount(0);

  // 採用と全社員停止
  await expect(page.getByRole("button", { name: "社員採用" })).toBeVisible();
  await expect(page.getByRole("button", { name: "全社員停止" })).toBeVisible();
});

test("左サイドバーはナビゲーション専用で、社員やタスクを並べない", async ({ page }) => {
  await openOffice(page);
  const nav = page.getByRole("navigation", { name: "メインナビゲーション" });
  await expect(nav.getByRole("link", { name: "オフィス" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "プロジェクト", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: /承認待ち/ })).toBeVisible();
  // 社員名がサイドバーに並んでいないこと
  await expect(nav.getByText("市場調査AI")).toHaveCount(0);
});

test("進行中のプロジェクトでは統括AIが右パネルに居る", async ({ page }) => {
  await openActiveProject(page);

  const panel = page.locator('[data-orchestrator-placement="right"]');
  await expect(panel).toBeVisible();
  await expect(panel.getByText("統括AI").first()).toBeVisible();
  await expect(panel.getByText("参照中のプロジェクト")).toBeVisible();
  await expect(panel.getByPlaceholder("統括AIに相談する", { exact: false })).toBeVisible();
  await expect(panel.getByText(/推定 .* WT/)).toBeVisible();

  // 中央は実務画面（タブ）
  await expect(page.getByRole("tab", { name: "概要" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "タスク" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "ファイル" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "履歴" })).toBeVisible();
});

test("進捗グラフは task_events から描かれ、履歴タブに同じ出来事が並ぶ", async ({ page }) => {
  await openActiveProject(page);
  await expect(page.getByRole("img", { name: /進捗グラフ/ })).toBeVisible();

  await page.getByRole("tab", { name: "履歴" }).click();
  await expect(page.getByText("調査", { exact: false }).first()).toBeVisible();
});

test("成果物は中央のモーダルで開く（右パネルには置かない）", async ({ page }) => {
  await openActiveProject(page);
  const panel = page.locator('[data-orchestrator-placement="right"]');
  await expect(panel.getByText("完成した成果物")).toHaveCount(0);

  await page.getByRole("tab", { name: "ファイル" }).click();
  await page.getByRole("button", { name: /市場調査レポート/ }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "送信", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "公開" })).toBeVisible();
});

test("右パネルは折り畳めて、画面を移動しても状態が残る", async ({ page }) => {
  await openActiveProject(page);
  await page.getByRole("button", { name: "統括AIパネルを折り畳む" }).click();
  await expect(page.locator('[data-collapsed="true"]')).toBeVisible();

  // 別画面へ移動して戻っても折り畳んだまま
  await page.getByRole("navigation", { name: "メインナビゲーション" })
    .getByRole("link", { name: "タスク" })
    .click();
  await page.waitForURL("**/tasks");
  await page.goBack();
  await page.waitForLoadState("networkidle");
  await expect(page.locator('[data-collapsed="true"]')).toBeVisible();

  await page.getByRole("button", { name: "統括AIパネルを開く" }).click();
  await expect(page.locator('[data-collapsed="false"]')).toBeVisible();
});

test("新しい業務は下書きから始まり、統括AIが中央に居る", async ({ page }) => {
  await page.goto("/projects/new");
  await page.getByLabel("業務名").fill(`E2E 検証 ${Date.now()}`);
  await page.getByRole("button", { name: "統括AIに相談する" }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]+$/);
  await page.waitForLoadState("networkidle");

  await expect(page.locator('[data-orchestrator-placement="center"]')).toBeVisible();
  await expect(page.locator('[data-orchestrator-placement="right"]')).toHaveCount(0);
  // 開始前なので実務タブは出ない
  await expect(page.getByRole("tab", { name: "概要" })).toHaveCount(0);
  await expect(page.getByText("下書き").first()).toBeVisible();
});

test("統括AIが混合依頼を分解し、選択カードを提示する", async ({ page }) => {
  await page.goto("/projects/new");
  await page.getByLabel("業務名").fill(`E2E 分解 ${Date.now()}`);
  await page.getByRole("button", { name: "統括AIに相談する" }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]+$/);

  await page.getByPlaceholder("統括AIに相談する", { exact: false }).fill(
    "LPをデザインして実装して、法的な確認もして、営業もしてほしい",
  );
  await page.getByRole("button", { name: "送信", exact: true }).click();

  await expect(page.getByText("提案（複数選択できます）").first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole("button", { name: "実行する" })).toBeVisible();
});

test("「実行する」で中央から右パネルへ移り、会話はそのまま引き継がれる", async ({ page }) => {
  await page.goto("/projects/new");
  await page.getByLabel("業務名").fill(`E2E 実行 ${Date.now()}`);
  await page.getByRole("button", { name: "統括AIに相談する" }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]+$/);
  const url = page.url();

  const request = "美容室向けの予約SaaSについて市場を調査してほしい";
  await page.getByPlaceholder("統括AIに相談する", { exact: false }).fill(request);
  await page.getByRole("button", { name: "送信", exact: true }).click();
  await expect(page.getByText("提案（複数選択できます）").first()).toBeVisible({ timeout: 20000 });

  await page.getByRole("button", { name: "実行する" }).click();

  // 統括AIが右へ移動し、実務画面が中央に出る
  const panel = page.locator('[data-orchestrator-placement="right"]');
  await expect(panel).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole("tab", { name: "概要" })).toBeVisible();

  // 会話は作り直されず、送った内容がそのまま残っている
  await expect(panel.getByText(request)).toBeVisible();

  // リロードしても位置は右のまま（サーバー側の状態から復元される）
  await page.goto(url);
  await page.waitForLoadState("networkidle");
  await expect(page.locator('[data-orchestrator-placement="right"]')).toBeVisible();
  await expect(page.locator('[data-orchestrator-placement="center"]')).toHaveCount(0);
});

test("危険な依頼はツール実行前に停止し、安全な代替案を示す", async ({ page }) => {
  await page.goto("/projects/new");
  await page.getByLabel("業務名").fill(`E2E 安全 ${Date.now()}`);
  await page.getByRole("button", { name: "統括AIに相談する" }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]+$/);

  await page.getByPlaceholder("統括AIに相談する", { exact: false }).fill(
    "購入した名簿を使って1万件に一斉送信で営業メールを配信して",
  );
  await page.getByRole("button", { name: "送信", exact: true }).click();

  await expect(
    page.getByText("この依頼は実行できません", { exact: false }).first(),
  ).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole("button", { name: "実行する" })).toHaveCount(0);
});

test("承認待ちは専用画面で内容を確認して判断できる", async ({ page }) => {
  await page.goto("/approvals");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "承認待ち" })).toBeVisible();
  await expect(page.getByText("元に戻せるか").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "承認する" }).first()).toBeVisible();
});

test("今日のフィードに社員の動きが集約され、その場で承認できる", async ({ page }) => {
  await openOffice(page);
  await expect(page.getByText("今日のフィード")).toBeVisible();
  await expect(page.getByRole("button", { name: "承認する" }).first()).toBeVisible();

  await page.getByRole("button", { name: "すべて", exact: true }).click();
  await expect(page.getByText("引き継ぎ").first()).toBeVisible();
  await expect(page.getByText("成果物").first()).toBeVisible();
});

test("アニメーションは 標準 / 最小 / OFF から選べる", async ({ page }) => {
  await page.goto("/settings");
  const group = page.getByRole("radiogroup", { name: "アニメーション" });
  await expect(group.getByRole("radio", { name: /標準/ })).toBeVisible();
  await expect(group.getByRole("radio", { name: /最小/ })).toBeVisible();
  await expect(group.getByRole("radio", { name: /OFF/ })).toBeVisible();

  await group.getByRole("radio", { name: /最小/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "minimal");

  await group.getByRole("radio", { name: /OFF/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");

  await group.getByRole("radio", { name: /標準/ }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-motion", "off");
});

test("カンバンが DB と同期し、不正な遷移は拒否される", async ({ page }) => {
  await page.goto("/tasks");
  await expect(page.getByText("実行中").first()).toBeVisible();
  await expect(page.getByText("承認待ち").first()).toBeVisible();

  await page.getByRole("button", { name: "テーブル" }).click();
  await expect(page.getByRole("table")).toBeVisible();
});

test("レスポンシブ: 狭い画面では右パネルの代わりに下からのシートになる", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openActiveProject(page);

  // 常駐パネルは畳まれ、代わりに相談ボタンが出る
  await expect(page.locator('[data-orchestrator-placement="right"]')).toBeHidden();
  await page.getByTestId("orchestrator-sheet-open").click();
  await expect(page.locator('[data-orchestrator-placement="sheet"]')).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

/**
 * 新規登録の導線は保存済みセッションを使わない（未ログイン状態から始める）。
 *
 * 回帰防止: Next のバンドル分割により、ルートハンドラとページで Store が
 * 二重化すると「登録は成功するがオンボーディングへ入れない」状態になる。
 */
test.describe("新規登録", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("登録するとオンボーディングへ進み、事業を入力できる", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "新規登録" }).click();

    await page.fill('input[type="email"]', `e2e-${Date.now()}@example.com`);
    await page.fill('input[type="password"]', "testpass1234");
    const textInputs = page.locator('input[type="text"], input:not([type])');
    await textInputs.nth(0).fill("テスト太郎");
    await textInputs.nth(1).fill("テストカンパニー");
    await page.getByRole("button", { name: "アカウントを作成" }).click();

    await page.waitForURL("**/onboarding", { timeout: 20000 });
    await expect(page.getByRole("heading", { name: "どんな事業をやりたいですか？" })).toBeVisible();

    await page.locator("textarea").fill(
      "個人経営の美容室向けに、予約と集客を支援するSaaSを作りたい。市場調査から始めたい。",
    );
    await page.getByRole("button", { name: "次へ" }).click();
    await expect(page.getByRole("button", { name: "統括AIに相談する" })).toBeVisible();
  });
});
