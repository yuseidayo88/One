"use client";

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
import { PROJECT_STATUS_LABEL } from "@/lib/projects/status";

const SUGGESTIONS = [
  "市場を調査してほしい",
  "集客の戦略を考えたい",
  "収支計画を作ってほしい",
];

/**
 * プロジェクト開始前の統括AI。画面中央に居る。
 *
 * ここが会話の「主役」なので、実務タブは出さない。
 * 「実行する」を押すと同じ要素が右パネルへ移動する（layoutId で連続する）。
 */
export function OrchestratorCenter({ employees }: { employees: EmployeeInstance[] }) {
  const { projectName, projectStatus, busy } = useOrchestrator();
  const level = useMotionLevel();
  const shared = layoutAnimationEnabled(level);

  return (
    <section
      className="flex min-h-0 flex-1 flex-col"
      aria-label="統括AIとの相談"
      data-orchestrator-placement="center"
    >
      <header className="shrink-0 border-b px-4 py-3 ac-hairline">
        <div className="mx-auto flex max-w-[720px] items-center gap-2.5">
          <motion.div layoutId={shared ? "orchestrator-identicon" : undefined}>
            <OrchestratorIdenticon size={34} busy={busy} />
          </motion.div>
          <div className="min-w-0">
            <h1 className="truncate text-[14px] font-semibold tracking-tight">統括AI</h1>
            <div className="flex items-center gap-2">
              <OnlineDot busy={busy} />
              <span className="ac-chip">{PROJECT_STATUS_LABEL[projectStatus]}</span>
              <span className="truncate text-[11px] text-[var(--color-text-faint)]">
                {projectName}
              </span>
            </div>
          </div>
        </div>
      </header>

      <OrchestratorMessages employees={employees} />

      <motion.div
        layoutId={shared ? "orchestrator-composer" : undefined}
        transition={phaseTransition(level, "dockMove")}
        className="shrink-0 border-t px-4 py-3 ac-hairline"
      >
        <OrchestratorComposer variant="center" suggestions={SUGGESTIONS} />
      </motion.div>
    </section>
  );
}
