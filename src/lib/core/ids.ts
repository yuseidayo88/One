import { randomUUID, randomBytes } from "node:crypto";

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
