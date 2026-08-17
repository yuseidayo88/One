# AI Company

1人起業・副業・少人数事業者向けの **AI社員 SaaS**。

ユーザーは社長として統括AIに事業を相談し、統括AIが仕事を分解して
AI社員への配属や新規採用を提案します。カードを選んで「実行する」を押した時点で、
採用・タスク作成・業務開始が行われます。

> プロダクト名は未確定のため仮名です。`NEXT_PUBLIC_APP_NAME` の 1 か所で変更できます。

---

## 1. すぐ動かす

APIキーは **1つも不要** です。未設定のときは Mock Provider と Memory ストアで、
オンボーディングからタスク実行・成果物・承認・クレジット精算まで通しで動作します。

```bash
npm install
cp .env.example .env.local     # 任意（未作成でも動きます）
npm run dev                    # http://localhost:3000
```

開発用デモ組織が自動投入されます。

| 項目 | 値 |
| --- | --- |
| メールアドレス | `founder@example.com` |
| パスワード | `demo1234` |

デモ会社の事業は「個人経営の美容室向けに、予約と集客を支援するSaaSを作る」で、
稼働中 / 待機中 / 承認待ち / 成果物完成 / 引き継ぎ / 追加採用提案 / カンバン /
仕事フローアニメーションがすべて確認できる状態になっています。

デモデータを作り直すには `.data/` を削除してください。

```bash
rm -rf .data && npm run dev
```

---

## 2. 検証コマンド

```bash
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit (strict)
npm run test        # Vitest（51ケース）
npm run build       # 本番ビルド
npm run verify      # 上記をまとめて実行

# ブラウザでの受け入れ確認（別ターミナルで npm start を起動してから）
npm run e2e
```

---

## 3. 主要画面

| 画面 | パス | 内容 |
| --- | --- | --- |
| オフィス（ホーム） | `/office` | 3ペイン。左=AI社員一覧と粒子アニメーション、中央=統括AIとの会話・選択カード・仕事フロー、右=Inspector（承認・通知・成果物・ワークトークン） |
| プロジェクト | `/projects` | 事業概要、仮説、プロジェクト進捗、成果物 |
| タスク | `/tasks` | カンバン / リスト / テーブル / タイムライン。ドラッグ＆ドロップはサーバー側で遷移と権限を検証 |
| AI社員 | `/employees` | 採用、専門分野の設定、権限の確認、担当外依頼の引き継ぎ確認 |
| ナレッジ | `/knowledge` | 階層メモリの表示・編集・固定・削除 |
| 連携 | `/integrations` | 各 Provider の接続状態（Mock / 接続済み / 未接続） |
| 使用量・料金 | `/usage` | 残高・予約・社員別/モデル別/月別使用量・プラン・追加購入 |
| 設定 | `/settings` | アカウント、アニメーションの手動 ON/OFF、実行制御 |
| 管理者 | `/admin` | 換算率、モデルルーティング、Tool Policy、Safety 判定、監査ログ、粗利推定 |
| オンボーディング | `/onboarding` | 「どんな事業をやりたいですか？」から提案カードまで |

「成果物」の独立タブは作らず、オフィス・通知・プロジェクト・タスクから開きます。

---

## 4. アーキテクチャ

```
ブラウザ
  └─ /api/*  … requireSession → Zod検証 → レート制限 → 冪等性 → ハンドラ
        ├─ orchestrator/  17ステップのタスクルーティング
        ├─ safety/        決定論ルール + 分類 + 実行直前の再検査（GREEN/YELLOW/ORANGE/RED）
        ├─ roles/         Role Registry と Role Policy（サーバー側で権限を強制）
        ├─ credits/       ワークトークン台帳（reserve / settle / release）
        ├─ models/        ModelRouter（複雑さ・文脈長・品質・原価・安全性で選択）
        ├─ memory/        組織 / 事業 / プロジェクト / 社員 / 実行時の階層メモリ
        ├─ providers/     LLM・画像・動画・メール・検索・ストレージ・デプロイ・課金
        └─ db/            Store インターフェース → MemoryStore | SupabaseStore
```

- 仕様の詳細: [docs/implementation-plan.md](docs/implementation-plan.md)
- 脅威モデル: [docs/threat-model.md](docs/threat-model.md)
- 長時間タスクの実行方式: [docs/adr-0001-background-jobs.md](docs/adr-0001-background-jobs.md)

### 9職種（固定テンプレート）

統括AI / 市場調査 / マーケティング / 営業 / デザイナー / プログラマー /
事務・秘書 / 法務・コンプライアンス調査 / 財務・経理サポート

社員名と専門分野は変更できますが、**許可された業務・ツール・データ権限は
サービス側（`src/lib/roles/registry.ts`）で管理**され、ユーザーや外部文書の指示では変更できません。

---

## 5. データベース

`supabase/migrations/` に 3 つのマイグレーションがあります。

| ファイル | 内容 |
| --- | --- |
| `20260817000001_init.sql` | 全テーブル、列挙型、`updated_at` トリガー、**1社員1メインタスクの部分ユニークインデックス** |
| `20260817000002_rls.sql` | 全組織スコープテーブルの RLS、Storage ポリシー、Realtime パブリケーション |
| `20260817000003_role_seed.sql` | 職種テンプレートの初期投入 |

適用（Supabase CLI）:

```bash
supabase link --project-ref <ref>
supabase db push
```

適用後に `.env.local` へ `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` /
`SUPABASE_SERVICE_ROLE_KEY` を設定すると、自動的に `SupabaseStore` へ切り替わります
（`DATA_STORE=supabase` を明示することもできます）。

---

## 6. 環境変数

`.env.example` を参照してください。主なものは次のとおりです。

| 変数 | 用途 |
| --- | --- |
| `NEXT_PUBLIC_APP_NAME` | プロダクト名（1か所で変更） |
| `SESSION_SECRET` | セッション署名鍵。**本番では必須** |
| `DATA_STORE` | `memory` / `supabase` |
| `FORCE_MOCK_PROVIDERS` | `true` で全 Provider を Mock に固定 |
| `SEED_DEMO_DATA` | デモ組織の自動投入 |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Supabase |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | LLM |
| `OPENAI_FAST_MODEL` / `ANTHROPIC_REASONING_MODEL` / `ANTHROPIC_CODING_MODEL` | モデル名（コードへ散らさない） |
| `MODEL_ROUTING_CONFIG` | ルーティングの上書き（JSON） |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_*` | 課金 |
| `IMAGE_PROVIDER` / `VIDEO_PROVIDER` / `EMAIL_PROVIDER` / `SEARCH_PROVIDER` / `DEPLOYMENT_PROVIDER` | Provider 切り替え |
| `ADMIN_EMAILS` | `/admin` へアクセスできるメールアドレス |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX_REQUESTS` | レート制限 |

### Mock と本番接続の切り替え

1. 対応する API キーを `.env.local` に設定する
2. 必要なら `IMAGE_PROVIDER` などを `mock` 以外へ変更する
3. `/integrations` で状態が「Mock」から「接続済み」に変わることを確認する

`FORCE_MOCK_PROVIDERS=true` を設定すると、キーがあっても常に Mock を使います。

### 外部サービス側で必要な設定

| サービス | 設定 |
| --- | --- |
| Supabase | プロジェクト作成 → マイグレーション適用 → Auth 有効化 → Storage バケット `artifacts`（マイグレーションで作成） |
| Stripe | 商品と価格を作成し `STRIPE_PRICE_*` に設定 → Webhook エンドポイント `/api/billing/webhook` を登録し `STRIPE_WEBHOOK_SECRET` を設定 |
| Resend | ドメイン認証 → `EMAIL_FROM` を認証済みドメインに設定 |
| Gmail / Outlook | OAuth クライアント作成、リダイレクト URI 登録、最小スコープ |
| Cloudflare | API トークン（Pages/Workers/DNS の必要権限のみ）とアカウント ID |
| 画像 / 動画 | 各社の公式 API キー。**非公式エンドポイントは使用しません** |

---

## 7. セキュリティ

- **認証**: HttpOnly + SameSite + Secure Cookie、HMAC 署名、timingSafeEqual による検証、重要操作の再認証フック
- **テナント分離**: 全組織データに `organization_id`、Postgres は RLS、Store 層でも組織スコープを強制（2組織テストで検証）
- **秘密情報**: サーバー専用モジュールを `server-only` で保護。クライアントへ渡すのは `NEXT_PUBLIC_*` のみ（テストで機械的に検証）
- **API**: Zod 検証、CSRF（Origin 検証）、レート制限、リクエストサイズ制限、冪等性、Webhook 署名検証、エラーから内部情報を出さない
- **AI 固有**: Role Policy による allowlist、外部データの `<untrusted_external_data>` 分離、外部データ由来の操作は再承認、実行直前の安全性再検査
- **監査**: ログイン / 採用 / 配属 / ツール呼び出し / メール送信 / 公開 / ドメイン操作 / 支払い / 削除 / Safety 判定 / 承認 / モデル利用 / クレジット変更
- **ヘッダー**: CSP、HSTS、X-Frame-Options、nosniff、Referrer-Policy、Permissions-Policy（`next.config.ts`）

### 承認が必須の操作

メール送信 / SNS投稿 / 広告公開 / 本番公開 / ドメイン購入 / DNS変更 / 支払い / 資金移動 /
本番DB変更 / データ削除 / 新規 OAuth 付与 / 契約・申請 / 高額なワークトークン消費 / 個人情報の外部送信。

承認画面には「実行内容・影響範囲・使用サービス・送信先・差分・予想費用・ワークトークン・可逆性・リスク」を表示します。

---

## 8. ワークトークン

ユーザー向け単位は API の生トークンではなく「ワークトークン」です。

| プラン | ワークトークン / 月 | 月額 |
| --- | --- | --- |
| Free | 100,000 | 無料 |
| Starter | 1,500,000 | 1,980円 |
| Founder | 4,000,000 | 4,980円 |
| CEO | 8,000,000 | 9,800円 |

追加購入: 1,000,000 = 1,480円 / 3,000,000 = 3,980円 / 10,000,000 = 11,800円

価格と換算率は `src/config/pricing.ts` に集約しており、管理画面から確認できます
（1WTあたりのAPI原価上限の目安 0.00025円、安全係数 1.25、目標粗利 80%、USD→JPY レート）。

---

## 9. 現在の制限（未対応事項）

- **実 LLM 未接続**: `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` を設定すると実モデルへ切り替わりますが、
  本リポジトリでは Mock（決定論的な生成）でのみ検証しています。接続時は各社の**最新の公式ドキュメントで
  API 仕様とモデル名を必ず確認**してください。
- **Provider は Adapter + Mock のみ**: Resend / Gmail / Outlook / Cloudflare / Google 画像生成 /
  Higgsfield / Seedance は、インターフェースと Mock を用意した段階です。非公式 API は使用していません。
- **sandbox 未接続**: AI 生成コードの実行はインターフェース定義のみで、実行基盤は接続していません。
  現時点で生成コードをサーバー上で実行することはありません。
- **Supabase 実接続は未検証**: マイグレーションと `SupabaseStore` は用意していますが、
  実プロジェクトに対する動作確認は行えていません（キー未設定のため）。RLS も同様です。
- **MFA / OAuth ログイン**: 拡張ポイントのみ。Supabase Auth 有効化時に接続します。
- **バックグラウンド実行**: 開発構成ではプロセス内実行です。本番では
  `docs/adr-0001-background-jobs.md` のとおり pg_cron または Cloudflare Queues の
  ワーカーと、`running` のまま残った run を回収するジョブが必要です。
- **多言語化**: 日本語のみ。文言は各コンポーネントに直書きのため、
  本格対応時はメッセージカタログへの抽出が必要です。
- **MemoryStore は開発専用**: 暗号化・バックアップの対象外です。本番では必ず Supabase を使用してください。
- **依存脆弱性検査**: `npm audit` は CI へ未組み込みです。

---

## 10. 次に実装すべき項目

1. Supabase 実接続での RLS 検証（2組織の実アカウントでの結合テスト）
2. 実 LLM 接続時の Structured Output 検証とリトライ方針の実測
3. Cloudflare Queues / pg_cron のワーカー実装と、停滞 run の回収ジョブ
4. sandbox 実行基盤（ファイルパス・ネットワーク・時間・CPU/メモリ制限）
5. Resend → Gmail / Outlook OAuth の順での メール連携
6. 画像・動画 Provider の公式 API 接続
7. i18n（メッセージカタログ抽出と英語対応）
8. MFA と不審ログイン検知
