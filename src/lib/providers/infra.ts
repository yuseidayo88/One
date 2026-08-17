import { PROVIDER_UNIT_COSTS, jpyFromUsd, workTokensFromCostJpy } from "@/config/pricing";
import {
  errResult,
  okResult,
  type ProviderInfo,
  type ProviderRequestBase,
  type ProviderResult,
} from "@/lib/providers/types";

/* ────────────────────────── 検索 ────────────────────────── */

export interface SearchRequest extends ProviderRequestBase {
  query: string;
  limit: number;
}

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
  checkedAt: string;
}

/**
 * SearchProvider。
 * 検索結果は **未信頼データ**。命令として扱わず、必ず出典として保存する。
 */
export interface SearchProvider {
  info(): ProviderInfo;
  search(req: SearchRequest): Promise<ProviderResult<SearchHit[]>>;
}

export class MockSearchProvider implements SearchProvider {
  info(): ProviderInfo {
    return { mode: "mock", name: "mock-search" };
  }

  async search(req: SearchRequest): Promise<ProviderResult<SearchHit[]>> {
    const checkedAt = new Date().toISOString().slice(0, 10);
    const hits: SearchHit[] = Array.from({ length: Math.min(req.limit, 3) }, (_, i) => ({
      title: `「${req.query}」に関する参考情報 ${i + 1}（Mock）`,
      url: `https://example.com/mock/${encodeURIComponent(req.query)}/${i + 1}`,
      snippet:
        "これは Mock の検索結果です。実際の Provider を接続すると、確認日付きの出典が保存されます。",
      checkedAt,
    }));
    const costJpy = jpyFromUsd(PROVIDER_UNIT_COSTS.search.perQueryUsd);
    return okResult(
      hits,
      { queries: 1 },
      { costJpy, workTokens: workTokensFromCostJpy(costJpy) },
      { mock: true, untrusted: true },
    );
  }
}

/* ────────────────────────── ストレージ ────────────────────────── */

export interface StoragePutRequest extends ProviderRequestBase {
  path: string;
  contentType: string;
  data: string;
}

export interface StorageProvider {
  info(): ProviderInfo;
  put(req: StoragePutRequest): Promise<ProviderResult<{ path: string; url: string }>>;
  get(orgId: string, path: string): Promise<ProviderResult<{ data: string }>>;
}

/** 組織単位でパスを分離する（Storage にも組織単位ポリシーを適用） */
export function orgStoragePath(orgId: string, path: string): string {
  const clean = path.replace(/^\/+/, "").replace(/\.\./g, "");
  return `org/${orgId}/${clean}`;
}

export class MemoryStorageProvider implements StorageProvider {
  private files = new Map<string, { contentType: string; data: string }>();

  info(): ProviderInfo {
    return { mode: "mock", name: "memory-storage" };
  }

  async put(req: StoragePutRequest): Promise<ProviderResult<{ path: string; url: string }>> {
    const key = orgStoragePath(req.organizationId, req.path);
    this.files.set(key, { contentType: req.contentType, data: req.data });
    const bytes = Buffer.byteLength(req.data, "utf8");
    return okResult(
      { path: key, url: `/api/storage/${encodeURIComponent(key)}` },
      { bytes },
      { costJpy: 0, workTokens: 0 },
      { mock: true },
    );
  }

  async get(orgId: string, path: string): Promise<ProviderResult<{ data: string }>> {
    const key = orgStoragePath(orgId, path);
    const file = this.files.get(key);
    if (!file) return errResult("invalid_request", "ファイルが見つかりません", false);
    return okResult({ data: file.data }, {}, { costJpy: 0, workTokens: 0 });
  }
}

/* ────────────────────────── デプロイ / ドメイン ────────────────────────── */

export interface DeployRequest extends ProviderRequestBase {
  projectName: string;
  environment: "preview" | "production";
  /** production は承認レコード必須 */
  approvalId?: string | null;
}

export interface DeployResult {
  url: string;
  deploymentId: string;
  environment: string;
}

export interface DomainQuote {
  domain: string;
  available: boolean;
  firstYearPriceJpy: number;
  renewalPriceJpy: number;
  autoRenew: boolean;
  refundable: boolean;
  registrantRequirement: string;
  dnsAfterPurchase: string[];
}

export interface DnsRecord {
  type: "A" | "AAAA" | "CNAME" | "TXT" | "MX";
  name: string;
  value: string;
  proxied?: boolean;
}

/**
 * DeploymentProvider — Cloudflare Pages/Workers 等。
 * 本番公開・DNS 変更・ドメイン購入は必ず承認を伴う。
 */
export interface DeploymentProvider {
  info(): ProviderInfo;
  deploy(req: DeployRequest): Promise<ProviderResult<DeployResult>>;
  listDeployments(orgId: string, projectName: string): Promise<ProviderResult<DeployResult[]>>;
  rollback(req: DeployRequest & { deploymentId: string }): Promise<ProviderResult<DeployResult>>;
  checkDns(orgId: string, domain: string): Promise<ProviderResult<DnsRecord[]>>;
  proposeDns(orgId: string, domain: string): Promise<ProviderResult<DnsRecord[]>>;
  searchDomain(orgId: string, domain: string): Promise<ProviderResult<DomainQuote>>;
  sslStatus(orgId: string, domain: string): Promise<ProviderResult<{ status: string; issuer: string }>>;
  wafStatus(orgId: string, domain: string): Promise<ProviderResult<{ enabled: boolean; rules: number }>>;
}

export class MockDeploymentProvider implements DeploymentProvider {
  private deployments = new Map<string, DeployResult[]>();

  info(): ProviderInfo {
    return { mode: "mock", name: "mock-deployment" };
  }

  async deploy(req: DeployRequest): Promise<ProviderResult<DeployResult>> {
    if (req.environment === "production" && !req.approvalId) {
      return errResult("invalid_request", "本番公開には承認が必要です", false);
    }
    const result: DeployResult = {
      url:
        req.environment === "production"
          ? `https://${req.projectName}.example.com`
          : `https://preview-${req.idempotencyKey.slice(0, 8)}.${req.projectName}.example.dev`,
      deploymentId: `dep_${req.idempotencyKey.slice(0, 12)}`,
      environment: req.environment,
    };
    const key = `${req.organizationId}:${req.projectName}`;
    const list = this.deployments.get(key) ?? [];
    if (!list.some((d) => d.deploymentId === result.deploymentId)) list.unshift(result);
    this.deployments.set(key, list);
    return okResult(result, {}, { costJpy: 0, workTokens: 0 }, { mock: true });
  }

  async listDeployments(orgId: string, projectName: string): Promise<ProviderResult<DeployResult[]>> {
    return okResult(
      this.deployments.get(`${orgId}:${projectName}`) ?? [],
      {},
      { costJpy: 0, workTokens: 0 },
    );
  }

  async rollback(
    req: DeployRequest & { deploymentId: string },
  ): Promise<ProviderResult<DeployResult>> {
    const list = this.deployments.get(`${req.organizationId}:${req.projectName}`) ?? [];
    const target = list.find((d) => d.deploymentId === req.deploymentId);
    if (!target) return errResult("invalid_request", "対象のデプロイが見つかりません", false);
    return okResult(target, {}, { costJpy: 0, workTokens: 0 }, { mock: true, rollback: true });
  }

  async checkDns(_orgId: string, domain: string): Promise<ProviderResult<DnsRecord[]>> {
    return okResult(
      [{ type: "A", name: domain, value: "192.0.2.1", proxied: true }],
      {},
      { costJpy: 0, workTokens: 0 },
    );
  }

  async proposeDns(_orgId: string, domain: string): Promise<ProviderResult<DnsRecord[]>> {
    return okResult(
      [
        { type: "CNAME", name: `www.${domain}`, value: `${domain}`, proxied: true },
        { type: "TXT", name: `_verify.${domain}`, value: "ai-company-site-verification=mock", proxied: false },
      ],
      {},
      { costJpy: 0, workTokens: 0 },
    );
  }

  async searchDomain(_orgId: string, domain: string): Promise<ProviderResult<DomainQuote>> {
    return okResult(
      {
        domain,
        available: !domain.startsWith("example"),
        firstYearPriceJpy: 1_580,
        renewalPriceJpy: 2_180,
        autoRenew: true,
        refundable: false,
        registrantRequirement: "登録者情報（氏名・住所・連絡先）が必要です",
        dnsAfterPurchase: ["ネームサーバーの切り替え", "A/CNAME レコードの設定", "SSL 証明書の発行待ち"],
      },
      {},
      { costJpy: 0, workTokens: 0 },
      { mock: true },
    );
  }

  async sslStatus(): Promise<ProviderResult<{ status: string; issuer: string }>> {
    return okResult({ status: "active", issuer: "Mock CA" }, {}, { costJpy: 0, workTokens: 0 });
  }

  async wafStatus(): Promise<ProviderResult<{ enabled: boolean; rules: number }>> {
    return okResult({ enabled: true, rules: 12 }, {}, { costJpy: 0, workTokens: 0 });
  }
}

/**
 * Cloudflare アダプタの受け口。
 * ドメイン購入は、公式 API でユーザーアカウントから実行可能な場合のみ自動化する。
 * 実行できない場合は手順を案内し、取得後の接続から自動化する。
 */
export class CloudflareDeploymentProvider extends MockDeploymentProvider {
  constructor(private token: string) {
    super();
  }

  override info(): ProviderInfo {
    return { mode: this.token ? "live" : "not_configured", name: "cloudflare" };
  }

  override async deploy(_req: DeployRequest): Promise<ProviderResult<DeployResult>> {
    if (!this.token) return errResult("not_configured", "CLOUDFLARE_API_TOKEN が未設定です", false);
    return errResult(
      "not_configured",
      "Cloudflare 連携は未実装です。公式ドキュメントを確認して実装してください。",
      false,
    );
  }
}
