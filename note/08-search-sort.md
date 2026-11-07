# 第 08 回 検索・フィルタ・ソートの実装

- **ゴール**: 一覧系 API のクエリ設計と、純関数的な検索/ソートの実装パターンを習得する
- **対象ファイル**: `backend/src/store.ts` 116-151 行 (`listBooks`)、`backend/src/index.ts:27-35`、`frontend/src/lib/api.ts` 95-107 行
- **AI 時代の位置づけ**: 入力仕様・比較関数・境界条件を分解し、もっともらしい検索実装を検証する

## 1. 一覧 API のインターフェース

```ts
// backend/src/store.ts:118-125
export interface ListParams {
  q?: string        // 複数フィールド横断の検索 (書名/著者/出版社/ISBN)
  category?: string // 完全一致フィルタ
  status?: string   // 完全一致フィルタ
  sort?: string     // ソートキー ("-書名" で降順)
}

export function listBooks({ q, category, status, sort = "-registeredAt" }: ListParams): Book[]
```

まず設計面の決め事に注目します。

1. **検索 (`q`) とフィルタ (category/status) を区別している**
   - 検索 = 部分一致・複数フィールド対象・利用者の意図が曖昧
   - フィルタ = 完全一致・単一フィールド・機械的な絞り込み
   - 1 つの `q` に全部押し込む (例: `q=category:技術書`) 方式 (grep 的記法) も
     ありますが、UI が独立した入力欄を持つなら独立パラメータのほうが素直です
2. **`sort` のデフォルト = `-registeredAt`** — 「新しく登録したものが上」は
     一覧 UI の最も無難な初期順序

## 2. 検索 `q` — 横断的部分一致

```ts
// backend/src/store.ts:128-133
if (q) {
  const needle = q.toLowerCase()
  result = result.filter((b) =>
    [b.title, b.author, b.publisher, b.isbn].some((f) => f.toLowerCase().includes(needle))
  )
}
```

- `[...].some(...)` で **4 フィールドのいずれかに部分一致** すれば採用
- `toLowerCase()` を両辺に適用 → 大文字小文字を無視 (ISBN の `x` などが該当)
- 日本語は `toLowerCase` で変わらないため、ひらがな/カタカラの同一視は
  **していない** — 意図的な簡略化。必要なら正規化 (NFKC + カタカナ統一) が必要

「1 文字入力ごとに絞り込む UI (インクリメンタルサーチ)」を支える最小構成です。
フロント側は 0.3 秒のデバウンスでこれを叩きます (第 12 回)。

## 3. フィルタ — 完全一致の積み重ね

```ts
// backend/src/store.ts:134-137
if (category) result = result.filter((b) => b.category === category)
if (status) result = result.filter((b) => b.status === status)
```

- `if (category)` は **空文字・undefined のとき無視** を意味する
  (フロントは「すべてのカテゴリ」のとき空文字を送る — 第 12 回)
- フィルタを **段階的に掛ける** 方式なので、`q + category + status` の組み合わせは
  自然に AND 条件になる

### 3.1. バリデーションはしないという判断

`category=技術書&category=文学` のような未知値を送っても、この実装では
**単に 0 件になる** (400 にはならない)。これは設計判断です。

- 検索条件の誤りは「データを破壊しない」→ 400 ではなく空結果でも許容できる
- 一方で「存在しない category の選択肢が UI に露出する」バグを検知しにくくなる
- 厳格にやるなら `category` を `BOOK_CATEGORIES` に一致するか検査し
  不一致は 400 — AI ドリルで扱います

## 4. ソート — `-` プレフィックスの記法

```ts
// backend/src/store.ts:139-150
const desc = sort.startsWith("-")
const field = desc ? sort.slice(1) : sort
const comparators: Record<string, (a: Book, b: Book) => number> = {
  title: (a, b) => a.title.localeCompare(b.title, "ja"),
  author: (a, b) => a.author.localeCompare(b.author, "ja"),
  publishedYear: (a, b) => a.publishedYear - b.publishedYear,
  rating: (a, b) => a.rating - b.rating,
  registeredAt: (a, b) => a.registeredAt.localeCompare(a.registeredAt) /* b と比較 */,
}
const comparator = comparators[field] ?? comparators.registeredAt
result.sort((a, b) => (desc ? -comparator(a, b) : comparator(a, b)))
```

(注: 6 行目は `a.registeredAt.localeCompare(b.registeredAt)` が正しい読み。
ISO 8601 文字列は辞書順 = 時系列順になるので `localeCompare` で比較できます)

### 4.1. `-` プレフィックス方式とは

`sort=-publishedYear` = 「publishedYear の降順」。この記法は
Mastodon API 等で採用されており、次の利点があります。

- `?sort=publishedYear&order=desc` (2 パラメータ方式) より **1 トークンで完結** し、
  URL の見通しが良い
- 降順フラグの不正組み合わせ (`order=asc` を忘れる等) が起きない
- UI の `<select>` に「登録日 (新しい順)」「登録日 (古い順)」のような
  **選択肢をそのまま値にできる** — フロント (`BookManager.tsx:309-318`) が
  まさにそう並べています

### 4.2. comparator テーブルのパターン

`Record<キー, 比較関数>` を用意して 1 行で引き当てる方式です。

- **分岐の爆発を防ぐ**: `if (field === "title") ... else if ...` の連鎖を書かない
- **型の違いを関数ごとに吸収**: 文字列は `localeCompare`、数値は引き算、
  ISO 日付は辞書順 — 「フィールドごとの比較方法」が 1 行にカプセル化される
- **未知キーはフォールバック** (`?? comparators.registeredAt`) — `sort=foo` で
  500 にせず既定順に戻す (検索と同じ「壊さない寛容さ」)

### 4.3. `localeCompare(b.title, "ja")` の効果

日本語の「かな漢字混じり」を、日本語の慣習 (五十音順ベース) に沿って並べます。
素の `<` 比較 (コードポイント順) だと漢字が全部後ろに寄り、利用者が期待する
並びになりません。「並び替えはロケールを指定する」は多言語データの作法です。

### 4.4. 安定ソートについて

ECMAScript 2020 以降、`Array.prototype.sort` は **安定** (同順の要素は
元の順を維持) が保証されています。この API のデータは `id` が一意なので
ここでは問題になりませんが、「第二ソートキー」が必要になったら
`comparator` をつなげる設計に拡張できます (AI ドリルの改修)。

## 5. 実装スタイル — 「段階的な絞り込み」の純関数

```ts
let result = [...books.values()]
if (q) { ... result = result.filter(...) }
if (category) ...
result.sort(...)
return result
```

- 冒頭で `[...books.values()]` と **コピーを作ってから** 触っている。
  **元の `Map` を破壊しない** (関数を呼ぶだけでデータが書き換わるバグを構造的に排除)
- 「横断処理は `filter` で段階的に」は SQL の WHERE 句を
  処理系が書くときの定番スタイル
- 第 09 回の `getStats` と対比すると、listBooks は **全件保持型**
  (ページネーション未実装)。`{ total, items }` の total は「絞り込み後の件数」
  (第 06 回 5 節) で、まだ全件を返しています — README 学習課題 2 が
  page/limit 導入の AI ドリルです

## 6. クライアントとの契約 — 疎通の確認

フロント (第 13 回 `api.ts`) は `URLSearchParams` でこの形を作ります。

```
GET /api/books?q=%E3%82%B3%E3%83%BC%E3%83%89&category=%E6%8A%80%E8%A1%93%E6%9B%B8&sort=-publishedYear
```

(URL エンコードは `URLSearchParams` と fetch が面倒を見る。手書きしない)

## 7. ハンズオン

```bash
# 1. 検索 (書名・著者・出版社・ISBN のどこかにヒット)
curl "http://localhost:8787/api/books?q=コード"      # 吾輩は猫である (ISBNに「コード」無し, タイトル由来)
curl "http://localhost:8787/api/books?q=オライリー"  # 出版社にヒット
curl "http://localhost:8787/api/books?q=9784274222648" # ISBN 完全一致

# 2. フィルタの組み合わせ (AND になる)
curl "http://localhost:8787/api/books?category=技術書&status=在庫あり"

# 3. ソートの昇順/降順を比べる
curl "http://localhost:8787/api/books?sort=publishedYear"   # 古い順 → 吾輩は猫であるが先頭
curl "http://localhost:8787/api/books?sort=-publishedYear"  # 新しい順 → 達人プログラマーが先頭

# 4. フォールバックの確認 (壊れない)
curl "http://localhost:8787/api/books?sort=関係ないキー"    # 登録日順に戻る

# 5. ブラウザで同じことをする (Network タブで URL を確認)
```

## 8. AI ドリル — 予測・レビュー・改修

### 8.1 予測 — 実行前に当てる

1. `q=オライリー`、`category=技術書&status=在庫あり`、`sort=-publishedYear` の
   結果が、どの処理順で何件になるかを予測してから curl で確認する
2. `sort=関係ないキー` と `sort=-関係ないキー` が 500 ではなく既定順になる理由を、
   comparator のフォールバックから説明する

### 8.2 レビュー — AI の出力を審査する

AI が検索とソートを短く書き直した。コンパイルエラー、元データの破壊、降順の向き、
未知キーの扱いのうち、該当する問題をすべて指摘する。

```ts
let result = books.values()
if (q) result = result.filter((b) => b.title.includes(q))
result.sort((a, b) => {
  const value = a.publishedYear - b.publishedYear
  return sort.startsWith("-") ? value : -value
})
return result
```

### 8.3 改修 — AI の失敗を直す

AI に `publishedYearMin` / `publishedYearMax` と第二ソートキーを追加させる。
`index.ts`・`store.ts`・`api.ts` の契約が揃っているか、空文字や数値でない入力が
どう扱われるかをレビューし、`q` の AND 検索を入れる場合は仕様も先に書く。

## 9. まとめ

- `q` (検索) と category/status (フィルタ) は性質が違う → 別パラメータ
- `-` プレフィックスの sort 記法は UI の選択肢と 1:1 に対応する
- comparator テーブル (Record) で分岐を消し、ロケール比較は `localeCompare("ja")`
- コピーを作って段階的に絞り込む非破壊スタイル

## 10. 次回予告

第 09 回は `GET /api/stats` の中身、`getStats` を読み、1 ループでの多重集計や
平均値の定義といった「データ集計」の勘所を学びます。
