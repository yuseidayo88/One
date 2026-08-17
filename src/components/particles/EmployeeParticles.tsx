"use client";

import { useEffect, useRef } from "react";
import type { EmployeeStatus, RoleKey } from "@/lib/core/types";
import { subscribeFrame, motionEnabled } from "@/components/particles/ticker";

/**
 * 職種ごとの粒子アニメーション。
 *
 * - 職種で色と「動きの性質」を変える
 * - 稼働中は活発、待機中はゆっくり呼吸する
 * - 実際の社員ステータスと同期する（装飾で終わらせない）
 * - Canvas 2D + 共有 rAF。transform を使わず、必要な領域だけ再描画する
 */

export type ParticleMotion =
  | "orbit"
  | "radar"
  | "wave"
  | "vector"
  | "curve"
  | "grid"
  | "align"
  | "shield"
  | "pulse";

interface RoleVisual {
  motion: ParticleMotion;
  colors: [string, string];
  count: number;
}

export const ROLE_VISUALS: Record<RoleKey, RoleVisual> = {
  director: { motion: "orbit", colors: ["#ffffff", "#7aa2ff"], count: 16 },
  market_research: { motion: "radar", colors: ["#a5f3fc", "#22d3ee"], count: 14 },
  marketing: { motion: "wave", colors: ["#fbcfe8", "#f472b6"], count: 18 },
  sales: { motion: "vector", colors: ["#fde68a", "#f59e0b"], count: 14 },
  designer: { motion: "curve", colors: ["#e9d5ff", "#a855f7"], count: 16 },
  engineer: { motion: "grid", colors: ["#bbf7d0", "#22c55e"], count: 16 },
  assistant: { motion: "align", colors: ["#e5e7eb", "#9ca3af"], count: 12 },
  legal: { motion: "shield", colors: ["#c7d2fe", "#6366f1"], count: 14 },
  finance: { motion: "pulse", colors: ["#a7f3d0", "#fbbf24"], count: 14 },
};

/** ステータス → 動きの強さ */
const STATUS_ENERGY: Record<EmployeeStatus, number> = {
  working: 1,
  idle: 0.28,
  awaiting_approval: 0.55,
  awaiting_info: 0.4,
  done: 0.2,
  error: 0.85,
  paused: 0.06,
};

interface Particle {
  a: number; // 位相
  r: number; // 半径比
  s: number; // 速度係数
  o: number; // 不透明度係数
}

function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface EmployeeParticlesProps {
  roleKey: RoleKey;
  status: EmployeeStatus;
  seed?: string;
  size?: number;
  className?: string;
}

export function EmployeeParticles({
  roleKey,
  status,
  seed = "0",
  size = 40,
  className,
}: EmployeeParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // 描画ループ（rAF）から最新のステータスを読むための箱。
  // レンダー中に ref を書き換えないよう、更新は effect で行う。
  const stateRef = useRef({ status, roleKey });
  useEffect(() => {
    stateRef.current = { status, roleKey };
  }, [status, roleKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const visual = ROLE_VISUALS[roleKey];
    const rand = seededRandom(`${roleKey}:${seed}`);
    const particles: Particle[] = Array.from({ length: visual.count }, () => ({
      a: rand() * Math.PI * 2,
      r: 0.25 + rand() * 0.72,
      s: 0.55 + rand() * 0.9,
      o: 0.35 + rand() * 0.65,
    }));

    const cx = size / 2;
    const cy = size / 2;
    const maxR = size / 2 - 2.5;
    let t = 0;

    const draw = (_time: number, delta: number) => {
      const energy = STATUS_ENERGY[stateRef.current.status] ?? 0.3;
      const enabled = motionEnabled();
      if (enabled) t += (delta / 1000) * (0.35 + energy * 1.7);

      ctx.clearRect(0, 0, size, size);

      // 呼吸するグロー（待機中はゆっくり、稼働中は明るい）
      const breath = 0.5 + 0.5 * Math.sin(t * (0.6 + energy));
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 1.15);
      glow.addColorStop(0, hexAlpha(visual.colors[1], 0.16 + energy * 0.22 * breath));
      glow.addColorStop(1, hexAlpha(visual.colors[1], 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, maxR * 1.15, 0, Math.PI * 2);
      ctx.fill();

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]!;
        const pos = positionFor(visual.motion, p, i, particles.length, t, energy, maxR);
        const alpha = Math.min(1, p.o * (0.35 + energy * 0.75) * pos.alpha);
        const radius = pos.size * (0.85 + energy * 0.5);

        ctx.fillStyle = hexAlpha(i % 3 === 0 ? visual.colors[0] : visual.colors[1], alpha);
        ctx.beginPath();
        ctx.arc(cx + pos.x, cy + pos.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // エラー時は輪郭を強調（色だけに依存しないよう、UI 側でも文字表示する）
      if (stateRef.current.status === "error") {
        ctx.strokeStyle = hexAlpha("#e5645c", 0.5 + 0.3 * breath);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
        ctx.stroke();
      }
    };

    // 初回は必ず 1 フレーム描く（動き無効時も静止画が出る）
    draw(0, 16);
    return subscribeFrame(draw);
  }, [roleKey, seed, size]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: size, height: size, display: "block" }}
      aria-hidden="true"
    />
  );
}

interface Pos {
  x: number;
  y: number;
  size: number;
  alpha: number;
}

function positionFor(
  motion: ParticleMotion,
  p: Particle,
  index: number,
  total: number,
  t: number,
  energy: number,
  maxR: number,
): Pos {
  const base = p.a + t * p.s;
  switch (motion) {
    // 統括AI: 複数ノードをまとめる軌道
    case "orbit": {
      const r = maxR * p.r * (0.82 + 0.18 * Math.sin(t * 0.9 + p.a));
      return { x: Math.cos(base) * r, y: Math.sin(base) * r * 0.72, size: 1.15, alpha: 1 };
    }
    // 市場調査: レーダー・探索
    case "radar": {
      const sweep = (t * 1.2) % (Math.PI * 2);
      const angle = p.a;
      let diff = Math.abs(((angle - sweep + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      diff = 1 - diff / Math.PI;
      const r = maxR * p.r;
      return {
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
        size: 1 + diff * 0.9,
        alpha: 0.25 + diff * diff * 1.3,
      };
    }
    // マーケティング: 波形・拡散
    case "wave": {
      const x = ((index / total) * 2 - 1) * maxR;
      const y = Math.sin(x * 0.35 + t * 2.2 + p.a) * maxR * 0.45 * (0.4 + energy);
      return { x, y, size: 1.1, alpha: 1 };
    }
    // 営業: 目標方向へ進む光
    case "vector": {
      const progress = (base * 0.28) % 1;
      const lane = (index % 3) - 1;
      return {
        x: -maxR + progress * maxR * 2,
        y: lane * maxR * 0.42,
        size: 1.2,
        alpha: Math.sin(progress * Math.PI),
      };
    }
    // デザイナー: 曲線・形状変化
    case "curve": {
      const k = 2 + Math.sin(t * 0.5) * 1.4;
      const r = maxR * p.r * (0.55 + 0.45 * Math.abs(Math.sin(base * k)));
      return { x: Math.cos(base) * r, y: Math.sin(base) * r, size: 1.1, alpha: 1 };
    }
    // プログラマー: ノード・グリッド
    case "grid": {
      const cols = 4;
      const gx = (index % cols) / (cols - 1) - 0.5;
      const gy = Math.floor(index / cols) / (cols - 1) - 0.5;
      const jitter = Math.sin(t * 1.6 + index) * 0.05 * energy;
      return {
        x: (gx + jitter) * maxR * 1.75,
        y: (gy + jitter) * maxR * 1.75,
        size: 1.05,
        alpha: 0.45 + 0.55 * Math.abs(Math.sin(t * 1.2 + index * 0.7)),
      };
    }
    // 事務・秘書: 整理される線
    case "align": {
      const target = ((index / total) * 2 - 1) * maxR * 0.9;
      const settle = 0.5 + 0.5 * Math.sin(t * 0.7);
      const scatter = Math.sin(index * 4.7 + p.a) * maxR * 0.5;
      return {
        x: target,
        y: scatter * (1 - settle),
        size: 1.05,
        alpha: 0.55 + settle * 0.45,
      };
    }
    // 法務: 境界・保護
    case "shield": {
      const ring = index % 2 === 0 ? 1 : 0.62;
      const r = maxR * ring;
      const angle = (index / total) * Math.PI * 2 + t * 0.35;
      return {
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
        size: index % 2 === 0 ? 1.25 : 0.9,
        alpha: 0.5 + 0.5 * Math.sin(t * 1.1 + index),
      };
    }
    // 財務: 規則的なパルス
    case "pulse": {
      const phase = (t * 1.1 + index / total) % 1;
      const r = maxR * phase;
      const angle = (index / total) * Math.PI * 2;
      return {
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
        size: 1.15,
        alpha: 1 - phase,
      };
    }
    default:
      return { x: 0, y: 0, size: 1, alpha: 1 };
  }
}

function hexAlpha(hex: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
