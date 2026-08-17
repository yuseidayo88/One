import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AuthError, requireSession, type AuthContext } from "@/lib/auth/session";
import { serverEnv } from "@/config/env";
import { redact, safeLog } from "@/lib/core/redact";

/**
 * API ハンドラの共通ガード。
 *
 *  1. リクエストサイズ制限
 *  2. CSRF 対策（Origin 検証 + SameSite Cookie）
 *  3. レート制限
 *  4. 認証・組織メンバーシップ確認
 *  5. Zod によるスキーマ検証
 *  6. エラーから秘密情報を漏らさない
 */

const MAX_BODY_BYTES = 256 * 1024;

/* ── レート制限（プロセス内。本番は Redis / Durable Object 等へ） ── */

interface Bucket {
  count: number;
  resetAt: number;
}
const buckets = new Map<string, Bucket>();

export function checkRateLimit(key: string, max = serverEnv.rateLimit.maxRequests): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + serverEnv.rateLimit.windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= max;
}

export function clientKey(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || "local";
  return ip;
}

/* ── 冪等性 ────────────────────────────────────────── */

const idempotencyCache = new Map<string, { at: number; response: unknown }>();
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;

export function rememberIdempotent(key: string, response: unknown): void {
  idempotencyCache.set(key, { at: Date.now(), response });
}

export function recallIdempotent(key: string): unknown | null {
  const entry = idempotencyCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > IDEMPOTENCY_TTL_MS) {
    idempotencyCache.delete(key);
    return null;
  }
  return entry.response;
}

/* ── レスポンス ─────────────────────────────────────── */

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status });
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
): NextResponse {
  return NextResponse.json({ ok: false, error: { code, message, ...extra } }, { status });
}

/* ── CSRF ──────────────────────────────────────────── */

function verifyOrigin(req: NextRequest): boolean {
  if (req.method === "GET" || req.method === "HEAD") return true;
  const origin = req.headers.get("origin");
  if (!origin) return true; // 同一オリジンの fetch では省略されることがある
  try {
    const originHost = new URL(origin).host;
    const host = req.headers.get("host");
    return !!host && originHost === host;
  } catch {
    return false;
  }
}

/* ── ハンドラ ──────────────────────────────────────── */

export interface HandlerContext<TBody> {
  req: NextRequest;
  body: TBody;
  auth: AuthContext;
}

export interface HandlerOptions<S extends z.ZodTypeAny> {
  schema?: S;
  /** 認証不要のエンドポイント */
  public?: boolean;
  rateLimitMax?: number;
}

export function defineHandler<S extends z.ZodTypeAny = z.ZodTypeAny>(
  options: HandlerOptions<S>,
  handler: (ctx: HandlerContext<z.infer<S>>) => Promise<NextResponse>,
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      if (!verifyOrigin(req)) {
        return jsonError(403, "csrf", "リクエストの送信元を確認できませんでした");
      }

      const rateKey = `${clientKey(req)}:${new URL(req.url).pathname}`;
      if (!checkRateLimit(rateKey, options.rateLimitMax)) {
        return jsonError(429, "rate_limited", "リクエストが多すぎます。しばらく待ってから再試行してください");
      }

      let body = {} as z.infer<S>;
      if (options.schema) {
        const raw = await req.text();
        if (raw.length > MAX_BODY_BYTES) {
          return jsonError(413, "payload_too_large", "リクエストが大きすぎます");
        }
        let parsedJson: unknown = {};
        if (raw.trim()) {
          try {
            parsedJson = JSON.parse(raw);
          } catch {
            return jsonError(400, "invalid_json", "リクエスト形式が不正です");
          }
        }
        const parsed = options.schema.safeParse(parsedJson);
        if (!parsed.success) {
          return jsonError(400, "validation_failed", "入力内容を確認してください", {
            issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
          });
        }
        body = parsed.data;
      }

      const auth = options.public
        ? (null as unknown as AuthContext)
        : await requireSession(
            (body as { organizationId?: string } | null)?.organizationId,
          );

      return await handler({ req, body, auth });
    } catch (error) {
      if (error instanceof AuthError) {
        return jsonError(error.status, "unauthorized", error.message);
      }
      // 本番では内部詳細を返さない
      safeLog("api-error", { message: (error as Error).message, stack: (error as Error).stack });
      const message = serverEnv.isProduction
        ? "処理中にエラーが発生しました"
        : String(redact((error as Error).message));
      return jsonError(500, "internal_error", message);
    }
  };
}
