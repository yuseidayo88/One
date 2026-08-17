import type { SafetyLevel } from "@/lib/core/types";

/**
 * 決定論的なルールエンジン（バージョン管理対象）。
 * LLM に安全性を委ねず、まずここで確定判定する。
 */
export const SAFETY_POLICY_VERSION = "2026-08-17.1";

export interface SafetyCategory {
  id: string;
  label: string;
  level: SafetyLevel;
  /** ユーザーへ表示してよいカテゴリ説明 */
  publicReason: string;
  patterns: RegExp[];
}

/** RED: 実行・API・外部ツール呼び出しを完全停止 */
export const RED_CATEGORIES: SafetyCategory[] = [
  {
    id: "fraud",
    label: "詐欺",
    level: "RED",
    publicReason: "詐欺にあたる可能性のある内容が含まれています。",
    patterns: [/詐欺/, /騙(し|す|して)/, /振り込め/, /当選しました.*(送金|振込)/, /\bscam\b/i, /架空請求/],
  },
  {
    id: "phishing",
    label: "フィッシング",
    level: "RED",
    publicReason: "フィッシングにあたる可能性のある内容が含まれています。",
    patterns: [
      /フィッシング/,
      /\bphishing\b/i,
      /(偽|なりすまし|そっくり)の?(ログイン|サイト|ページ|画面)/,
      /(パスワード|ログイン情報|認証情報|クレジットカード番号).{0,20}(入力させ|抜き取|盗|収集して送)/,
    ],
  },
  {
    id: "impersonation",
    label: "なりすまし",
    level: "RED",
    publicReason: "第三者へのなりすましにあたる可能性があります。",
    patterns: [/なりすま(し|す)/, /本人に見せかけ/, /他人の名義で(契約|申請|送信)/, /\bimpersonat/i],
  },
  {
    id: "unauthorized_access",
    label: "不正アクセス",
    level: "RED",
    publicReason: "不正アクセスにあたる可能性があります。",
    patterns: [/不正アクセス/, /ハッキング/, /\bhack into\b/i, /(サーバー|アカウント).{0,10}侵入/, /脆弱性を突いて/],
  },
  {
    id: "malware",
    label: "マルウェア",
    level: "RED",
    publicReason: "悪意あるソフトウェアに関する内容が含まれています。",
    patterns: [/マルウェア/, /ランサムウェア/, /ウイルスを(作|配布)/, /\bmalware\b/i, /\bransomware\b/i, /キーロガー/],
  },
  {
    id: "credential_theft",
    label: "認証情報の窃取",
    level: "RED",
    publicReason: "認証情報の不正取得にあたる可能性があります。",
    patterns: [
      /(パスワード|認証情報|APIキー|トークン).{0,15}(盗|窃取|抜き取|吸い上げ)/,
      /\bsteal (credentials|passwords|tokens)\b/i,
    ],
  },
  {
    id: "illegal_drugs",
    label: "違法薬物",
    level: "RED",
    publicReason: "違法薬物に関する内容が含まれています。",
    patterns: [/違法薬物/, /覚醒剤/, /大麻.{0,6}(販売|売買|密輸)/, /脱法ドラッグ/],
  },
  {
    id: "weapons_violence",
    label: "武器・暴力支援",
    level: "RED",
    publicReason: "武器や暴力の支援にあたる可能性があります。",
    patterns: [/銃器?の?(製造|入手|密輸)/, /爆弾.{0,6}(作|製造)/, /(殺害|暴行).{0,6}(方法|計画|依頼)/],
  },
  {
    id: "money_laundering",
    label: "マネーロンダリング",
    level: "RED",
    publicReason: "資金洗浄にあたる可能性があります。",
    patterns: [/マネーロンダリング/, /資金洗浄/, /\bmoney launder/i, /出金元を(隠|わからなく)/],
  },
  {
    id: "regulation_evasion",
    label: "法規制逃れ",
    level: "RED",
    publicReason: "法規制の回避にあたる可能性があります。",
    patterns: [
      /(法律|規制|規約|税務?申告|届出).{0,12}(逃れ|回避|かいくぐ|バイパス|ごまか)/,
      /無許可で(営業|販売|運営)/,
      /脱税/,
    ],
  },
  {
    id: "pii_illegitimate",
    label: "個人情報の不正取得",
    level: "RED",
    publicReason: "個人情報の不正な取得・利用にあたる可能性があります。",
    patterns: [
      /(個人情報|名簿|住所リスト).{0,12}(不正|無断|勝手に).{0,8}(取得|収集|購入|売買)/,
      /(スクレイピング|収集).{0,15}(個人の?(メール|電話|住所))/,
    ],
  },
  {
    id: "doxxing_stalking",
    label: "晒し・ストーカー行為",
    level: "RED",
    publicReason: "特定個人への嫌がらせや追跡にあたる可能性があります。",
    patterns: [/晒(し|す)/, /特定して(住所|勤務先)/, /ストーカー/, /\bdox+ing\b/i, /居場所を突き止め/],
  },
  {
    id: "fake_reviews",
    label: "虚偽レビュー",
    level: "RED",
    publicReason: "虚偽のレビュー・評価の作成にあたる可能性があります。",
    patterns: [/(サクラ|偽|捏造|やらせ).{0,6}(レビュー|口コミ|評価)/, /\bfake reviews?\b/i, /星5を大量に/],
  },
  {
    id: "deepfake_fraud",
    label: "ディープフェイク詐欺",
    level: "RED",
    publicReason: "ディープフェイクを用いた偽装にあたる可能性があります。",
    patterns: [/ディープフェイク/, /\bdeepfake/i, /(実在の人物|有名人|社長)の?(声|顔).{0,12}(合成|なりすま)/],
  },
  {
    id: "child_exploitation",
    label: "児童搾取",
    level: "RED",
    publicReason: "重大な違法性が疑われる内容が含まれています。",
    patterns: [/児童ポルノ/, /未成年.{0,8}(性的|わいせつ)/, /\bcsam\b/i],
  },
  {
    id: "human_trafficking",
    label: "人身取引",
    level: "RED",
    publicReason: "重大な違法性が疑われる内容が含まれています。",
    patterns: [/人身売買/, /人身取引/, /\bhuman trafficking\b/i, /強制労働.{0,8}(斡旋|募集)/],
  },
  {
    id: "mass_spam",
    label: "大量無差別スパム",
    level: "RED",
    publicReason: "大量無差別送信にあたる可能性があります。",
    patterns: [
      /(無差別|手当たり次第|片っ端から).{0,14}(送信|送りつけ|営業|DM)/,
      /(\d{3,}|数千|数万|何万)\s*(件|通|人).{0,20}(一斉|一括|自動).{0,6}(送信|配信|DM|メール)/,
      /スパム(メール|送信|配信)/,
      /\bspam (blast|campaign)\b/i,
      /購入した名簿.{0,10}(送信|営業)/,
    ],
  },
];

/**
 * ORANGE / YELLOW: 一律禁止ではなく制限。
 * 一般調査と情報整理は許可するが、個別の高リスク判断や無承認の外部実行を禁止する。
 */
export const REGULATED_CATEGORIES: SafetyCategory[] = [
  {
    id: "medical",
    label: "医療",
    level: "ORANGE",
    publicReason: "医療に関する内容のため、有資格者の確認が必要です。",
    patterns: [/診断/, /処方/, /治療法/, /医療広告/, /症状.{0,6}(相談|判断)/, /医薬品.{0,6}(販売|効能)/],
  },
  {
    id: "legal_advice",
    label: "法律",
    level: "ORANGE",
    publicReason: "法的判断に関わる内容のため、専門家の確認が必要です。",
    patterns: [/法的?(助言|アドバイス)/, /訴訟/, /契約書.{0,6}(締結|法的効力)/, /違法かどうか(判断|断定)/],
  },
  {
    id: "finance_investment",
    label: "金融・投資",
    level: "ORANGE",
    publicReason: "投資・金融判断に関わる内容のため、専門家の確認が必要です。",
    patterns: [/投資(助言|判断|推奨)/, /銘柄.{0,6}(推奨|選定)/, /暗号資産.{0,8}(運用|勧誘)/, /元本保証/, /利回り保証/],
  },
  {
    id: "hiring_decision",
    label: "採用判断",
    level: "ORANGE",
    publicReason: "採用の合否判断に関わる内容のため、人の確認が必要です。",
    patterns: [/採用の?(合否|可否).{0,6}(判断|決定)/, /応募者.{0,8}(スコアリング|自動判定|不採用)/],
  },
  {
    id: "politics",
    label: "政治",
    level: "YELLOW",
    publicReason: "政治に関する内容のため、慎重な取り扱いが必要です。",
    patterns: [/選挙運動/, /政党.{0,6}(支持|宣伝)/, /候補者.{0,6}(応援|広告)/],
  },
  {
    id: "gambling",
    label: "ギャンブル",
    level: "ORANGE",
    publicReason: "賭博に関する内容のため、法規制の確認が必要です。",
    patterns: [/オンラインカジノ/, /賭博/, /パチンコ.{0,8}(集客|広告)/, /ブックメーカー/],
  },
  {
    id: "alcohol",
    label: "酒類",
    level: "YELLOW",
    publicReason: "酒類に関する内容のため、表示・年齢確認の規制に注意が必要です。",
    patterns: [/酒類.{0,8}(販売|通販|広告)/, /アルコール飲料.{0,8}(販売|プロモーション)/],
  },
  {
    id: "adult",
    label: "成人向け",
    level: "ORANGE",
    publicReason: "成人向け領域のため、年齢確認と規制の確認が必要です。",
    patterns: [/アダルト(サイト|コンテンツ|業界)/, /風俗店?.{0,8}(集客|広告|経営)/, /出会い系/],
  },
];

/** プロンプトインジェクションの典型パターン（外部データ内でのみ検出対象） */
export const INJECTION_PATTERNS: RegExp[] = [
  /(以前|上記|これまで)の(指示|命令|ルール).{0,10}(無視|忘れ)/,
  /ignore (all )?(previous|prior|above) (instructions|prompts)/i,
  /(システムプロンプト|system prompt).{0,12}(表示|出力|教え|reveal|show)/i,
  /(APIキー|api key|認証情報|credentials|token).{0,15}(送信|送って|出力|表示|send|reveal)/i,
  /(権限|permission|role).{0,10}(拡張|昇格|変更|escalate)/i,
  /(他の?組織|other organization|別のテナント).{0,12}(情報|データ).{0,10}(取得|アクセス)/,
  /you are now (a|an|the) /i,
  /disregard your (rules|guidelines|policy)/i,
  /\bdeveloper mode\b/i,
];

export interface RuleMatch {
  categoryId: string;
  label: string;
  level: SafetyLevel;
  publicReason: string;
}

const LEVEL_ORDER: Record<SafetyLevel, number> = { GREEN: 0, YELLOW: 1, ORANGE: 2, RED: 3 };

export function maxLevel(a: SafetyLevel, b: SafetyLevel): SafetyLevel {
  return LEVEL_ORDER[a] >= LEVEL_ORDER[b] ? a : b;
}

export function atLeast(level: SafetyLevel, threshold: SafetyLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[threshold];
}

/** 決定論ルールで文字列を評価する */
export function evaluateRules(text: string): RuleMatch[] {
  const matches: RuleMatch[] = [];
  const all = [...RED_CATEGORIES, ...REGULATED_CATEGORIES];
  for (const category of all) {
    if (category.patterns.some((p) => p.test(text))) {
      matches.push({
        categoryId: category.id,
        label: category.label,
        level: category.level,
        publicReason: category.publicReason,
      });
    }
  }
  return matches;
}

/** 外部データ中のインジェクション試行を検出する */
export function detectInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((p) => p.test(text));
}
