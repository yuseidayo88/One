import { z } from "zod";
import { defineHandler, jsonError, jsonOk } from "@/lib/api/handler";
import { getStore } from "@/lib/db";
import { newId, nowIso } from "@/lib/core/ids";
import { requestApproval } from "@/lib/approvals/service";
import { transitionTask } from "@/lib/tasks/service";
import { assertToolCallAllowed } from "@/lib/safety/gate";
import { recordSafetyDecision } from "@/lib/audit/log";
import type { ToolName } from "@/lib/core/types";

const schema = z.object({
  organizationId: z.string().uuid().optional(),
  artifactId: z.string().uuid(),
  action: z.enum(["approve", "request_revision", "handoff", "send", "publish"]),
  note: z.string().max(4000).optional(),
  toEmployeeId: z.string().uuid().optional(),
  destination: z.string().max(400).optional(),
});

/**
 * 成果物の操作。
 * 送信・公開は「承認する」とは別に、必ず個別の承認を取る。
 */
export const POST = defineHandler({ schema, rateLimitMax: 40 }, async ({ body, auth }) => {
  const store = await getStore();
  const orgId = auth.organization.id;

  const artifact = await store.get("artifacts", orgId, body.artifactId);
  if (!artifact) return jsonError(404, "not_found", "成果物が見つかりません");

  switch (body.action) {
    case "approve": {
      const updated = await store.update("artifacts", orgId, body.artifactId, { status: "approved" });
      if (artifact.taskId) {
        await transitionTask(store, orgId, artifact.taskId, "done", auth.user.id);
      }
      return jsonOk({ artifact: updated });
    }

    case "request_revision": {
      const updated = await store.update("artifacts", orgId, body.artifactId, { status: "draft" });
      const versions = await store.list("artifact_versions", orgId, {
        filter: { artifactId: body.artifactId },
      });
      await store.insert("artifact_versions", {
        id: newId(),
        organizationId: orgId,
        artifactId: body.artifactId,
        version: versions.length + 1,
        content: body.note ?? "",
        contentType: "markdown",
        note: `修正依頼: ${body.note?.slice(0, 200) ?? ""}`,
        createdAt: nowIso(),
        createdBy: auth.user.id,
      });
      if (artifact.taskId) {
        await transitionTask(store, orgId, artifact.taskId, "revising", auth.user.id);
      }
      return jsonOk({ artifact: updated });
    }

    case "handoff": {
      if (!body.toEmployeeId) return jsonError(400, "invalid_request", "引き継ぎ先が必要です");
      const target = await store.get("employee_instances", orgId, body.toEmployeeId);
      if (!target) return jsonError(404, "not_found", "引き継ぎ先の社員が見つかりません");
      await store.insert("task_handoffs", {
        id: newId(),
        organizationId: orgId,
        taskId: artifact.taskId ?? "",
        fromEmployeeId: artifact.employeeId,
        toEmployeeId: target.id,
        toRoleKey: target.roleKey,
        reason: body.note ?? "成果物の引き継ぎ",
        status: "proposed",
        createdAt: nowIso(),
      });
      return jsonOk({ handedOffTo: target.name });
    }

    // 送信・公開は必ず別の承認を取る
    case "send":
    case "publish": {
      const tool: ToolName = body.action === "send" ? "email_send" : "deploy_production";
      const employee = artifact.employeeId
        ? await store.get("employee_instances", orgId, artifact.employeeId)
        : null;
      if (!employee) return jsonError(400, "invalid_request", "担当社員が特定できません");

      // 実行直前の再検査（安全性 + Role Policy + 承認）
      const gate = await assertToolCallAllowed({
        roleKey: employee.roleKey,
        employeeRole: employee.roleKey,
        tool,
        payloadText: `${artifact.title}\n${body.destination ?? ""}\n${body.note ?? ""}`,
        approvalId: null,
      });

      await recordSafetyDecision(store, {
        organizationId: orgId,
        userId: auth.user.id,
        employeeId: employee.id,
        taskId: artifact.taskId,
        level: gate.safety.level,
        categories: gate.safety.categories,
        stage: "pre_tool",
        publicReason: gate.safety.publicReason,
        internalDetail: gate.safety.internalDetail,
      });

      if (gate.safety.level === "RED") {
        return jsonError(403, "safety_blocked", gate.publicMessage, {
          safeAlternative: gate.safety.safeAlternative,
        });
      }

      const approval = await requestApproval(store, {
        organizationId: orgId,
        action: body.action === "send" ? "email_send" : "publish_production",
        title: body.action === "send" ? `メール送信: ${artifact.title}` : `公開: ${artifact.title}`,
        what:
          body.action === "send"
            ? "作成したメール下書きを送信します。"
            : "作成した成果物を本番環境へ公開します。",
        affects: body.destination ?? "指定された送信先 / 公開先",
        service: body.action === "send" ? "メール送信 Provider" : "デプロイ Provider",
        destination: body.destination ?? "（未指定）",
        diff: `+ ${artifact.title}\n+ バージョン ${artifact.currentVersion}`,
        estimatedCostJpy: 0,
        estimatedWorkTokens: 0,
        reversible: body.action !== "send",
        risk:
          body.action === "send"
            ? "送信後に取り消すことはできません。宛先と本文を必ず確認してください。"
            : "公開後は誰でも閲覧できる状態になります。",
        taskId: artifact.taskId,
        artifactId: artifact.id,
        employeeId: employee.id,
        userId: auth.user.id,
      });

      return jsonOk({
        requiresApproval: true,
        approvalId: approval.id,
        message: "承認が必要です。承認画面で内容を確認してください。",
      });
    }

    default:
      return jsonError(400, "invalid_action", "不明な操作です");
  }
});
