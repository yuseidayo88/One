import type { RuleMatch } from "@/lib/safety/rules";

/**
 * 軽量モデルによる二次分類。
 * OPENAI_FAST_MODEL を用いる想定。キーが無い場合はヒューリスティックで代替する。
 *
 * 目的は「決定論ルールを補うこと」であり、これ単体で安全性を保証しない。
 */

interface HeuristicSignal {
  categoryId: string;
  label: string;
  level: RuleMatch["level"];
  publicReason: string;
  /** 複合条件: すべて満たしたときのみ発火 */
  all: RegExp[];
}

/**
 * 単純なキーワードでは拾えない「組み合わせ」を検出する。
 * 例: 「大量」+「リスト」+「送信」→ 無差別送信の疑い
 */
const HEURISTICS: HeuristicSignal[] = [
  {
    categoryId: "mass_spam",
    label: "大量無差別スパム",
    level: "RED",
    publicReason: "大量無差別送信にあたる可能性があります。",
    all: [/(大量|一斉|一括|自動で)/, /(リスト|名簿|アドレス)/, /(送信|配信|DM|メール)/],
  },
  {
    categoryId: "phishing",
    label: "フィッシング",
    level: "RED",
    publicReason: "フィッシングにあたる可能性のある内容が含まれています。",
    all: [/(偽|模倣|そっくり|似せ)/, /(ログイン|サインイン|決済|カード)/, /(ページ|画面|フォーム|サイト)/],
  },
  {
    categoryId: "impersonation",
    label: "なりすまし",
    level: "RED",
    publicReason: "第三者へのなりすましにあたる可能性があります。",
    all: [/(他社|他人|実在|有名)/, /(名義|名前|ロゴ|ブランド)/, /(使って|装って|かたって|名乗)/],
  },
  {
    categoryId: "finance_investment",
    label: "金融・投資",
    level: "ORANGE",
    publicReason: "投資・金融判断に関わる内容のため、専門家の確認が必要です。",
    all: [/(投資|資産運用|ファンド|暗号資産)/, /(勧誘|募集|集める|セミナー)/],
  },
  {
    categoryId: "medical",
    label: "医療",
    level: "ORANGE",
    publicReason: "医療に関する内容のため、有資格者の確認が必要です。",
    all: [/(サプリ|健康食品|クリニック|施術)/, /(効果|効能|治る|改善する)/],
  },
];

export type ClassifierResult = RuleMatch;

function heuristicClassify(text: string): ClassifierResult[] {
  const out: ClassifierResult[] = [];
  for (const h of HEURISTICS) {
    if (h.all.every((p) => p.test(text))) {
      out.push({
        categoryId: h.categoryId,
        label: h.label,
        level: h.level,
        publicReason: h.publicReason,
      });
    }
  }
  return out;
}

/**
 * 実モデル接続時は OPENAI_FAST_MODEL で JSON 分類を行う。
 * 現在はキー未設定のため、ヒューリスティックのみを返す。
 *
 * NOTE: 実装を差し替える際も「モデルの判定だけで GREEN にしない」こと。
 * 決定論ルールの RED は常に優先される（evaluateSafety 側でマージ）。
 */
export async function classifyWithLightModel(text: string): Promise<ClassifierResult[]> {
  return heuristicClassify(text);
}
