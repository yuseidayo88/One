/**
 * モデルルーティング設定（バージョン管理対象）。
 * モデル名はコードへ直接散らさず、ここと環境変数だけで切り替える。
 */

export const MODEL_ROUTING_VERSION = "2026-08-17.1";

/** 論理モデル（物理モデル名は env で差し替える） */
export type LogicalModel =
  | "openai_fast"
  | "anthropic_reasoning"
  | "anthropic_coding"
  | "mock";

/** ルーティング対象の仕事種別 */
export type TaskKind =
  | "director_chat"
  | "intent_classification"
  | "task_decomposition"
  | "safety_triage"
  | "title_generation"
  | "summarization"
  | "notification_copy"
  | "light_rewrite"
  | "simple_structured"
  | "market_research"
  | "marketing_plan"
  | "sales_writing"
  | "design_spec"
  | "coding"
  | "legal_research"
  | "finance_analysis"
  | "long_context_analysis";

export interface RoutingRule {
  primary: LogicalModel;
  fallback: LogicalModel;
  /** 期待する最大コンテキスト長（トークン） */
  maxContextTokens: number;
  /** 構造化出力が必須か */
  structured: boolean;
  /** 1 = 低品質許容 / 5 = 最高品質 */
  qualityTarget: 1 | 2 | 3 | 4 | 5;
  /** ミリ秒。これを超える見込みなら軽量モデルへ降格を検討 */
  latencyBudgetMs: number;
}

/**
 * 安価な OpenAI モデルを使う処理と、Claude を使う処理を明示的に分ける。
 * fallback は「勝手に極端に高額なモデルへ切り替えない」ため、
 * 同等かより安価な方向にのみ設定する。
 */
export const MODEL_ROUTING: Record<TaskKind, RoutingRule> = {
  // ── 安価な OpenAI モデル ────────────────────────────────
  intent_classification: { primary: "openai_fast", fallback: "openai_fast", maxContextTokens: 8_000, structured: true, qualityTarget: 2, latencyBudgetMs: 4_000 },
  safety_triage: { primary: "openai_fast", fallback: "openai_fast", maxContextTokens: 8_000, structured: true, qualityTarget: 3, latencyBudgetMs: 3_000 },
  title_generation: { primary: "openai_fast", fallback: "openai_fast", maxContextTokens: 4_000, structured: false, qualityTarget: 1, latencyBudgetMs: 3_000 },
  summarization: { primary: "openai_fast", fallback: "openai_fast", maxContextTokens: 32_000, structured: false, qualityTarget: 2, latencyBudgetMs: 8_000 },
  notification_copy: { primary: "openai_fast", fallback: "openai_fast", maxContextTokens: 4_000, structured: false, qualityTarget: 1, latencyBudgetMs: 3_000 },
  light_rewrite: { primary: "openai_fast", fallback: "openai_fast", maxContextTokens: 8_000, structured: false, qualityTarget: 2, latencyBudgetMs: 5_000 },
  simple_structured: { primary: "openai_fast", fallback: "openai_fast", maxContextTokens: 8_000, structured: true, qualityTarget: 2, latencyBudgetMs: 5_000 },

  // ── Claude（重要・複雑・長文・高品質） ──────────────────
  director_chat: { primary: "anthropic_reasoning", fallback: "openai_fast", maxContextTokens: 100_000, structured: true, qualityTarget: 5, latencyBudgetMs: 30_000 },
  task_decomposition: { primary: "anthropic_reasoning", fallback: "openai_fast", maxContextTokens: 60_000, structured: true, qualityTarget: 5, latencyBudgetMs: 30_000 },
  market_research: { primary: "anthropic_reasoning", fallback: "openai_fast", maxContextTokens: 120_000, structured: true, qualityTarget: 5, latencyBudgetMs: 60_000 },
  marketing_plan: { primary: "anthropic_reasoning", fallback: "openai_fast", maxContextTokens: 60_000, structured: true, qualityTarget: 4, latencyBudgetMs: 40_000 },
  sales_writing: { primary: "anthropic_reasoning", fallback: "openai_fast", maxContextTokens: 40_000, structured: true, qualityTarget: 4, latencyBudgetMs: 30_000 },
  design_spec: { primary: "anthropic_reasoning", fallback: "openai_fast", maxContextTokens: 60_000, structured: true, qualityTarget: 4, latencyBudgetMs: 40_000 },
  coding: { primary: "anthropic_coding", fallback: "anthropic_reasoning", maxContextTokens: 180_000, structured: true, qualityTarget: 5, latencyBudgetMs: 120_000 },
  legal_research: { primary: "anthropic_reasoning", fallback: "openai_fast", maxContextTokens: 120_000, structured: true, qualityTarget: 5, latencyBudgetMs: 60_000 },
  finance_analysis: { primary: "anthropic_reasoning", fallback: "openai_fast", maxContextTokens: 80_000, structured: true, qualityTarget: 4, latencyBudgetMs: 40_000 },
  long_context_analysis: { primary: "anthropic_reasoning", fallback: "anthropic_reasoning", maxContextTokens: 180_000, structured: true, qualityTarget: 5, latencyBudgetMs: 90_000 },
};

/** 安全性が ORANGE 以上の場合、品質を落とさない（軽量降格を禁止する） */
export const NO_DOWNGRADE_ON_RISK = true;
