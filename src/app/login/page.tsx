import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { serverEnv } from "@/config/env";
import { appConfig } from "@/config/app";
import { LoginForm } from "@/app/login/LoginForm";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/db/seed";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/office");

  const showDemo = serverEnv.dataStore === "memory" && serverEnv.seedDemoData;

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full" style={{ maxWidth: 380 }}>
        <div className="mb-8 flex flex-col items-center gap-3 text-center ac-rise">
          <span
            className="inline-block h-9 w-9 rounded-[10px]"
            style={{ background: "linear-gradient(140deg,#6e8cff,#35c78a)" }}
            aria-hidden
          />
          <div>
            <h1 className="text-[19px] font-semibold tracking-tight">{appConfig.name}</h1>
            <p className="mt-1 text-[13px] text-[var(--color-text-muted)]">{appConfig.tagline}</p>
          </div>
        </div>

        <LoginForm
          demo={showDemo ? { email: DEMO_EMAIL, password: DEMO_PASSWORD } : null}
        />

        <p className="mt-6 text-center text-[11.5px] leading-relaxed text-[var(--color-text-faint)]">
          ログインすると、統括AIが最初の質問から会社の立ち上げを案内します。
          <br />
          AI社員の採用やタスクの開始は、あなたが「実行する」を押したときにのみ行われます。
        </p>
      </div>
    </div>
  );
}
