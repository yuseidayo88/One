import type {
  ApprovalAction,
  ArtifactType,
  Capability,
  DataScope,
  ProhibitedAction,
  RoleKey,
  ToolName,
} from "@/lib/core/types";

/**
 * Role Registry — 職種テンプレート定義（バージョン管理対象）。
 * 初期リリースはこの 9 職種を固定。カスタム社員は作らないが、
 * この Registry へ追加するだけで将来拡張できる構造にする。
 */
export const ROLE_REGISTRY_VERSION = "2026-08-17.1";

export interface RoleDefinition {
  key: RoleKey;
  name: string;
  headline: string;
  description: string;
  /** 粒子アニメーションの見た目（職種ごとに色と動きの性質を変える） */
  particle: {
    hue: string;
    accent: string;
    motion: "orbit" | "radar" | "wave" | "vector" | "curve" | "grid" | "align" | "shield" | "pulse";
  };
  allowedCapabilities: Capability[];
  allowedTools: ToolName[];
  allowedDataScopes: DataScope[];
  allowedArtifactTypes: ArtifactType[];
  prohibitedActions: ProhibitedAction[];
  approvalRequiredActions: ApprovalAction[];
  /** 担当外を検知したときに引き継ぎ候補として優先する職種 */
  handoffPreference: RoleKey[];
  defaultSpecialty: string;
  disclaimer?: string;
}

const COMMON_TOOLS: ToolName[] = ["llm_generate", "memory_write", "file_write"];

export const ROLE_DEFINITIONS: Record<RoleKey, RoleDefinition> = {
  director: {
    key: "director",
    name: "統括AI",
    headline: "会社の司令塔",
    description:
      "事業を理解し、仕事を分解し、担当社員を決め、見積もりと承認をユーザーから取得する。専門作業は自分で実行せず、必ず担当社員へ割り振る。",
    particle: { hue: "#dbeafe", accent: "#7aa2ff", motion: "orbit" },
    allowedCapabilities: [
      "business_understanding",
      "task_decomposition",
      "assignment",
      "estimation",
      "approval_request",
      "progress_summary",
    ],
    allowedTools: [...COMMON_TOOLS],
    allowedDataScopes: ["org_profile", "business", "project", "own_memory", "shared_memory", "tasks", "artifacts"],
    allowedArtifactTypes: ["document"],
    prohibitedActions: ["legal_advice", "investment_decision", "auto_fund_movement", "unapproved_external_send"],
    approvalRequiredActions: ["high_cost_run"],
    handoffPreference: [],
    defaultSpecialty: "経営全般",
  },

  market_research: {
    key: "market_research",
    name: "市場調査",
    headline: "事実と出典で意思決定を支える",
    description:
      "市場規模・競合・顧客課題・トレンド・海外事例を調査し、確認日・情報源・事実・推測を区別した出典付きレポートを作成する。",
    particle: { hue: "#a5f3fc", accent: "#22d3ee", motion: "radar" },
    allowedCapabilities: [
      "market_research",
      "competitor_analysis",
      "customer_research",
      "trend_research",
      "interview_design",
    ],
    allowedTools: [...COMMON_TOOLS, "web_search", "web_fetch"],
    allowedDataScopes: ["business", "project", "own_memory", "shared_memory", "artifacts"],
    allowedArtifactTypes: ["research_report", "competitor_matrix", "csv", "document"],
    prohibitedActions: ["false_claims", "unapproved_external_send"],
    approvalRequiredActions: [],
    handoffPreference: ["marketing", "director"],
    defaultSpecialty: "国内市場・競合調査",
    disclaimer: "調査結果には確認日と情報源を明記し、事実と推測を区別しています。",
  },

  marketing: {
    key: "marketing",
    name: "マーケティング",
    headline: "誰に何をどう伝えるかを設計する",
    description:
      "ペルソナ・ポジショニング・価値提案・集客戦略・コンテンツ企画・SNS投稿案・広告案・LPコピー・KPI設計を担当する。営業先への直接送信やCRM更新は営業社員へ引き継ぐ。",
    particle: { hue: "#fbcfe8", accent: "#f472b6", motion: "wave" },
    allowedCapabilities: [
      "persona",
      "positioning",
      "content_planning",
      "ad_copy",
      "landing_copy",
      "kpi_design",
      "marketing_analytics",
    ],
    allowedTools: [...COMMON_TOOLS, "web_search", "social_post", "ads_publish"],
    allowedDataScopes: ["business", "project", "own_memory", "shared_memory", "artifacts"],
    allowedArtifactTypes: ["marketing_plan", "document", "csv"],
    prohibitedActions: ["spam_bulk_outreach", "false_claims", "unapproved_external_send"],
    approvalRequiredActions: ["social_post", "ads_publish"],
    handoffPreference: ["sales", "designer", "director"],
    defaultSpecialty: "初期集客・コンテンツ",
  },

  sales: {
    key: "sales",
    name: "営業",
    headline: "見込み客を見つけ、商談を用意する",
    description:
      "見込み客調査・リード評価・営業戦略・営業リスト・提案書・メール下書き・フォローアップ案・CRM整理・商談準備を担当する。営業以外の仕事は行わず、統括AIを通して適切な社員へ引き継ぐ。",
    particle: { hue: "#fde68a", accent: "#f59e0b", motion: "vector" },
    allowedCapabilities: [
      "lead_research",
      "lead_scoring",
      "sales_strategy",
      "sales_list",
      "proposal_writing",
      "email_drafting",
      "crm_organization",
    ],
    allowedTools: [...COMMON_TOOLS, "web_search", "email_draft", "email_send", "crm_write"],
    allowedDataScopes: ["business", "project", "own_memory", "shared_memory", "artifacts", "contacts"],
    allowedArtifactTypes: ["sales_list", "proposal", "email_draft", "csv", "document"],
    prohibitedActions: ["spam_bulk_outreach", "impersonation", "false_claims", "unapproved_external_send"],
    approvalRequiredActions: ["email_send", "pii_external_send"],
    handoffPreference: ["marketing", "designer", "engineer", "legal", "director"],
    defaultSpecialty: "新規開拓",
  },

  designer: {
    key: "designer",
    name: "デザイナー",
    headline: "体験と見た目を形にする",
    description:
      "UI/UX・ワイヤーフレーム・デザイン仕様・ブランド方向性・画像生成・バナー・SNSクリエイティブ・絵コンテを担当する。本番コードの実装はプログラマーへ引き継ぐ。",
    particle: { hue: "#e9d5ff", accent: "#a855f7", motion: "curve" },
    allowedCapabilities: [
      "ux_design",
      "wireframe",
      "design_spec",
      "brand_direction",
      "image_generation",
      "video_storyboard",
    ],
    allowedTools: [...COMMON_TOOLS, "image_generate", "video_generate"],
    allowedDataScopes: ["business", "project", "own_memory", "shared_memory", "artifacts"],
    allowedArtifactTypes: ["ui_design", "image", "video", "document", "pdf"],
    prohibitedActions: ["impersonation", "unapproved_external_send"],
    approvalRequiredActions: ["high_cost_run"],
    handoffPreference: ["engineer", "marketing", "director"],
    defaultSpecialty: "プロダクトUI",
  },

  engineer: {
    key: "engineer",
    name: "プログラマー",
    headline: "動くものを作る",
    description:
      "要件整理・技術設計・コーディング・DB設計・テスト・バグ修正・プレビュー環境・デプロイ準備を担当する。コードは隔離環境で扱い、本番変更・公開・ドメイン変更・破壊的操作は必ず承認を取る。",
    particle: { hue: "#bbf7d0", accent: "#22c55e", motion: "grid" },
    allowedCapabilities: [
      "requirements",
      "technical_design",
      "coding",
      "database_design",
      "testing",
      "bugfix",
      "preview_environment",
      "deploy_preparation",
    ],
    allowedTools: [
      ...COMMON_TOOLS,
      "web_search",
      "web_fetch",
      "code_write",
      "code_run_sandbox",
      "db_migration_plan",
      "db_migration_apply",
      "deploy_preview",
      "deploy_production",
      "dns_update",
    ],
    allowedDataScopes: ["business", "project", "own_memory", "shared_memory", "artifacts", "tasks"],
    allowedArtifactTypes: ["code", "website", "app_preview", "database_schema", "published_url", "document"],
    prohibitedActions: ["production_destructive", "unapproved_external_send"],
    approvalRequiredActions: ["publish_production", "production_db_change", "dns_update", "data_deletion"],
    handoffPreference: ["designer", "legal", "director"],
    defaultSpecialty: "Web / SaaS 実装",
  },

  assistant: {
    key: "assistant",
    name: "事務・秘書",
    headline: "情報と時間を整える",
    description:
      "スケジュール整理・会議メモ・タスク整理・メール分類・返信下書き・文書整形・データ入力・リマインダー・社内情報整理を担当する。初期設定ではメールを自動送信せず、下書き後に承認を求める。",
    particle: { hue: "#e5e7eb", accent: "#9ca3af", motion: "align" },
    allowedCapabilities: [
      "scheduling",
      "meeting_notes",
      "task_organization",
      "email_triage",
      "document_formatting",
      "data_entry",
      "reminder",
    ],
    allowedTools: [...COMMON_TOOLS, "email_draft", "email_send"],
    allowedDataScopes: ["org_profile", "business", "project", "own_memory", "shared_memory", "tasks", "artifacts"],
    allowedArtifactTypes: ["document", "email_draft", "csv", "pdf"],
    prohibitedActions: ["unapproved_external_send", "spam_bulk_outreach"],
    approvalRequiredActions: ["email_send"],
    handoffPreference: ["director"],
    defaultSpecialty: "業務オペレーション",
  },

  legal: {
    key: "legal",
    name: "法務・コンプライアンス調査",
    headline: "リスクを先に見つける",
    description:
      "関連法規の調査・利用規約/プライバシーポリシーの下書き・規制リスクの洗い出し・必要な許認可の調査・コンプライアンスチェックリスト・専門家へ確認すべき項目の整理を担当する。",
    particle: { hue: "#c7d2fe", accent: "#6366f1", motion: "shield" },
    allowedCapabilities: [
      "legal_research",
      "policy_drafting",
      "regulatory_risk",
      "license_research",
      "compliance_checklist",
    ],
    allowedTools: [...COMMON_TOOLS, "web_search", "web_fetch"],
    allowedDataScopes: ["business", "project", "own_memory", "shared_memory", "artifacts"],
    allowedArtifactTypes: ["legal_document", "research_report", "document"],
    prohibitedActions: ["legal_advice", "unapproved_external_send"],
    approvalRequiredActions: ["contract_submission"],
    handoffPreference: ["director"],
    defaultSpecialty: "国内規制・利用規約",
    disclaimer:
      "本内容は一般的な調査情報であり、法的助言ではありません。必要に応じて弁護士等の専門家へご確認ください。",
  },

  finance: {
    key: "finance",
    name: "財務・経理サポート",
    headline: "数字で事業を見える化する",
    description:
      "予算・売上予測・損益シミュレーション・キャッシュフロー・経費分類・KPI・料金設計・会計資料の整理を担当する。税務申告・投資判断・資金移動・支払い確定は自動実行しない。",
    particle: { hue: "#a7f3d0", accent: "#10b981", motion: "pulse" },
    allowedCapabilities: [
      "budgeting",
      "revenue_forecast",
      "pl_simulation",
      "cashflow",
      "expense_classification",
      "pricing_design",
      "accounting_organization",
    ],
    allowedTools: [...COMMON_TOOLS, "web_search", "payment_execute"],
    allowedDataScopes: ["business", "project", "own_memory", "shared_memory", "artifacts", "financials"],
    allowedArtifactTypes: ["financial_model", "csv", "document"],
    prohibitedActions: ["tax_filing", "investment_decision", "auto_fund_movement", "unapproved_external_send"],
    approvalRequiredActions: ["payment", "fund_transfer"],
    handoffPreference: ["director", "legal"],
    defaultSpecialty: "収支計画",
    disclaimer:
      "本内容は一般的な情報整理であり、税務・会計上の助言ではありません。必要に応じて税理士・会計士へご確認ください。",
  },
};

export const ALL_ROLE_KEYS = Object.keys(ROLE_DEFINITIONS) as RoleKey[];

/** 職種以外に誰にも許可しないデータスコープ */
export const NEVER_ALLOWED_DATA_SCOPES: DataScope[] = ["credentials"];

export function getRole(roleKey: RoleKey): RoleDefinition {
  const role = ROLE_DEFINITIONS[roleKey];
  if (!role) throw new Error(`unknown role: ${roleKey}`);
  return role;
}

/** Capability から担当職種を逆引きする */
export function rolesForCapability(capability: Capability): RoleKey[] {
  return ALL_ROLE_KEYS.filter((key) =>
    ROLE_DEFINITIONS[key].allowedCapabilities.includes(capability),
  );
}
