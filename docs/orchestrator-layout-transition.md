# 統括AIの配置とトランジション設計

プロジェクト開始の前後で、統括AIの居場所を「中央」から「右パネル」へ移す。
本書は状態モデル・レイアウト・アニメーション・技術選定の根拠を記録する。

---

## 1. 何を変えるか

| | 開始前（draft / planning / ready） | 開始後（active / paused / completed） |
| --- | --- | --- |
| 統括AI | **中央下部の Composer** | **右パネル（固定・リサイズ可）** |
| 中央 | 事業入力・提案カード・見積り・実行ボタン | プロジェクト実務（概要 / タスク / ファイル / 履歴） |
| 左 | ナビゲーションのみ | ナビゲーションのみ |

役割:

- **左** = 画面移動だけ。AI社員一覧は置かない（オフィスへ移す）
- **中央** = 会社が実際に進めている仕事
- **右** = 社長（ユーザー）と参謀（統括AI）の対話・判断

---

## 2. 状態モデル

```ts
type ProjectStatus =
  | "draft"       // 何も決まっていない
  | "planning"    // 統括AIと相談中
  | "ready"       // 提案が出て、実行待ち
  | "active"      // 実行中
  | "paused"      // 一時停止
  | "completed"   // 完了
  | "cancelled";  // 中止
```

表示位置は **projectStatus から導出**する（CSS で無理に動かさない）。

```ts
const showOrchestratorInCenter = status === "draft" || status === "planning" || status === "ready";
const showOrchestratorInRightPanel = status === "active" || status === "paused" || status === "completed";
```

- 導出は `src/lib/projects/status.ts` に集約し、UI とテストの両方から同じ関数を使う。
- サーバー（RSC）が `project.status` を読んで初期レイアウトを決めるため、**リロード後も正しい位置に復元**される。
- 「実行する」が失敗したときは `ready` のままにし、中央の入力内容と会話履歴を保持する。

### 遷移

```
draft ──(事業を入力)──> planning ──(提案が出る)──> ready ──(実行する)──> active
                                                      ▲                  │
                                                      └──(開始に失敗)────┘
active ⇄ paused        active ──> completed / cancelled
```

`executeDecision()` が成功したときだけ `ready → active` へ進める。

---

## 3. 会話の引き継ぎ

**新しい会話を作らない。** 中央で使っていた会話をそのまま右パネルが読む。

- `conversations` に `projectId` を追加し、プロジェクト単位で 1 本持つ。
- 中央 Composer と右パネル Composer は同じ `conversationId` を送信する。
- プロジェクトを切り替えたら、そのプロジェクトの会話へコンテキストごと切り替える。
- メッセージの重複を防ぐため、送信は常に `/api/director/message` の 1 経路のみ。

---

## 4. トランジション

「実行する」を押してから右パネルが開くまでを、**1 つの連続した動き**として見せる。

| 段階 | 時間 | 実装 | 定数 |
| --- | --- | --- | --- |
| 選択確定 → Composer が少し縮む | 0–120ms | CSS transform | `composerShrink` |
| 中央がプロジェクト画面へ展開 | 120–420ms | Motion（opacity + y） | `centerExpand` |
| Identicon と Composer が右へ移動 | 120–560ms | **Motion `layoutId`（Shared Layout Transition）** | `dockMove` |
| 右パネルが開く | 200–480ms | Motion（width アニメーション） | `panelOpen` |
| 進捗グラフの線が描かれる | 300–700ms | SVG `stroke-dashoffset` | `graphDraw` |

合計 **700ms**（仕様の 450–700ms の上限）。イージングは `cubic-bezier(0.22, 1, 0.36, 1)`。
バウンス・回転は使わない。値は `src/lib/motion/transition.ts` の
`ORCHESTRATOR_TRANSITION` が唯一の定義で、テストが範囲と連続性を検証する。

### なぜ Motion の `layoutId` か

- 中央の Composer と右パネルの Composer は **別のツリーにある別 DOM**。
  `layoutId` を共有すると、Motion が両者の矩形を測って FLIP で補間する。
- View Transitions API も候補だが、Next.js の RSC 再描画と併用すると
  スナップショット取得のタイミング制御が難しく、パネルのリサイズ状態と噛み合わない。
- GSAP FLIP は同等のことができるが、依存を増やす割に得るものが少ない。

---

## 5. 技術選定

| 対象 | 技術 | 理由 |
| --- | --- | --- |
| パネル移動・開閉・モーダル | **Motion + CSS** | DOM で足りる。レイアウト補間が必要な箇所だけ `layoutId` |
| 社員の粒子 | **Canvas 2D + 共有 rAF** | 1 社員あたり数十粒子。GPU コンテキストを人数分作る方が高コスト |
| 進行グラフ | **Canvas 2D**（線・光）+ **DOM**（ノードカード） | テキストは DOM の方が可読性・アクセシビリティで有利 |
| ボタン・リスト・ホバー | **CSS** | それ以外を使う理由がない |

### Three.js / WebGL を使わない判断

使用は許可されているが、**今回は使わない**。理由:

- 同時に描く粒子は最大でも「社員数 × 十数個」。Canvas 2D で 60fps に収まる。
- 社員ごとに `WebGLRenderer` を作るのは明確なアンチパターン。共有 Renderer +
  `InstancedMesh` にすると、DOM 上で自由に配置される小さなアバターへ
  座標を同期させる仕組みが必要になり、複雑さに見合わない。
- 文字の上を粒子が通らない設計にしているため、重ね合わせの自由度も不要。

将来 1 画面で数千粒子を扱う要件（会社全体を 1 つの粒子場で表現する等）が出たら、
共有 Renderer + `InstancedMesh` + Texture Atlas へ移行する。その際も
描画ループは既存の共有ティッカーに合流させる。

---

## 6. パフォーマンス方針

- **rAF は 1 本**（`components/particles/ticker.ts`）。購読者が 0 になったら停止。
- **タブが非表示のときは停止**し、復帰時に再開する（`visibilitychange`）。
- **画面外の粒子は描画しない**（`IntersectionObserver`）。
- Canvas は `devicePixelRatio` を上限 2 に丸める。
- アンマウント時にティッカー購読を解除し、`ResizeObserver` / `IntersectionObserver` を破棄する。
- 右パネルのリサイズは `pointermove` 中は localStorage へ書かず、
  ポインタを離した時点で 1 回だけ保存する（`usePersisted(key, value, persist=false)`）。
- 幅と折り畳み状態は `useSyncExternalStore` 経由で localStorage を購読する。
  サーバー描画は必ず既定値を返すため、hydration の食い違いを起こさない。

WebGL を使わないため Renderer / Texture / Geometry / Material の dispose と
Context Lost の処理は現時点では発生しない。将来 WebGL を導入する場合に備え、
ティッカーは購読解除の仕組みを持たせてある。

---

## 7. アニメーション設定

省電力状態や `prefers-reduced-motion` を理由に**自動で品質を落とさない**。
ユーザーが設定画面から明示的に選ぶ。

| 設定 | 挙動 | 実装 |
| --- | --- | --- |
| `standard`（既定） | すべて有効 | `motionDuration()` は指定値をそのまま返す |
| `minimal` | 位置は動かさず、120ms のフェードだけ | `layoutAnimationEnabled()` が false → `layoutId` を渡さない。粒子は静止画 |
| `off` | アニメーション停止（最終状態のみ） | `motionDuration()` が 0。CSS も 0.001ms へ丸める |

`<html data-motion="minimal|off">`（標準時は属性なし）を唯一の真実とし、
`src/app/layout.tsx` のインラインスクリプトが hydration 前に適用する。
React 側は `useSyncExternalStore` で DOM を購読するので、effect 内 setState を起こさない。

判定関数は `src/lib/motion/level.ts`、時間割りは `src/lib/motion/transition.ts` に集約した。

---

## 8. 実装順序と影響範囲

1. `ProjectStatus` 拡張（型 + SQL + 既存データの移行）
2. `conversations.project_id` 追加
3. 左サイドバー化（`AppShell`）
4. オフィスを「社員一覧＋会社の状況」へ再構成
5. `/projects/[id]` を実務画面として新設（概要/タスク/ファイル/履歴）
6. `OrchestratorPanel` を新設し、中央/右の両方から同じ会話を描画
7. `layoutId` によるトランジション
8. 承認待ち画面（`/approvals`）と新規業務画面（`/projects/new`）を独立
9. レスポンシブ（タブレット=右パネル / モバイル=ボトムシート）
10. テスト

**壊さないもの**: 既存の API 経路、Role Policy、Safety Gate、クレジット台帳、
タスク実行、カンバン、成果物モーダル（修正依頼／送信／公開／承認）、
今日のフィード、オンボーディング。
ユニット 88 件 / E2E 17 件が通ることを条件とする。

---

## 9. サーバー側の状態遷移（どこで status が動くか）

| 契機 | 経路 | 遷移 |
| --- | --- | --- |
| 新しい業務を作る | `POST /api/projects` (`create`) | （作成）→ `draft` |
| 統括AIに相談する | `POST /api/director/message` | `draft` → `planning` |
| 実行できる提案が出た | 同上 | `planning` → `ready` |
| 「実行する」が成功 | `POST /api/director/execute` → `executeDecision()` | `ready` → `active` |
| 「実行する」が失敗 | 同上（例外・拒否） | 変更しない（`ready` のまま＝中央に留まる） |
| 一時停止 / 再開 / 完了 / 中止 | `POST /api/projects` (`set_status`) | `active ⇄ paused`、`→ completed`、`→ cancelled` |

遷移可否は `canTransitionProject()` がサーバー側で判定する。
UI の出し分けは判断の根拠にしない（クライアントが偽の status を送っても通らない）。

---

## 10. データの流れ（表示が実データとずれないようにする）

プロジェクト画面は RSC が持ってきた配列を **state に写し取らない**。
写し取ると `router.refresh()` で届いた新しいタスクや社員が無視されるため、
土台は常にサーバーの値とし、ポーリングで分かった差分（status / usedWorkTokens /
currentTaskId）だけを `Map` に重ねる。

進捗グラフは `task_events` から `buildProgressSeries()` で組み立てる。
イベントが 1 件も無いときは点を作らず、「まだ進捗の記録がありません」と出す
（それらしい線を描かない）。
