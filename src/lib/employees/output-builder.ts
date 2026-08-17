import type { ArtifactType, RoleKey } from "@/lib/core/types";
import { ROLE_DEFINITIONS } from "@/lib/roles/registry";
import type { EmployeeOutput } from "@/lib/orchestrator/schema";

/**
 * 社員の成果物を決定論的に生成する（Mock モード）。
 *
 * 実 LLM 接続時はこのモジュールを置き換えるのではなく、
 * 「出力形式のテンプレート」として同じ構造を要求する。
 */

export interface OutputContext {
  roleKey?: RoleKey;
  employeeName?: string;
  taskTitle?: string;
  taskDescription?: string;
  businessSummary?: string;
  targetCustomer?: string;
}

const ARTIFACT_TYPE_BY_ROLE: Record<RoleKey, ArtifactType> = {
  director: "document",
  market_research: "research_report",
  marketing: "marketing_plan",
  sales: "sales_list",
  designer: "ui_design",
  engineer: "code",
  assistant: "document",
  legal: "legal_document",
  finance: "financial_model",
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function section(title: string, body: string): string {
  return `## ${title}\n\n${body}\n`;
}

function bullets(items: string[]): string {
  return items.map((i) => `- ${i}`).join("\n");
}

function marketResearch(ctx: OutputContext): string {
  const biz = ctx.businessSummary ?? "対象事業";
  return [
    `# 市場調査レポート\n`,
    `> 確認日: ${today()} / 作成: ${ctx.employeeName ?? "市場調査社員"}\n`,
    `> 本レポートは **事実**（出典あり）と **推測**（社員による解釈）を区別して記載しています。\n`,
    section(
      "1. 調査対象",
      `${biz}\n\n想定顧客: ${ctx.targetCustomer ?? "未確定（本調査で仮説を提示）"}`,
    ),
    section(
      "2. 市場規模（推計）",
      bullets([
        "**推測**: 対象セグメントの事業者数から、初期に到達可能な母集団は数千〜数万規模と見込まれます。",
        "**推測**: 1事業者あたりの月額支払い意思は 3,000〜10,000円 のレンジが現実的です。",
        "**事実確認が必要**: 公的統計（経済センサス等）で事業者数を確認してください。",
      ]),
    ),
    section(
      "3. 競合",
      [
        "| 競合 | 強み | 弱み | 価格帯 |",
        "| --- | --- | --- | --- |",
        "| 大手汎用ツール | 機能が広い / 信頼性 | 業種特化していない / 設定が重い | 中〜高 |",
        "| 業種特化サービス | 導入が早い | 機能が限定的 | 低〜中 |",
        "| 手作業・紙・電話 | コストゼロ | 抜け漏れ・時間消費 | ― |",
        "",
        "**推測**: 「業種特化 × 導入の軽さ」に空きがあります。",
      ].join("\n"),
    ),
    section(
      "4. 顧客課題（仮説）",
      bullets([
        "本業の合間に事務作業が発生し、対応が後回しになる",
        "既存ツールは多機能すぎて設定しきれない",
        "効果が数字で見えないため継続の判断ができない",
      ]),
    ),
    section(
      "5. 次に検証すべきこと",
      bullets([
        "想定顧客 5〜10 件へのインタビューで課題の実在を確認する",
        "現在の代替手段と、それに費やしている時間を計測する",
        "提示価格に対する支払い意思を確認する",
      ]),
    ),
    section(
      "6. 情報源",
      bullets([
        "公的統計（要確認）: 事業者数・市場規模",
        "競合公式サイト（要確認）: 価格・機能",
        "※ 本 Mock 実行では外部検索を行っていないため、URL は接続後に自動付与されます。",
      ]),
    ),
  ].join("\n");
}

function marketingPlan(ctx: OutputContext): string {
  return [
    `# マーケティング戦略\n`,
    `> 作成日: ${today()} / 作成: ${ctx.employeeName ?? "マーケティング社員"}\n`,
    section(
      "1. ペルソナ",
      bullets([
        "**主要ペルソナ**: 個人〜少人数で事業を運営し、集客と事務を1人で兼任している経営者",
        "**課題**: 時間が足りず、施策の効果測定ができていない",
        "**情報接触**: 検索、SNS、同業者の口コミ",
      ]),
    ),
    section(
      "2. ポジショニング",
      "「多機能な汎用ツール」ではなく「その業種の業務がそのまま回る、設定のいらない仕組み」として位置づけます。",
    ),
    section(
      "3. 価値提案",
      bullets([
        "導入初日から使える（設定作業ほぼゼロ）",
        "本業の時間を削らない",
        "効果が数字で見える",
      ]),
    ),
    section(
      "4. 集客チャネルと優先順位",
      [
        "| 優先 | チャネル | 狙い | 初月の目標 |",
        "| --- | --- | --- | --- |",
        "| 1 | 検索（記事） | 顕在層の獲得 | 記事 8 本 / 流入 500 |",
        "| 2 | SNS | 認知と信頼構築 | 投稿 20 本 |",
        "| 3 | 紹介 | 成約率が高い | 紹介 5 件 |",
      ].join("\n"),
    ),
    section(
      "5. KPI",
      bullets([
        "訪問数 → 無料登録率 5%",
        "無料登録 → 有料転換率 10%",
        "解約率 月 5% 以下",
      ]),
    ),
    section("6. 次アクション", bullets(["LP の構成案をデザイナーへ依頼", "記事テーマ 8 本の確定"])),
  ].join("\n");
}

function salesPlan(ctx: OutputContext): string {
  return [
    `# 営業戦略・営業リスト\n`,
    `> 作成日: ${today()} / 作成: ${ctx.employeeName ?? "営業社員"}\n`,
    section(
      "1. ターゲット条件",
      bullets([
        "従業員 1〜5 名の事業者",
        "現在は手作業または汎用ツールで運用",
        "Web サイトまたは SNS アカウントを保有（=情報発信の意欲がある）",
      ]),
    ),
    section(
      "2. リード評価基準（スコアリング）",
      [
        "| 項目 | 配点 |",
        "| --- | --- |",
        "| 課題の顕在化 | 40 |",
        "| 予算感の一致 | 30 |",
        "| 意思決定の速さ | 20 |",
        "| 導入時期の近さ | 10 |",
      ].join("\n"),
    ),
    section(
      "3. 営業リスト（雛形）",
      [
        "| 会社名 | 担当 | 接点 | スコア | 次アクション |",
        "| --- | --- | --- | --- | --- |",
        "| （調査後に自動入力） | ― | ― | ― | 初回メール下書き |",
        "",
        "※ リストは**同意または正当な公開情報**に基づいてのみ作成します。名簿の購入・無差別収集は行いません。",
      ].join("\n"),
    ),
    section(
      "4. 初回メール下書き",
      [
        "件名: 〇〇の業務を1日30分減らすご提案",
        "",
        "本文:",
        "はじめまして。〇〇と申します。",
        "同業の方から「予約管理と集客の両立が大変」という声を伺い、ご連絡しました。",
        "同じ課題をお持ちであれば、15分ほどで現状をお伺いできればと思います。",
        "不要でしたらこのメールは破棄してください。今後のご案内も停止いたします。",
        "",
        "**この下書きは送信していません。送信にはユーザーの承認が必要です。**",
      ].join("\n"),
    ),
  ].join("\n");
}

function designSpec(ctx: OutputContext): string {
  return [
    `# UI/UX デザイン仕様\n`,
    `> 作成日: ${today()} / 作成: ${ctx.employeeName ?? "デザイナー"}\n`,
    section(
      "1. 画面構成（LP）",
      bullets([
        "ヒーロー: 一文の価値提案 + 主要CTA",
        "課題提示: 3点",
        "解決方法: 画面キャプチャ + 3ステップ",
        "料金: 3プラン比較",
        "FAQ / 導入事例 / 最終CTA",
      ]),
    ),
    section(
      "2. デザイン方針",
      bullets([
        "余白を広く取り、1画面1メッセージ",
        "彩度は抑え、CTA にのみアクセントカラー",
        "本文 16px / 行間 1.8 / 最大幅 720px",
      ]),
    ),
    section(
      "3. コンポーネント",
      [
        "| 要素 | 仕様 |",
        "| --- | --- |",
        "| ボタン | 高さ 44px / 角丸 10px / 主要1色 |",
        "| カード | 境界線 1px / 影は最小限 |",
        "| フォーム | ラベル常時表示 / エラーは入力直下 |",
      ].join("\n"),
    ),
    section("4. 引き継ぎ", "実装はプログラマー社員へ引き継ぎます（本仕様＋アセット一式）。"),
  ].join("\n");
}

function engineeringPlan(ctx: OutputContext): string {
  return [
    `# 技術設計・実装計画\n`,
    `> 作成日: ${today()} / 作成: ${ctx.employeeName ?? "プログラマー"}\n`,
    section(
      "1. 要件",
      bullets(["認証（メール）", "予約作成・変更・キャンセル", "顧客一覧", "通知メール（承認後に送信）"]),
    ),
    section(
      "2. 技術構成",
      bullets([
        "Next.js App Router + TypeScript",
        "Supabase (Auth / Postgres / Storage / Realtime / RLS)",
        "Cloudflare へデプロイ（Preview → Production）",
      ]),
    ),
    section(
      "3. データベース設計（案）",
      [
        "```sql",
        "create table reservations (",
        "  id uuid primary key default gen_random_uuid(),",
        "  organization_id uuid not null references organizations(id) on delete cascade,",
        "  customer_id uuid not null references customers(id),",
        "  starts_at timestamptz not null,",
        "  status text not null check (status in ('booked','done','cancelled')),",
        "  created_at timestamptz not null default now()",
        ");",
        "alter table reservations enable row level security;",
        "```",
      ].join("\n"),
    ),
    section(
      "4. テスト",
      bullets(["予約の重複が作成できないこと", "他組織の予約が取得できないこと", "キャンセル後に枠が解放されること"]),
    ),
    section(
      "5. 公開前チェックリスト",
      bullets([
        "RLS が全テーブルで有効",
        "秘密情報がクライアントへ含まれない",
        "エラー監視の設定",
        "**本番公開はユーザー承認後にのみ実行**",
      ]),
    ),
  ].join("\n");
}

function legalReport(ctx: OutputContext): string {
  return [
    `# 法務・コンプライアンス調査\n`,
    `> 確認日: ${today()} / 作成: ${ctx.employeeName ?? "法務・コンプライアンス調査社員"}\n`,
    `> **本内容は一般的な調査情報であり、法的助言ではありません。必要に応じて弁護士等の専門家へご確認ください。**\n`,
    section(
      "1. 関連する可能性のある法規",
      bullets([
        "個人情報保護法（顧客情報の取得・保管・第三者提供）",
        "特定商取引法（通信販売の表示義務）",
        "特定電子メール法（広告メールのオプトイン・表示義務）",
        "景品表示法（優良誤認・有利誤認の禁止）",
        "資金決済法（前払式支払手段に該当する場合）",
      ]),
    ),
    section(
      "2. 必要になり得る対応",
      bullets([
        "プライバシーポリシーの整備と同意取得の導線",
        "特定商取引法に基づく表記の掲載",
        "広告メールへの配信停止導線の明示",
        "外部送信規律（Cookie 等）への対応",
      ]),
    ),
    section(
      "3. コンプライアンスチェックリスト",
      [
        "- [ ] 利用規約・プライバシーポリシーを掲載した",
        "- [ ] 個人情報の利用目的を明示した",
        "- [ ] 広告メールはオプトインのみに送信している",
        "- [ ] 効果効能の断定的表現を使っていない",
        "- [ ] 委託先との契約に安全管理措置を含めた",
      ].join("\n"),
    ),
    section(
      "4. 専門家へ確認すべき項目",
      bullets([
        "取り扱うデータが要配慮個人情報に該当するか",
        "事業形態が許認可を要するか",
        "利用規約の免責条項の有効性",
      ]),
    ),
  ].join("\n");
}

function financeModel(ctx: OutputContext): string {
  return [
    `# 収支計画・料金設計\n`,
    `> 作成日: ${today()} / 作成: ${ctx.employeeName ?? "財務・経理サポート社員"}\n`,
    `> **本内容は一般的な情報整理であり、税務・会計上の助言ではありません。必要に応じて税理士・会計士へご確認ください。**\n`,
    section(
      "1. 料金設計（案）",
      [
        "| プラン | 月額 | 想定利用者 |",
        "| --- | --- | --- |",
        "| Light | 2,980円 | 1人運営 |",
        "| Standard | 5,980円 | スタッフ数名 |",
        "| Pro | 9,800円 | 複数店舗 |",
      ].join("\n"),
    ),
    section(
      "2. 損益シミュレーション（12か月）",
      [
        "| 月 | 有料顧客 | 売上 | 原価 | 粗利 |",
        "| --- | --- | --- | --- | --- |",
        "| 3 | 10 | 59,800 | 12,000 | 47,800 |",
        "| 6 | 35 | 209,300 | 42,000 | 167,300 |",
        "| 12 | 90 | 538,200 | 108,000 | 430,200 |",
        "",
        "前提: 平均単価 5,980円 / 原価率 20% / 解約率 月5%",
      ].join("\n"),
    ),
    section(
      "3. キャッシュフロー上の注意",
      bullets(["初期3か月は広告費が先行する", "年払い導入で運転資金が改善する", "固定費は月10万円以内に抑える"]),
    ),
    section("4. KPI", bullets(["MRR", "解約率", "CAC 回収期間（目標 6か月以内）"])),
  ].join("\n");
}

function assistantDoc(ctx: OutputContext): string {
  return [
    `# 業務整理メモ\n`,
    `> 作成日: ${today()} / 作成: ${ctx.employeeName ?? "事務・秘書社員"}\n`,
    section(
      "1. 今週やること",
      bullets(["調査レポートの確認", "LP 構成案のレビュー", "営業リストの承認"]),
    ),
    section("2. 保留中", bullets(["ドメイン取得の判断", "料金プランの最終確定"])),
    section("3. リマインダー", bullets(["金曜: 週次の進捗確認", "月初: 前月の使用量確認"])),
  ].join("\n");
}

function directorDoc(ctx: OutputContext): string {
  return [
    `# 進捗サマリー\n`,
    `> 作成日: ${today()} / 作成: ${ctx.employeeName ?? "統括AI"}\n`,
    section("現在の状況", ctx.businessSummary ?? "事業の初期立ち上げ段階です。"),
    section("次の判断", bullets(["調査結果に基づき、最初の顧客セグメントを1つに絞る"])),
  ].join("\n");
}

const BUILDERS: Record<RoleKey, (ctx: OutputContext) => string> = {
  director: directorDoc,
  market_research: marketResearch,
  marketing: marketingPlan,
  sales: salesPlan,
  designer: designSpec,
  engineer: engineeringPlan,
  assistant: assistantDoc,
  legal: legalReport,
  finance: financeModel,
};

export function buildEmployeeOutput(
  _requestText: string,
  rawContext: Record<string, unknown>,
): EmployeeOutput {
  const ctx = rawContext as OutputContext;
  const roleKey = ctx.roleKey ?? "director";
  const role = ROLE_DEFINITIONS[roleKey];
  const content = BUILDERS[roleKey](ctx);

  return {
    title: ctx.taskTitle ?? `${role.name}の成果物`,
    summary: `${role.name}社員が「${ctx.taskTitle ?? role.name}」を完了しました。`,
    contentMarkdown: content,
    citations:
      roleKey === "market_research" || roleKey === "legal"
        ? [{ title: "（接続後に外部検索の出典が入ります）", url: "", checkedAt: today() }]
        : [],
    artifactType: ARTIFACT_TYPE_BY_ROLE[roleKey],
    followUpSuggestions:
      roleKey === "market_research"
        ? ["調査結果をもとにマーケティング戦略を作成する", "顧客インタビューの設計を依頼する"]
        : roleKey === "designer"
          ? ["デザインをもとに実装をプログラマーへ依頼する"]
          : [],
    disclaimer: role.disclaimer ?? "",
  };
}
