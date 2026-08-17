import type { ProjectStatus } from "@/lib/core/types";

/**
 * 統括AIの表示位置は projectStatus から導出する。
 *
 * CSS で無理に動かすのではなく、この関数を UI とテストの唯一の判断基準にする。
 * サーバー(RSC)がこの結果で初期レイアウトを決めるため、リロード後も位置が復元される。
 */

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: "下書き",
  planning: "計画中",
  ready: "実行待ち",
  active: "進行中",
  paused: "一時停止",
  completed: "完了",
  cancelled: "中止",
};

/** 開始前: 統括AIは中央下部の Composer に居る */
export function showOrchestratorInCenter(status: ProjectStatus): boolean {
  return status === "draft" || status === "planning" || status === "ready";
}

/** 開始後: 統括AIは右パネルに居る */
export function showOrchestratorInRightPanel(status: ProjectStatus): boolean {
  return status === "active" || status === "paused" || status === "completed";
}

/**
 * cancelled はどちらにも属さない（プロジェクトを閉じた状態）。
 * 呼び出し側が一覧へ戻すため、ここでは false / false を返す。
 */
export function orchestratorPlacement(status: ProjectStatus): "center" | "right" | "none" {
  if (showOrchestratorInCenter(status)) return "center";
  if (showOrchestratorInRightPanel(status)) return "right";
  return "none";
}

/** 実務画面（概要/タスク/ファイル/履歴）を出すか */
export function hasWorkspace(status: ProjectStatus): boolean {
  return showOrchestratorInRightPanel(status);
}

const ALLOWED: Record<ProjectStatus, ProjectStatus[]> = {
  draft: ["planning", "cancelled"],
  planning: ["ready", "draft", "cancelled"],
  // 実行に失敗したら ready のまま留まる（入力と会話を失わせない）
  ready: ["active", "planning", "cancelled"],
  active: ["paused", "completed", "cancelled"],
  paused: ["active", "cancelled", "completed"],
  completed: ["active"],
  cancelled: ["draft"],
};

export function canTransitionProject(from: ProjectStatus, to: ProjectStatus): boolean {
  if (from === to) return true;
  return ALLOWED[from].includes(to);
}
