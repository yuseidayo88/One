import { z } from "zod";

/**
 * LLM の出力は自由文だけにせず、型付き Structured Output で受け取る。
 * スキーマ検証に失敗した出力は破棄し、リトライまたは安全な代替へ倒す。
 */

export const roleKeySchema = z.enum([
  "director",
  "market_research",
  "marketing",
  "sales",
  "designer",
  "engineer",
  "assistant",
  "legal",
  "finance",
]);

export const safetyLevelSchema = z.enum(["GREEN", "YELLOW", "ORANGE", "RED"]);

export const approvalActionSchema = z.enum([
  "email_send",
  "social_post",
  "ads_publish",
  "publish_production",
  "domain_purchase",
  "dns_update",
  "payment",
  "fund_transfer",
  "production_db_change",
  "data_deletion",
  "oauth_grant",
  "contract_submission",
  "high_cost_run",
  "pii_external_send",
]);

export const proposedTaskSchema = z.object({
  /** 計画内で一意な一時ID（依存関係の解決に使う） */
  refId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(4000),
  requiredCapabilities: z.array(z.string()).default([]),
  suggestedRole: roleKeySchema,
  suggestedEmployeeId: z.string().nullable().default(null),
  hiringRequired: z.boolean().default(false),
  dependencies: z.array(z.string()).default([]),
  riskLevel: safetyLevelSchema.default("GREEN"),
  requiredApprovals: z.array(approvalActionSchema).default([]),
  estimatedDurationMinutes: z.number().int().min(1).max(10_000).default(30),
  estimatedWorkTokens: z.number().int().min(0).max(10_000_000).default(1000),
});

export type ProposedTask = z.infer<typeof proposedTaskSchema>;

export const choiceSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["hire", "assign", "queue", "task", "info", "alternative"]),
  title: z.string().min(1).max(200),
  description: z.string().max(2000),
  roleKey: roleKeySchema.nullable().default(null),
  employeeId: z.string().nullable().default(null),
  reason: z.string().max(1000).default(""),
  estimatedDurationMinutes: z.number().int().min(0).default(0),
  estimatedWorkTokens: z.number().int().min(0).default(0),
  riskLevel: safetyLevelSchema.default("GREEN"),
  recommended: z.boolean().default(false),
  /** このカードを選択したときに作るタスクの refId 群 */
  taskRefIds: z.array(z.string()).default([]),
});

export type Choice = z.infer<typeof choiceSchema>;

/** 統括AIの計画出力（最低限の構造） */
export const directorPlanSchema = z.object({
  summary: z.string().max(4000),
  questions: z.array(z.string().max(500)).max(5).default([]),
  hypotheses: z.array(z.string().max(500)).max(5).default([]),
  proposedTasks: z.array(proposedTaskSchema).max(30).default([]),
  requiredCapabilities: z.array(z.string()).default([]),
  suggestedRole: roleKeySchema.nullable().default(null),
  suggestedEmployeeId: z.string().nullable().default(null),
  hiringRequired: z.boolean().default(false),
  dependencies: z
    .array(z.object({ taskRefId: z.string(), dependsOnRefId: z.string() }))
    .default([]),
  riskLevel: safetyLevelSchema.default("GREEN"),
  requiredApprovals: z.array(approvalActionSchema).default([]),
  estimatedDuration: z.number().int().min(0).default(0),
  estimatedWorkTokens: z.number().int().min(0).default(0),
  choices: z.array(choiceSchema).max(20).default([]),
  safeAlternative: z.string().max(2000).default(""),
  risks: z.array(z.string().max(500)).max(10).default([]),
  /** 担当外業務が含まれる場合の引き継ぎ案 */
  handoffs: z
    .array(
      z.object({
        fromRole: roleKeySchema,
        toRole: roleKeySchema,
        reason: z.string().max(500),
        taskRefIds: z.array(z.string()).default([]),
      }),
    )
    .default([]),
});

export type DirectorPlan = z.infer<typeof directorPlanSchema>;

/** 社員の成果物生成出力 */
export const employeeOutputSchema = z.object({
  title: z.string().min(1).max(200),
  summary: z.string().max(2000),
  contentMarkdown: z.string().max(200_000),
  citations: z
    .array(
      z.object({
        title: z.string().max(300),
        url: z.string().max(2000),
        checkedAt: z.string().max(40),
      }),
    )
    .default([]),
  artifactType: z.string().default("document"),
  followUpSuggestions: z.array(z.string().max(300)).max(5).default([]),
  disclaimer: z.string().max(1000).default(""),
});

export type EmployeeOutput = z.infer<typeof employeeOutputSchema>;

/** オンボーディングの事業要約 */
export const businessBriefSchema = z.object({
  name: z.string().max(120),
  summary: z.string().max(2000),
  targetCustomer: z.string().max(1000),
  problem: z.string().max(1000),
  progress: z.string().max(500),
  market: z.enum(["domestic", "overseas", "both"]).default("domestic"),
  regulatedNotes: z.string().max(1000).default(""),
  hypotheses: z.array(z.string().max(300)).max(5).default([]),
});

export type BusinessBrief = z.infer<typeof businessBriefSchema>;

/**
 * スキーマ検証つきパース。失敗時は null を返し、呼び出し側で安全側へ倒す。
 */
export function parseStructured<S extends z.ZodTypeAny>(
  schema: S,
  raw: unknown,
): z.infer<S> | null {
  const result = schema.safeParse(raw);
  return result.success ? (result.data as z.infer<S>) : null;
}
