import "server-only";
import OpenAI from "openai";
import { serverEnv } from "@/config/env";
import { estimateCostJpy } from "@/lib/models/router";
import { workTokensFromCostJpy } from "@/config/pricing";
import { errResult, okResult, type ProviderInfo, type ProviderResult } from "@/lib/providers/types";
import { wrapUntrusted, type LlmProvider, type LlmRequest } from "@/lib/providers/llm/types";
import { classifyError, extractJson } from "@/lib/providers/llm/anthropic";

/**
 * OpenAI アダプタ（安価・高速な処理用）。
 * 短い会話 / タイトル生成 / 分類 / 要約 / 軽い修正 / 意図判定 /
 * 安全性の一次分類 / 通知文 / 簡単な構造化 に使う。
 *
 * NOTE: 接続前に必ず公式ドキュメントで最新の API 仕様とモデル名を確認すること。
 */
export class OpenAiLlmProvider implements LlmProvider {
  private client: OpenAI | null;

  constructor() {
    this.client = serverEnv.llm.openaiApiKey
      ? new OpenAI({ apiKey: serverEnv.llm.openaiApiKey })
      : null;
  }

  info(): ProviderInfo {
    return { mode: this.client ? "live" : "not_configured", name: "openai" };
  }

  private buildUserContent(req: LlmRequest): string {
    const parts = [req.userContent];
    if (req.untrustedData?.length) parts.push(wrapUntrusted(req.untrustedData));
    if (req.context) parts.push(`<context>\n${JSON.stringify(req.context).slice(0, 20_000)}\n</context>`);
    return parts.join("\n\n");
  }

  private async call(req: LlmRequest, forceJson: boolean): Promise<ProviderResult<string>> {
    if (!this.client) {
      return errResult("not_configured", "OPENAI_API_KEY が設定されていません", false);
    }
    try {
      const response = await this.client.chat.completions.create(
        {
          model: serverEnv.llm.openaiFastModel,
          max_tokens: req.maxOutputTokens ?? 2048,
          messages: [
            { role: "system", content: req.systemPrompt },
            { role: "user", content: this.buildUserContent(req) },
          ],
          ...(forceJson ? { response_format: { type: "json_object" as const } } : {}),
        },
        { signal: req.signal, headers: { "Idempotency-Key": req.idempotencyKey } },
      );

      const text = response.choices[0]?.message?.content ?? "";
      const inputTokens = response.usage?.prompt_tokens ?? 0;
      const outputTokens = response.usage?.completion_tokens ?? 0;
      const costJpy = estimateCostJpy("openai_fast", inputTokens, outputTokens);

      return okResult(
        text,
        { inputTokens, outputTokens },
        { costJpy, workTokens: workTokensFromCostJpy(costJpy) },
        { model: serverEnv.llm.openaiFastModel },
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
    if (parsed === null) return errResult("invalid_request", "構造化出力の解析に失敗しました", true);
    return { ...result, data: parsed };
  }
}
