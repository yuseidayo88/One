"use client";

import { useCallback, useRef, useState } from "react";
import { motion } from "motion/react";
import type { EmployeeInstance } from "@/lib/core/types";
import { useMotionLevel } from "@/components/motion/useMotionLevel";
import { layoutAnimationEnabled } from "@/lib/motion/level";
import { phaseTransition } from "@/lib/motion/transition";
import { useOrchestrator } from "@/components/orchestrator/OrchestratorContext";
import {
  OnlineDot,
  OrchestratorComposer,
  OrchestratorIdenticon,
  OrchestratorMessages,
} from "@/components/orchestrator/OrchestratorParts";
import { AllGlyphs as Glyphs } from "@/components/ui/primitives";
import { usePersisted } from "@/components/shell/usePersisted";
import { PROJECT_STATUS_LABEL } from "@/lib/projects/status";

/** 仕様どおり 360〜420px。持ち手でこの範囲を動かせる。 */
export const PANEL_MIN_WIDTH = 360;
export const PANEL_MAX_WIDTH = 420;
export const PANEL_DEFAULT_WIDTH = 380;

const WIDTH_KEY = "ac_orch_width";
const COLLAPSED_KEY = "ac_orch_collapsed";

export function clampPanelWidth(width: number): number {
  if (!Number.isFinite(width)) return PANEL_DEFAULT_WIDTH;
  return Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, Math.round(width)));
}

/**
 * プロジェクト開始後の統括AI。右側に常駐する。
 *
 * 画面を移動しても閉じない。幅と折り畳み状態はブラウザに保存し、次に開いたときも同じ。
 * 成果物はここには出さない（中央またはモーダルで開く）。
 */
export function OrchestratorPanel({ employees }: { employees: EmployeeInstance[] }) {
  const { projectName, projectStatus, busy } = useOrchestrator();
  const level = useMotionLevel();
  const shared = layoutAnimationEnabled(level);

  // 幅と折り畳み状態はブラウザに残す。画面を移動しても、次に開いたときも同じ。
  const [widthRaw, setWidthRaw] = usePersisted(WIDTH_KEY, String(PANEL_DEFAULT_WIDTH));
  const [collapsedRaw, setCollapsedRaw] = usePersisted(COLLAPSED_KEY, "0");
  const width = clampPanelWidth(Number(widthRaw));
  const collapsed = collapsedRaw === "1";
  const dragRef = useRef<number | null>(null);

  const toggleCollapsed = useCallback(
    () => setCollapsedRaw(collapsed ? "0" : "1"),
    [collapsed, setCollapsedRaw],
  );

  const startResize = useCallback(
    (event: React.PointerEvent) => {
      const startX = event.clientX;
      const startWidth = width;
      dragRef.current = startWidth;

      const onMove = (e: PointerEvent) => {
        // ドラッグ中は保存せず、離した時点で 1 回だけ書き込む
        dragRef.current = clampPanelWidth(startWidth + (startX - e.clientX));
        setWidthRaw(String(dragRef.current), false);
      };
      const onUp = () => {
        if (dragRef.current !== null) setWidthRaw(String(dragRef.current), true);
        dragRef.current = null;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [setWidthRaw, width],
  );

  if (collapsed) {
    return (
      <aside
        className="hidden shrink-0 flex-col items-center gap-3 border-l px-2 py-3 ac-hairline lg:flex"
        style={{ width: 52, background: "var(--color-bg-panel)" }}
        aria-label="統括AI（折り畳み中）"
        data-orchestrator-placement="right"
        data-collapsed="true"
      >
        <button
          className="ac-btn ac-btn-ghost h-8 w-8 px-0"
          onClick={toggleCollapsed}
          aria-label="統括AIパネルを開く"
          title="統括AIパネルを開く"
        >
          {Glyphs.panelRight}
        </button>
        <OrchestratorIdenticon size={28} busy={busy} />
        <span
          className="text-[11px] text-[var(--color-text-faint)]"
          style={{ writingMode: "vertical-rl" }}
        >
          統括AI
        </span>
      </aside>
    );
  }

  return (
    <motion.aside
      className="relative hidden shrink-0 flex-col border-l ac-hairline lg:flex"
      style={{ background: "var(--color-bg-panel)" }}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0, width }}
      transition={phaseTransition(level, "panelOpen")}
      aria-label="統括AI"
      data-orchestrator-placement="right"
      data-collapsed="false"
    >
      {/* 幅を変える持ち手 */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="統括AIパネルの幅を変更"
        tabIndex={0}
        className="absolute left-0 top-0 hidden h-full w-1.5 cursor-col-resize lg:block"
        style={{ marginLeft: -3 }}
        onPointerDown={startResize}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          setWidthRaw(String(clampPanelWidth(width + (e.key === "ArrowLeft" ? 20 : -20))));
        }}
      />

      <header className="flex shrink-0 items-center gap-2.5 border-b px-3 py-3 ac-hairline">
        <motion.div
          layoutId={shared ? "orchestrator-identicon" : undefined}
          transition={phaseTransition(level, "dockMove")}
        >
          <OrchestratorIdenticon size={30} busy={busy} />
        </motion.div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold tracking-tight">統括AI</p>
          <OnlineDot busy={busy} />
        </div>
        <button
          className="ac-btn ac-btn-ghost h-8 w-8 shrink-0 px-0"
          onClick={toggleCollapsed}
          aria-label="統括AIパネルを折り畳む"
          title="折り畳む"
        >
          {Glyphs.panelRight}
        </button>
      </header>

      <div className="shrink-0 border-b px-3 py-2 ac-hairline">
        <p className="text-[10.5px] uppercase tracking-[0.08em] text-[var(--color-text-faint)]">
          参照中のプロジェクト
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[12px]">
          <span className="min-w-0 truncate">{projectName}</span>
          <span className="ac-chip shrink-0">{PROJECT_STATUS_LABEL[projectStatus]}</span>
        </p>
      </div>

      <OrchestratorMessages employees={employees} compact />

      <motion.div
        layoutId={shared ? "orchestrator-composer" : undefined}
        transition={phaseTransition(level, "dockMove")}
        className="shrink-0 border-t px-3 py-3 ac-hairline"
      >
        <OrchestratorComposer variant="panel" />
      </motion.div>
    </motion.aside>
  );
}

/**
 * 幅の狭い画面では、右パネルの代わりに下から出るシートにする。
 * 画面の大半を覆わず、実務画面を見ながら相談できる高さで止める。
 */
export function OrchestratorSheet({ employees }: { employees: EmployeeInstance[] }) {
  const { busy, projectName } = useOrchestrator();
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden">
      {!open && (
        <button
          className="ac-btn fixed bottom-20 right-4 z-30 shadow-lg"
          onClick={() => setOpen(true)}
          data-testid="orchestrator-sheet-open"
        >
          <OrchestratorIdenticon size={20} busy={busy} />
          統括AIに相談
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-40"
          style={{ background: "rgba(5,6,9,0.6)" }}
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="ac-enter absolute inset-x-0 bottom-0 flex flex-col rounded-t-2xl border-t ac-hairline"
            style={{ height: "78vh", background: "var(--color-bg-panel)" }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="統括AI"
            data-orchestrator-placement="sheet"
          >
            <header className="flex shrink-0 items-center gap-2.5 border-b px-3 py-3 ac-hairline">
              <OrchestratorIdenticon size={28} busy={busy} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold">統括AI</p>
                <OnlineDot busy={busy} />
              </div>
              <span className="ac-chip hidden max-w-[38%] truncate sm:inline-flex">{projectName}</span>
              <button className="ac-btn ac-btn-ghost h-8" onClick={() => setOpen(false)}>
                閉じる
              </button>
            </header>
            <OrchestratorMessages employees={employees} compact />
            <div className="shrink-0 border-t px-3 py-3 ac-hairline">
              <OrchestratorComposer variant="panel" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
