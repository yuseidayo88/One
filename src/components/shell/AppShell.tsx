"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { appConfig } from "@/config/app";
import { AllGlyphs as Glyphs, Modal } from "@/components/ui/primitives";

/**
 * 左サイドバー。ナビゲーション専用。
 *
 * AI社員一覧・プロジェクト一覧・タスクスレッドをここへ並べない。
 * 社員は「オフィス」の中に置く。
 */

export interface ShellUser {
  displayName: string;
  email: string;
  organizationName: string;
  isAdmin: boolean;
}

interface NavItem {
  href: string;
  key: string;
  label: string;
  glyph: ReactNode;
  badge?: number;
}

export function AppShell({
  user,
  available,
  pendingApprovals,
  children,
}: {
  user: ShellUser;
  available: number;
  pendingApprovals: number;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [navOpenMobile, setNavOpenMobile] = useState(false);

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

  // 画面が変わったらモバイルのドロワーを閉じる（effect ではなく描画中に同期する）
  const [navPathname, setNavPathname] = useState(pathname);
  if (navPathname !== pathname) {
    setNavPathname(pathname);
    setNavOpenMobile(false);
  }

  const main: NavItem[] = [
    { href: "/office", key: "office", label: "オフィス", glyph: Glyphs.grid },
    { href: "/tasks", key: "tasks", label: "タスク", glyph: Glyphs.checklist },
    { href: "/projects", key: "projects", label: "プロジェクト", glyph: Glyphs.folder },
    {
      href: "/approvals",
      key: "approvals",
      label: "承認待ち",
      glyph: Glyphs.warn,
      badge: pendingApprovals,
    },
    { href: "/knowledge", key: "knowledge", label: "ナレッジ", glyph: Glyphs.book },
    { href: "/integrations", key: "integrations", label: "連携", glyph: Glyphs.plug },
  ];

  const bottom: NavItem[] = [
    { href: "/usage", key: "usage", label: "使用量・料金", glyph: Glyphs.gauge },
    { href: "/settings", key: "settings", label: "設定", glyph: Glyphs.gear },
    ...(user.isAdmin
      ? [{ href: "/admin", key: "admin", label: "管理者", glyph: Glyphs.shield }]
      : []),
  ];

  const searchable = [...main, ...bottom];
  const results = searchable.filter(
    (item) => !query || item.label.includes(query) || item.key.includes(query.toLowerCase()),
  );

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const navBody = (
    <>
      <div className="flex items-center gap-2 px-2 py-1">
        <span
          className="inline-block h-5 w-5 shrink-0 rounded-[7px]"
          style={{ background: "linear-gradient(140deg,#3d7dff,#34d27b)" }}
          aria-hidden
        />
        <span className="truncate text-[13px] font-semibold tracking-tight">{appConfig.name}</span>
      </div>

      <div className="mt-3 flex flex-col gap-0.5">
        <Link href="/projects/new" className="ac-btn ac-btn-primary h-9 justify-start text-[12.5px]">
          {Glyphs.plus}
          新しい業務
        </Link>
        <button
          className="ac-btn ac-btn-ghost h-9 justify-start text-[12.5px]"
          onClick={() => setPaletteOpen(true)}
          title="⌘K"
        >
          {Glyphs.search}
          検索
        </button>
      </div>

      <nav className="mt-4 flex flex-1 flex-col gap-0.5" aria-label="メインナビゲーション">
        {main.map((item) => (
          <NavLink key={item.key} item={item} active={isActive(item.href)} />
        ))}
      </nav>

      <div className="mt-4 flex flex-col gap-0.5 border-t pt-3 ac-hairline">
        {bottom.map((item) => (
          <NavLink key={item.key} item={item} active={isActive(item.href)} />
        ))}

        <Link
          href="/usage"
          className="mt-2 rounded-xl border px-3 py-2 transition-colors ac-hairline hover:bg-[var(--color-bg-hover)]"
          style={{ background: "var(--color-bg-raised)" }}
        >
          <span className="block text-[10.5px] uppercase tracking-[0.08em] text-[var(--color-text-faint)]">
            ワークトークン
          </span>
          <span className="mt-0.5 block text-[14px] font-semibold tabular-nums">
            {available.toLocaleString("ja-JP")}
          </span>
        </Link>

        <p className="mt-2 truncate px-3 text-[11px] text-[var(--color-text-faint)]">
          {user.organizationName}
        </p>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen">
      {/* デスクトップ・タブレット: 左サイドバー */}
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden w-[228px] flex-col border-r px-3 py-3.5 ac-hairline md:flex"
        style={{ background: "var(--color-bg-panel)" }}
      >
        {navBody}
      </aside>

      {/* モバイル: 上部バー + 下部ナビ */}
      <header
        className="fixed inset-x-0 top-0 z-30 flex h-12 items-center gap-2 border-b px-3 ac-hairline md:hidden"
        style={{ background: "rgba(10,11,14,0.92)", backdropFilter: "blur(12px)" }}
      >
        <span
          className="inline-block h-5 w-5 rounded-[7px]"
          style={{ background: "linear-gradient(140deg,#3d7dff,#34d27b)" }}
          aria-hidden
        />
        <span className="truncate text-[13px] font-semibold">{appConfig.name}</span>
        <button
          className="ac-btn ac-btn-ghost ml-auto h-8 px-2"
          onClick={() => setPaletteOpen(true)}
          aria-label="検索"
        >
          {Glyphs.search}
        </button>
        <button
          className="ac-btn ac-btn-ghost h-8 px-2"
          onClick={() => setNavOpenMobile(true)}
          aria-label="メニュー"
        >
          {Glyphs.menu}
        </button>
      </header>

      {navOpenMobile && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ background: "rgba(5,6,9,0.6)" }}
          onClick={() => setNavOpenMobile(false)}
          role="presentation"
        >
          <div
            className="ac-enter absolute inset-y-0 left-0 flex w-[260px] flex-col border-r px-3 py-3.5 ac-hairline"
            style={{ background: "var(--color-bg-panel)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {navBody}
          </div>
        </div>
      )}

      <div className="flex min-h-screen w-full flex-col pt-12 md:pl-[228px] md:pt-0">
        <main className="flex-1">{children}</main>
      </div>

      {/* モバイル: 下部ナビゲーション */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t px-1 py-1.5 ac-hairline md:hidden"
        style={{ background: "rgba(10,11,14,0.94)", backdropFilter: "blur(12px)" }}
        aria-label="下部ナビゲーション"
      >
        {main.slice(0, 5).map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.key}
              href={item.href}
              className="relative flex flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1"
              style={{ color: active ? "var(--color-text)" : "var(--color-text-faint)" }}
            >
              {item.glyph}
              <span className="text-[10px]">{item.label}</span>
              {!!item.badge && item.badge > 0 && (
                <span
                  className="absolute right-2 top-0 h-1.5 w-1.5 rounded-full"
                  style={{ background: "var(--color-caution)" }}
                  aria-hidden
                />
              )}
            </Link>
          );
        })}
      </nav>

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
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition-colors hover:bg-[var(--color-bg-hover)]"
                onClick={() => {
                  setPaletteOpen(false);
                  router.push(item.href);
                }}
              >
                {item.glyph}
                {item.label}
                <span className="ml-auto text-[11px] text-[var(--color-text-faint)]">
                  {item.href}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[12.5px] transition-colors"
      style={{
        color: active ? "var(--color-text)" : "var(--color-text-muted)",
        background: active ? "var(--color-bg-active)" : "transparent",
      }}
    >
      <span style={{ color: active ? "var(--color-accent)" : "var(--color-text-faint)" }}>
        {item.glyph}
      </span>
      <span className="flex-1 truncate">{item.label}</span>
      {!!item.badge && item.badge > 0 && (
        <span
          className="flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold"
          style={{ background: "var(--color-caution)", color: "#1a1206" }}
        >
          {item.badge}
        </span>
      )}
    </Link>
  );
}
