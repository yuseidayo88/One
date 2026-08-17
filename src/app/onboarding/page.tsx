import { redirect } from "next/navigation";
import { getCurrentUser, requireSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { OnboardingFlow } from "@/app/onboarding/OnboardingFlow";
import { appConfig } from "@/config/app";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const auth = await requireSession();
  const store = await getStore();
  const businesses = await store.list("businesses", auth.organization.id);
  if (businesses.length > 0) redirect("/office");

  return (
    <div className="mx-auto flex min-h-screen w-full flex-col px-5 py-10" style={{ maxWidth: 760 }}>
      <header className="mb-8 ac-rise">
        <p className="text-[11px] uppercase tracking-[0.1em] text-[var(--color-text-faint)]">
          {appConfig.name} — はじめに
        </p>
        <h1 className="mt-2 text-[22px] font-semibold tracking-tight">どんな事業をやりたいですか？</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-text-muted)]">
          思いつくままで構いません。統括AIが内容を整理し、必要な仕事に分解して、
          最初に採用すべきAI社員を提案します。採用やタスクの開始は、あなたが「実行する」を押したときにのみ行われます。
        </p>
      </header>

      <OnboardingFlow />
    </div>
  );
}
