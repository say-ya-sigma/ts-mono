# 第 15 回 デプロイと次のステップ

- **ゴール**: 両ワークスペースの本番デプロイ構成を理解し、D1 永続化の設計ができる
- **対象ファイル**: `frontend/wrangler.jsonc`、`backend/wrangler.jsonc`、`README.md` (学習課題)

## 1. この講義の到達点のおさらい

ここまでの 14 回で、私たちはこの図の **すべての矢印と箱** を読み、
一部を自作してきました。

```
[ブラウザ]
   BookManager (use client)  ← 第 11-12, 14 回
      │ api.list / create / update ...  ← 第 13 回 (境界)
      │ fetch (CORS + プリフライト)  ← 第 10 回
[Hono on Workers]  ← 第 04-06 回 (ルーティング/REST)
      │ store.ts (検証・検索・集計)  ← 第 07-09 回
      │ books.ts (型とシード)  ← 第 02 回
[モノレポ / ランタイム]  ← 第 03, 05 回
```

最終回は「このアプリを本番 (production) 持ち出し可能にする」ために
残っている 3 つの壁 — **デプロイ・永続化・発展課題** — を扱います。

## 2. デプロイ — 2 つの Worker という構成

最終形は「frontend も backend も Workers」という 2 Worker 構成です。

```bash
npm -w backend run deploy    # backend → Workers へ
npm -w frontend run deploy   # frontend → OpenNext + Cloudflare へ
```

### 2.1. backend のデプロイ

`wrangler deploy` が `src/index.ts` をバンドルして全世界に配布します。
ビルド成果物は 1 つの Worker。設定は第 05 回で読んだ `wrangler.jsonc` の通り。

デプロイ後に確認すべきこと:

1. `https://backend.<account>.workers.dev/` で API 自己説明 (第 04 回) が返るか
2. **CORS の origin 許可を本番ドメインに絞る** (第 10 回 5.1) — 
   `cors({ origin: ["https://frontend.<account>.workers.dev"] })`
3. **フロントの `NEXT_PUBLIC_API_URL`** に本番の backend URL を
   **ビルド時に**渡す (第 13 回 4 節 — 焼き付けである点に注意)

### 2.2. frontend のデプロイ — OpenNext の役割

Next.js は本来 Node.js サーバーを前提とするため、Workers で動かすには
変換層が必要です。それが **OpenNext Cloudflare adapter** です。

```jsonc
// frontend/wrangler.jsonc (要点)
{
  "main": ".open-next/worker.js",           // OpenNext が生成したワーカー
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "assets": { "binding": "ASSETS", "directory": ".open-next/assets" },  // 静的資産
  "images": { "binding": "IMAGES" },        // 画像最適化
  "services": [
    { "binding": "WORKER_SELF_REFERENCE", "service": "frontend" }  // 自分自身への service binding
  ],
  "observability": { "enabled": true },
  "upload_source_maps": true
}
```

読み解き:

- **`assets`** — JS/CSS/画像などの静的資産を Cloudflare の CDN から配る
  (Workers の Static Assets 機能)
- **`nodejs_compat`** — Next.js の Node 依存を動かすための互換フラグ。
  backend 側で不要だった (第 05 回) のに対し、Next を載せる側では必須級。
  「アダプタを載せる側は互換レイヤーのコストを払う」例です
- **`services` の self-reference** — Next のキャッシュ実装が
  「自分自身の Worker を service binding 経由で呼ぶ」ために必要
  (外部往復せず Worker 間通信で再取得する仕掛け)
- `observability` / `upload_source_maps` — 本番のログとスタックトレースの
  可視化。**デプロイ時に初めて効いてくる設定** の代表

つまり frontend の「本番化」は `next build` でなく **OpenNext ビルド**
 (`deploy` スクリプトが `opennextjs-cloudflare build && wrangler deploy` 
 の類になっている) で行われます。開発は素の `next dev` (第 11 回) と
 挙動が微妙に異なり得る点 (bindings など) は OpenNext が `next.config.ts` の 
 `initOpenNextCloudflareForDev()` で吸収していました。

## 3. 最大の壁: 永続化 — Map から D1 へ

第 05 回の結論「エッジではプロセスに状態を置けない」が、本番では
致命的になります。**リクエストをまたいで確実に生きる場所** が要る。

### 3.1. 選択肢の比較

| 手段 | 性質 | 本アプリでの適性 |
|------|------|------------------|
| **D1** (SQLite) | リレーショナル・SQL・Workers ネイティブ | 蔵書の一覧/検索/集計 = SQL が主戦場。◎ |
| KV | 巨大な key-value・最終整合性 | 検索・集計が自前実装になる。△ |
| Durable Objects | 単一インスタンスの強い一貫性 + SQLite | 排他が必要な在庫引き当て等に ◎。まずは過剰 |
| R2 | オブジェクトストレージ | 表データ向けでない。× |

書籍管理 = 「構造化データの CRUD + 集計」なので **D1** が定石です
(README 補足・backend の wrangler.jsonc コメントも同じ指定です)。

### 3.2. D1 化の設計スケッチ

```jsonc
// backend/wrangler.jsonc (コメントを外して書き直す例)
"d1_databases": [
  { "binding": "DB", "database_name": "books-db", "database_id": "…" }
]
```

```sql
CREATE TABLE books (
  id TEXT PRIMARY KEY,                -- crypto.randomUUID() (第 07 回) を維持
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  publisher TEXT NOT NULL,
  isbn TEXT NOT NULL,
  category TEXT NOT NULL,
  published_year INTEGER NOT NULL CHECK (published_year BETWEEN 1000 AND 2100),
  status TEXT NOT NULL CHECK (status IN ('在庫あり','貸出中','予約中')),
  rating INTEGER NOT NULL DEFAULT 0 CHECK (rating BETWEEN 0 AND 5),
  borrower TEXT,                      -- NULL 許容 (第 02 回の null 設計を反映)
  registered_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_books_category ON books(category);
CREATE INDEX idx_books_status ON books(status);
```

**ハンドラから DB へのつなぎ方** (イメージ):

```ts
app.get("/api/books", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM books WHERE (? IS NULL OR title LIKE '%'||?||'%') ORDER BY registered_at DESC"
  ).bind(...).all<Book>()
  ...
})
```

重要なのは **影響範囲の見通し** です:

- `store.ts` の `Map` 操作を SQL に置換 — しかし **`validateBookInput` 
  (第 07 回) はそのまま再利用** できる。「ロジック層が境界 (第 03-04 回の 
  3 層構成) に寄っていて DB を知らない」構成のために、差し替えが 
  「実装の入れ替え」で済む
- 第 09 回の集計は `SELECT status, COUNT(*) GROUP BY status` に置換可能。
  「計算をループで書いた経験」(第 09 回) が SQL の意味を正確に読む基礎になる
- シードデータは `wrangler d1 execute` での INSERT、`resetToSeed` は 
  `DELETE + INSERT` のトランザクションに
- CHECK 制約は「最後の防波堤」であり、アプリ側バリデーション (第 07 回) を
  代弁しない — **二重防御** の構え

## 4. 残る本番課題のチェックリスト

| 課題 | 要点 | どの回の延長か |
|------|------|----------------|
| CORS 本番設定 | 許可 origin の列挙 | 第 10 回 |
| 環境変数 | `NEXT_PUBLIC_API_URL` のビルド時指定 / Workers の `vars` と secrets | 第 13 回 |
| 認証 | トークン/セッション。導入時は CORS の `credentials` と第 07 回の信頼モデル | 第 07, 10 回 |
| 監視 | `observability`、`onError` の構造化ログ (第 04 回) の活用 | 第 04 回 |
| テスト | `store.ts` (第 07-09 回) は純関数に近くユニットテストの好対象。README 学習課題 5 | 第 07-09 回 |
| 型共有 | `packages/shared` 化 (第 03 回演習) or OpenAPI 生成 | 第 02, 03 回 |
| ページネーション | `page`/`limit` + `{total, items}` の拡張 (既に包んであるのが効く) | 第 06, 08 回 |
| 貸出履歴 | `lending_logs` リソースの導入 = REST 設計の再演習 | 第 06 回 |

README の「学習課題 1〜5」は第 02 (1)、06 (2, 4)、09 (5)、15 (3) 回と
対応しているのに気づいたでしょうか。講義を通しでやると、
README の課題がすべて「今なら自分の言葉で設計できる」状態になっているはずです。

## 5. ハンズオン

※ Cloudflare アカウント (無料枠で可) と `wrangler login` が必要です。
**演習環境のデプロイは自己責任で** 行ってください (データは公開されます)。

```bash
# 1. ログイン
npx wrangler login

# 2. backend をデプロイ (アカウント名を確認)
npm -w backend run deploy
curl https://backend.<account>.workers.dev/api/stats

# 3. frontend をビルド (API_URL を渡す)
NEXT_PUBLIC_API_URL=https://backend.<account>.workers.dev \
  npm -w frontend run deploy

# 4. ブラウザで確認 → うまく行かなければ第 10 回 6 節の事故表と照合
```

うまく動いたら: **データが再起動で消えないか、逆に言えば「どこにも保存されない」**
ことを突き止めてください。2 つの Worker はリクエストごとに isolate が
変わってもよい世界 (第 05 回) で動いています。

## 6. 演習

1. **D1 スキーマ設計**: 第 08 回の検索 (`q` の 4 フィールド横断) と
   ソート (`-` プレフィックス) を SQL に翻訳するクエリを設計せよ。
   ヒント: `LIKE` の 4 連 OR、`ORDER BY` の動的組立では **カラム名は
   プレースホルダでなく allowlist で** (第 08 回 comparator テーブルの SQL 版)
2. **`resetToSeed` をトランザクションで**: DELETE + 全 INSERT を
   `batch()` または `WITH` で原子的にする方法を D1 ドキュメントで調べよ
3. **デプロイ構成の棚卸し**: frontend を `frontend.<account>.workers.dev` 以外の
   独自ドメインで出すとき、CORS・`NEXT_PUBLIC_API_URL`・`services` の 
   self-reference 名をそれぞれどう更新するか整理せよ
4. **キャッシュ再考**: `GET /api/books` に `Cache-Control` を付けるとして、
   「貸出 (PATCH) 後に古い一覧を見る」問題とどう折り合いを付けるか
   (Cache-Control + ETag の戦略を 1 つ提案)

## 7. まとめ (シリーズ全体)

15 回を通して最も伝えたかった 3 つのこと:

1. **境界の設計がすべての始まり** — unknown 入力の検証 (第 07 回)、
   `{ errors: [...] }` という契約 (第 06 回)、CORS (第 10 回)、
   `api.ts` (第 13 回)。層と層の間を「翻訳者」が挟む構造は常に同じ形をしていた
2. **型は手続きではなく約束** — ユニオン型・`as const`・`Record<Status, ...>` の
   全網羅 (第 02, 14 回)。「約束を破れない形にする」ことで、
   バリデーションも UI の色分けも同じ型の上に立った
3. **ランタイムを知って構成を選ぶ** — isolate の寿命 (第 05 回) が
   インメモリの限界を教え、D1 への置き換え (本回) が 3 層構成の価値を
   証明した

## 8. 修了課題 (発展)

- **Level 1**: `store.ts` のバリデーションと `listBooks` の
  ユニットテストを追加する (第 07-08 回演習の集大成)
- **Level 2**: ページネーション (`page`/`limit`) を API・クライアント・UI に通す
- **Level 3**: D1 化を完了させ、シード 15 冊を登録するマイグレーションを作る
- **Level 4**: 貸出履歴 (`lending_logs`) を導入し、履歴画面を加える
- **Level 5**: `packages/shared` で型共有し、CI で `typecheck` を回す構成を作る

ここから先は、このリポジトリを「自分の物語」に改造する作業です。
楽しんでください。
