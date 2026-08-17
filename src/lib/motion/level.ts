/**
 * アニメーション設定（標準 / 最小 / OFF）。
 *
 * 判定はここだけに置き、UI もテストもこの関数を使う。
 * 「端末が遅そうだから自動で落とす」ような推測はしない。ユーザーの明示的な選択だけを見る。
 */

export type MotionLevel = "standard" | "minimal" | "off";

export const MOTION_LEVELS: MotionLevel[] = ["standard", "minimal", "off"];

export const MOTION_LEVEL_LABEL: Record<MotionLevel, string> = {
  standard: "標準",
  minimal: "最小",
  off: "OFF",
};

export const MOTION_LEVEL_DESCRIPTION: Record<MotionLevel, string> = {
  standard: "位置の移動、粒子、グラフの描画までを表示します。",
  minimal: "位置は動かさず、短いフェードだけにします。",
  off: "アニメーションを止めて、最終状態だけを表示します。",
};

export const MOTION_STORAGE_KEY = "ac_motion";

/** 最小構成でのフェード時間（ms）。これ以上長くしない。 */
export const MINIMAL_DURATION_MS = 120;

export function normalizeMotionLevel(value: unknown): MotionLevel {
  return value === "off" || value === "minimal" ? value : "standard";
}

/** その設定で実際に使うべき時間（ms） */
export function motionDuration(level: MotionLevel, ms: number): number {
  if (level === "off") return 0;
  if (level === "minimal") return Math.min(ms, MINIMAL_DURATION_MS);
  return ms;
}

/** 粒子アニメーションを進めるか */
export function particlesEnabled(level: MotionLevel): boolean {
  return level === "standard";
}

/** レイアウト（位置）アニメーションを行うか。最小・OFF では位置を動かさない。 */
export function layoutAnimationEnabled(level: MotionLevel): boolean {
  return level === "standard";
}
