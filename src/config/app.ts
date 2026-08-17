/**
 * クライアント/サーバー双方で参照できるアプリ設定。
 * プロダクト名は環境変数 1 か所で変更できる（未確定のため仮名 "AI Company"）。
 */
export const appConfig = {
  name: process.env.NEXT_PUBLIC_APP_NAME || "AI Company",
  tagline: process.env.NEXT_PUBLIC_APP_TAGLINE || "あなたの会社に、AIの社員を。",
  defaultLocale: (process.env.NEXT_PUBLIC_DEFAULT_LOCALE || "ja") as "ja" | "en",
  supportedLocales: ["ja", "en"] as const,
  theme: "dark" as const,
} as const;

export type Locale = (typeof appConfig.supportedLocales)[number];

/** メインナビゲーション（「成果物」独立タブは作らない） */
export const mainNavigation = [
  { href: "/office", key: "office", label: "オフィス" },
  { href: "/projects", key: "projects", label: "プロジェクト" },
  { href: "/tasks", key: "tasks", label: "タスク" },
  { href: "/employees", key: "employees", label: "AI社員" },
  { href: "/knowledge", key: "knowledge", label: "ナレッジ" },
  { href: "/integrations", key: "integrations", label: "連携" },
  { href: "/usage", key: "usage", label: "使用量・料金" },
  { href: "/settings", key: "settings", label: "設定" },
] as const;
