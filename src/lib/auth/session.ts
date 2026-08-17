import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { serverEnv } from "@/config/env";
import { getStore } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import type { Organization, OrganizationMember, Profile } from "@/lib/core/types";

export { hashPassword, verifyPassword };

/**
 * セッション管理。
 *
 * - HttpOnly / SameSite=Lax / Secure(本番) Cookie
 * - HMAC-SHA256 署名 + 有効期限
 * - 署名検証は timingSafeEqual（タイミング攻撃対策）
 *
 * Supabase Auth を有効化する場合は、この層を Supabase セッションへ差し替える。
 * 上位のコードは `requireSession()` のみに依存させ、認証方式の変更を局所化する。
 */

export const SESSION_COOKIE = "ai_company_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface SessionPayload {
  userId: string;
  email: string;
  exp: number;
}

function sign(data: string): string {
  return createHmac("sha256", serverEnv.sessionSecret).update(data).digest("base64url");
}

export function createSessionToken(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts as [string, string];

  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/* ── セッション取得 ─────────────────────────────────── */

export interface AuthContext {
  user: Profile;
  organization: Organization;
  membership: OrganizationMember;
  isAdmin: boolean;
}

export class AuthError extends Error {
  constructor(
    public status: 401 | 403 | 404,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export async function getSessionPayload(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function setSessionCookie(userId: string, email: string): Promise<void> {
  const jar = await cookies();
  const token = createSessionToken({ userId, email, exp: Date.now() + SESSION_TTL_MS });
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: serverEnv.isProduction,
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<Profile | null> {
  const payload = await getSessionPayload();
  if (!payload) return null;
  const store = await getStore();
  const profile = await store.getGlobal("profiles", payload.userId);
  if (!profile) return null;
  // セッション失効: メールが変わっている場合は無効
  if (profile.email !== payload.email) return null;
  return profile;
}

export function isAdminEmail(email: string): boolean {
  return serverEnv.adminEmails.includes(email.toLowerCase());
}

/**
 * 認証 + 組織メンバーシップの確認。
 * すべての API はこれを通す。組織IDをクライアントから受け取っても必ず再検証する。
 */
export async function requireSession(organizationId?: string): Promise<AuthContext> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError(401, "ログインが必要です");

  const store = await getStore();
  const memberships = await store.listGlobal("organization_members", { userId: user.id });

  const membership = organizationId
    ? memberships.find((m) => m.organizationId === organizationId)
    : memberships[0];

  if (!membership) throw new AuthError(403, "この組織へのアクセス権がありません");

  const organization = await store.getGlobal("organizations", membership.organizationId);
  if (!organization) throw new AuthError(404, "組織が見つかりません");

  return { user, organization, membership, isAdmin: isAdminEmail(user.email) };
}

export async function requireAdmin(): Promise<AuthContext> {
  const auth = await requireSession();
  if (!auth.isAdmin) throw new AuthError(403, "管理者権限が必要です");
  return auth;
}

/** 重要操作時の再認証（パスワード再確認） */
export async function reauthenticate(userId: string, password: string): Promise<boolean> {
  const store = await getStore();
  const profile = await store.getGlobal("profiles", userId);
  if (!profile?.passwordHash) return false;
  return verifyPassword(password, profile.passwordHash);
}
