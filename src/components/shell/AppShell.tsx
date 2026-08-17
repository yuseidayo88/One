"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { appConfig, mainNavigation } from "@/config/app";
import type { Notification } from "@/lib/core/types";
import { Modal } from "@/components/ui/primitives";

export interface ShellUser {
  displayName: string;
  email: string;
  organizationName: string;
  isAdmin: boolean;
}

export function AppShell({
  user,
  notifications,
  available,
  children,
}: {
  user: ShellUser;
  notifications: Notification[];
  available: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const unread = notifications.filter((n) => !n.read).length;

  // コマンドパレット (⌘K / Ctrl+K)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const nav = [...mainNavigation, ...(user.isAdmin ? [{ href: "/admin", key: "admin", label: "管理者" }] : [])];
  const results = nav.filter(
    (item) => !query || item.label.includes(query) || item.key.includes(query.toLowerCase()),
  );

  async function emergencyStop() {
    if (!confirm("全社員のタスクを停止します。よろしいですか？")) return;
    await fetch("/api/employees", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "emergency_stop" }),
    });
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header
        className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b px-4 ac-hairline"
        style={{ background: "rgba(8,9,11,0.86)", backdropFilter: "blur(12px)" }}
      >
        <Link href="/office" className="flex shrink-0 items-center gap-2 px-1">
          <span
            className="inline-block h-4 w-4 rounded-[5px]"
            style={{ background: "linear-gradient(140deg,#6e8cff,#35c78a)" }}
            aria-hidden
          />
          <span className="hidden whitespace-nowrap text-[13px] font-semibold tracking-tight sm:inline">
            {appConfig.name}
          </span>
        </Link>

        <nav
          className="hidden items-center gap-0.5 rounded-full border p-1 ac-hairline xl:flex"
          style={{ background: "var(--color-bg-raised)" }}
          aria-label="メインナビゲーション"
        >
          {nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.key}
                href={item.href}
                className="rounded-full px-3 py-1 text-[12.5px] transition-colors"
                style={{
                  color: active ? "#ffffff" : "var(--color-text-muted)",
                  background: active ? "var(--color-bg-active)" : "transparent",
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex min-w-0 items-center gap-2">
          <span className="ac-chip hidden sm:inline-flex" title="利用可能なワークトークン">
            {available.toLocaleString("ja-JP")} WT
          </span>
          <button
            className="ac-btn ac-btn-ghost hidden sm:inline-flex"
            onClick={() => setPaletteOpen(true)}
            aria-label="コマンドパレットを開く"
            title="コマンドパレット（Cmd/Ctrl + K）"
          >
            検索
          </button>
          <Link
            href="/office#notifications"
            className="ac-btn ac-btn-ghost relative shrink-0 whitespace-nowrap"
            aria-label="通知"
          >
            通知
            {unread > 0 && (
              <span
                className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold"
                style={{ background: "var(--color-accent)", color: "#0a0d16" }}
              >
                {unread}
              </span>
            )}
          </Link>
          <button
            className="ac-btn ac-btn-danger shrink-0 whitespace-nowrap"
            onClick={emergencyStop}
            title="全社員を停止する"
          >
            全停止
          </button>
        </div>
      </header>

      {/* 狭い画面向けナビ */}
      <nav
        className="flex gap-1 overflow-x-auto border-b px-3 py-2 xl:hidden ac-hairline"
        aria-label="メインナビゲーション（モバイル）"
      >
        {nav.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.key}
              href={item.href}
              className="shrink-0 rounded-full px-3 py-1 text-[12px]"
              style={{
                color: active ? "var(--color-text)" : "var(--color-text-muted)",
                background: active ? "var(--color-bg-active)" : "transparent",
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <main className="flex-1">{children}</main>

      <Modal open={paletteOpen} onClose={() => setPaletteOpen(false)} title="コマンドパレット">
        <input
          autoFocus
          className="ac-input mb-3"
          placeholder="移動先を検索…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results[0]) {
              setPaletteOpen(false);
              router.push(results[0].href);
            }
          }}
        />
        <ul className="flex flex-col gap-0.5">
          {results.map((item) => (
            <li key={item.key}>
              <button
                className="w-full rounded-md px-3 py-2 text-left text-[13px] transition-colors hover:bg-[var(--color-bg-hover)]"
                onClick={() => {
                  setPaletteOpen(false);
                  router.push(item.href);
                }}
              >
                {item.label}
                <span className="ml-2 text-[11px] text-[var(--color-text-faint)]">{item.href}</span>
              </button>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}
