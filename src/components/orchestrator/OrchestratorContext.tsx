"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { Message, ProjectStatus, RoleKey, SafetyLevel } from "@/lib/core/types";
import { orchestratorPlacement } from "@/lib/projects/status";

/**
 * 統括AIの会話状態を、中央 Composer と右パネルで共有する。
 *
 * 位置が変わっても会話は作り直さない。同じ conversationId / projectId を使い、
 * メッセージ配列もこのコンテキスト 1 つだけが持つ（重複を作らない）。
 */

export interface ChoiceOption {
  id: string;
  kind: string;
  title: string;
  description: string;
  roleKey: RoleKey | null;
  reason: string;
  estimatedDurationMinutes: number;
  estimatedWorkTokens: number;
  riskLevel: SafetyLevel;
  recommended: boolean;
}

export interface OrchestratorState {
  projectId: string | null;
  projectName: string;
  projectStatus: ProjectStatus;
  placement: "center" | "right" | "none";
  conversationId: string;
  messages: Message[];
  options: ChoiceOption[];
  decisionId: string | null;
  selectedOptions: Set<string>;
  input: string;
  busy: boolean;
  notice: string;
  /** 実行中の統括AIリクエストを中断するための識別子 */
  running: boolean;
}

export interface OrchestratorApi extends OrchestratorState {
  setInput: (value: string) => void;
  toggleOption: (id: string) => void;
  send: (text?: string) => Promise<void>;
  execute: () => Promise<void>;
  stop: () => void;
  estimatedWorkTokens: number;
}

const Ctx = createContext<OrchestratorApi | null>(null);

export function useOrchestrator(): OrchestratorApi {
  const value = useContext(Ctx);
  if (!value) throw new Error("useOrchestrator must be used inside OrchestratorProvider");
  return value;
}

export function OrchestratorProvider({
  projectId,
  projectName,
  projectStatus,
  conversationId,
  initialMessages,
  initialOptions,
  initialDecisionId,
  children,
}: {
  projectId: string | null;
  projectName: string;
  projectStatus: ProjectStatus;
  conversationId: string;
  initialMessages: Message[];
  initialOptions: ChoiceOption[];
  initialDecisionId: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [options, setOptions] = useState<ChoiceOption[]>(initialOptions);
  const [decisionId, setDecisionId] = useState<string | null>(initialDecisionId);
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(
    () => new Set(initialOptions.filter((o) => o.recommended).map((o) => o.id)),
  );
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState("");
  const [controller, setController] = useState<AbortController | null>(null);

  // 別のプロジェクト（＝別の会話）に切り替わったときだけ、サーバーの内容へ戻す。
  // 同じ会話のままなら、ここで作った履歴を捨てない（中央→右パネルでも作り直さない）。
  const [syncedConversationId, setSyncedConversationId] = useState(conversationId);
  if (syncedConversationId !== conversationId) {
    setSyncedConversationId(conversationId);
    setMessages(initialMessages);
    setOptions(initialOptions);
    setDecisionId(initialDecisionId);
    setSelectedOptions(new Set(initialOptions.filter((o) => o.recommended).map((o) => o.id)));
  }

  const toggleOption = useCallback((id: string) => {
    setSelectedOptions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const stop = useCallback(() => {
    controller?.abort();
    setController(null);
    setBusy(false);
    setRunning(false);
    setNotice("実行を停止しました。");
  }, [controller]);

  const send = useCallback(
    async (override?: string) => {
      const content = (override ?? input).trim();
      if (!content || busy) return;
      const ac = new AbortController();
      setController(ac);
      setBusy(true);
      setRunning(true);
      setNotice("");
      setInput("");
      setMessages((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}`,
          organizationId: "",
          conversationId,
          author: "user",
          employeeId: null,
          content,
          containsUntrustedData: false,
          createdAt: new Date().toISOString(),
        },
      ]);

      try {
        const res = await fetch("/api/director/message", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ conversationId, content }),
          signal: ac.signal,
        });
        const json = await res.json();
        if (!res.ok) {
          setNotice(json?.error?.message ?? "送信に失敗しました");
          return;
        }
        const data = json.data as {
          message: string;
          decisionId: string;
          blocked: boolean;
          options: ChoiceOption[];
        };
        setMessages((prev) => [
          ...prev,
          {
            id: `local-reply-${Date.now()}`,
            organizationId: "",
            conversationId,
            author: "employee",
            employeeId: null,
            content: data.message,
            containsUntrustedData: false,
            createdAt: new Date().toISOString(),
          },
        ]);
        setOptions(data.options);
        setDecisionId(data.blocked ? null : data.decisionId);
        setSelectedOptions(new Set(data.options.filter((o) => o.recommended).map((o) => o.id)));
        // 相談によってプロジェクトの状態が進む（下書き→計画中→実行待ち）ので、
        // ヘッダーの表示をサーバーの値に合わせ直す。会話はここでは作り直されない。
        router.refresh();
      } catch (error) {
        if ((error as Error).name !== "AbortError") setNotice("通信に失敗しました");
      } finally {
        setBusy(false);
        setRunning(false);
        setController(null);
      }
    },
    [busy, conversationId, input, router],
  );

  const execute = useCallback(async () => {
    if (!decisionId || selectedOptions.size === 0 || busy) return;
    setBusy(true);
    setRunning(true);
    setNotice("");
    try {
      const res = await fetch("/api/director/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decisionId,
          selectedOptionIds: [...selectedOptions],
          projectId,
          startImmediately: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        // 失敗しても入力と会話は保持する（中央に留まる）
        setNotice(json?.error?.message ?? "実行に失敗しました。もう一度お試しください。");
        return;
      }
      setOptions([]);
      setDecisionId(null);
      setNotice(json.data.message);
      // active になったら RSC を再取得し、統括AIが右パネルへ移る
      router.refresh();
    } catch {
      setNotice("通信に失敗しました。もう一度お試しください。");
    } finally {
      setBusy(false);
      setRunning(false);
    }
  }, [busy, decisionId, projectId, router, selectedOptions]);

  const estimatedWorkTokens = useMemo(
    () =>
      options
        .filter((o) => selectedOptions.has(o.id))
        .reduce((sum, o) => sum + o.estimatedWorkTokens, 0),
    [options, selectedOptions],
  );

  const value: OrchestratorApi = {
    projectId,
    projectName,
    projectStatus,
    placement: orchestratorPlacement(projectStatus),
    conversationId,
    messages,
    options,
    decisionId,
    selectedOptions,
    input,
    busy,
    notice,
    running,
    setInput,
    toggleOption,
    send,
    execute,
    stop,
    estimatedWorkTokens,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
