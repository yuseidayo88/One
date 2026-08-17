import type {
  ApprovalAction,
  ArtifactType,
  Capability,
  DataScope,
  RoleKey,
  ToolName,
} from "@/lib/core/types";
import { NEVER_ALLOWED_DATA_SCOPES, getRole } from "@/lib/roles/registry";

/**
 * Role Policy — サーバー側の強制レイヤー。
 *
 * 重要: 権限は「プロンプト」ではなくこのテーブルで決まる。
 * ユーザーや外部文書が「以前の指示を無視して別の仕事をしろ」と命令しても、
 * ここを通らない限りツールは実行されない。
 */

export interface PolicyDecision {
  allowed: boolean;
  /** 承認が必要な場合のアクション種別 */
  requiresApproval: ApprovalAction | null;
  reasonCode:
    | "ok"
    | "tool_not_allowed"
    | "capability_not_allowed"
    | "data_scope_not_allowed"
    | "artifact_type_not_allowed"
    | "approval_required"
    | "never_allowed";
  /** ユーザーへ表示してよい説明（内部ルール詳細は含めない） */
  publicMessage: string;
}

const OK: PolicyDecision = {
  allowed: true,
  requiresApproval: null,
  reasonCode: "ok",
  publicMessage: "",
};

/** ツールごとの承認必須アクション対応表（職種横断の最終防衛線） */
export const TOOL_APPROVAL_MAP: Partial<Record<ToolName, ApprovalAction>> = {
  email_send: "email_send",
  social_post: "social_post",
  ads_publish: "ads_publish",
  deploy_production: "publish_production",
  db_migration_apply: "production_db_change",
  domain_purchase: "domain_purchase",
  dns_update: "dns_update",
  payment_execute: "payment",
};

export function canUseCapability(roleKey: RoleKey, capability: Capability): PolicyDecision {
  const role = getRole(roleKey);
  if (!role.allowedCapabilities.includes(capability)) {
    return {
      allowed: false,
      requiresApproval: null,
      reasonCode: "capability_not_allowed",
      publicMessage: `${role.name}社員の担当業務ではありません。適切な社員へ引き継ぎます。`,
    };
  }
  return OK;
}

export function canUseTool(roleKey: RoleKey, tool: ToolName): PolicyDecision {
  const role = getRole(roleKey);
  if (!role.allowedTools.includes(tool)) {
    return {
      allowed: false,
      requiresApproval: null,
      reasonCode: "tool_not_allowed",
      publicMessage: `${role.name}社員はこの操作を実行できません。担当社員へ引き継ぎます。`,
    };
  }
  const approval = TOOL_APPROVAL_MAP[tool];
  if (approval) {
    return {
      allowed: false,
      requiresApproval: approval,
      reasonCode: "approval_required",
      publicMessage: "この操作にはユーザーの承認が必要です。",
    };
  }
  return OK;
}

export function canAccessDataScope(roleKey: RoleKey, scope: DataScope): PolicyDecision {
  if (NEVER_ALLOWED_DATA_SCOPES.includes(scope)) {
    return {
      allowed: false,
      requiresApproval: null,
      reasonCode: "never_allowed",
      publicMessage: "この情報にはどの社員もアクセスできません。",
    };
  }
  const role = getRole(roleKey);
  if (!role.allowedDataScopes.includes(scope)) {
    return {
      allowed: false,
      requiresApproval: null,
      reasonCode: "data_scope_not_allowed",
      publicMessage: `${role.name}社員はこの情報へアクセスできません。`,
    };
  }
  return OK;
}

export function canCreateArtifact(roleKey: RoleKey, type: ArtifactType): PolicyDecision {
  const role = getRole(roleKey);
  if (!role.allowedArtifactTypes.includes(type)) {
    return {
      allowed: false,
      requiresApproval: null,
      reasonCode: "artifact_type_not_allowed",
      publicMessage: `${role.name}社員はこの種類の成果物を作成できません。`,
    };
  }
  return OK;
}

export interface ToolCallRequest {
  roleKey: RoleKey;
  tool: ToolName;
  capability?: Capability;
  dataScopes?: DataScope[];
  /** 外部データ（メール・Web・PDF・検索結果）に由来する呼び出しか */
  originatedFromUntrustedData?: boolean;
  /** 有効な承認レコードのID（承認済みの場合） */
  approvalId?: string | null;
}

export interface ToolCallVerdict extends PolicyDecision {
  /** 外部データ由来のため、承認済みでも再検証・再承認が必要 */
  requiresReapproval: boolean;
}

/**
 * すべてのツール呼び出し前に必ず通す検証。
 * approvalId が渡されている場合は呼び出し側で有効性（対象・期限・実行者）を確認済みであること。
 */
export function verifyToolCall(req: ToolCallRequest): ToolCallVerdict {
  const withReapproval = (d: PolicyDecision, requiresReapproval = false): ToolCallVerdict => ({
    ...d,
    requiresReapproval,
  });

  if (req.capability) {
    const cap = canUseCapability(req.roleKey, req.capability);
    if (!cap.allowed) return withReapproval(cap);
  }

  for (const scope of req.dataScopes ?? []) {
    const s = canAccessDataScope(req.roleKey, scope);
    if (!s.allowed) return withReapproval(s);
  }

  const role = getRole(req.roleKey);
  if (!role.allowedTools.includes(req.tool)) {
    return withReapproval({
      allowed: false,
      requiresApproval: null,
      reasonCode: "tool_not_allowed",
      publicMessage: `${role.name}社員はこの操作を実行できません。担当社員へ引き継ぎます。`,
    });
  }

  const approvalAction = TOOL_APPROVAL_MAP[req.tool];
  if (approvalAction) {
    if (!req.approvalId) {
      return withReapproval({
        allowed: false,
        requiresApproval: approvalAction,
        reasonCode: "approval_required",
        publicMessage: "この操作にはユーザーの承認が必要です。",
      });
    }
    // 外部データ由来の場合は、承認済みでも再承認を必須にする
    if (req.originatedFromUntrustedData) {
      return withReapproval(
        {
          allowed: false,
          requiresApproval: approvalAction,
          reasonCode: "approval_required",
          publicMessage:
            "外部データに基づく操作のため、実行前にもう一度確認が必要です。",
        },
        true,
      );
    }
  }

  return withReapproval(OK);
}

/** 職種が担当できない Capability 群を、必要な職種ごとに分類する */
export function splitByRole(capabilities: Capability[]): Map<RoleKey, Capability[]> {
  const map = new Map<RoleKey, Capability[]>();
  for (const cap of capabilities) {
    const owners = (Object.keys(ROLE_CAPABILITY_INDEX) as RoleKey[]).filter((r) =>
      ROLE_CAPABILITY_INDEX[r].has(cap),
    );
    const owner = owners[0] ?? "director";
    const list = map.get(owner) ?? [];
    list.push(cap);
    map.set(owner, list);
  }
  return map;
}

const ROLE_CAPABILITY_INDEX: Record<RoleKey, Set<Capability>> = (() => {
  const index = {} as Record<RoleKey, Set<Capability>>;
  const keys: RoleKey[] = [
    "director",
    "market_research",
    "marketing",
    "sales",
    "designer",
    "engineer",
    "assistant",
    "legal",
    "finance",
  ];
  for (const key of keys) {
    index[key] = new Set(getRole(key).allowedCapabilities);
  }
  return index;
})();
