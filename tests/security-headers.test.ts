import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

/**
 * セキュリティヘッダーの回帰防止。
 *
 * 特に HSTS は、開発（http://localhost）で送るとブラウザが localhost 全体を
 * HTTPS へ強制し、以後どの開発サーバーへも接続できなくなる
 * （ERR_CONNECTION_REFUSED）。HSTS は host 単位で記録されるため、
 * ポートを変えても回避できない。
 *
 * このテストは NODE_ENV=test（= 非 production）で動くため、
 * 「開発では HSTS を送らない」ことを検証する。
 */

async function headerMap(): Promise<Map<string, string>> {
  const rules = await nextConfig.headers!();
  const rule = rules.find((r) => r.source === "/:path*");
  expect(rule).toBeDefined();
  return new Map(rule!.headers.map((h) => [h.key.toLowerCase(), h.value]));
}

describe("セキュリティヘッダー", () => {
  it("開発では HSTS を送らない", async () => {
    expect(process.env.NODE_ENV).not.toBe("production");
    const headers = await headerMap();
    expect(headers.has("strict-transport-security")).toBe(false);
  });

  it("常に付与するヘッダーが揃っている", async () => {
    const headers = await headerMap();
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("permissions-policy")).toContain("camera=()");
  });

  it("CSP が主要な指示子を含み、frame-ancestors を禁止している", async () => {
    const headers = await headerMap();
    const csp = headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it("X-Powered-By を出さない", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
