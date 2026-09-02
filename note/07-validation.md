# 第 07 回 サーバー側バリデーションと型安全

- **ゴール**: `unknown` 入力を検証して型のある値に変換するパターン (結果型) を習得する
- **対象ファイル**: `backend/src/store.ts` (バリデーション〜CRUD 部、1-207 行)

## 1. なぜサーバー側でバリデーションが必要か

フロントエンドのフォーム (第 12 回) もチェックしています。それでも
**サーバー側は必須** です。理由:

1. API は誰でも (curl でも) 叩ける — UI のチェックは保護にならない
2. UI は改変可能 (DevTools で form を書き換えられる)
3. データの整合性を守るのは「最終的に書き込む側」の責務

原則は **「クライアントのチェックは UX のため、サーバーのチェックは整合性のため」**。

## 2. エントリポイントは `unknown`

```ts
// backend/src/store.ts:40
function validateBookInput(body: unknown): ValidationResult {
```

JSON パース結果は `any` でも `Book` でもなく **`unknown`** として受けます。

- `any`: 検査なしで何にでもなれる (型安全性が死ぬ) — 使うべきでない
- `unknown`: 「何かは分からない」が、**検査するまで何もできない**

境界 (ネットワーク入力) を `unknown` で受け、**検査を通過したものだけが
`BookInput` になる** — 「型は検査を通った証明書」という考え方です。
(第 04 回の `c.req.json().catch(() => null)` と合わせて、この API は
`any` を一切使いません。)

## 3. 結果型 (判別可能ユニオン) — エラーを「値」として返す

```ts
// backend/src/store.ts:19-21
export type ValidationResult =
  | { ok: true; value: BookInput }
  | { ok: false; errors: string[] }
```

`ok` フィールドで場合分けできるユニオン型 (discriminated union) です。

```ts
const result = store.createBook(body)
if (!result.ok) return c.json({ errors: result.errors }, 400)  // errors が「見える」
// ここより下は result.book が使える
```

TypeScript は `!result.ok` の後は `{ ok: false; errors }` 側だと认识し、
`result.errors` へのアクセスを許します。つまり **「失敗の情報にだけ触れる」
ことがコンパイルで保証される**。例外 (throw) と比べた利点:

- 失敗パスが型に現れる (投げっぱなしの考慮漏れが起きにくい)
- 「複数のエラーをまとめて返す」が自然に書ける (例外は 1 個しか持てない)
- HTTP の 400 に翻訳しやすい (第 04/06 回で見た通り)

`createBook` / `updateBook` の戻り値も同じ構造 (`{ ok: true; book }` /
`{ ok: false; errors; notFound?: boolean }`) で、失敗の理由の種類だけを
差分で足しています。

## 4. 検査の中身 — 小さな道具から積み上げる

### 4.1. 型ガード関数

```ts
// backend/src/store.ts:23-25
function asString(v: unknown): v is string {
  return typeof v === "string"
}
```

戻り値型 `v is string` が **型ガード** です。`true` を返した場合、
呼び出し側は `v` を `string` として扱えます。`unknown` の世界で
「1 段ずつ型を絞る」ための最も基本的な道具です。

### 4.2. エラーの「集め方」— exceptions ではなく accumulation

```ts
// backend/src/store.ts:28-38
function requireText(value: unknown, name: string, errors: string[], maxLength?: number): string {
  if (!asString(value) || value.trim() === "") {
    errors.push(`${name} は必須です`)
    return ""
  }
  const trimmed = value.trim()
  if (maxLength !== undefined && trimmed.length > maxLength) {
    errors.push(`${name} は ${maxLength} 文字以内にしてください`)
  }
  return trimmed
}
```

注目ポイント:

- **`errors` 配列に push して処理を続行** — 最初のエラーで止まらず、
  利用者に一度で全部の間違いを見せる (第 12 回のフォームがエラー一覧を
  まとめて表示できるのはこのため)
- **`return ""`** — 無効なときは「空白の値」を返して先へ進む。
  値としては無意味だが、以降の検査が型エラーなく走れる
- **`trim` して保存** — 「正規化してから保存」という方針の表れ
  (検証と正規化を 1 関数で兼ねている)

### 4.3. フォーマット検査 — ISBN の正規表現

```ts
// backend/src/store.ts:17, 52-55
const ISBN_RE = /^(?:\d{9}[\dXx]|\d{13})$/

const rawIsbn = asString(b.isbn) ? b.isbn.replace(/-/g, "") : ""
if (!ISBN_RE.test(rawIsbn)) {
  errors.push("isbn は ISBN-10 / ISBN-13 形式にしてください (例: 978-4001001094)")
}
```

- ISBN-10 は末尾が `X` になり得る → `[\dXx]`
- **先にハイフン除去 (正規化) → それから検査**。順序が逆だと
  `978-4274210084` が検証を通らない
- 正規表現は「形式」だけを見る。チェックデジットの検算は学習課題に最適

### 4.4. 数値の検査 — `typeof` と整数・範囲

```ts
// backend/src/store.ts:57-66
let publishedYear = 0
if (typeof b.publishedYear === "number" && Number.isInteger(b.publishedYear)) {
  publishedYear = b.publishedYear
} else {
  errors.push("publishedYear は 1000〜2100 の整数にしてください")
}
if (publishedYear !== 0 && (publishedYear < 1000 || publishedYear > 2100)) {
  errors.push("publishedYear は 1000〜2100 の整数にしてください")
  publishedYear = 0
}
```

- JSON では `"2012"` (文字列) と `2012` (数値) が混同されやすい。
  フロントは `Number(form.publishedYear)` で変換してから送っている (第 12 回) が、
  サーバーは信用しない
- `Number.isInteger` で `2012.5` を排除
- エラーメッセージは同じ文言を使い回している → 利用者向けの体験を統一

### 4.5. 列挙値と「条件付き必須」

```ts
// backend/src/store.ts:77-98 (要旨)
if (b.status !== undefined) {
  if (asString(b.status) && (BOOK_STATUSES as string[]).includes(b.status)) {
    status = b.status as BookStatus
  } else { errors.push(`status は ${BOOK_STATUSES.join(" / ")} のいずれかにしてください`) }
}
...
if ((status === "貸出中" || status === "予約中") && !borrower) {
  errors.push(`status が ${status} の場合は borrower (借用者名) が必須です`)
}
```

最後の検査が最重要です。**「フィールド単位の検査」ではなく
「フィールド間の関係の検査」** — 「貸出中なら借りた人がいるはず」という
ドメインルールを型ガードで表現しています。

## 5. 検査結果から「きれいな値」を組み立てる

```ts
// backend/src/store.ts:102-113 (要旨)
const value: BookInput = {
  title, author, publisher, isbn: rawIsbn, category, publishedYear, rating,
  ...(status !== undefined ? { status } : {}),
  ...(borrower !== undefined ? { borrower } : {}),
}
return { ok: true, value }
```

ポイントは **条件付きスプレッド** `...(x !== undefined ? { x } : {})` です。

- `status: undefined` というキーが入ったオブジェクトを作らない
- なぜ大事か: `updateBook` が「キーがある = 変更したい」と解釈するため、
  `undefined` でもキーがあると「status を undefined に変えたい」と誤読されかねない
  (第 6 節参照)

## 6. PATCH の実装方式 — 「マージして全体再検査」

```ts
// backend/src/store.ts:190-199 (要旨)
const validated = validateBookInput({ ...current, ...body })
if (!validated.ok) return validated

const input = validated.value
const updated: Book = {
  ...current,
  ...input,
  // 返却 (在庫あり) になったら借用者をクリア
  borrower: input.status === "在庫あり" ? null : (input.borrower ?? current.borrower),
  updatedAt: new Date().toISOString(),
}
```

`PATCH {status:"在庫あり"}` が「部分更新」として機能する仕組み:

1. **`{ ...current, ...body }`** — 既存値に送られたフィールドだけ上書きした
   「マージ後の姿」を作る (body に無いキーは current の値が残る)
2. **それを `validateBookInput` に丸ごと通す** — 部分更新なのに「全体の整合性」を
   検査できる (前述の「貸出中なら borrower 必須」が部分更新でも守られる)
3. **`borrower` の自動クリア** — 返却 (`在庫あり`) に変わるときだけ借用者を消す。
   第 01 回で体験した「返却すると名前が消える」はこの 1 行です

代替案との比較 (知っておくと設計の幅が出ます):

| 方式 | 内容 | 得意/不得意 |
|------|------|-------------|
| **マージ再検査 (本 API)** | 現在値+差分を丸ごと検査 | 必須フィールドの自動補完。PATCH 用スキーマが不要 |
| 個別 PATCH スキーマ | `Partial<BookInput>` を検査 | 動的だが「組み合わせの整合」の検査が二度手間 |
| JSON Patch (RFC 6902) | `[{op:"replace",path:"/status"}]` | 汎用的だがクライアントが複雑になる |

「マージ再検査」は小規模 API で非常によく選ばれる方式です。

## 7. ID の採番とタイムスタンプ

```ts
// backend/src/store.ts:164-177 (要旨)
const now = new Date().toISOString()
const book: Book = {
  id: crypto.randomUUID(),
  ...
  status: input.status ?? "在庫あり",      // 未指定なら初期値
  borrower: input.borrower ?? null,
  registeredAt: now, updatedAt: now,
}
```

- `id` / `registeredAt` / `updatedAt` は **クライアントから送らせずサーバーが決める**
  (第 02 回の `Pick` が「送れない型」にしていた対応物)
- `??` でデフォルトを埋める
- ISO 8601 文字列で保存 (第 02 回・第 05 回で触れた方針)

## 8. ハンズオン

```bash
# 1. エラーが「全部一度に」出ることを確認
curl -X POST http://localhost:8787/api/books \
  -H 'Content-Type: application/json' \
  -d '{"isbn":"bad","publishedYear":"昭和"}'
# → title/author/publisher/category/isbn/publishedYear の全エラー

# 2. 条件付き必須の確認 (borrower 無しで貸出中にはできない)
curl -X PATCH http://localhost:8787/api/books/b02 \
  -H 'Content-Type: application/json' -d '{"status":"貸出中"}'

# 3. borrower の自動クリア
curl -X PATCH http://localhost:8787/api/books/b01 \
  -H 'Content-Type: application/json' -d '{"status":"在庫あり"}'
curl http://localhost:8787/api/books/b01 | grep -o '"borrower":[^,]*'

# 4. 後始末
curl -X POST http://localhost:8787/api/reset
```

## 9. 演習

1. **ISBN チェックデジット**: ISBN-13 の検算 (各桁×{1,3} 交替和 mod 10 = 0) を
   `validateBookInput` に追加せよ (README の curl サンプルが通ることを確認)
2. **`rating` の上限エラー文言を個別化** せよ (現在は他と同じ形式。
   「rating は 0〜5 の整数にしてください (0=未評価)」を review する)
3. **思考問題**: `updateBook` で `title` を空文字にする PATCH を送ると?
   マージ再検査方式だと「省略」と「空文字」の区別がどう扱われるか確認せよ
4. **発展**: zod のようなスキーマライブラリで `validateBookInput` を
   書き直すと何行になるか調べる (依存追加はしなくてよい)

## 10. まとめ

- 境界の入力は `unknown` で受け、検査を通ったものだけ型を与える
- 判別可能ユニオン (`{ok: true|false}`) で失敗を「値」として運ぶ
- エラーは配列に蓄積して一度に全部返す。検証と正規化を兼ねる
- PATCH は「マージして全体再検査」+ 副作用 (borrower クリア) の 2 段構え

## 11. 次回予告

第 08 回は `listBooks` を読み、クエリパラメータで検索・フィルタ・
ソートをどう設計・実装するか (`-publishedYear` 記法、comparator パターン) を学びます。
