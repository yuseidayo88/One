import type { RoleKey, SafetyLevel, ToolName } from "@/lib/core/types";
import {
  SAFETY_POLICY_VERSION,
  atLeast,
  detectInjection,
  evaluateRules,
  maxLevel,
  type RuleMatch,
} from "@/lib/safety/rules";
import { classifyWithLightModel } from "@/lib/safety/classifier";
import { verifyToolCall, type ToolCallRequest, type ToolCallVerdict } from "@/lib/roles/policy";

/**
 * Safety Gate — 多層防御の統合点。
 * 1) 決定論ルール 2) 軽量モデル分類 3) サーバー側権限検査
 * 4) ツールごとの許可リスト 5) 外部操作前の再検査 6) 監査ログ 7) 人間確認
 */

export interface SafetyVerdict {
  level: SafetyLevel;
  categories: string[];
  /** ユーザーへ表示してよい説明 */
  publicReason: string;
  /** 実行できないことの説明（RED/ORANGE 時） */
  cannotDo: string;
  /** 実行可能な安全な代替案 */
  safeAlternative: string;
  /** 専門家確認の案内（必要時） */
  expertNotice: string | null;
  /** 監査用の内部詳細（UI へ返さない） */
  internalDetail: string;
  /** 外部データ由来のインジェクション検出 */
  injectionDetected: boolean;
  policyVersion: string;
}

export interface SafetyInput {
  /** ユーザー入力（信頼できる操作主体だが、内容は検査する） */
  userText: string;
  /** 外部から取得した未信頼データ（メール本文・Webページ・PDF・検索結果など） */
  untrustedData?: string[];
  stage: "input" | "plan" | "pre_tool" | "output";
}

const SAFE_ALTERNATIVES: Record<string, string> = {
  fraud: "実在する価値提供に基づく正当な集客・営業の設計はお手伝いできます。",
  phishing: "自社サービスの正規のログイン導線やセキュリティ改善の検討はお手伝いできます。",
  impersonation: "自社名義での正式な案内文・提案書の作成はお手伝いできます。",
  unauthorized_access: "自社システムの脆弱性対応方針の整理や、正規の権限設計はお手伝いできます。",
  malware: "自社のセキュリティ対策チェックリストの作成はお手伝いできます。",
  credential_theft: "安全な認証情報の管理方針（保管・ローテーション）の整理はお手伝いできます。",
  mass_spam:
    "同意を得た見込み客への少量・個別最適化したアプローチや、オプトイン獲得の設計はお手伝いできます。",
  fake_reviews: "実際の利用者から正当にレビューを集める導線の設計はお手伝いできます。",
  regulation_evasion: "必要な許認可や届出の一般的な調査、遵守のためのチェックリスト作成はお手伝いできます。",
  pii_illegitimate: "同意取得を前提とした適法なリード獲得手法の設計はお手伝いできます。",
  doxxing_stalking: "公開情報のみを用いた市場調査・企業単位の調査はお手伝いできます。",
  deepfake_fraud: "自社の正規素材を用いたクリエイティブ制作はお手伝いできます。",
  money_laundering: "適法な会計処理・資金繰り表の整理はお手伝いできます。",
  medical: "一般的な市場動向や公開情報の整理、規制の概要調査はお手伝いできます。",
  legal_advice: "関連法規の一般的な調査と、専門家へ確認すべき論点の整理はお手伝いできます。",
  finance_investment: "一般的な料金設計や自社の損益シミュレーションの作成はお手伝いできます。",
  hiring_decision: "募集要項の作成や選考プロセスの設計案の整理はお手伝いできます。",
  gambling: "関連する法規制の一般的な調査と、必要な確認事項の整理はお手伝いできます。",
  adult: "年齢確認や広告規制など、遵守すべき要件の一般的な調査はお手伝いできます。",
  politics: "公開情報に基づく一般的な整理はお手伝いできます。",
  alcohol: "表示・広告規制の一般的な調査はお手伝いできます。",
};

const EXPERT_NOTICE: Record<string, string> = {
  medical: "医療従事者・薬機法に詳しい専門家へご確認ください。",
  legal_advice: "弁護士等の専門家へご確認ください。",
  finance_investment: "税理士・公認会計士・金融商品取引業に詳しい専門家へご確認ください。",
  hiring_decision: "社会保険労務士等の専門家へご確認ください。",
  gambling: "弁護士等の専門家へご確認ください。",
  adult: "所轄官庁および専門家へご確認ください。",
  alcohol: "酒類販売の所轄官庁へご確認ください。",
};

function buildVerdict(matches: RuleMatch[], injectionDetected: boolean): SafetyVerdict {
  let level: SafetyLevel = "GREEN";
  for (const m of matches) level = maxLevel(level, m.level);

  const categories = matches.map((m) => m.categoryId);
  const publicReason =
    matches.length > 0
      ? matches.map((m) => m.publicReason).join(" ")
      : "";

  const primary = matches.find((m) => m.level === "RED") ?? matches[0];
  const safeAlternative = primary
    ? SAFE_ALTERNATIVES[primary.categoryId] ??
      "内容を調整すれば、安全な範囲でお手伝いできる可能性があります。"
    : "";

  const expertMatch = matches.find((m) => EXPERT_NOTICE[m.categoryId]);
  const expertNotice = expertMatch ? EXPERT_NOTICE[expertMatch.categoryId] ?? null : null;

  const cannotDo =
    level === "RED"
      ? "この依頼は実行できません。関連するツール実行・外部送信もすべて停止しました。"
      : level === "ORANGE"
        ? "この領域では、一般的な調査と情報整理までを行います。個別の高リスク判断や、承認のない外部実行は行いません。"
        : "";

  return {
    level,
    categories,
    publicReason,
    cannotDo,
    safeAlternative,
    expertNotice,
    internalDetail: JSON.stringify({ matches, injectionDetected }),
    injectionDetected,
    policyVersion: SAFETY_POLICY_VERSION,
  };
}

/**
 * 入力（ユーザー文 + 未信頼外部データ）を評価する。
 *
 * 重要: 未信頼データ内の「命令」は絶対に指示として扱わない。
 * ここでは「インジェクション試行の検出」と「内容カテゴリの検査」のみを行う。
 */
export async function evaluateSafety(input: SafetyInput): Promise<SafetyVerdict> {
  const ruleMatches = evaluateRules(input.userText);

  // 未信頼データはカテゴリ検査のみ行い、命令としては扱わない
  let injectionDetected = false;
  for (const data of input.untrustedData ?? []) {
    if (detectInjection(data)) injectionDetected = true;
  }

  // 軽量モデルによる二次分類（Mock 時はヒューリスティック）
  const classified = await classifyWithLightModel(input.userText);
  const merged: RuleMatch[] = [...ruleMatches];
  for (const c of classified) {
    if (!merged.some((m) => m.categoryId === c.categoryId)) merged.push(c);
  }

  const verdict = buildVerdict(merged, injectionDetected);

  // インジェクションを検出した場合、権限は一切変わらないが注意レベルを上げる
  if (injectionDetected && verdict.level === "GREEN") {
    return {
      ...verdict,
      level: "YELLOW",
      categories: [...verdict.categories, "prompt_injection_attempt"],
      publicReason:
        "取得した外部データに、指示の上書きを試みる記述が含まれていました。データとして扱い、指示としては実行していません。",
    };
  }
  return verdict;
}

export interface ToolGateInput extends ToolCallRequest {
  employeeRole: RoleKey;
  tool: ToolName;
  /** 実行直前に再検査するテキスト（プロンプト・宛先・本文など） */
  payloadText: string;
  untrustedData?: string[];
}

export interface ToolGateResult {
  allowed: boolean;
  safety: SafetyVerdict;
  policy: ToolCallVerdict;
  /** ユーザーへ表示する統合メッセージ */
  publicMessage: string;
}

/**
 * 外部操作前の再検査。ツール実行の直前に必ず呼ぶ。
 * ここを通らない実行経路をコード上に作らない。
 */
export async function assertToolCallAllowed(input: ToolGateInput): Promise<ToolGateResult> {
  const safety = await evaluateSafety({
    userText: input.payloadText,
    untrustedData: input.untrustedData,
    stage: "pre_tool",
  });

  if (safety.level === "RED") {
    return {
      allowed: false,
      safety,
      policy: {
        allowed: false,
        requiresApproval: null,
        requiresReapproval: false,
        reasonCode: "never_allowed",
        publicMessage: safety.cannotDo,
      },
      publicMessage: `${safety.cannotDo} ${safety.publicReason} ${safety.safeAlternative}`.trim(),
    };
  }

  const policy = verifyToolCall({
    ...input,
    roleKey: input.employeeRole,
    originatedFromUntrustedData:
      input.originatedFromUntrustedData || (input.untrustedData?.length ?? 0) > 0,
  });

  // ORANGE 以上では外部実行を止め、人間/有資格者の確認を必須にする
  const externalTools: ToolName[] = [
    "email_send",
    "social_post",
    "ads_publish",
    "deploy_production",
    "domain_purchase",
    "dns_update",
    "payment_execute",
    "db_migration_apply",
    "crm_write",
  ];
  if (atLeast(safety.level, "ORANGE") && externalTools.includes(input.tool)) {
    return {
      allowed: false,
      safety,
      policy: {
        ...policy,
        allowed: false,
        reasonCode: "approval_required",
        publicMessage: "この領域の外部実行には確認が必要です。",
      },
      publicMessage: `${safety.cannotDo} ${safety.expertNotice ?? ""}`.trim(),
    };
  }

  return {
    allowed: policy.allowed,
    safety,
    policy,
    publicMessage: policy.allowed ? "" : policy.publicMessage,
  };
}

/**
 * RED で停止した場合、危険な部分出力を成果物として保存・表示しない。
 */
export function sanitizeBlockedOutput(verdict: SafetyVerdict, _draft: string): string {
  if (verdict.level === "RED") return "";
  return _draft;
}
