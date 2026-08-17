import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/config/env";
import { estimateCostJpy } from "@/lib/models/router";
import { workTokensFromCostJpy } from "@/config/pricing";
import { errResult, okResult, type ProviderInfo, type ProviderResult } from "@/lib/providers/types";
import { wrapUntrusted, type LlmProvider, type LlmRequest } from "@/lib/providers/llm/types";

/**
 * Anthropic (Claude) アダプタ。
 * 重要な経営会話・複雑な分解・長文分析・コーディング・高品質成果物に使う。
 *
 * NOTE: 接続前に必ず公式ドキュメントで最新の API 仕様とモデル名を確認すること。
 * モデル名は env (ANTHROPIC_REASONING_MODEL / ANTHROPIC_CODING_MODEL) で指定する。
 */
export class AnthropicLlmProvider implements LlmProvider {
  private client: Anthropic | null;

  constructor() {
    this.client = serverEnv.llm.anthropicApiKey
      ? new Anthropic({ apiKey: serverEnv.llm.anthropicApiKey })
      : null;
  }

  info(): ProviderInfo {
    return { mode: this.client ? "live" : "not_configured", name: "anthropic" };
  }

  private physicalModel(req: LlmRequest): string {
    return req.logicalModel === "anthropic_coding"
      ? serverEnv.llm.anthropicCodingModel
      : serverEnv.llm.anthropicReasoningModel;
  }

  private buildUserContent(req: LlmRequest): string {
    const parts = [req.userContent];
    if (req.untrustedData?.length) parts.push(wrapUntrusted(req.untrustedData));
    if (req.context) {
      parts.push(
        `<context>\n${JSON.stringify(req.context).slice(0, 20_000)}\n</context>`,
      );
    }
    return parts.join("\n\n");
  }

  private async call(req: LlmRequest, forceJson: boolean): Promise<ProviderResult<string>> {
    if (!this.client) {
      return errResult("not_configured", "ANTHROPIC_API_KEY が設定されていません", false);
    }
    const model = this.physicalModel(req);
    const system = forceJson
      ? `${req.systemPrompt}\n\n必ず JSON のみを出力してください。前後に説明文を付けないでください。`
      : req.systemPrompt;

    try {
      const response = await this.client.messages.create(
        {
          model,
          max_tokens: req.maxOutputTokens ?? 4096,
          system,
          messages: [{ role: "user", content: this.buildUserContent(req) }],
        },
        { signal: req.signal, headers: { "Idempotency-Key": req.idempotencyKey } },
      );

      const text = response.content
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("");

      const inputTokens = response.usage.input_tokens;
      const outputTokens = response.usage.output_tokens;
      const costJpy = estimateCostJpy(req.logicalModel, inputTokens, outputTokens);

      return okResult(
        text,
        { inputTokens, outputTokens },
        { costJpy, workTokens: workTokensFromCostJpy(costJpy) },
        { model, stopReason: response.stop_reason },
      );
    } catch (error) {
      return errResult(...classifyError(error));
    }
  }

  async generateText(req: LlmRequest): Promise<ProviderResult<string>> {
    return this.call(req, false);
  }

  async generateStructured(req: LlmRequest): Promise<ProviderResult<unknown>> {
    const result = await this.call(req, true);
    if (!result.ok || !result.data) return result as ProviderResult<unknown>;
    const parsed = extractJson(result.data);
    if (parsed === null) {
      return errResult("invalid_request", "構造化出力の解析に失敗しました", true);
    }
    return { ...result, data: parsed };
  }
}

export function extractJson(text: string): unknown | null {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

export function classifyError(
  error: unknown,
): [import("@/lib/providers/types").ProviderErrorKind, string, boolean] {
  const status = (error as { status?: number } | null)?.status;
  if (status === 401 || status === 403) return ["auth", "認証に失敗しました", false];
  if (status === 429) return ["rate_limit", "レート制限に達しました", true];
  if (status && status >= 500) return ["provider_unavailable", "プロバイダー側の障害です", true];
  if ((error as { name?: string } | null)?.name === "AbortError") {
    return ["timeout", "処理が中断されました", true];
  }
  return ["unknown", "不明なエラーが発生しました", true];
}
