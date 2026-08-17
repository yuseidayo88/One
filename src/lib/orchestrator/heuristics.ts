import type { ApprovalAction, Capability, RoleKey } from "@/lib/core/types";

/**
 * 決定論的なタスク分解ルール。
 *
 * 役割:
 *  - Mock モード（APIキー無し）でも、統括AIのタスク分解が実際に動くようにする。
 *  - 実 LLM 接続時も、LLM 出力の検証・補完に使う（提案された職種が
 *    Role Policy 上ありえない場合の是正など）。
 */

export interface DecompositionRule {
  id: string;
  /** この仕事を表すキーワード */
  patterns: RegExp[];
  role: RoleKey;
  capability: Capability;
  title: string;
  description: string;
  approvals: ApprovalAction[];
  estimatedDurationMinutes: number;
  estimatedWorkTokens: number;
  /** 依存する他ルールの id */
  dependsOn: string[];
}

export const DECOMPOSITION_RULES: DecompositionRule[] = [
  {
    id: "market_research",
    patterns: [/市場/, /調査/, /競合/, /リサーチ/, /ニーズ/, /トレンド/, /顧客(の)?課題/, /需要/],
    role: "market_research",
    capability: "market_research",
    title: "市場・競合調査",
    description:
      "市場規模、競合、顧客課題、トレンドを調査し、確認日と情報源を明記した出典付きレポートを作成します。事実と推測は区別します。",
    approvals: [],
    estimatedDurationMinutes: 45,
    estimatedWorkTokens: 9_000,
    dependsOn: [],
  },
  {
    id: "marketing_strategy",
    patterns: [/マーケ/, /集客/, /ペルソナ/, /ポジショニング/, /広告/, /SNS/, /コンテンツ/, /認知/, /LP.*(コピー|文言)/],
    role: "marketing",
    capability: "persona",
    title: "マーケティング戦略・ペルソナ設計",
    description:
      "ペルソナ、ポジショニング、価値提案、集客チャネル、コンテンツ企画、KPI を設計します。",
    approvals: [],
    estimatedDurationMinutes: 40,
    estimatedWorkTokens: 8_000,
    dependsOn: ["market_research"],
  },
  {
    id: "sales_strategy",
    patterns: [/営業/, /セールス/, /商談/, /見込み客/, /リード/, /提案書/, /アポ/, /BtoB/],
    role: "sales",
    capability: "sales_strategy",
    title: "営業戦略・営業リスト作成",
    description:
      "ターゲット条件の定義、見込み客の調査、リード評価、営業リストと提案書の作成、メール下書きまでを行います。送信は行いません。",
    approvals: ["email_send"],
    estimatedDurationMinutes: 50,
    estimatedWorkTokens: 10_000,
    dependsOn: ["marketing_strategy"],
  },
  {
    id: "design",
    patterns: [/デザイン/, /UI/, /UX/, /LP/, /ランディング/, /ワイヤー/, /ブランド/, /ロゴ/, /バナー/, /画像/],
    role: "designer",
    capability: "ux_design",
    title: "UI/UX・LPデザイン",
    description:
      "情報設計、ワイヤーフレーム、デザイン仕様、ブランド方向性をまとめます。実装はプログラマーへ引き継ぎます。",
    approvals: [],
    estimatedDurationMinutes: 60,
    estimatedWorkTokens: 12_000,
    dependsOn: ["marketing_strategy"],
  },
  {
    id: "engineering",
    patterns: [/実装/, /開発/, /コード/, /プログラ/, /アプリ/, /サイト/, /Web/, /システム/, /データベース/, /API/, /公開/, /デプロイ/],
    role: "engineer",
    capability: "coding",
    title: "実装・プレビュー環境構築",
    description:
      "要件整理、技術設計、実装、テスト、プレビュー環境の準備までを隔離環境で行います。本番公開は承認後に実行します。",
    approvals: ["publish_production"],
    estimatedDurationMinutes: 120,
    estimatedWorkTokens: 25_000,
    dependsOn: ["design"],
  },
  {
    id: "legal",
    patterns: [/法的/, /法律/, /法務/, /規約/, /プライバシー/, /コンプライアンス/, /許認可/, /規制/, /個人情報/],
    role: "legal",
    capability: "legal_research",
    title: "法務・コンプライアンス調査",
    description:
      "関連法規、必要な許認可、規制リスクを調査し、利用規約・プライバシーポリシーの下書きとチェックリストを作成します。",
    approvals: [],
    estimatedDurationMinutes: 45,
    estimatedWorkTokens: 9_000,
    dependsOn: [],
  },
  {
    id: "finance",
    patterns: [/財務/, /経理/, /予算/, /損益/, /売上予測/, /キャッシュ/, /料金/, /価格/, /原価/, /KPI.*(数値|目標)/],
    role: "finance",
    capability: "budgeting",
    title: "収支計画・料金設計",
    description:
      "予算、売上予測、損益シミュレーション、キャッシュフロー、料金設計を作成します。税務判断や資金移動は行いません。",
    approvals: [],
    estimatedDurationMinutes: 40,
    estimatedWorkTokens: 8_000,
    dependsOn: [],
  },
  {
    id: "assistant",
    patterns: [/スケジュール/, /議事録/, /メール.*(分類|整理)/, /書類/, /文書/, /整形/, /リマインド/, /事務/],
    role: "assistant",
    capability: "task_organization",
    title: "情報整理・事務オペレーション",
    description:
      "タスク整理、文書整形、メール分類、リマインダー設定など、事務業務を整えます。メール送信は承認後に行います。",
    approvals: ["email_send"],
    estimatedDurationMinutes: 25,
    estimatedWorkTokens: 4_000,
    dependsOn: [],
  },
];

export interface MatchedWork {
  rule: DecompositionRule;
  matchedTerms: string[];
}

/** 依頼文から必要な仕事を抽出する */
export function decomposeRequest(text: string): MatchedWork[] {
  const matched: MatchedWork[] = [];
  for (const rule of DECOMPOSITION_RULES) {
    const terms = rule.patterns.filter((p) => p.test(text)).map((p) => p.source);
    if (terms.length > 0) matched.push({ rule, matchedTerms: terms });
  }
  return matched;
}

/**
 * 依頼が「その社員の担当範囲」に収まっているかを判定する。
 * 収まらない部分は引き継ぎ対象になる。
 */
export function splitOwnAndForeign(
  text: string,
  ownRole: RoleKey,
): { own: MatchedWork[]; foreign: MatchedWork[] } {
  const all = decomposeRequest(text);
  return {
    own: all.filter((m) => m.rule.role === ownRole),
    foreign: all.filter((m) => m.rule.role !== ownRole),
  };
}

/** 最初に検証すべき仮説の雛形 */
export function defaultHypotheses(businessSummary: string): string[] {
  return [
    `想定顧客が、${businessSummary.slice(0, 40)}に対して実際に課題を感じている`,
    "現在の代替手段（手作業・既存ツール）に明確な不満がある",
    "提示する価格帯で支払い意思がある",
  ];
}

/** 事業内容から最初に必要になりやすい職種 */
export function recommendInitialRoles(text: string): RoleKey[] {
  const matched = decomposeRequest(text);
  const roles = new Set<RoleKey>(matched.map((m) => m.rule.role));
  // 最低限のスターティングメンバー
  roles.add("market_research");
  if (/(サービス|SaaS|アプリ|サイト|プロダクト)/.test(text)) roles.add("engineer");
  if (roles.size < 3) roles.add("marketing");
  return [...roles];
}
