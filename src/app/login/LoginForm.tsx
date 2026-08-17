"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm({ demo }: { demo: { email: string; password: string } | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState(demo?.email ?? "");
  const [password, setPassword] = useState(demo?.password ?? "");
  const [displayName, setDisplayName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");

    const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/signup";
    const payload =
      mode === "login"
        ? { email, password }
        : { email, password, displayName, organizationName: organizationName || "マイカンパニー" };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "処理に失敗しました");
        return;
      }
      router.push(json.data?.needsOnboarding ? "/onboarding" : "/office");
      router.refresh();
    } catch {
      setError("通信に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="ac-panel flex flex-col gap-3 p-5 ac-enter">
      <div className="mb-1 flex gap-1 rounded-full p-1" style={{ background: "var(--color-bg)" }}>
        {(["login", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className="flex-1 rounded-full py-1.5 text-[12.5px] transition-colors"
            style={{
              background: mode === m ? "var(--color-bg-active)" : "transparent",
              color: mode === m ? "var(--color-text)" : "var(--color-text-muted)",
            }}
          >
            {m === "login" ? "ログイン" : "新規登録"}
          </button>
        ))}
      </div>

      {mode === "signup" && (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-[var(--color-text-muted)]">お名前</span>
            <input
              className="ac-input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              maxLength={80}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-[var(--color-text-muted)]">会社名（あとで変更できます）</span>
            <input
              className="ac-input"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              placeholder="マイカンパニー"
              maxLength={80}
            />
          </label>
        </>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] text-[var(--color-text-muted)]">メールアドレス</span>
        <input
          className="ac-input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] text-[var(--color-text-muted)]">パスワード（8文字以上）</span>
        <input
          className="ac-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
      </label>

      {error && (
        <p className="text-[12px]" style={{ color: "var(--color-danger)" }} role="alert">
          {error}
        </p>
      )}

      <button className="ac-btn ac-btn-primary mt-1" type="submit" disabled={busy}>
        {busy ? "処理中…" : mode === "login" ? "ログイン" : "アカウントを作成"}
      </button>

      {demo && mode === "login" && (
        <p className="text-center text-[11.5px] text-[var(--color-text-faint)]">
          開発用デモ: {demo.email} / {demo.password}
        </p>
      )}
    </form>
  );
}
