import {
  MODEL_ROUTING,
  MODEL_ROUTING_VERSION,
  NO_DOWNGRADE_ON_RISK,
  type LogicalModel,
  type TaskKind,
} from "@/config/models";
import { PROVIDER_UNIT_COSTS, jpyFromUsd, workTokensFromCostJpy } from "@/config/pricing";
import type { SafetyLevel } from "@/lib/core/types";

/**
 * ModelRouter — 仕事内容に応じてモデルを切り替える。
 * モデル名はここと env にのみ存在させ、業務ロジックへ散らさない。
 */

export interface RouteInput {
  taskKind: TaskKind;
  /** 概算入力トークン */
  estimatedInputTokens: number;
  /** 概算出力トークン */
  estimatedOutputTokens: number;
  safetyLevel: SafetyLevel;
  /** 構造化出力が必要か */
  needsStructuredOutput?: boolean;
  /** 利用可能な論理モデル（キー未設定のものは除外して渡す） */
  availableModels: LogicalModel[];
}

export interface RouteDecision {
  logicalModel: LogicalModel;
  fallbackModel: LogicalModel;
  reason: string;
  estimatedCostJpy: number;
  estimatedWorkTokens: number;
  routingVersion: string;
}

function parseOverrides(json: string): Partial<Record<TaskKind, LogicalModel>> {
  if (!json) return {};
  try {
    return JSON.parse(json) as Partial<Record<TaskKind, LogicalModel>>;
  } catch {
    return {};
  }
}

export function estimateCostJpy(
  model: LogicalModel,
  inputTokens: number,
  outputTokens: number,
): number {
  const unit = PROVIDER_UNIT_COSTS.llm[model];
  const usd =
    (inputTokens / 1_000_000) * unit.inputPerMTokUsd +
    (outputTokens / 1_000_000) * unit.outputPerMTokUsd;
  return jpyFromUsd(usd);
}

export function estimateWorkTokens(
  model: LogicalModel,
  inputTokens: number,
  outputTokens: number,
): number {
  return workTokensFromCostJpy(estimateCostJpy(model, inputTokens, outputTokens));
}

/**
 * 判断基準: 複雑さ / 必要コンテキスト長 / 期待品質 / レイテンシ / API原価 / 安全性 /
 * タスク種類 / 構造化出力の必要性。
 */
export function routeModel(input: RouteInput, routingConfigJson = ""): RouteDecision {
  const rule = MODEL_ROUTING[input.taskKind];
  const overrides = parseOverrides(routingConfigJson);
  const reasons: string[] = [];

  let chosen: LogicalModel = overrides[input.taskKind] ?? rule.primary;
  if (overrides[input.taskKind]) reasons.push("MODEL_ROUTING_CONFIG による上書き");
  else reasons.push(`タスク種別 ${input.taskKind} の既定`);

  const totalTokens = input.estimatedInputTokens + input.estimatedOutputTokens;

  // コンテキスト長が想定を超える場合は長文対応モデルへ
  if (totalTokens > rule.maxContextTokens && chosen === "openai_fast") {
    chosen = "anthropic_reasoning";
    reasons.push("必要コンテキスト長が軽量モデルの想定を超過");
  }

  // 安全性が高い場合は品質を落とさない
  const risky = input.safetyLevel === "ORANGE" || input.safetyLevel === "RED";
  if (risky && NO_DOWNGRADE_ON_RISK && chosen === "openai_fast" && rule.qualityTarget >= 3) {
    chosen = "anthropic_reasoning";
    reasons.push("安全性レベルが高いため高品質モデルを使用");
  }

  // 利用できないモデルはフォールバックへ（高額側へ勝手に昇格しない）
  if (!input.availableModels.includes(chosen)) {
    const fallback = input.availableModels.includes(rule.fallback) ? rule.fallback : "mock";
    reasons.push(`${chosen} が利用不可のため ${fallback} を使用`);
    chosen = fallback;
  }

  const fallbackModel = input.availableModels.includes(rule.fallback) ? rule.fallback : "mock";

  const costJpy = estimateCostJpy(chosen, input.estimatedInputTokens, input.estimatedOutputTokens);

  return {
    logicalModel: chosen,
    fallbackModel,
    reason: reasons.join(" / "),
    estimatedCostJpy: costJpy,
    estimatedWorkTokens: workTokensFromCostJpy(costJpy),
    routingVersion: MODEL_ROUTING_VERSION,
  };
}

/** 職種 → 既定のタスク種別 */
export const ROLE_TASK_KIND: Record<string, TaskKind> = {
  director: "director_chat",
  market_research: "market_research",
  marketing: "marketing_plan",
  sales: "sales_writing",
  designer: "design_spec",
  engineer: "coding",
  assistant: "light_rewrite",
  legal: "legal_research",
  finance: "finance_analysis",
};
