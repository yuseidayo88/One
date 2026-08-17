import { z } from "zod";
import { defineHandler, jsonError, jsonOk } from "@/lib/api/handler";
import { getStore } from "@/lib/db";
import { hireEmployee } from "@/lib/orchestrator/workflow";
import { busyEmployeeOptions, proposeHandoff, emergencyStopAll, resumeAll } from "@/lib/tasks/service";
import { cancelAllRuns } from "@/lib/tasks/runner";
import { ALL_ROLE_KEYS } from "@/lib/roles/registry";

const schema = z.object({
  organizationId: z.string().uuid().optional(),
  action: z.enum(["hire", "rename", "handoff_proposal", "busy_options", "emergency_stop", "resume_all"]),
  roleKey: z.enum(ALL_ROLE_KEYS as [string, ...string[]]).optional(),
  employeeId: z.string().uuid().optional(),
  name: z.string().min(1).max(80).optional(),
  specialty: z.string().max(120).optional(),
  requestText: z.string().max(4000).optional(),
});

export const POST = defineHandler({ schema, rateLimitMax: 40 }, async ({ body, auth }) => {
  const store = await getStore();
  const orgId = auth.organization.id;

  switch (body.action) {
    case "hire": {
      if (!body.roleKey) return jsonError(400, "invalid_request", "職種が指定されていません");
      const employee = await hireEmployee(store, {
        organizationId: orgId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        roleKey: body.roleKey as any,
        userId: auth.user.id,
        name: body.name,
        specialty: body.specialty,
      });
      return jsonOk({ employee });
    }

    case "rename": {
      if (!body.employeeId) return jsonError(400, "invalid_request", "社員が指定されていません");
      // 社員名と専門分野は変更できるが、許可された業務・ツール・データ権限は変更できない
      const employee = await store.update("employee_instances", orgId, body.employeeId, {
        ...(body.name ? { name: body.name } : {}),
        ...(body.specialty ? { specialty: body.specialty } : {}),
      });
      return jsonOk({ employee });
    }

    case "handoff_proposal": {
      if (!body.employeeId || !body.requestText) {
        return jsonError(400, "invalid_request", "社員と依頼内容が必要です");
      }
      const proposal = await proposeHandoff(store, orgId, body.employeeId, body.requestText);
      return jsonOk(proposal);
    }

    case "busy_options": {
      if (!body.employeeId) return jsonError(400, "invalid_request", "社員が指定されていません");
      const options = await busyEmployeeOptions(store, orgId, body.employeeId);
      return jsonOk(options ?? { options: [] });
    }

    case "emergency_stop": {
      const cancelled = cancelAllRuns();
      const result = await emergencyStopAll(store, orgId, auth.user.id);
      return jsonOk({ ...result, cancelledRuns: cancelled });
    }

    case "resume_all": {
      const resumed = await resumeAll(store, orgId, auth.user.id);
      return jsonOk({ resumed });
    }

    default:
      return jsonError(400, "invalid_action", "不明な操作です");
  }
});
