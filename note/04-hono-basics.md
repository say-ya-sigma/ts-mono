# 第 04 回 Hono 入門 — ルーティングとレスポンス

- **ゴール**: Hono のルーティング/Context/レスポンス API を使いこなせる
- **対象ファイル**: `backend/src/index.ts` (88 行、全体)
- **AI 時代の位置づけ**: HTTP の入力・結果・責務の翻訳を読み、AI が層を混ぜていないか判定する

## 1. Hono とは

TypeScript ファーストの軽量 Web フレームワークです。
Express に近い API を持ちつつ、Cloudflare Workers をはじめとする
エッジランタイムで動くよう設計されています。

- 依存が軽い / ゼロコピー文字列ルーティングなどで高速
- **型が効く**: 環境 (bindings) の型をジェネリクスで注入できる
- ミドルウェア (CORS 等) が公式同梱 — 第 10 回で扱う

## 2. アプリの生成と「環境の型」

```ts
// backend/src/index.ts:6
const app = new Hono<{ Bindings: CloudflareBindings }>()
```

`CloudflareBindings` は `backend/worker-configuration.d.ts` で定義されている、
この Worker が受け取る bindings (環境変数・D1・KV など) の型です。
第 05 回で生成方法を説明します。Workers 実行環境を渡すことで、
ハンドラ内の `c.env.MY_VAR` などが型安全になります。
**エッジフレームワークでは「環境」が引数ではなく設定で来る** ため、
このジェネリクスが Hono と Workers の接着剤になります。

## 3. ルーティングの基本

```ts
// backend/src/index.ts:27-35
app.get("/api/books", (c) => {
  const books = store.listBooks({
    q: c.req.query("q"),
    category: c.req.query("category"),
    status: c.req.query("status"),
    sort: c.req.query("sort"),
  })
  return c.json({ total: books.length, items: books })
})
```

- `app.get(path, handler)` — メソッドごとに登録 (`post` / `patch` / `delete` も同様)
- ハンドラ引数 `c` が **Context**。リクエスト情報の読み取りとレスポンス生成の両方を持つ
- `c.req.query("q")` — クエリパラメータ (無ければ `undefined`)
- `c.json(obj, status?)` — JSON レスポンス (`Content-Type: application/json` 付き)

### 3.1. パスパラメータ

```ts
// backend/src/index.ts:38-42
app.get("/api/books/:id", (c) => {
  const book = store.getBook(c.req.param("id"))
  if (!book) return c.json({ errors: ["指定された ID の書籍が見つかりません"] }, 404)
  return c.json({ item: book })
})
```

`:id` がパスパラメータで `c.req.param("id")` で取得します。
`/api/books/b01` → `id = "b01"`。
ここに「無いなら 404 を返す」判断が **ルーティング層に** 書かれている点を見て
ください — 見つける処理 (`store.getBook`) はロジック層です。層の分離は
「判断して応答するのは index.ts、計算するのは store.ts」と一言でまとめられます。

### 3.2. ボディを受け取る (非同期ハンドラ)

```ts
// backend/src/index.ts:45-50
app.post("/api/books", async (c) => {
  const body = await c.req.json().catch(() => null)
  const result = store.createBook(body)
  if (!result.ok) return c.json({ errors: result.errors }, 400)
  return c.json({ item: result.book }, 201)
})
```

重要なのは `await c.req.json().catch(() => null)` の 1 行です。

- `c.req.json()` は `Promise` を返す → ハンドラは `async`
- **ボディが JSON でない場合は例外になる** → `.catch(() => null)` で握りつぶし
  `null` に変換 → `store.createBook(null)` が「JSON オブジェクトにしてください」という
  バリデーションエラー (400) を返す、という流れ

「例外をビジネスロジック層に持ち込まず、値 (`null`) に変換して渡す」のは、
層をまたぐエラー処理の定番スタイルです (第 07 回で継続)。

### 3.3. ボディとパスパラメータの組み合わせ (PATCH)

```ts
// backend/src/index.ts:53-58
app.patch("/api/books/:id", async (c) => {
  const body = await c.req.json().catch(() => null)
  const result = store.updateBook(c.req.param("id"), body)
  if (!result.ok) return c.json({ errors: result.errors }, result.notFound ? 404 : 400)
  return c.json({ item: result.book })
})
```

`result.notFound ? 404 : 400` — 「同じ失敗でも、原因でステータスコードを変える」
実装です。この `notFound` フラグが結果オブジェクトに入っている設計経緯は
第 06 回・第 07 回で掘り下げます。

## 4. 最初のルート = API の自己説明

```ts
// backend/src/index.ts:11-24
app.get("/", (c) => {
  return c.json({
    name: "書籍管理システム API",
    endpoints: { "GET /api/books": "一覧 (クエリ: q, category, status, sort)", ... },
  })
})
```

「`GET /` を叩けば全エンドポイントが分かる」という、小さい API では馬鹿に
できない慣習です。開発者体験 (DX) の設計として取り上げます。

## 5. 例外と未知のパスの処理

```ts
// backend/src/index.ts:79-86
app.onError((err, c) => {
  console.error(JSON.stringify({ level: "error", message: String(err) }))
  return c.json({ errors: ["サーバー内部エラーが発生しました"] }, 500)
})

app.notFound((c) => {
  return c.json({ errors: ["エンドポイントが見つかりません"] }, 404)
})
```

- `app.onError` — ハンドラ内で投げられた例外の受け皿。
  **外向けには詳細を返さず、ログにだけ詳細を出す** (5xx の内容をそのまま返すと
  内部情報漏洩になるため、実務の基本手筋)
- `app.notFound` — どのルートにも一致しなかったとき
- 両者ともエラーボディは `{ errors: string[] }` の統一形式 — これはフロントの
  `ApiError` (第 13 回) が前提する契約になっています

## 6. ルーティング表 (全体像)

| メソッド + パス | store.ts の関数 | 成功時 | 失敗時 |
|-----------------|-----------------|--------|--------|
| `GET /` | — | 200 | — |
| `GET /api/books` | `listBooks` | 200 | — |
| `GET /api/books/:id` | `getBook` | 200 | 404 |
| `POST /api/books` | `createBook` | **201** | 400 |
| `PATCH /api/books/:id` | `updateBook` | 200 | 400 / 404 |
| `DELETE /api/books/:id` | `deleteBook` | 200 | 404 |
| `GET /api/stats` | `getStats` | 200 | — |
| `POST /api/reset` | `resetToSeed` | 200 | — |

**index.ts は「HTTP との翻訳者」でしかない** — 全ルートが
「入力を store に渡す → 結果の ok/NG をステータスコードに翻訳する」の
同じ形をしていることを確認してください。この均一さが読みやすさの正体です。

## 7. ハンズオン

```bash
# 1. パスパラメータとクエリを並べて実行
curl http://localhost:8787/api/books/b06
curl "http://localhost:8787/api/books?category=技術書&sort=-rating"

# 2. ボディを壊す → 400 の errors を観察
curl -X POST http://localhost:8787/api/books -d 'これはJSONではない'

# 3. 存在しないパス → notFound ハンドラ
curl -i http://localhost:8787/api/nothing

# 4. バックエンドを再起動 (データがシードに戻る確認)
#    Ctrl-C → npm run dev:backend → curl http://localhost:8787/api/books
```

## 8. AI ドリル — 予測・レビュー・改修

### 8.1 予測 — 実行前に当てる

1. 存在しない ID、未知のパス、不正な JSON body をそれぞれ叩いたとき、
   `404` と `400` のどちらになるか、どのハンドラが担当するかを予測する
2. `c.req.json()` を await せずに `store.createBook` へ渡した場合、`store` に届く
   値の実体と結果の型がどう変わるかを説明する

### 8.2 レビュー — AI の出力を審査する

AI が POST ルートを次のように書いた。少なくとも 3 つの問題を、Context・非同期処理・
HTTP 応答の観点から指摘する。

```ts
app.post("/api/books", (c) => {
  const body = c.req.json()
  const result = store.createBook(body)
  return c.json({ item: result.book })
})
```

### 8.3 改修 — AI の失敗を直す

AI に `GET /api/health` または `GET /api/statuses` を追加させる。生成されたルートが
正しい HTTP メソッド・JSON の形・成功ステータスを使っているかを `curl -i` で確認し、
未知のパスや例外時の統一形式を壊していれば最小差分で修正する。

## 9. まとめ

- `new Hono<{ Bindings: CloudflareBindings }>()` で環境の型を注入
- Context `c` から query / param / body を読み、`c.json(obj, status)` で応答
- `:param` と `async` ハンドラ、`.catch(() => null)` の例外→値変換
- `onError` / `notFound` で外側を固め、エラーボディは `{ errors: [...] }` に統一

## 10. 次回予告

第 05 回は `wrangler.jsonc` と `worker-configuration.d.ts` を読み、
このコードが「どこで・どう動くのか」= Cloudflare Workers ランタイムの特徴
(インメモリデータの寿命、`crypto.randomUUID()`、bindings) を学びます。
