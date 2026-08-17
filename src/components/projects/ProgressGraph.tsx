"use client";

import { useMemo } from "react";
import type { Task, TaskEvent } from "@/lib/core/types";
import { buildProgressSeries } from "@/lib/views/progress";
import { useMotionLevel } from "@/components/motion/useMotionLevel";
import { motionDuration } from "@/lib/motion/level";
import { ORCHESTRATOR_TRANSITION, TRANSITION_EASE_CSS } from "@/lib/motion/transition";
import { EmptyState } from "@/components/ui/primitives";

/**
 * 進捗グラフ。task_events から作った系列だけを描く。
 * イベントが無いときは線を引かず、その旨を出す（それらしい形を作らない）。
 */
export function ProgressGraph({
  tasks,
  events,
  height = 132,
}: {
  tasks: Task[];
  events: TaskEvent[];
  height?: number;
}) {
  const series = useMemo(() => buildProgressSeries(tasks, events), [tasks, events]);
  const level = useMotionLevel();

  if (series.points.length === 0) {
    return (
      <EmptyState
        title="まだ進捗の記録がありません"
        description="タスクが動き始めると、ここに実際のイベントから進捗が描かれます。"
      />
    );
  }

  const width = 640;
  const pad = 8;
  const maxCompleted = Math.max(1, series.totalTasks, ...series.points.map((p) => p.completed));
  const maxEvents = Math.max(1, ...series.points.map((p) => p.events));
  const stepX = (width - pad * 2) / Math.max(1, series.points.length - 1);
  const y = (value: number) => height - pad - (value / maxCompleted) * (height - pad * 2);

  const line = series.points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(pad + i * stepX).toFixed(1)},${y(p.completed).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${(pad + (series.points.length - 1) * stepX).toFixed(1)},${height - pad} L${pad},${height - pad} Z`;

  const drawMs = motionDuration(level, ORCHESTRATOR_TRANSITION.graphDraw.duration);
  const delayMs = motionDuration(level, ORCHESTRATOR_TRANSITION.graphDraw.delay);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[11.5px]">
        <span className="ac-chip tabular-nums">
          完了 {series.completedTasks} / {series.totalTasks}
        </span>
        <span className="ac-chip tabular-nums">
          進捗 {Math.round(series.ratio * 100)}%
        </span>
        {series.approvalWaits > 0 && (
          <span className="ac-chip tabular-nums">承認待ち発生 {series.approvalWaits} 回</span>
        )}
        {series.failures > 0 && (
          <span className="ac-chip tabular-nums" style={{ color: "var(--color-danger)" }}>
            失敗・停止 {series.failures} 回
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label={`進捗グラフ。完了 ${series.completedTasks} / ${series.totalTasks} タスク。`}
        style={{ display: "block" }}
      >
        <defs>
          <linearGradient id="ac-progress-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* 各期間のイベント量 */}
        {series.points.map((p, i) => {
          const h = (p.events / maxEvents) * (height - pad * 2) * 0.32;
          return (
            <rect
              key={p.at}
              x={pad + i * stepX - Math.max(1, stepX * 0.28)}
              y={height - pad - h}
              width={Math.max(2, stepX * 0.56)}
              height={h}
              rx={1}
              fill="var(--color-bg-active)"
            />
          );
        })}

        <path d={area} fill="url(#ac-progress-fill)" />
        <path
          d={line}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            strokeDasharray: 2000,
            strokeDashoffset: 0,
            animation:
              drawMs > 0
                ? `ac-draw ${drawMs}ms ${TRANSITION_EASE_CSS} ${delayMs}ms both`
                : undefined,
          }}
        />
      </svg>
    </div>
  );
}
