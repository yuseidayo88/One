import "server-only";

/**
 * サーバー専用の環境変数アクセス。
 * ここに書かれた値はクライアントバンドルへ入らない (`server-only` で強制)。
 * クライアントで必要な値は `NEXT_PUBLIC_*` のみ (src/config/app.ts)。
 */

function str(key: string, fallback = ""): string {
  const v = process.env[key];
  return v === undefined || v === "" ? fallback : v;
}

function num(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function bool(key: string, fallback = false): boolean {
  const v = process.env[key];
  if (v === undefined || v === "") return fallback;
  return v === "true" || v === "1";
}

const supabaseUrl = str("NEXT_PUBLIC_SUPABASE_URL");
const supabaseServiceKey = str("SUPABASE_SERVICE_ROLE_KEY");

export const serverEnv = {
  nodeEnv: str("NODE_ENV", "development"),
  isProduction: process.env.NODE_ENV === "production",

  sessionSecret: str("SESSION_SECRET", "dev-only-insecure-session-secret-change-me"),

  dataStore: (() => {
    const explicit = str("DATA_STORE");
    if (explicit === "memory" || explicit === "supabase") return explicit;
    return supabaseUrl && supabaseServiceKey ? "supabase" : "memory";
  })() as "memory" | "supabase",

  forceMockProviders: bool("FORCE_MOCK_PROVIDERS", false),
  seedDemoData: bool("SEED_DEMO_DATA", true),

  supabase: {
    url: supabaseUrl,
    anonKey: str("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceRoleKey: supabaseServiceKey,
  },

  llm: {
    anthropicApiKey: str("ANTHROPIC_API_KEY"),
    openaiApiKey: str("OPENAI_API_KEY"),
    openaiFastModel: str("OPENAI_FAST_MODEL", "gpt-4o-mini"),
    anthropicReasoningModel: str("ANTHROPIC_REASONING_MODEL", "claude-sonnet-4-5"),
    anthropicCodingModel: str("ANTHROPIC_CODING_MODEL", "claude-sonnet-4-5"),
    routingConfigJson: str("MODEL_ROUTING_CONFIG"),
  },

  stripe: {
    secretKey: str("STRIPE_SECRET_KEY"),
    webhookSecret: str("STRIPE_WEBHOOK_SECRET"),
    prices: {
      starter: str("STRIPE_PRICE_STARTER"),
      founder: str("STRIPE_PRICE_FOUNDER"),
      ceo: str("STRIPE_PRICE_CEO"),
    },
  },

  image: {
    provider: str("IMAGE_PROVIDER", "mock"),
    googleApiKey: str("GOOGLE_AI_API_KEY"),
  },

  video: {
    provider: str("VIDEO_PROVIDER", "mock"),
    higgsfieldApiKey: str("HIGGSFIELD_API_KEY"),
    seedanceApiKey: str("SEEDANCE_API_KEY"),
  },

  email: {
    provider: str("EMAIL_PROVIDER", "mock"),
    resendApiKey: str("RESEND_API_KEY"),
    from: str("EMAIL_FROM", "no-reply@example.com"),
  },

  search: {
    provider: str("SEARCH_PROVIDER", "mock"),
    apiKey: str("SEARCH_API_KEY"),
  },

  deployment: {
    provider: str("DEPLOYMENT_PROVIDER", "mock"),
    cloudflareApiToken: str("CLOUDFLARE_API_TOKEN"),
    cloudflareAccountId: str("CLOUDFLARE_ACCOUNT_ID"),
  },

  adminEmails: str("ADMIN_EMAILS", "founder@example.com")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),

  rateLimit: {
    windowMs: num("RATE_LIMIT_WINDOW_MS", 60_000),
    maxRequests: num("RATE_LIMIT_MAX_REQUESTS", 120),
  },
} as const;

/**
 * 本番で危険な設定が残っていないかを起動時に検査する。
 * 例外は投げず、警告を返す（起動不能にしない）。
 */
export function auditServerEnv(): string[] {
  const warnings: string[] = [];
  if (serverEnv.isProduction) {
    if (serverEnv.sessionSecret.startsWith("dev-only")) {
      warnings.push("SESSION_SECRET が未設定です。本番では必ず設定してください。");
    }
    if (serverEnv.dataStore === "memory") {
      warnings.push("DATA_STORE=memory で本番稼働しています。Supabase を設定してください。");
    }
  }
  return warnings;
}
