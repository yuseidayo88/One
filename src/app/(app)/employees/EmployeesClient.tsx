"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Artifact, EmployeeInstance, MemoryRecord, RoleKey, Task } from "@/lib/core/types";
import { ALL_ROLE_KEYS, ROLE_DEFINITIONS } from "@/lib/roles/registry";
import { EmployeeParticles } from "@/components/particles/EmployeeParticles";
import { EmployeeStatusBadge, Modal, SectionLabel, TaskStatusBadge } from "@/components/ui/primitives";

export function EmployeesClient({
  employees,
  tasks,
  memories,
  artifacts,
}: {
  employees: EmployeeInstance[];
  tasks: Task[];
  memories: MemoryRecord[];
  artifacts: Artifact[];
}) {
  const router = useRouter();
  const [hireOpen, setHireOpen] = useState(false);
  const [hireRole, setHireRole] = useState<RoleKey>("market_research");
  const [hireName, setHireName] = useState("");
  const [hireSpecialty, setHireSpecialty] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [handoffText, setHandoffText] = useState("");
  const [handoffResult, setHandoffResult] = useState<null | {
    message: string;
    ownWork: { title: string }[];
    handoffs: { toRoleName: string; title: string; reason: string; hiringRequired: boolean }[];
  }>(null);

  const selected = employees.find((e) => e.id === selectedId) ?? null;

  async function hire() {
    setBusy(true);
    try {
      await fetch("/api/employees", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "hire",
          roleKey: hireRole,
          name: hireName || undefined,
          specialty: hireSpecialty || undefined,
        }),
      });
      setHireOpen(false);
      setHireName("");
      setHireSpecialty("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function checkHandoff() {
    if (!selected || !handoffText.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "handoff_proposal",
          employeeId: selected.id,
          requestText: handoffText,
        }),
      });
      const json = await res.json();
      if (res.ok) setHandoffResult(json.data);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full px-4 py-5" style={{ maxWidth: 1200 }}>
      <header className="mb-4 flex items-center gap-3">
        <h1 className="text-[16px] font-semibold tracking-tight">AI社員</h1>
        <button className="ac-btn ac-btn-primary ml-auto" onClick={() => setHireOpen(true)}>
          社員を採用する
        </button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {employees.map((employee) => {
          const role = ROLE_DEFINITIONS[employee.roleKey];
          const own = tasks.filter((t) => t.assigneeEmployeeId === employee.id);
          const current = own.find((t) => t.id === employee.currentTaskId);
          const queued = own.filter((t) => t.status === "queued");
          return (
            <button
              key={employee.id}
              className="ac-panel p-4 text-left transition-colors hover:bg-[var(--color-bg-hover)]"
              onClick={() => {
                setSelectedId(employee.id);
                setHandoffResult(null);
                setHandoffText("");
              }}
            >
              <div className="flex items-center gap-3">
                <EmployeeParticles
                  roleKey={employee.roleKey}
                  status={employee.status}
                  seed={employee.avatarSeed}
                  size={44}
                />
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-medium">{employee.name}</p>
                  <p className="truncate text-[11.5px] text-[var(--color-text-faint)]">
                    {role.name} ・ {employee.specialty}
                  </p>
                  <EmployeeStatusBadge status={employee.status} />
                </div>
              </div>

              <p className="mt-3 line-clamp-2 text-[11.5px] leading-relaxed text-[var(--color-text-muted)]">
                {role.headline}
              </p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="ac-chip">メインタスク {current ? 1 : 0} / 1</span>
                <span className="ac-chip">待機 {queued.length}</span>
                <span className="ac-chip">
                  成果物 {artifacts.filter((a) => a.employeeId === employee.id).length}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* 採用モーダル */}
      <Modal
        open={hireOpen}
        onClose={() => setHireOpen(false)}
        title="AI社員を採用する"
        footer={
          <>
            <button className="ac-btn" onClick={() => setHireOpen(false)}>
              キャンセル
            </button>
            <button className="ac-btn ac-btn-primary" onClick={hire} disabled={busy}>
              採用する
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-[var(--color-text-muted)]">職種</span>
            <select
              className="ac-input"
              value={hireRole}
              onChange={(e) => setHireRole(e.target.value as RoleKey)}
            >
              {ALL_ROLE_KEYS.filter((k) => k !== "director").map((key) => (
                <option key={key} value={key}>
                  {ROLE_DEFINITIONS[key].name}
                </option>
              ))}
            </select>
          </label>

          <div className="ac-panel p-3 text-[12px] leading-relaxed text-[var(--color-text-muted)]">
            {ROLE_DEFINITIONS[hireRole].description}
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-[var(--color-text-muted)]">社員名（任意）</span>
            <input
              className="ac-input"
              value={hireName}
              onChange={(e) => setHireName(e.target.value)}
              placeholder={ROLE_DEFINITIONS[hireRole].name}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-[var(--color-text-muted)]">
              専門分野（同じ職種でも分けられます）
            </span>
            <input
              className="ac-input"
              value={hireSpecialty}
              onChange={(e) => setHireSpecialty(e.target.value)}
              placeholder={ROLE_DEFINITIONS[hireRole].defaultSpecialty}
            />
          </label>

          <p className="text-[11.5px] text-[var(--color-text-faint)]">
            社員名と専門分野は変更できますが、許可された業務・ツール・データ権限は
            サービス側で管理され、変更できません。
          </p>
        </div>
      </Modal>

      {/* 社員詳細 */}
      <Modal
        open={!!selected}
        onClose={() => setSelectedId(null)}
        title={selected?.name ?? ""}
        wide
      >
        {selected && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <EmployeeParticles
                roleKey={selected.roleKey}
                status={selected.status}
                seed={selected.avatarSeed}
                size={52}
              />
              <div>
                <p className="text-[13px]">{ROLE_DEFINITIONS[selected.roleKey].name}</p>
                <p className="text-[12px] text-[var(--color-text-muted)]">{selected.specialty}</p>
                <EmployeeStatusBadge status={selected.status} />
              </div>
            </div>

            <p className="text-[13px] leading-relaxed text-[var(--color-text-muted)]">
              {ROLE_DEFINITIONS[selected.roleKey].description}
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <SectionLabel>担当タスク</SectionLabel>
                <ul className="flex flex-col gap-1">
                  {tasks
                    .filter((t) => t.assigneeEmployeeId === selected.id)
                    .map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-2 text-[12.5px]">
                        <span className="truncate">{t.title}</span>
                        <TaskStatusBadge status={t.status} />
                      </li>
                    ))}
                  {tasks.filter((t) => t.assigneeEmployeeId === selected.id).length === 0 && (
                    <li className="text-[12px] text-[var(--color-text-faint)]">なし</li>
                  )}
                </ul>
              </div>

              <div>
                <SectionLabel>この社員のメモリ</SectionLabel>
                <ul className="flex flex-col gap-1">
                  {memories
                    .filter((m) => m.employeeId === selected.id)
                    .map((m) => (
                      <li key={m.id} className="text-[12.5px]">
                        <span className="font-medium">{m.title}</span>
                        <span className="block text-[11.5px] text-[var(--color-text-faint)]">
                          {m.content}
                        </span>
                      </li>
                    ))}
                  {memories.filter((m) => m.employeeId === selected.id).length === 0 && (
                    <li className="text-[12px] text-[var(--color-text-faint)]">なし</li>
                  )}
                </ul>
              </div>
            </div>

            <div>
              <SectionLabel>権限（サービス側で管理）</SectionLabel>
              <div className="flex flex-col gap-2 text-[11.5px]">
                <PermissionRow
                  label="使用できるツール"
                  values={ROLE_DEFINITIONS[selected.roleKey].allowedTools}
                />
                <PermissionRow
                  label="アクセスできるデータ"
                  values={ROLE_DEFINITIONS[selected.roleKey].allowedDataScopes}
                />
                <PermissionRow
                  label="作成できる成果物"
                  values={ROLE_DEFINITIONS[selected.roleKey].allowedArtifactTypes}
                />
                <PermissionRow
                  label="禁止された行為"
                  values={ROLE_DEFINITIONS[selected.roleKey].prohibitedActions}
                />
                <PermissionRow
                  label="承認が必要な操作"
                  values={ROLE_DEFINITIONS[selected.roleKey].approvalRequiredActions}
                />
              </div>
            </div>

            {/* 担当外業務の引き継ぎ確認 */}
            <div>
              <SectionLabel>この社員に依頼してみる</SectionLabel>
              <p className="mb-2 text-[11.5px] text-[var(--color-text-faint)]">
                担当外の業務が含まれる場合、実行せずに引き継ぎ案を返します。
              </p>
              <textarea
                className="ac-input"
                rows={2}
                value={handoffText}
                onChange={(e) => setHandoffText(e.target.value)}
                placeholder="例）LPを作って、法的問題を確認して、営業もして"
              />
              <button className="ac-btn mt-2" onClick={checkHandoff} disabled={busy}>
                依頼内容を確認する
              </button>

              {handoffResult && (
                <div className="ac-panel mt-3 p-3">
                  <p className="text-[12.5px] font-medium">{handoffResult.message}</p>
                  {handoffResult.ownWork.length > 0 && (
                    <div className="mt-2">
                      <p className="text-[11px] text-[var(--color-text-faint)]">
                        この社員が担当できる部分
                      </p>
                      <ul className="mt-1 flex flex-col gap-0.5 text-[12px]">
                        {handoffResult.ownWork.map((w, i) => (
                          <li key={i}>・{w.title}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {handoffResult.handoffs.length > 0 && (
                    <div className="mt-2">
                      <p className="text-[11px] text-[var(--color-text-faint)]">引き継ぎ提案</p>
                      <ul className="mt-1 flex flex-col gap-1 text-[12px]">
                        {handoffResult.handoffs.map((h, i) => (
                          <li key={i}>
                            ・{h.toRoleName} → {h.title}
                            {h.hiringRequired && (
                              <span className="ac-chip ml-1.5">採用が必要</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function PermissionRow({ label, values }: { label: string; values: readonly string[] }) {
  return (
    <div>
      <p className="text-[var(--color-text-faint)]">{label}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {values.length === 0 ? (
          <span className="text-[var(--color-text-faint)]">なし</span>
        ) : (
          values.map((v) => (
            <span key={v} className="ac-chip">
              {v}
            </span>
          ))
        )}
      </div>
    </div>
  );
}
