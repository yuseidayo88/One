"use client";

import { useSyncExternalStore } from "react";
import {
  MOTION_STORAGE_KEY,
  normalizeMotionLevel,
  type MotionLevel,
} from "@/lib/motion/level";

/**
 * 設定の正は <html data-motion>。
 * localStorage の値は root layout のインラインスクリプトが hydration 前に反映するので、
 * React 側は DOM を外部ストアとして購読するだけにする（effect 内 setState を避ける）。
 */

const EVENT = "ac:motion-level";

export function readMotionLevel(): MotionLevel {
  if (typeof document === "undefined") return "standard";
  return normalizeMotionLevel(document.documentElement.dataset.motion);
}

export function applyMotionLevel(level: MotionLevel): void {
  if (typeof document === "undefined") return;
  if (level === "standard") {
    delete document.documentElement.dataset.motion;
    try {
      localStorage.removeItem(MOTION_STORAGE_KEY);
    } catch {
      // プライベートモード等で保存できなくても、その場の表示は切り替える
    }
  } else {
    document.documentElement.dataset.motion = level;
    try {
      localStorage.setItem(MOTION_STORAGE_KEY, level);
    } catch {
      // 同上
    }
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-motion"],
  });
  window.addEventListener(EVENT, onChange);
  return () => {
    observer.disconnect();
    window.removeEventListener(EVENT, onChange);
  };
}

export function useMotionLevel(): MotionLevel {
  return useSyncExternalStore(subscribe, readMotionLevel, () => "standard" as MotionLevel);
}
