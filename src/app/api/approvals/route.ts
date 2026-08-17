import { z } from "zod";
import { defineHandler, jsonError, jsonOk } from "@/lib/api/handler";
import { getStore } from "@/lib/db";
import { decideApproval, verifyApproval } from "@/lib/approvals/service";
import { getEmailProvider, getDeploymentProvider } from "@/lib/providers";
import { recordAudit } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/service";
import { idempotencyKey } from "@/lib/core/ids";

const schema = z.object({
  organizationId: z.string().uuid().optional(),
  approvalId: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
});

/**
 * 承認の判断。
 * 承認された場合のみ、対応する外部操作を実行する。
 * 実行直前に承認レコードの有効性（対象・期限・状態）を再検証する。
 */
export const POST = defineHandler({ schema, rateLimitMax: 30 }, async ({ body, auth }) => {
  const store = await getStore();
  const orgId = auth.organization.id;

  const approval = await decideApproval(
    store,
    orgId,
    body.approvalId,
    body.decision,
    auth.user.id,
  );

  if (body.decision === "rejected") {
    return jsonOk({ approval, executed: false });
  }

  // 実行直前の再検証
  const verified = await verifyApproval(store, orgId, approval.id, approval.action, {
    taskId: approval.taskId,
    artifactId: approval.artifactId,
  });
  if (!verified.valid) {
    return jsonError(409, "approval_invalid", verified.reason);
  }

  let executed = false;
  let detail: Record<string, unknown> = {};

  switch (approval.action) {
    case "email_send": {
      const provider = getEmailProvider();
      const result = await provider.send({
        idempotencyKey: idempotencyKey("email", approval.id),
        organizationId: orgId,
        approvalId: approval.id,
        to: [approval.destination].filter((d) => d && d !== "（未指定）"),
        subject: approval.title,
        bodyText: approval.what,
      });
      executed = result.ok;
      detail = { messageId: result.data?.messageId, error: result.error?.kind };
      await recordAudit(store, {
        organizationId: orgId,
        actorUserId: auth.user.id,
        type: "email_sent",
        target: approval.destination,
        detail,
      });
      break;
    }

    case "publish_production": {
      const provider = getDeploymentProvider();
      const result = await provider.deploy({
        idempotencyKey: idempotencyKey("deploy", approval.id),
        organizationId: orgId,
        projectName: "app",
        environment: "production",
        approvalId: approval.id,
      });
      executed = result.ok;
      detail = { url: result.data?.url, error: result.error?.kind };
      await recordAudit(store, {
        organizationId: orgId,
        actorUserId: auth.user.id,
        type: "published",
        target: result.data?.url ?? "",
        detail,
      });
      break;
    }

    default: {
      // それ以外の承認は記録のみ（実処理は各機能側で承認IDを検証して実行する）
      await recordAudit(store, {
        organizationId: orgId,
        actorUserId: auth.user.id,
        type: "approval",
        target: approval.action,
        detail: { approved: true },
      });
      break;
    }
  }

  await notify(store, {
    organizationId: orgId,
    userId: auth.user.id,
    kind: "system",
    title: `承認しました: ${approval.title}`,
    body: executed ? "承認された操作を実行しました。" : "承認を記録しました。",
    linkTaskId: approval.taskId,
    linkArtifactId: approval.artifactId,
  });

  return jsonOk({ approval, executed, detail });
});
