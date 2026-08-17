"use client";

/**
 * 全粒子キャンバスで共有する単一の rAF ループ。
 *
 * 社員ごとに rAF を張るとメインスレッドを圧迫するため、
 * ティッカーは 1 本にまとめ、各キャンバスは描画関数だけを登録する。
 */

type Frame = (time: number, delta: number) => void;

const subscribers = new Set<Frame>();
let rafId = 0;
let last = 0;

function loop(time: number) {
  const delta = last === 0 ? 16 : Math.min(48, time - last);
  last = time;
  for (const fn of subscribers) fn(time, delta);
  rafId = requestAnimationFrame(loop);
}

export function subscribeFrame(fn: Frame): () => void {
  subscribers.add(fn);
  if (rafId === 0) {
    last = 0;
    rafId = requestAnimationFrame(loop);
  }
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0 && rafId !== 0) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  };
}

export function motionEnabled(): boolean {
  if (typeof document === "undefined") return true;
  return document.documentElement.dataset.motion !== "off";
}
