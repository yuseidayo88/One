# ADR-0001: 長時間タスクのバックグラウンド実行方式

- ステータス: 採用
- 日付: 2026-08-17

## 背景

AI社員のタスク（市場調査、実装、長文分析）は数十秒〜数分かかる。
これを通常の HTTP リクエスト内で完結させると、以下が起こる。

- Serverless のタイムアウトで途中終了し、クレジットの予約だけが残る
- ブラウザを閉じると処理が失われる
- 進行状況をユーザーへ返せない

## 決定

**`task_runs` テーブルを耐久キュー兼状態機械として使い、進行は `task_events` へ追記する。**

```
POST /api/director/execute
  → tasks 作成
  → task_runs (status=queued) を作成       ← ここまでがリクエスト内
  → executeRun() をリクエスト外で開始       ← 応答は即返す
        ├ credit reserve
        ├ step ごとに task_events を追記
        ├ artifacts / artifact_versions 保存
        ├ credit settle（失敗時 release）
        └ task_runs.status = succeeded / failed / cancelled
```

UI は `/api/events?since=...` で `task_events` を購読し、進行アニメーションを実データと同期させる。

### 冪等性

- `task_runs.idempotency_key` に `(organization_id, idempotency_key)` の unique 制約。
- 実行中の run があれば新規作成せず既存を返す。
- `credit_reservations.idempotency_key` にも unique 制約があり、リトライで二重課金しない。

## 実行基盤の選択

| 環境 | 実行方法 |
| --- | --- |
| 開発 / 単一プロセス | プロセス内で `executeRun()` を起動（現在の実装） |
| Supabase 中心の本番 | `pg_cron` + Edge Function が `task_runs (status=queued)` をポーリングして実行 |
| Cloudflare 中心の本番 | Cloudflare Queues のコンシューマー Worker が `runId` を受け取り実行 |

いずれの場合も **状態は DB にあり、実行基盤は「誰が `executeRun` を呼ぶか」だけ**が異なる。
そのためワーカー基盤を差し替えてもドメインロジックは変更不要。

### なぜこの方式か

- **DB が単一の真実**: ワーカーが落ちても `task_runs` に残るため再開できる。
- **Realtime と自然に接続**: Supabase Realtime のパブリケーションへ `task_events` を追加済みで、
  ポーリングから WebSocket へ移行しても UI 側の JSON 形状は変わらない。
- **緊急停止が確実**: `AbortController` によるプロセス内中断に加え、
  `task_runs.status = cancelled` を書き込むため、別プロセスのワーカーでも次のチェックポイントで停止する。

## 代替案と却下理由

| 案 | 却下理由 |
| --- | --- |
| HTTP リクエスト内で完結 | タイムアウトで中断し、予約クレジットが残る |
| 外部キュー(SQS/Redis)を新規導入 | Supabase/Cloudflare 前提の構成に対して運用対象が増える |
| クライアント側でポーリングしながら分割実行 | ブラウザを閉じると止まる。安全性の再検査もクライアント依存になる |

## 現在の制限

- 開発構成ではプロセス再起動時に実行中の run が `running` のまま残る。
  本番構成では起動時に「一定時間更新のない running を failed へ戻す」回収ジョブが必要。
- 並列実行数の制御は「1社員1メインタスク」制約のみ。組織単位の同時実行上限は未実装。
