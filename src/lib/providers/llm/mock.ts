import type { LlmProvider, LlmRequest } from "@/lib/providers/llm/types";
import { okResult, type ProviderInfo, type ProviderResult } from "@/lib/providers/types";
import { buildDirectorPlan } from "@/lib/orchestrator/plan-builder";
import { buildEmployeeOutput } from "@/lib/employees/output-builder";
import { buildBusinessBrief } from "@/lib/orchestrator/brief-builder";
import { estimateCostJpy, estimateWorkTokens } from "@/lib/models/router";

/**
 * MockLLMProvider。
 *
 * APIキーが無くても Phase 1 と主要 UI を完全に試せるようにするため、
 * 決定論的なルールベースで「本物と同じ形の構造化出力」を返す。
 * 実 LLM と同じ Zod スキーマで検証されるため、差し替えても呼び出し側は変わらない。
 */
export class MockLlmProvider implements LlmProvider {
  info(): ProviderInfo {
    return { mode: "mock", name: "mock-llm" };
  }

  private cost(req: LlmRequest, outputChars: number) {
    const inputTokens = Math.ceil((req.systemPrompt.length + req.userContent.length) / 3);
    const outputTokens = Math.ceil(outputChars / 3);
    return {
      usage: { inputTokens, outputTokens },
      cost: {
        costJpy: estimateCostJpy(req.logicalModel, inputTokens, outputTokens),
        workTokens: Math.max(
          200,
          estimateWorkTokens(req.logicalModel, inputTokens, outputTokens),
        ),
      },
    };
  }

  async generateStructured(req: LlmRequest): Promise<ProviderResult<unknown>> {
    const context = req.context ?? {};
    let data: unknown;

    switch (req.purpose) {
      case "director_plan":
        data = buildDirectorPlan(req.userContent, context);
        break;
      case "employee_output":
        data = buildEmployeeOutput(req.userContent, context);
        break;
      case "business_brief":
        data = buildBusinessBrief(req.userContent, context);
        break;
      default:
        data = { text: req.userContent };
    }

    const serialized = JSON.stringify(data);
    const { usage, cost } = this.cost(req, serialized.length);
    return okResult(data, usage, cost, { mock: true, purpose: req.purpose });
  }

  async generateText(req: LlmRequest): Promise<ProviderResult<string>> {
    let text: string;
    switch (req.purpose) {
      case "title":
        text = req.userContent.replace(/\s+/g, " ").trim().slice(0, 32) || "新しい相談";
        break;
      case "summary":
        text = summarize(req.userContent);
        break;
      default:
        text = summarize(req.userContent);
    }
    const { usage, cost } = this.cost(req, text.length);
    return okResult(text, usage, cost, { mock: true, purpose: req.purpose });
  }
}

function summarize(text: string): string {
  const sentences = text
    .split(/[。\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length === 0) return "";
  return sentences.slice(0, 3).join("。") + "。";
}
