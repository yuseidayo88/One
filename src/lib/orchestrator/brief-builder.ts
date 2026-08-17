import type { BusinessBrief } from "@/lib/orchestrator/schema";
import { defaultHypotheses } from "@/lib/orchestrator/heuristics";

export interface OnboardingAnswers {
  businessIdea?: string;
  targetCustomer?: string;
  problem?: string;
  progress?: string;
  budget?: string;
  deadline?: string;
  ownerCanDo?: string;
  delegateToAi?: string;
  market?: string;
  regulatedNotes?: string;
}

const REGULATED_HINTS: { re: RegExp; note: string }[] = [
  { re: /(医療|クリニック|健康食品|サプリ|美容医療)/, note: "医療・薬機法に関わる可能性があります。" },
  { re: /(金融|投資|保険|暗号資産|決済)/, note: "金融規制に関わる可能性があります。" },
  { re: /(法律|士業|契約書)/, note: "士業法に関わる可能性があります。" },
  { re: /(人材|採用|派遣)/, note: "職業安定法・労働者派遣法に関わる可能性があります。" },
  { re: /(酒|アルコール)/, note: "酒類の販売・広告規制に関わる可能性があります。" },
  { re: /(中古|リサイクル)/, note: "古物営業法に関わる可能性があります。" },
  { re: /(食品|飲食|カフェ)/, note: "食品衛生法・営業許可に関わる可能性があります。" },
  { re: /(不動産|賃貸)/, note: "宅地建物取引業法に関わる可能性があります。" },
  { re: /(個人情報|顧客データ)/, note: "個人情報保護法への対応が必要になる可能性があります。" },
];

function firstSentence(text: string, max = 60): string {
  const s = text.split(/[。\n]/)[0]?.trim() ?? "";
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export function buildBusinessBrief(
  requestText: string,
  rawContext: Record<string, unknown>,
): BusinessBrief {
  const answers = (rawContext.answers ?? {}) as OnboardingAnswers;
  const idea = answers.businessIdea?.trim() || requestText.trim();

  const regulated = REGULATED_HINTS.filter((h) => h.re.test(idea)).map((h) => h.note);
  if (answers.regulatedNotes) regulated.push(answers.regulatedNotes);

  const marketValue: BusinessBrief["market"] =
    answers.market === "overseas" ? "overseas" : answers.market === "both" ? "both" : "domestic";

  const summary = [
    idea,
    answers.targetCustomer ? `想定顧客: ${answers.targetCustomer}` : "",
    answers.problem ? `解決したい課題: ${answers.problem}` : "",
    answers.progress ? `現在の進捗: ${answers.progress}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    name: firstSentence(idea, 40) || "新規事業",
    summary,
    targetCustomer: answers.targetCustomer ?? "未定（最初の調査で特定します）",
    problem: answers.problem ?? "未定（最初の調査で特定します）",
    progress: answers.progress ?? "構想段階",
    market: marketValue,
    regulatedNotes: regulated.join(" "),
    hypotheses: defaultHypotheses(idea),
  };
}
