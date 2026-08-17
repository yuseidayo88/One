"use client";

/**
 * 全粒子キャンバスで共有する単一の rAF ループ。
 *
 * 社員ごとに rAF を張るとメインスレッドを圧迫するため、
 * ティッカーは 1 本にまとめ、各キャンバスは描画関数だけを登録する。
 */

import { normalizeMotionLevel, particlesEnabled } from "@/lib/motion/level";

type Frame = (time: number, delta: number) => void;

const subscribers = new Set<Frame>();
let rafId = 0;
let last = 0;
/** タブが隠れている / 画面外のキャンバスしか無いときは回さない */
let documentHidden = false;

function loop(time: number) {
  const delta = last === 0 ? 16 : Math.min(48, time - last);
  last = time;
  for (const fn of subscribers) fn(time, delta);
  rafId = requestAnimationFrame(loop);
}

function start() {
  if (rafId !== 0 || documentHidden || subscribers.size === 0) return;
  last = 0;
  rafId = requestAnimationFrame(loop);
}

function stop() {
  if (rafId === 0) return;
  cancelAnimationFrame(rafId);
  rafId = 0;
}

if (typeof document !== "undefined") {
  documentHidden = document.visibilityState === "hidden";
  document.addEventListener("visibilitychange", () => {
    documentHidden = document.visibilityState === "hidden";
    if (documentHidden) stop();
    else start();
  });
}

export function subscribeFrame(fn: Frame): () => void {
  subscribers.add(fn);
  start();
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0) stop();
  };
}

/** 粒子を進めてよいか（アニメーション設定が「標準」のときだけ） */
export function motionEnabled(): boolean {
  if (typeof document === "undefined") return true;
  return particlesEnabled(normalizeMotionLevel(document.documentElement.dataset.motion));
}
