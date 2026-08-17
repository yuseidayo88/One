/**
 * Provider Adapter 共通契約。
 * 外部サービスは UI や業務ロジックへ直接埋め込まず、必ずこの形へ包む。
 */

export interface ProviderUsage {
  inputTokens?: number;
  outputTokens?: number;
  images?: number;
  videoSeconds?: number;
  queries?: number;
  bytes?: number;
}

export interface ProviderCost {
  costJpy: number;
  workTokens: number;
}

export type ProviderErrorKind =
  | "auth"
  | "rate_limit"
  | "invalid_request"
  | "provider_unavailable"
  | "timeout"
  | "content_blocked"
  | "not_configured"
  | "unknown";

export class ProviderError extends Error {
  constructor(
    public kind: ProviderErrorKind,
    message: string,
    public retryable: boolean,
    public provider: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface ProviderRequestBase {
  /** リトライで二重課金しないためのキー */
  idempotencyKey: string;
  /** 呼び出しをキャンセルするためのシグナル */
  signal?: AbortSignal;
  organizationId: string;
  taskId?: string | null;
  employeeId?: string | null;
}

export interface ProviderResult<T> {
  ok: boolean;
  data: T | null;
  usage: ProviderUsage;
  cost: ProviderCost;
  error: { kind: ProviderErrorKind; message: string; retryable: boolean } | null;
  providerMetadata: Record<string, unknown>;
}

export interface ProviderInfo {
  /** 実接続か Mock か */
  mode: "live" | "mock" | "not_configured";
  name: string;
}

export function okResult<T>(
  data: T,
  usage: ProviderUsage,
  cost: ProviderCost,
  metadata: Record<string, unknown> = {},
): ProviderResult<T> {
  return { ok: true, data, usage, cost, error: null, providerMetadata: metadata };
}

export function errResult<T>(
  kind: ProviderErrorKind,
  message: string,
  retryable: boolean,
  metadata: Record<string, unknown> = {},
): ProviderResult<T> {
  return {
    ok: false,
    data: null,
    usage: {},
    cost: { costJpy: 0, workTokens: 0 },
    error: { kind, message, retryable },
    providerMetadata: metadata,
  };
}
