import "server-only";
import fs from "node:fs";
import path from "node:path";
import { serverEnv } from "@/config/env";
import { MemoryStore } from "@/lib/db/memory-store";
import type { Store } from "@/lib/db/store";

const PERSIST_PATH = path.join(process.cwd(), ".data", "dev-store.json");

/**
 * Store は必ずプロセス内で 1 つにする。
 *
 * Next.js はルートハンドラとページ(RSC)を別々のモジュールグラフへバンドルするため、
 * モジュールスコープの変数だけでは同じプロセス内でもインスタンスが二重化する。
 * その場合 MemoryStore が分裂し、「API で作成したユーザーがページ側に存在しない」
 * といった不整合が起きる（Supabase 利用時は外部DBが真実なので影響しない）。
 * そのため globalThis に載せて共有する。
 */
const STORE_KEY = Symbol.for("ai-company.store");

type StoreGlobal = typeof globalThis & { [STORE_KEY]?: Promise<Store> | null };
const storeGlobal = globalThis as StoreGlobal;

function persistMemoryStore(store: MemoryStore): void {
  try {
    fs.mkdirSync(path.dirname(PERSIST_PATH), { recursive: true });
    fs.writeFileSync(PERSIST_PATH, JSON.stringify(store.dump()), "utf8");
  } catch {
    // 開発用途のため、永続化に失敗しても動作は継続する
  }
}

function loadMemoryStore(store: MemoryStore): boolean {
  try {
    if (!fs.existsSync(PERSIST_PATH)) return false;
    const raw = fs.readFileSync(PERSIST_PATH, "utf8");
    if (!raw.trim()) return false;
    store.restore(JSON.parse(raw));
    return true;
  } catch {
    return false;
  }
}

async function createStore(): Promise<Store> {
  if (serverEnv.dataStore === "supabase") {
    const { SupabaseStore } = await import("@/lib/db/supabase-store");
    return new SupabaseStore();
  }

  const store = new MemoryStore();
  const restored = loadMemoryStore(store);

  if (!restored && serverEnv.seedDemoData) {
    const { seedDemoOrganization } = await import("@/lib/db/seed");
    await seedDemoOrganization(store);
    persistMemoryStore(store);
  }

  // 変更を都度書き出す（開発時のリロードでデータが消えないように）
  const wrapped = new Proxy(store, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      const mutating = ["insert", "update", "remove", "updateGlobal", "tryClaimEmployeeForTask", "releaseEmployee"];
      if (!mutating.includes(String(prop))) return value.bind(target);
      return async (...args: unknown[]) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (value as any).apply(target, args);
        persistMemoryStore(target);
        return result;
      };
    },
  });

  return wrapped as Store;
}

export function getStore(): Promise<Store> {
  if (!storeGlobal[STORE_KEY]) storeGlobal[STORE_KEY] = createStore();
  return storeGlobal[STORE_KEY];
}

/** テスト用: 独立したストアを作る */
export function createTestStore(): MemoryStore {
  return new MemoryStore();
}

export function resetStoreForTests(): void {
  storeGlobal[STORE_KEY] = null;
}
