"use client";

import { useEffect, useMemo, useRef } from "react";
import type { EmployeeInstance, EmployeeStatus, Task, TaskEvent, TaskStatus } from "@/lib/core/types";
import { subscribeFrame, motionEnabled } from "@/components/particles/ticker";
import { EmployeeParticles, ROLE_VISUALS } from "@/components/particles/EmployeeParticles";

/**
 * 仕事の進行キャンバス。
 *
 * ドットグリッド上に、タスクをノードカードとして並べ、
 * 間を接続線と「+」コネクタで結ぶ（ワークフロービルダーの見た目）。
 * 装飾ではなく、実際の task_events / タスク状態と同期する。
 *  - 実行中ノードは役職色で発光する
 *  - 実行中の区間は光がノード間を移動する
 *  - 承認待ちはユーザーの位置（オレンジ）で停止する
 *  - エラー・停止・完了もカード上で示す
 */

const NODE_W = 178;
const NODE_H = 56;
const GAP = 56;
const PAD_X = 18;
const PAD_Y = 16;

interface FlowNode {
  id: string;
  label: string;
  roleKey: EmployeeInstance["roleKey"] | null;
  seed: string;
  status: TaskStatus;
}

/** タスク状態 → 粒子の動きの強さ（EmployeeParticles の語彙へ写像） */
const PARTICLE_STATUS: Record<TaskStatus, EmployeeStatus> = {
  idea: "paused",
  todo: "idle",
  queued: "idle",
  running: "working",
  awaiting_approval: "awaiting_approval",
  revising: "working",
  done: "done",
  blocked: "error",
};

const STATUS_COLOR: Record<TaskStatus, string> = {
  idea: "#6c7481",
  todo: "#8f97a5",
  queued: "#a78bfa",
  running: "#4da3ff",
  awaiting_approval: "#f2a33c",
  revising: "#e2c13c",
  done: "#34d27b",
  blocked: "#f26b5e",
};

function statusText(status: TaskStatus): string {
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

  const nodes: FlowNode[] = useMemo(
    () =>
      tasks.map((task) => {
        const employee = employees.find((e) => e.id === task.assigneeEmployeeId) ?? null;
        return {
          id: task.id,
          label: task.title,
          roleKey: employee?.roleKey ?? null,
          seed: employee?.avatarSeed ?? task.id.slice(0, 8),
          status: task.status,
        };
      }),
    [tasks, employees],
  );

  const contentWidth = PAD_X * 2 + nodes.length * NODE_W + Math.max(0, nodes.length - 1) * GAP;
  const height = NODE_H + PAD_Y * 2;

  /* 接続線・+コネクタ・移動する光は canvas レイヤーに描く */
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

      for (let i = 0; i < nodes.length - 1; i++) {
        const x1 = PAD_X + i * (NODE_W + GAP) + NODE_W;
        const x2 = PAD_X + (i + 1) * (NODE_W + GAP);
        const mid = (x1 + x2) / 2;
        const current = nodes[i]!;
        const next = nodes[i + 1]!;
        const done = current.status === "done";
        const active = current.status === "running" || next.status === "running";

        ctx.strokeStyle = done
          ? "rgba(52,210,123,0.5)"
          : active
            ? "rgba(77,163,255,0.55)"
            : "rgba(47,52,64,1)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x1 + 4, y);
        ctx.lineTo(x2 - 4, y);
        ctx.stroke();

        // 実行中の区間は光の粒がノード間を移動する
        if (active) {
          const progress = (t * 0.5 + i * 0.31) % 1;
          const px = x1 + 6 + (x2 - x1 - 12) * progress;
          const glow = ctx.createRadialGradient(px, y, 0, px, y, 9);
          glow.addColorStop(0, "rgba(120,170,255,0.9)");
          glow.addColorStop(1, "rgba(120,170,255,0)");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(px, y, 9, 0, Math.PI * 2);
          ctx.fill();
        }

        // 「+」コネクタ
        ctx.beginPath();
        ctx.arc(mid, y, 8, 0, Math.PI * 2);
        ctx.fillStyle = done ? "rgba(23,42,32,1)" : "#171a21";
        ctx.fill();
        ctx.strokeStyle = done ? "rgba(52,210,123,0.5)" : "rgba(47,52,64,1)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.strokeStyle = done ? "rgba(52,210,123,0.85)" : "rgba(154,163,177,0.9)";
        ctx.beginPath();
        ctx.moveTo(mid - 3.2, y);
        ctx.lineTo(mid + 3.2, y);
        ctx.moveTo(mid, y - 3.2);
        ctx.lineTo(mid, y + 3.2);
        ctx.stroke();
      }
    };

    draw(0, 16);
    return subscribeFrame(draw);
  }, [nodes, contentWidth, height]);

  if (nodes.length === 0) {
    return (
      <div className="ac-dotgrid rounded-2xl border px-4 py-6 text-center text-[12px] text-[var(--color-text-faint)] ac-hairline">
        タスクを作成すると、ここに進行フローが表示されます。
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="ac-dotgrid overflow-x-auto rounded-2xl border ac-hairline">
        <div className="relative" style={{ width: contentWidth, height }}>
          <canvas
            ref={canvasRef}
            className="pointer-events-none absolute inset-0"
            style={{ width: contentWidth, height }}
            aria-hidden="true"
          />
          {nodes.map((node, i) => {
            const visual = node.roleKey ? ROLE_VISUALS[node.roleKey] : null;
            const roleColor = visual?.colors[1] ?? "#8f97a5";
            const running = node.status === "running";
            const awaiting = node.status === "awaiting_approval";
            const blocked = node.status === "blocked";
            return (
              <div
                key={node.id}
                className="absolute z-10 flex items-center gap-2.5 rounded-[14px] border px-3"
                style={{
                  left: PAD_X + i * (NODE_W + GAP),
                  top: PAD_Y,
                  width: NODE_W,
                  height: NODE_H,
                  background: "rgba(20,22,28,0.94)",
                  borderColor: running
                    ? `${roleColor}88`
                    : awaiting
                      ? "rgba(242,163,60,0.55)"
                      : blocked
                        ? "rgba(242,107,94,0.55)"
                        : "var(--color-line-strong)",
                  boxShadow: running ? `0 0 20px ${roleColor}30` : "none",
                }}
                title={node.label}
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]"
                  style={{ background: `color-mix(in srgb, ${roleColor} 15%, transparent)` }}
                  aria-hidden
                >
                  {node.roleKey ? (
                    <EmployeeParticles
                      roleKey={node.roleKey}
                      status={PARTICLE_STATUS[node.status]}
                      seed={node.seed}
                      size={24}
                    />
                  ) : (
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: roleColor }}
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11.5px] font-medium leading-tight">
                    {node.label}
                  </span>
                  <span
                    className="mt-0.5 flex items-center gap-1.5 text-[10.5px] font-medium"
                    style={{ color: STATUS_COLOR[node.status] }}
                  >
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{ background: STATUS_COLOR[node.status] }}
                      aria-hidden
                    />
                    {statusText(node.status)}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {/* 実イベントの最新行（アニメーションが実データと同期していることを示す） */}
      {events.length > 0 && (
        <p className="mt-1.5 truncate text-[11px] text-[var(--color-text-faint)]">
          最新: {events[events.length - 1]!.message}
        </p>
      )}
    </div>
  );
}
