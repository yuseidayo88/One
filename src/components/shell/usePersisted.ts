"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * localStorage を外部ストアとして購読する。
 *
 * effect の中で setState して再描画を重ねるのではなく、
 * useSyncExternalStore に任せることで、サーバー描画と hydration を素直に合わせる。
 * サーバー側は必ず fallback を返すので、初回 HTML は誰が見ても同じになる。
 */

const cache = new Map<string, string | null>();
const listeners = new Map<string, Set<() => void>>();

function read(key: string): string | null {
  if (!cache.has(key)) {
    let value: string | null = null;
    try {
      value = localStorage.getItem(key);
    } catch {
      value = null; // プライベートモード等では既定値で動かす
    }
    cache.set(key, value);
  }
  return cache.get(key) ?? null;
}

export function writePersisted(key: string, value: string, persist = true): void {
  cache.set(key, value);
  if (persist) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* 保存できなくても、この画面の表示は更新する */
    }
  }
  listeners.get(key)?.forEach((fn) => fn());
}

/** テスト用。ブラウザ側のキャッシュを捨てる。 */
export function clearPersistedCache(): void {
  cache.clear();
}

export function usePersisted(
  key: string,
  fallback: string,
): [string, (value: string, persist?: boolean) => void] {
  const subscribe = useCallback(
    (onChange: () => void) => {
      let set = listeners.get(key);
      if (!set) {
        set = new Set();
        listeners.set(key, set);
      }
      set.add(onChange);
      return () => {
        set!.delete(onChange);
      };
    },
    [key],
  );

  const value = useSyncExternalStore(
    subscribe,
    () => read(key) ?? fallback,
    () => fallback,
  );

  const set = useCallback(
    (next: string, persist = true) => writePersisted(key, next, persist),
    [key],
  );

  return [value, set];
}
