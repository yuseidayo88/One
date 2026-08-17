import { PROVIDER_UNIT_COSTS, jpyFromUsd, workTokensFromCostJpy } from "@/config/pricing";
import {
  errResult,
  okResult,
  type ProviderInfo,
  type ProviderRequestBase,
  type ProviderResult,
} from "@/lib/providers/types";

/* ────────────────────────── 画像 ────────────────────────── */

export interface ImageRequest extends ProviderRequestBase {
  prompt: string;
  /** 画像編集の場合の元画像 */
  sourceImageUrl?: string;
  width: number;
  height: number;
  count: number;
}

export interface ImageResultData {
  images: { url: string; width: number; height: number }[];
}

/**
 * ImageProvider — 画像生成・画像編集。
 * Nano Banana 系（Google 系画像生成モデル）はここに属する。
 * **動画生成用途には使わない**（VideoProvider を使うこと）。
 */
export interface ImageProvider {
  info(): ProviderInfo;
  /** 生成前にユーザーへ提示する見積もり */
  estimate(req: Pick<ImageRequest, "width" | "height" | "count">): {
    estimatedSeconds: number;
    estimatedWorkTokens: number;
  };
  generate(req: ImageRequest): Promise<ProviderResult<ImageResultData>>;
}

export class MockImageProvider implements ImageProvider {
  info(): ProviderInfo {
    return { mode: "mock", name: "mock-image" };
  }

  estimate(req: Pick<ImageRequest, "width" | "height" | "count">) {
    const costJpy = jpyFromUsd(PROVIDER_UNIT_COSTS.image.perImageUsd * req.count);
    return {
      estimatedSeconds: 6 * req.count,
      estimatedWorkTokens: workTokensFromCostJpy(costJpy),
    };
  }

  async generate(req: ImageRequest): Promise<ProviderResult<ImageResultData>> {
    const costJpy = jpyFromUsd(PROVIDER_UNIT_COSTS.image.perImageUsd * req.count);
    const images = Array.from({ length: req.count }, (_, i) => ({
      url: `/api/mock-media/image?seed=${encodeURIComponent(req.idempotencyKey)}-${i}&w=${req.width}&h=${req.height}`,
      width: req.width,
      height: req.height,
    }));
    return okResult(
      { images },
      { images: req.count },
      { costJpy, workTokens: workTokensFromCostJpy(costJpy) },
      { mock: true, prompt: req.prompt.slice(0, 200) },
    );
  }
}

/**
 * Google 系画像生成（Nano Banana 系）アダプタの受け口。
 * 公式 API 提供時にここへ実装する。非公式エンドポイントは使用しない。
 */
export class GoogleImageProvider implements ImageProvider {
  info(): ProviderInfo {
    return { mode: "not_configured", name: "google-image" };
  }
  estimate(req: Pick<ImageRequest, "width" | "height" | "count">) {
    return new MockImageProvider().estimate(req);
  }
  async generate(_req: ImageRequest): Promise<ProviderResult<ImageResultData>> {
    return errResult(
      "not_configured",
      "画像生成 Provider が未接続です。GOOGLE_AI_API_KEY を設定し、公式ドキュメントに沿って実装してください。",
      false,
    );
  }
}

/* ────────────────────────── 動画 ────────────────────────── */

export interface VideoRequest extends ProviderRequestBase {
  prompt: string;
  seconds: number;
  resolution: "720p" | "1080p";
  sourceImageUrl?: string;
}

export interface VideoResultData {
  url: string;
  seconds: number;
  resolution: string;
}

/** VideoProvider — 動画生成専用。画像 Provider とは別に設計する。 */
export interface VideoProvider {
  info(): ProviderInfo;
  estimate(req: Pick<VideoRequest, "seconds" | "resolution">): {
    estimatedSeconds: number;
    estimatedWorkTokens: number;
  };
  generate(req: VideoRequest): Promise<ProviderResult<VideoResultData>>;
}

export class MockVideoProvider implements VideoProvider {
  info(): ProviderInfo {
    return { mode: "mock", name: "mock-video" };
  }

  estimate(req: Pick<VideoRequest, "seconds" | "resolution">) {
    const multiplier = req.resolution === "1080p" ? 1.6 : 1;
    const costJpy = jpyFromUsd(PROVIDER_UNIT_COSTS.video.perSecondUsd * req.seconds * multiplier);
    return {
      estimatedSeconds: req.seconds * 12,
      estimatedWorkTokens: workTokensFromCostJpy(costJpy),
    };
  }

  async generate(req: VideoRequest): Promise<ProviderResult<VideoResultData>> {
    const { estimatedWorkTokens } = this.estimate(req);
    return okResult(
      {
        url: `/api/mock-media/video?seed=${encodeURIComponent(req.idempotencyKey)}`,
        seconds: req.seconds,
        resolution: req.resolution,
      },
      { videoSeconds: req.seconds },
      {
        costJpy: jpyFromUsd(PROVIDER_UNIT_COSTS.video.perSecondUsd * req.seconds),
        workTokens: estimatedWorkTokens,
      },
      { mock: true },
    );
  }
}

/**
 * Higgsfield / Seedance などの動画 Provider アダプタの受け口。
 * 公式 API が利用可能になった時点でここへ実装する。
 * 非公式・リバースエンジニアリングされたエンドポイントは使用しない。
 */
export class ExternalVideoProvider implements VideoProvider {
  constructor(private providerName: "higgsfield" | "seedance") {}

  info(): ProviderInfo {
    return { mode: "not_configured", name: this.providerName };
  }

  estimate(req: Pick<VideoRequest, "seconds" | "resolution">) {
    return new MockVideoProvider().estimate(req);
  }

  async generate(_req: VideoRequest): Promise<ProviderResult<VideoResultData>> {
    return errResult(
      "not_configured",
      `${this.providerName} の公式 API が未接続です。API キーを設定し、公式ドキュメントに沿って実装してください。`,
      false,
    );
  }
}
