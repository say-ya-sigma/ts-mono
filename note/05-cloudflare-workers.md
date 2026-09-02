# 第 05 回 Cloudflare Workers と wrangler

- **ゴール**: Workers ランタイムの特性 (特に「状態の寿命」) を理解し、wrangler 設定を読める
- **対象ファイル**: `backend/wrangler.jsonc`、`backend/worker-configuration.d.ts`、`backend/src/store.ts` (冒頭)

## 1. Cloudflare Workers とは

Cloudflare のエッジ (世界中のデータセンター) で動くサーバーレス関数
ランタイムです。Node.js と**似て非なる**点が学習の核心です。

| 観点 | Node.js サーバー | Cloudflare Workers |
|------|------------------|---------------------|
| 実行単位 | プロセス (常駐) | isolate (V8 の隔離環境) |
| ライフサイクル | 起動〜停止で継続 | リクエストごとに活性化、アイドルで凍結/破棄 |
| 状態の保持 | モジュール変数が実質永続 | モジュール変数は **いつ消えてもよい一時キャッシュ** |
| 実装の配布 | 1 台のサーバーに 1 インスタンス | コードが全世界に配布され、近くの拠点で応答 |
| API | Node 標準 + npm | Web 標準 (fetch / crypto / URL …) + bindings |

「インメモリの `Map` を置くと再起動で消える」という本デモの挙動は、
Node では「実装の都合」ですが Workers では **アーキテクチャの帰結** です。

## 2. `wrangler.jsonc` を読む

```jsonc
// backend/wrangler.jsonc (要点)
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "backend",
  "main": "src/index.ts",
  "compatibility_date": "2026-08-05"
  // "compatibility_flags": ["nodejs_compat"],
  // "d1_databases": [ ... ],  ← 第 15 回で有効化する
}
```

- `main` — エントリポイント。`export default app` (第 04 回) が
  Workers から呼ばれる fetch ハンドラになります (Hono が互換形にしてくれる)
- `compatibility_date` — **「どの時点の Workers 仕様で動かすか」を固定する日付**。
  Cloudflare はランタイムを継続更新するため、明示しないとデプロイごとに挙動が
  変わってしまう。この日付は scaffold 作成日に合わせてある
- `$schema` — エディタで設定の補完・検証が効く (JSONC 対応の JSON Schema)
- コメントアウトされた `kv_namespaces` / `r2_buckets` / `d1_databases` / `ai` —
  **bindings の雛形**。必要になったらコメントを外して使う

### 2.1. `worker-configuration.d.ts` と `CloudflareBindings`

`backend/worker-configuration.d.ts` は `wrangler types` コマンドが生成する
型定義ファイルで、wrangler.jsonc の内容から `CloudflareBindings` (bindings の型) を
作ります。第 04 回の `new Hono<{ Bindings: CloudflareBindings }>()` はこれを使い、
「設定と型が 1 対 1」に保たれます — **設定ファイルを型に持ち込む** 好例です。
bindings を足せば型も追従し、typo がコンパイルエラーになります。

### 2.2. フロントの wrangler.jsonc (先取り)

`frontend/wrangler.jsonc` は OpenNext (Next.js を Workers に乗せるアダプタ) 向けで、
`main: ".open-next/worker.js"`・`assets` (静的ファイル)・`nodejs_compat` など、
backend より多くのフラグが有効です。詳しくは第 15 回で扱います。

## 3. `wrangler dev` — ローカルのエミュレータ

```bash
npm run dev:backend   # 中身は wrangler dev
```

- ローカルで `workerd` (Workers の実ランタイム) を動かし、8787 番で待受
- ソース変更を検出してホットリロード (この講義で何度も世話になる)
- **再起動 = isolate の作り直し = モジュール変数 (本のデータ) が消える** —
  第 01 回で体験した「再起動で 15 冊に戻る」の仕組み

## 4. 状態の寿命 — 本プロジェクトの選択

```ts
// backend/src/store.ts:12-13
const books = new Map<string, Book>()
for (const book of SEED_BOOKS) books.set(book.id, book)
```

モジュール直下の `Map` です。Workers での扱いは:

- リクエストをまたいで **参照できることもある** (isolate が生きていれば)
- しかし **保証はない** (凍結・破棄・別 isolate への分散があり得る)
- さらに本番では **拠点ごとに別の isolate** = 同じ `Map` を見ない

つまりこの `Map` は「単一開発者のローカルデモ用キャッシュ」としてだけ正当です。
README の「本番では D1 / Durable Objects を使う」はこの帰結で、第 15 回で
D1 (SQLite) に置き換えます。

**教訓: エッジでは「プロセスに状態を置く」設計がそもそも通じない。**
状態の置き場所 (DB / DO / KV) を先に決めるのがエッジ設計の入口です。

## 5. Web 標準 API — `crypto.randomUUID()`

```ts
// backend/src/store.ts:166
id: crypto.randomUUID()
```

`uuid` パッケージの import がありません。Workers では Web 標準の
`crypto.randomUUID()` (UUID v4) がそのまま使えます
(Node.js でも 19 以降はグローバルにあります)。

エッジ向けコードの書き味は「ブラウザのつもりで書く」が近く:

- `fetch` / `Request` / `Response` / `URL` / `URLSearchParams` / `crypto` …
  すべて Web 標準
- Node 専用 API (`fs`、`process` の一部など) は基本使えない。
  互換が必要なら `nodejs_compat` フラグ (wrangler.jsonc のコメント参照)

フロントの `frontend/src/lib/api.ts` が Node 依存ゼロで書けているのも、
同じ「Web 標準だけで書く」規律のおかげです。

## 6. なぜ「Next.js と API を同じ Cloudflare に」なのか (設計背景)

1. フロント (OpenNext) もバックエンドも同じプラットフォーム → 運用が 1 つ
2. エッジ配信により世界的にレイテンシが小さい
3. 依存関係を増やさない小さいスタックで構成できる — 学習題材としても好適

## 7. ハンズオン

```bash
# 1. データの「寿命」を体験する
curl -X POST http://localhost:8787/api/books \
  -H 'Content-Type: application/json' \
  -d '{"title":"テスト本","author":"誰か","publisher":"どこか","isbn":"9784001001094","category":"技術書","publishedYear":2020,"rating":3}'
curl http://localhost:8787/api/books | grep -o テスト本   # ある

# 2. バックエンドを再起動 (Ctrl-C → npm run dev:backend)
curl http://localhost:8787/api/books | grep -o テスト本 || echo '消えた'

# 3. 型定義の再生成を知る
npx wrangler types --help
```

## 8. 演習

1. **再起動 vs リセットの違いを言葉で**: 「`POST /api/reset` で戻る」のと
   「再起動で戻る」のは、コード上どこが違うか?
   (`store.ts` の `resetToSeed` と 12-13 行目の初期化を比べよ)
2. **wrangler.jsonc を調べる**: `compatibility_date` を 1 か月戻すと何が起こり
   うるか、公式ドキュメントで調べる (論点: 後方互換の保障期間)
3. **思考問題**: この backend を「複数人で同時利用する社内デモ」として
   1 か月動かすなら、どこが最初に破綻するか? (ヒント: isolate の分散と凍結)

## 9. まとめ

- Workers は isolate ベース。「プロセス常駐」を前提にした設計は通じない
- `compatibility_date` で仕様の時点を固定し、bindings を wrangler.jsonc で宣言
- `wrangler dev` の再起動は isolate 再作成 → インメモリ `Map` は消える
- Web 標準 API (`crypto.randomUUID()` 等) で書くのがエッジの作法

## 10. 次回予告

第 06 回は視点を「ランタイム」から「API 設計」へ戻し、REST の考え方
(リソース・メソッド・ステータスコード) を `backend/src/index.ts` の
ルーティング表から体系的に読み解きます。
