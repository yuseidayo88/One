# AI Company — 実装計画 (Implementation Plan)

> 1人起業・副業・少人数事業者向けの「AI社員 SaaS」。
> ユーザーは社長として統括AIに相談し、AI社員を採用し、タスクを実行する。

このドキュメントは実装の設計根拠と作業計画を記録する。
決定した仮定は `src/config/*` に集約し、コードへ散在させない。

---

## 1. 前提と制約

| 項目 | 状態 |
| --- | --- |
| リポジトリ | 空 (initial commit なし) → 推奨構成で新規構築 |
| Supabase | 環境変数なし → SQL マイグレーションは作成、実行時は Memory ストアにフォールバック |
| Anthropic / OpenAI | キーなし → `MockLLMProvider` が既定 |
| Stripe | キーなし → `MockBillingProvider` が既定 |
| 画像 / 動画 / メール / 検索 / デプロイ | キーなし → Adapter + Mock のみ |
| 非公式 API | **使用しない**。Adapter と Mock のみを用意し、公式 API 提供時に差し替える |

**設計原則**: APIキーが 1 つも無い状態でも、Phase 1 の全機能（オンボーディング → 提案 → 採用 → タスク実行 → 成果物 → 承認 → クレジット精算）がブラウザ上で完全に動作すること。

---

## 2. アーキテクチャ

```
 ┌──────────────────────────── Next.js App Router (RSC + Client) ─────────────────────────────┐
 │  /login  /onboarding  /office  /projects  /tasks  /employees                               │
 │  /knowledge  /integrations  /usage  /settings  /admin                                      │
 └──────────────┬────────────────────────────────────────────────────────────────────────────┘
                │  fetch (JSON, Zod 検証)
 ┌──────────────▼──────────────── /api/* Route Handlers ─────────────────────────────────────┐
 │  requireSession → requireOrgMember → Zod parse → rate limit → idempotency → handler        │
 └──────────────┬────────────────────────────────────────────────────────────────────────────┘
                │
 ┌──────────────▼─────────────── Server Core (src/lib) ──────────────────────────────────────┐
 │  orchestrator/   17ステップのルーティングワークフロー                                        │
 │  safety/         決定論ルールエンジン + 軽量モデル分類 + GREEN/YELLOW/ORANGE/RED            │
 │  roles/          Role Registry / Role Policy (allowlist をサーバー側で強制)                 │
 │  credits/        ワークトークン台帳 reserve / settle / release                              │
 │  models/         ModelRouter (複雑さ・文脈長・品質・原価・安全性で選択)                      │
 │  memory/         組織 / 事業 / プロジェクト / 社員 / 実行時 の階層メモリ                     │
 │  providers/      LLM Image Video Email Search Storage Deployment Database Billing           │
 │  db/             Store インターフェース → SupabaseStore | MemoryStore                        │
 └───────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 データ層の二重化

`src/lib/db/store.ts` が `Store` インターフェースを定義する。

- `MemoryStore` — 開発既定。プロセス内 + `.data/dev-store.json` へ永続化。全クエリが `organization_id` スコープを強制（RLS と同じ不変条件をアプリ層で再現）。
- `SupabaseStore` — `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` がある場合に有効。RLS が有効な Postgres に対して動作。

どちらでも同じ振る舞いになるよう、テナント分離テストは Store インターフェース経由で実施する。

### 2.2 バックグラウンドジョブ

長時間タスクを HTTP リクエスト内で完結させない。
`task_runs` を耐久キューとして使い、`JobRunner` がステップ単位で `task_events` を追記する。
選定理由と本番構成（Supabase pg_cron / Cloudflare Queues）は `docs/adr-0001-background-jobs.md` に記録。

---

## 3. ドメインモデル

### 3.1 職種 (Role Registry)

初期リリースの固定 9 職種。カスタム社員は作らないが、Registry 構造で将来追加可能。

| roleKey | 名称 | 主な Capability |
| --- | --- | --- |
| `director` | 統括AI | 事業理解 / 分解 / 配属 / 見積 / 承認取得 |
| `market_research` | 市場調査 | 市場・競合・顧客・トレンド調査、出典付きレポート |
| `marketing` | マーケティング | ペルソナ / 戦略 / コンテンツ / LPコピー / KPI |
| `sales` | 営業 | リード調査 / 営業リスト / 提案書 / メール下書き |
| `designer` | デザイナー | UI/UX / ワイヤー / ブランド / 画像生成 |
| `engineer` | プログラマー | 設計 / 実装 / DB / テスト / デプロイ準備 |
| `assistant` | 事務・秘書 | 予定 / 議事録 / メール分類 / 下書き / 整形 |
| `legal` | 法務・コンプライアンス調査 | 法規調査 / 規約下書き / リスク洗い出し |
| `finance` | 財務・経理サポート | 予算 / 予測 / P/L / CF / 料金設計 |

各職種は `allowedCapabilities` / `allowedTools` / `allowedDataScopes` / `allowedArtifactTypes` /
`prohibitedActions` / `approvalRequiredActions` を持ち、**すべてのツール呼び出し前にサーバー側で検証**する。

### 3.2 引き継ぎ (Handoff)

担当外の依頼は拒否ではなく分解する:
依頼 → サブタスク分解 → 自分の担当部分を特定 → 担当外に必要な職種を特定 →
統括AIへ引き継ぎ案 → 在籍社員がいれば配属提案 / いなければ採用提案 → ユーザーが「実行する」。

### 3.3 1社員1メインタスク

- `employee_instances.current_task_id` + 部分ユニークインデックス
  `unique (assignee_employee_id) where status = 'running'` で DB レベルに強制。
- MemoryStore も同じ制約を実装し、同一のテストで検証する。
- 競合時は「完了を待つ / 優先度変更 / 同職種を追加採用」の 3 択を提示。

---

## 4. 安全ゲート

多層防御。単一 LLM に安全性を委ねない。

1. **決定論ルールエンジン** (`safety/rules.ts`) — 正規表現 + キーワード + 文脈条件。RED カテゴリを即時停止。
2. **軽量モデル分類** (`safety/classifier.ts`) — `OPENAI_FAST_MODEL` 経由。Mock 時はヒューリスティック。
3. **サーバー側権限検査** (`roles/policy.ts`) — Role Policy allowlist。
4. **ツール実行直前の再検査** (`safety/gate.ts#assertToolCallAllowed`) — 外部操作は必ず再判定。
5. **監査ログ** (`audit_events`, `safety_decisions`)。
6. **人間確認** (`approvals`)。

判定は 4 段階: `GREEN` / `YELLOW` / `ORANGE` / `RED`。
拒否時は「できないこと・理由カテゴリ・安全な代替案・専門家確認の案内」を返し、内部判定詳細は返さない。
RED で停止した場合、危険な部分出力は成果物として保存しない。

---

## 5. ワークトークン

- ユーザー向け単位は API 生トークンではなく **ワークトークン**。
- 原価換算は `src/config/pricing.ts` の `COST_MODEL`（1WT あたり API 原価上限 0.00025 円、目標粗利 80%、為替レート、安全係数）。管理者が変更可能。
- ライフサイクル: `reserve` → 実行 → `settle`（実使用）/ `release`（失敗時）。
- `idempotency_key` により、リトライ時の二重課金を防ぐ。
- 月次付与分と追加購入分は `credit_ledger.bucket` で区別（有効期限ルールは設定で変更可能）。

---

## 6. UI

ダークモードのみ。Codex / OpenAI / Apple 的な静かな高品質。
3ペイン（左: 社員一覧 / 中央: 統括AI会話・選択カード / 右: Inspector）。
狭い画面では右ペインをドロワー化。

- 社員ごとの粒子アニメーション（Canvas, GPU意識, requestAnimationFrame, ステータス同期）。
- 業務フローのノード＋光の移動アニメーション（`task_events` と同期）。
- コマンドパレット（⌘K）、キーボード操作。
- 粒子・演出は自動劣化させず、設定画面で手動 OFF のみ可能。

ナビ: オフィス / プロジェクト / タスク / AI社員 / ナレッジ / 連携 / 使用量・料金 / 設定（+ 管理者）。
「成果物」独立タブは作らない。

---

## 7. 実装フェーズ

### Phase 1 — 動くコア MVP
認証 / 組織 / オンボーディング / オフィス / 統括AIチャット / 9職種 / 採用 /
1社員1メインタスク / タスク分解・配属 / 引き継ぎ / 成果物 / 通知 / 承認 /
Safety Gate / ワークトークン台帳 / ModelRouter / RLS マイグレーション。

### Phase 2 — 管理体験
カンバン / リスト / テーブル / フローアニメーション / 社員別メモリ / Inspector /
バージョン履歴 / 修正依頼 / 使用量画面 / Stripe。

### Phase 3 — 外部連携
Resend / Gmail / Outlook / 画像生成 / 動画 Provider / Cloudflare / Supabase 管理 /
公開フロー / ドメイン接続。すべて Adapter + Mock を先に用意。

---

## 8. テスト

`npm run test` (Vitest) で以下を検証（要求 30 章の 18 項目に対応）:

1. 事業案入力 → 社員提案 → 選択 → 採用
2. 混合依頼の複数タスク分解
3. 営業社員へのプログラミング依頼 → 実行せず引き継ぎ
4. 該当社員不在 → 採用提案
5. 営業社員稼働中 → キュー / 追加採用の提案
6. 同一社員に running 2 件不可
7. スパム / フィッシング → RED + ツール停止
8. 規制領域 → ORANGE + 外部実行停止
9. プロンプトインジェクションで権限が変わらない
10. メール下書き可 / 未承認送信不可
11. 未承認の本番公開不可
12. reserve / settle / release
13. リトライで二重課金なし
14. 他組織データ取得不可
15. service_role / APIキーがクライアントへ含まれない
16. 成果物完成通知 → 「確認する」で開く
17. task_events と進捗アニメーションの同期
18. 全社員停止が実ジョブへ反映

---

## 9. 残課題（実装後に README へ記載）

- 本番 Supabase / Stripe / 各 Provider への実接続は鍵投入後に検証が必要。
- Gmail / Outlook / Cloudflare / Higgsfield / Seedance は Adapter + Mock のみ。
- sandbox 実行はインターフェース定義まで（実行基盤は未接続）。
