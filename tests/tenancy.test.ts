import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { MemoryStore } from "@/lib/db/memory-store";
import { createOrg, hire, makeTask } from "./helpers";
import { rememberMemory, recallForEmployee } from "@/lib/memory/service";
import { newId, nowIso } from "@/lib/core/ids";

/**
 * 必須テストケース 14〜15（30章）
 */

describe("14. 他組織のプロジェクト・社員・成果物・メモリを取得できない", () => {
  it("2組織を用いた分離テスト", async () => {
    const store = new MemoryStore();
    const orgA = await createOrg(store, "組織A");
    const orgB = await createOrg(store, "組織B");

    const employeeA = await hire(orgA, "engineer");
    const taskA = await makeTask(orgA, { assigneeEmployeeId: employeeA.id, title: "Aの秘密タスク" });

    await store.insert("projects", {
      id: newId(),
      organizationId: orgA.orgId,
      businessId: null,
      name: "Aのプロジェクト",
      description: "",
      status: "active",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      createdBy: orgA.userId,
    });

    const artifactId = newId();
    await store.insert("artifacts", {
      id: artifactId,
      organizationId: orgA.orgId,
      projectId: null,
      taskId: taskA.id,
      employeeId: employeeA.id,
      type: "document",
      title: "Aの成果物",
      summary: "",
      currentVersion: 1,
      status: "draft",
      citations: [],
      usedWorkTokens: 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      createdBy: orgA.userId,
    });

    const memoryA = await rememberMemory(store, {
      organizationId: orgA.orgId,
      scope: "organization",
      title: "Aの機密メモ",
      content: "他組織へ漏れてはいけない",
      source: "test",
      createdBy: orgA.userId,
    });

    // ID を直接指定しても、別組織スコープでは取得できない
    expect(await store.get("tasks", orgB.orgId, taskA.id)).toBeNull();
    expect(await store.get("employee_instances", orgB.orgId, employeeA.id)).toBeNull();
    expect(await store.get("artifacts", orgB.orgId, artifactId)).toBeNull();
    expect(await store.get("memories", orgB.orgId, memoryA.id)).toBeNull();

    // 一覧にも現れない
    expect((await store.list("tasks", orgB.orgId)).length).toBe(0);
    expect((await store.list("projects", orgB.orgId)).length).toBe(0);
    expect((await store.list("artifacts", orgB.orgId)).length).toBe(0);
    expect((await store.list("memories", orgB.orgId)).length).toBe(0);

    // 更新も他組織からはできない
    await expect(
      store.update("tasks", orgB.orgId, taskA.id, { title: "改ざん" }),
    ).rejects.toThrow();

    // 削除も無視される
    await store.remove("tasks", orgB.orgId, taskA.id);
    expect(await store.get("tasks", orgA.orgId, taskA.id)).not.toBeNull();
  });

  it("組織をまたいだメモリ共有は起こらない", async () => {
    const store = new MemoryStore();
    const orgA = await createOrg(store, "組織A");
    const orgB = await createOrg(store, "組織B");

    await rememberMemory(store, {
      organizationId: orgA.orgId,
      scope: "organization",
      title: "Aの知識",
      content: "秘密",
      source: "test",
      createdBy: orgA.userId,
    });

    const employeeB = await hire(orgB, "market_research");
    const recalled = await recallForEmployee(store, orgB.orgId, {
      employeeId: employeeB.id,
      roleKey: "market_research",
    });
    expect(recalled.length).toBe(0);
  });

  it("社員は他社員の個別メモリを読めない", async () => {
    const store = new MemoryStore();
    const org = await createOrg(store);
    const engineer = await hire(org, "engineer");
    const researcher = await hire(org, "market_research");

    await rememberMemory(store, {
      organizationId: org.orgId,
      scope: "employee",
      scopeRefId: engineer.id,
      employeeId: engineer.id,
      title: "プログラマーの個人メモ",
      content: "他社員に見せない",
      source: "test",
      createdBy: org.userId,
    });

    const recalled = await recallForEmployee(store, org.orgId, {
      employeeId: researcher.id,
      roleKey: "market_research",
    });
    expect(recalled.find((m) => m.title === "プログラマーの個人メモ")).toBeUndefined();

    const own = await recallForEmployee(store, org.orgId, {
      employeeId: engineer.id,
      roleKey: "engineer",
    });
    expect(own.find((m) => m.title === "プログラマーの個人メモ")).toBeDefined();
  });

  it("財務データは許可された職種のみが読める", async () => {
    const store = new MemoryStore();
    const org = await createOrg(store);
    const finance = await hire(org, "finance");
    const sales = await hire(org, "sales");

    await rememberMemory(store, {
      organizationId: org.orgId,
      scope: "organization",
      title: "資金繰り",
      content: "機密",
      source: "test",
      confidentiality: "confidential",
      createdBy: org.userId,
    });

    const financeView = await recallForEmployee(store, org.orgId, {
      employeeId: finance.id,
      roleKey: "finance",
    });
    const salesView = await recallForEmployee(store, org.orgId, {
      employeeId: sales.id,
      roleKey: "sales",
    });

    expect(financeView.some((m) => m.title === "資金繰り")).toBe(true);
    expect(salesView.some((m) => m.title === "資金繰り")).toBe(false);
  });
});

describe("15. service_role や APIキーがクライアントへ含まれない", () => {
  const SERVER_ONLY_ENV = [
    "SUPABASE_SERVICE_ROLE_KEY",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "SESSION_SECRET",
    "RESEND_API_KEY",
    "CLOUDFLARE_API_TOKEN",
    "GOOGLE_AI_API_KEY",
    "HIGGSFIELD_API_KEY",
    "SEEDANCE_API_KEY",
    "SEARCH_API_KEY",
    "ADMIN_EMAILS",
  ];

  function collectFiles(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) collectFiles(full, out);
      else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
    }
    return out;
  }

  it("クライアントコンポーネントがサーバー専用の環境変数を参照していない", () => {
    const root = path.join(process.cwd(), "src");
    const offenders: string[] = [];

    for (const file of collectFiles(root)) {
      const content = fs.readFileSync(file, "utf8");
      const isClient = content.startsWith('"use client"') || content.startsWith("'use client'");
      if (!isClient) continue;

      for (const key of SERVER_ONLY_ENV) {
        if (content.includes(key)) offenders.push(`${file} → ${key}`);
      }
      // serverEnv 自体をクライアントから参照していない
      if (/from "@\/config\/env"/.test(content)) offenders.push(`${file} → @/config/env`);
    }

    expect(offenders).toEqual([]);
  });

  it("サーバー専用モジュールは server-only で保護されている", () => {
    const protectedFiles = [
      "src/config/env.ts",
      "src/lib/db/index.ts",
      "src/lib/db/supabase-store.ts",
      "src/lib/providers/index.ts",
      "src/lib/auth/session.ts",
      "src/lib/api/handler.ts",
    ];
    for (const file of protectedFiles) {
      const content = fs.readFileSync(path.join(process.cwd(), file), "utf8");
      expect(content.startsWith('import "server-only";')).toBe(true);
    }
  });

  it("クライアントへ渡す設定には公開値だけが含まれる", async () => {
    const appConfigSource = fs.readFileSync(
      path.join(process.cwd(), "src/config/app.ts"),
      "utf8",
    );
    const envRefs = appConfigSource.match(/process\.env\.[A-Z_]+/g) ?? [];
    for (const ref of envRefs) {
      expect(ref.startsWith("process.env.NEXT_PUBLIC_")).toBe(true);
    }
  });

  it("秘密情報がログから除去される", async () => {
    const { redact } = await import("@/lib/core/redact");
    const result = redact({
      apiKey: "sk-abcdefghijklmnopqrstuvwxyz",
      password: "hunter2",
      nested: { authorization: "Bearer abcdefghijklmnop" },
      note: "連絡先は user@example.com です",
    }) as Record<string, unknown>;

    expect(result.apiKey).toBe("<redacted>");
    expect(result.password).toBe("<redacted>");
    expect((result.nested as Record<string, unknown>).authorization).toBe("<redacted>");
    expect(String(result.note)).toContain("<email>");
  });
});
