/**
 * 料金・ワークトークン設定。
 * 価格をコードへ散らさず、ここ（または将来 DB の admin_settings）から変更する。
 */

export type PlanKey = "free" | "starter" | "founder" | "ceo";

export interface Plan {
  key: PlanKey;
  name: string;
  monthlyWorkTokens: number;
  monthlyPriceJpy: number;
  stripePriceEnvKey?: "starter" | "founder" | "ceo";
  highlights: string[];
}

export const PLANS: Record<PlanKey, Plan> = {
  free: {
    key: "free",
    name: "Free",
    monthlyWorkTokens: 100_000,
    monthlyPriceJpy: 0,
    highlights: ["AI社員 3名まで", "基本タスク実行", "成果物の保存"],
  },
  starter: {
    key: "starter",
    name: "Starter",
    monthlyWorkTokens: 1_500_000,
    monthlyPriceJpy: 1_980,
    stripePriceEnvKey: "starter",
    highlights: ["AI社員 6名まで", "カンバン・メモリ", "メール下書き"],
  },
  founder: {
    key: "founder",
    name: "Founder",
    monthlyWorkTokens: 4_000_000,
    monthlyPriceJpy: 4_980,
    stripePriceEnvKey: "founder",
    highlights: ["AI社員 無制限", "画像生成", "外部連携"],
  },
  ceo: {
    key: "ceo",
    name: "CEO",
    monthlyWorkTokens: 8_000_000,
    monthlyPriceJpy: 9_800,
    stripePriceEnvKey: "ceo",
    highlights: ["優先実行", "動画生成", "公開・デプロイ支援"],
  },
};

export interface CreditPack {
  key: string;
  workTokens: number;
  priceJpy: number;
}

export const CREDIT_PACKS: CreditPack[] = [
  { key: "pack_1m", workTokens: 1_000_000, priceJpy: 1_480 },
  { key: "pack_3m", workTokens: 3_000_000, priceJpy: 3_980 },
  { key: "pack_10m", workTokens: 10_000_000, priceJpy: 11_800 },
];

/**
 * 内部原価モデル。
 * ワークトークンは API の生トークンではなく、原価をならした「仕事の単位」。
 *
 *   workTokens = ceil( costJpy / TARGET_COST_PER_WORK_TOKEN_JPY * SAFETY_FACTOR )
 *
 * TARGET_COST_PER_WORK_TOKEN_JPY = 0.00025 円 は「1WTあたりのAPI原価上限の目安」。
 * 目標粗利 80% は価格表側（PLANS）で担保する。
 */
export const COST_MODEL = {
  /** 1 ワークトークンあたりの API 原価上限の目安（円） */
  targetCostPerWorkTokenJpy: 0.00025,
  /** 見積もりのブレを吸収する安全係数 */
  safetyFactor: 1.25,
  /** USD→JPY 換算（管理者が変更可能） */
  usdToJpy: 155,
  /** 目標粗利（管理画面の表示用） */
  targetGrossMargin: 0.8,
  /** 「高額」とみなし事前確認を必須にする閾値 */
  highCostApprovalThresholdWorkTokens: 50_000,
} as const;

/**
 * Provider 別の原価表（USD）。LLM 以外の原価もワークトークンへ含める。
 * 実価格は各社の公式ドキュメントで確認して更新すること。
 */
export const PROVIDER_UNIT_COSTS = {
  llm: {
    openai_fast: { inputPerMTokUsd: 0.15, outputPerMTokUsd: 0.6 },
    anthropic_reasoning: { inputPerMTokUsd: 3.0, outputPerMTokUsd: 15.0 },
    anthropic_coding: { inputPerMTokUsd: 3.0, outputPerMTokUsd: 15.0 },
    mock: { inputPerMTokUsd: 0.0, outputPerMTokUsd: 0.0 },
  },
  image: { perImageUsd: 0.04 },
  video: { perSecondUsd: 0.35 },
  search: { perQueryUsd: 0.008 },
  storage: { perGbMonthUsd: 0.021 },
} as const;

/** 月次付与分と追加購入分の有効期限（設定で変更可能） */
export const CREDIT_EXPIRY = {
  monthlyGrantExpiresInDays: 31,
  purchasedPackExpiresInDays: 365,
} as const;

export function jpyFromUsd(usd: number): number {
  return usd * COST_MODEL.usdToJpy;
}

/** 原価(円) → ワークトークン */
export function workTokensFromCostJpy(costJpy: number): number {
  if (costJpy <= 0) return 0;
  return Math.ceil(
    (costJpy / COST_MODEL.targetCostPerWorkTokenJpy) * COST_MODEL.safetyFactor,
  );
}

export function isHighCost(workTokens: number): boolean {
  return workTokens >= COST_MODEL.highCostApprovalThresholdWorkTokens;
}
