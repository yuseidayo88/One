import { motionDuration, type MotionLevel } from "@/lib/motion/level";

/**
 * 統括AIが「中央下部の Composer」から「右パネル」へ移動するときのタイムライン。
 *
 * 画面が一度消えて別のレイアウトが現れる、という切り替えにはしない。
 * 同じ要素が連続して動くように、開始時刻と長さをここで一元管理する。
 */

export interface Phase {
  /** 開始（ms、押した瞬間を 0 とする） */
  delay: number;
  /** 長さ（ms） */
  duration: number;
}

export const TRANSITION_EASE = [0.22, 1, 0.36, 1] as const;
export const TRANSITION_EASE_CSS = "cubic-bezier(0.22, 1, 0.36, 1)";

export const ORCHESTRATOR_TRANSITION = {
  /** 中央の Composer が縮む */
  composerShrink: { delay: 0, duration: 120 },
  /** 中央が実務画面（タブ）へ広がる */
  centerExpand: { delay: 120, duration: 300 },
  /** Identicon と入力欄が右上へ移動する（layoutId による連続移動） */
  dockMove: { delay: 120, duration: 440 },
  /** 右パネルが開く */
  panelOpen: { delay: 200, duration: 280 },
  /** 進捗グラフが描かれる */
  graphDraw: { delay: 300, duration: 400 },
} satisfies Record<string, Phase>;

export type PhaseName = keyof typeof ORCHESTRATOR_TRANSITION;

/** 全体の所要時間（ms）。仕様の 450〜700ms に収める。 */
export function totalTransitionMs(): number {
  return Math.max(
    ...Object.values(ORCHESTRATOR_TRANSITION).map((p) => p.delay + p.duration),
  );
}

/** 設定を反映した Motion 用トランジション */
export function phaseTransition(level: MotionLevel, phase: PhaseName) {
  const { delay, duration } = ORCHESTRATOR_TRANSITION[phase];
  return {
    delay: motionDuration(level, delay) / 1000,
    duration: motionDuration(level, duration) / 1000,
    ease: TRANSITION_EASE,
  };
}
