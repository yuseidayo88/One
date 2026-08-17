import { randomUUID, randomBytes, createHash } from "node:crypto";

export function newId(): string {
  return randomUUID();
}

export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function isoIn(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

/** 冪等キー: 同じ論理操作は同じキーになるよう呼び出し側で組み立てる */
export function idempotencyKey(...parts: (string | number | null | undefined)[]): string {
  return parts.filter((p) => p !== null && p !== undefined).join(":");
}

/**
 * ラベルから決定論的に UUID を作る（デモデータ専用）。
 *
 * サーバーレスではプロセスが複数に分かれ、そのたびにデモ組織が
 * 再投入される。ID がランダムだとインスタンスごとに別人になり、
 * ログイン直後のセッションが他インスタンスで無効になる。
 * 同じラベルからは常に同じ ID を返すことでこれを防ぐ。
 */
export function stableId(label: string): string {
  const hash = createHash("sha256").update(`ai-company:demo:${label}`).digest("hex");
  const v = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  return v;
}
