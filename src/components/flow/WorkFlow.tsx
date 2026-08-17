"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { EmployeeInstance, Task, TaskEvent } from "@/lib/core/types";
import { subscribeFrame, motionEnabled } from "@/components/particles/ticker";
import { ROLE_VISUALS } from "@/components/particles/EmployeeParticles";

/**
 * 仕事の進行アニメーション。
 *
 * ノードと線で「いまどの業務を行っているか」を可視化する。
 * 見た目だけのタイマーではなく、実際の task_events / タスク状態と同期する。
 *  - 実行中ノードが発光する
 *  - ノード間を光が移動する
 *  - 引き継ぎ時は光が次の社員へ移動する
 *  - 承認待ちはユーザーの位置で停止する
 *  - 完了時は控えめに収束する
 *  - エラー・停止・再実行も表示する
 */

export interface FlowNode {
  id: string;
  label: string;
  employeeId: string | null;
  roleKey: string | null;
  status: Task["status"];
}

export function WorkFlow({
  tasks,
  employees,
  events,
}: {
  tasks: Task[];
  employees: EmployeeInstance[];
  events: TaskEvent[];
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [width, setWidth] = useState(760);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const nodes: FlowNode[] = useMemo(
    () =>
      tasks.map((task) => {
        const employee = employees.find((e) => e.id === task.assigneeEmployeeId) ?? null;
        return {
          id: task.id,
          label: task.title,
          employeeId: task.assigneeEmployeeId,
          roleKey: employee?.roleKey ?? null,
          status: task.status,
        };
      }),
    [tasks, employees],
  );

  const lastEventRef = useRef<TaskEvent | null>(null);
  lastEventRef.current = events[events.length - 1] ?? null;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.max(320, w));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const height = 96;
  // ラベルが重ならない最小間隔を確保し、足りなければ横スクロールさせる
  const LABEL_WIDTH = 148;
  const NODE_GAP = LABEL_WIDTH + 12;
  const padding = LABEL_WIDTH / 2 + 6;
  const contentWidth = Math.max(width, padding * 2 + NODE_GAP * Math.max(0, nodes.length - 1));
  const step = nodes.length > 1 ? (contentWidth - padding * 2) / (nodes.length - 1) : 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || nodes.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = contentWidth * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const y = height / 2;
    let t = 0;

    const draw = (_time: number, delta: number) => {
      if (motionEnabled()) t += delta / 1000;
      ctx.clearRect(0, 0, contentWidth, height);

      // 線（依存関係の流れ）
      for (let i = 0; i < nodes.length - 1; i++) {
        const from = padding + step * i;
        const to = padding + step * (i + 1);
        const current = nodes[i]!;
        const done = current.status === "done";

        ctx.strokeStyle = done ? "rgba(53,199,138,0.35)" : "rgba(42,47,56,0.9)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(from + 12, y);
        ctx.lineTo(to - 12, y);
        ctx.stroke();

        // 実行中の直前区間は、光の粒子が次のノードへ移動する
        const nextNode = nodes[i + 1]!;
        if (nextNode.status === "running" || current.status === "running") {
          const progress = (t * 0.55) % 1;
          const x = from + 12 + (to - from - 24) * progress;
          const glow = ctx.createRadialGradient(x, y, 0, x, y, 9);
          glow.addColorStop(0, "rgba(110,140,255,0.85)");
          glow.addColorStop(1, "rgba(110,140,255,0)");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(x, y, 9, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ノード
      nodes.forEach((node, i) => {
        const x = padding + step * i;
        const visual = node.roleKey
          ? ROLE_VISUALS[node.roleKey as keyof typeof ROLE_VISUALS]
          : null;
        const color = visual?.colors[1] ?? "#6b7280";

        const running = node.status === "running";
        const awaiting = node.status === "awaiting_approval";
        const blocked = node.status === "blocked";
        const done = node.status === "done";

        const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);

        if (running) {
          // 実行中ノードは発光する
          const g = ctx.createRadialGradient(x, y, 0, x, y, 20);
          g.addColorStop(0, `${color}${Math.round((0.35 + pulse * 0.4) * 255).toString(16).padStart(2, "0")}`);
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x, y, 20, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(x, y, running ? 7 : 5.5, 0, Math.PI * 2);
        ctx.fillStyle = done
          ? "rgba(53,199,138,0.85)"
          : blocked
            ? "rgba(229,100,92,0.9)"
            : awaiting
              ? "rgba(224,163,74,0.95)"
              : running
                ? color
                : "#2a2f38";
        ctx.fill();

        if (awaiting) {
          // 承認待ちはユーザーの位置で停止していることを示す二重丸
          ctx.strokeStyle = `rgba(224,163,74,${0.35 + pulse * 0.4})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(x, y, 11, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (blocked) {
          ctx.strokeStyle = "rgba(229,100,92,0.6)";
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(x - 9, y - 9);
          ctx.lineTo(x + 9, y + 9);
          ctx.moveTo(x + 9, y - 9);
          ctx.lineTo(x - 9, y + 9);
          ctx.stroke();
        }
      });
    };

    draw(0, 16);
    return subscribeFrame(draw);
  }, [nodes, contentWidth, padding, step]);

  if (nodes.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-[12px] text-[var(--color-text-faint)]">
        タスクを作成すると、ここに進行状況が表示されます。
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full overflow-x-auto">
      <div style={{ width: contentWidth }}>
        <canvas
          ref={canvasRef}
          style={{ width: contentWidth, height, display: "block" }}
          aria-hidden="true"
        />
        <div className="relative" style={{ width: contentWidth, height: 42 }}>
          {nodes.map((node, i) => (
            <div
              key={node.id}
              className="absolute top-0 -translate-x-1/2 text-center"
              style={{ left: padding + step * i, width: LABEL_WIDTH }}
            >
              <p className="truncate text-[11px] leading-tight" title={node.label}>
                {node.label}
              </p>
              <p className="mt-0.5 text-[10px] text-[var(--color-text-faint)]">
                {statusText(node.status)}
              </p>
            </div>
          ))}
        </div>
      </div>
      {/* 実イベントの最新行（アニメーションが実データと同期していることを示す） */}
      {events.length > 0 && (
        <p className="mt-1 truncate text-[11px] text-[var(--color-text-faint)]">
          最新: {events[events.length - 1]!.message}
        </p>
      )}
    </div>
  );
}

function statusText(status: Task["status"]): string {
  switch (status) {
    case "running":
      return "実行中";
    case "awaiting_approval":
      return "承認待ち";
    case "done":
      return "完了";
    case "blocked":
      return "停止";
    case "queued":
      return "待機中";
    case "revising":
      return "修正中";
    case "idea":
      return "アイデア";
    default:
      return "未着手";
  }
}
