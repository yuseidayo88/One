import "server-only";
import { serverEnv } from "@/config/env";
import type { LogicalModel } from "@/config/models";
import type { LlmProvider } from "@/lib/providers/llm/types";
import { MockLlmProvider } from "@/lib/providers/llm/mock";
import {
  GoogleImageProvider,
  ExternalVideoProvider,
  MockImageProvider,
  MockVideoProvider,
  type ImageProvider,
  type VideoProvider,
} from "@/lib/providers/media";
import {
  MockEmailProvider,
  OAuthEmailProvider,
  ResendEmailProvider,
  type EmailProvider,
} from "@/lib/providers/email";
import {
  CloudflareDeploymentProvider,
  MemoryStorageProvider,
  MockDeploymentProvider,
  MockSearchProvider,
  type DeploymentProvider,
  type SearchProvider,
  type StorageProvider,
} from "@/lib/providers/infra";
import {
  MockBillingProvider,
  StripeBillingProvider,
  type BillingProvider,
} from "@/lib/providers/billing";

/**
 * Provider レジストリ。
 * 本番 Provider と MockProvider をここだけで切り替える。
 */

const forceMock = serverEnv.forceMockProviders;

let llmCache: Map<LogicalModel, LlmProvider> | null = null;

export async function getLlmProvider(model: LogicalModel): Promise<LlmProvider> {
  if (!llmCache) llmCache = new Map();
  const cached = llmCache.get(model);
  if (cached) return cached;

  let provider: LlmProvider = new MockLlmProvider();
  if (!forceMock) {
    if (model === "openai_fast" && serverEnv.llm.openaiApiKey) {
      const { OpenAiLlmProvider } = await import("@/lib/providers/llm/openai");
      provider = new OpenAiLlmProvider();
    } else if (
      (model === "anthropic_reasoning" || model === "anthropic_coding") &&
      serverEnv.llm.anthropicApiKey
    ) {
      const { AnthropicLlmProvider } = await import("@/lib/providers/llm/anthropic");
      provider = new AnthropicLlmProvider();
    }
  }
  llmCache.set(model, provider);
  return provider;
}

/** ModelRouter へ渡す「実際に使える論理モデル」 */
export function availableLogicalModels(): LogicalModel[] {
  const models: LogicalModel[] = ["mock"];
  if (forceMock) return models;
  if (serverEnv.llm.openaiApiKey) models.push("openai_fast");
  if (serverEnv.llm.anthropicApiKey) models.push("anthropic_reasoning", "anthropic_coding");
  return models;
}

let imageProvider: ImageProvider | null = null;
export function getImageProvider(): ImageProvider {
  if (imageProvider) return imageProvider;
  imageProvider =
    !forceMock && serverEnv.image.provider === "google" && serverEnv.image.googleApiKey
      ? new GoogleImageProvider()
      : new MockImageProvider();
  return imageProvider;
}

let videoProvider: VideoProvider | null = null;
export function getVideoProvider(): VideoProvider {
  if (videoProvider) return videoProvider;
  if (!forceMock && serverEnv.video.provider === "higgsfield" && serverEnv.video.higgsfieldApiKey) {
    videoProvider = new ExternalVideoProvider("higgsfield");
  } else if (!forceMock && serverEnv.video.provider === "seedance" && serverEnv.video.seedanceApiKey) {
    videoProvider = new ExternalVideoProvider("seedance");
  } else {
    videoProvider = new MockVideoProvider();
  }
  return videoProvider;
}

let emailProvider: EmailProvider | null = null;
export function getEmailProvider(): EmailProvider {
  if (emailProvider) return emailProvider;
  if (forceMock) emailProvider = new MockEmailProvider();
  else if (serverEnv.email.provider === "resend")
    emailProvider = new ResendEmailProvider(serverEnv.email.resendApiKey);
  else if (serverEnv.email.provider === "gmail") emailProvider = new OAuthEmailProvider("gmail");
  else if (serverEnv.email.provider === "outlook") emailProvider = new OAuthEmailProvider("outlook");
  else emailProvider = new MockEmailProvider();
  return emailProvider;
}

let searchProvider: SearchProvider | null = null;
export function getSearchProvider(): SearchProvider {
  if (!searchProvider) searchProvider = new MockSearchProvider();
  return searchProvider;
}

let storageProvider: StorageProvider | null = null;
export function getStorageProvider(): StorageProvider {
  if (!storageProvider) storageProvider = new MemoryStorageProvider();
  return storageProvider;
}

let deploymentProvider: DeploymentProvider | null = null;
export function getDeploymentProvider(): DeploymentProvider {
  if (deploymentProvider) return deploymentProvider;
  deploymentProvider =
    !forceMock && serverEnv.deployment.provider === "cloudflare"
      ? new CloudflareDeploymentProvider(serverEnv.deployment.cloudflareApiToken)
      : new MockDeploymentProvider();
  return deploymentProvider;
}

let billingProvider: BillingProvider | null = null;
export function getBillingProvider(): BillingProvider {
  if (billingProvider) return billingProvider;
  billingProvider =
    !forceMock && serverEnv.stripe.secretKey
      ? new StripeBillingProvider(
          serverEnv.stripe.secretKey,
          serverEnv.stripe.webhookSecret,
          serverEnv.stripe.prices,
        )
      : new MockBillingProvider();
  return billingProvider;
}

/** 管理画面・連携画面で表示する Provider の状態一覧 */
export function providerStatuses() {
  return [
    { kind: "llm", ...new MockLlmProvider().info(), available: availableLogicalModels() },
    { kind: "image", ...getImageProvider().info() },
    { kind: "video", ...getVideoProvider().info() },
    { kind: "email", ...getEmailProvider().info() },
    { kind: "search", ...getSearchProvider().info() },
    { kind: "storage", ...getStorageProvider().info() },
    { kind: "deployment", ...getDeploymentProvider().info() },
    { kind: "billing", ...getBillingProvider().info() },
  ];
}
