/**
 * ログ・エラー出力から秘密情報と個人情報を除去する。
 * ログにトークン・PII・機密情報を残さないための最終防衛線。
 */

const PATTERNS: { re: RegExp; replacement: string }[] = [
  { re: /sk-[A-Za-z0-9_\-]{16,}/g, replacement: "sk-***" },
  { re: /sk_live_[A-Za-z0-9]{8,}/g, replacement: "sk_live_***" },
  { re: /whsec_[A-Za-z0-9]{8,}/g, replacement: "whsec_***" },
  { re: /eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/g, replacement: "<jwt>" },
  { re: /Bearer\s+[A-Za-z0-9._\-]{12,}/gi, replacement: "Bearer ***" },
  { re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, replacement: "<email>" },
  { re: /\b0\d{1,4}-?\d{1,4}-?\d{3,4}\b/g, replacement: "<phone>" },
  { re: /\b(?:\d[ -]?){13,16}\b/g, replacement: "<card>" },
];

const SENSITIVE_KEYS = [
  "password",
  "passwordhash",
  "token",
  "accesstoken",
  "refreshtoken",
  "apikey",
  "api_key",
  "secret",
  "servicerolekey",
  "authorization",
  "cookie",
  "encryptedcredentials",
];

export function redactString(input: string): string {
  let out = input;
  for (const { re, replacement } of PATTERNS) out = out.replace(re, replacement);
  return out;
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "<deep>";
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.includes(k.toLowerCase())) {
        out[k] = "<redacted>";
        continue;
      }
      out[k] = redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

export function safeLog(scope: string, payload: unknown): void {
  if (process.env.NODE_ENV === "test") return;
  console.log(`[${scope}]`, JSON.stringify(redact(payload)));
}
