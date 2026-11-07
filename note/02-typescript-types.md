# 第 02 回 TypeScript の型でデータモデルを表現する

- **ゴール**: ユニオン型・`as const`・ユーティリティ型を使い、データモデルを型で厳密に記述できる
- **対象ファイル**: `backend/src/books.ts` (全体)、`frontend/src/lib/api.ts` (型定義部分)
- **AI 時代の位置づけ**: 型を AI への仕様書にし、生成コードの入力・出力の逸脱をコンパイラで検出する

## 1. この回の主役: `backend/src/books.ts`

API の「型定義 + シードデータ」だけを切り出したファイルです。
バリデーションもルーティングも入っていないため、**型の学習に最適な素材** です。

## 2. 文字列リテラルユニオン型 — まずステータスから

```ts
// backend/src/books.ts:4
export type BookStatus = "在庫あり" | "貸出中" | "予約中"

export const BOOK_STATUSES: BookStatus[] = ["在庫あり", "貸出中", "予約中"]
```

`BookStatus` は「3 つの文字列のうちどれか 1 つ」しか取れない型です。

- ありそうな誤用: `"在庫"` `"stock"` `"在庫有"` → すべてコンパイルエラー
- この「名前の揺れを型で防ぐ」発想は、実務で最も効果の大きい TypeScript の使い方

UI 側の色分け (第 14 回 `StatusBadge`) も `Record<BookStatus, string>` という
「キーを 3 種類しか持てない Record」で書かれており、ステータスを追加すると
コンパイルエラーで色の追加を強制できます — これがユニオン型の連携効果です。

## 3. `as const` と `(typeof X)[number]` — 定数配列から型を作る

```ts
// backend/src/books.ts:8-17
export const BOOK_CATEGORIES = [
  "文学", "技術書", "実用書", "ビジネス", "科学", "歴史",
] as const

export type BookCategory = (typeof BOOK_CATEGORIES)[number]
```

2 行で何が起きているか。

1. `as const` で配列が「読み取り専用のタプル」になり、各要素は
   文字列リテラル型 (`"文学"` など) に推論される
2. `(typeof BOOK_CATEGORIES)[number]` は「このタプルの任意の要素の型」= 
   `"文学" | "技術書" | ... | "歴史"`

**単一情報源 (Single Source of Truth)** にできます。カテゴリを 1 つ増やしたい
ときは配列に 1 行追加するだけで、型・UI の選択肢 (`BOOK_CATEGORIES.map(...)`) が
同時に更新されます。

### 3.1. マニアックなトリック: `BookCategory | (string & {})`

```ts
// backend/src/books.ts:25
category: BookCategory | (string & {})
```

一見 `(string & {})` は `string` と同じ型では? と思うのが正しい感覚です。
実際、型の集合としてはほぼ `string` です。しかしこの書き方にすると
**エディタの入力補完はリテラル候補 (`"文学"` など) を表示しつつ、
任意の文字列もエラーにしない** という挙動になります。

- `string` だけだと補完が全く出ない
- `BookCategory` だけだとシードデータ以外のカテゴリ (利用者が自由入力した値など) を保持できない

「データ上は自由だが、コードを書く人の利便性のために候補は出したい」
という妥協の産物です。`as const` + インデックスアクセスと合わせて、
**型は集合だが、体験はツールが作る** という教訓として覚えてください。

## 4. `interface` で主ドメイン型を定義する

```ts
// backend/src/books.ts:19-32
export interface Book {
  id: string
  title: string
  author: string
  publisher: string
  isbn: string
  category: BookCategory | (string & {})
  publishedYear: number
  status: BookStatus
  rating: number           // 0-5、0 は「未評価」を意味する
  borrower: string | null   // 貸出中・予約中時の氏名。それ以外は null
  registeredAt: string      // ISO 8601
  updatedAt: string
}
```

読み取るべき設計判断:

- **`null` vs `undefined`**: 「DB 上は空で、DB から取得した以上 null」に寄せている
- **日付を `string` (ISO 8601) で持つ**: Workers では DB (D1) との往復を考えると
  `Date` オブジェクトより ISO 文字列が扱いやすい。代償として比較は
  `localeCompare` に頼る (第 08 回で出てくる)
- **`rating: 0` を「未評価」と約束**: `null | number` にせず 0 をセンチネル値に。
  0-5 の「未評価あり」レーティングでは一般的な設計

## 5. ユーティリティ型 — 既存の型から新しい型を「計算」する

```ts
// backend/src/books.ts:34-37
export type BookInput = Pick<
  Book,
  "title" | "author" | "publisher" | "isbn" | "category" | "publishedYear" | "rating"
> & { status?: BookStatus; borrower?: string | null }
```

`BookInput` は「登録・更新時にクライアントから送ってよいフィールド」の型です。
ポイントは 2 つ。

1. **`Pick` で `Book` から必要なフィールドだけを抜く**
   - `id` (サーバーが採番する)・`registeredAt` / `updatedAt` (サーバーが管理する)
     は入力に含めない — 「入力に含めてはいけない」を型レベルで表明
2. **交差型 `&` で省略可能 (`?`) を上書き追加**
   - `status` と `borrower` は PATCH 時に「省略 = 変更しない」にしたいので
     `Book` では必須 → `BookInput` ではオプショナル、と変化させている

さらにシードデータ用には `Omit` も使われています。

```ts
// backend/src/books.ts:42-45
type SeedBook = Omit<Book, "id" | "borrower" | "registeredAt" | "updatedAt"> & {
  borrower?: string
  registeredDaysAgo?: number
}
```

「大部分は `Book` と同じだが、いくつかのフィールドだけ差し替えたい」—
`Omit` + 交差型はこのパターンの定番です (継承よりも疎結合)。

### 5.1. ユーティリティ型ミニ辞書

| 型 | 意味 | 本プロジェクトでの用途 |
|----|------|------------------------|
| `Pick<T, K>` | T から K のキーだけ抜く | `BookInput` の必須 7 フィールド |
| `Omit<T, K>` | T から K を除く | `SeedBook` |
| `Partial<T>` | 全フィールド省略可 | PATCH の緩い型 (今回はマージ方式のため未使用 → 第 07 回で解説) |
| `Readonly<T>` | 全フィールド読み取り専用 | `as const` の型レベル版 |

## 6. 同じ型が 2 つある問題 — 意図的な重複

`frontend/src/lib/api.ts:4-30` を見てください。`BookStatus`・`Book` などが
**ほぼ同じ内容でもう一度定義されています**。よく見ると違いがあります。

- frontend の `Book.category` は `string` (backend より緩い)
- frontend には `BookInput` がありますが、`rating` がオプショナル

モノレポなのに共有しないのはなぜか? — 良い議論の題材です。

- **肯定的な解釈**: `api.ts` は「API との境界」であり、バックエンドの内部都合で
  型が変わってもフロントが壊れないよう、フロントはフロントで契約を宣言している
- **否定的な解釈**: 両方を更新し忘れると静かに不整合が起きる。第 03 回で
  共有パッケージ化を AI ドリルとして扱う

## 7. ハンズオン

```bash
curl http://localhost:8787/api/books | head -c 400   # 実際の JSON と Book 型を見比べる
```

型は JSON の「形」の宣言です。レスポンスの各キーが `Book` のフィールドと
対応していることを確認してください。

## 8. AI ドリル — 予測・レビュー・改修

### 8.1 予測 — 実行前に当てる

1. `BOOK_STATUSES` に `"紛失"` を追加したとき、`Record<BookStatus, string>` を
   使う `StatusBadge` がなぜ型エラーになるか、エラー箇所を実行前に予測する
2. `BookInput` に `id` と `updatedAt` を書けるようにした場合、クライアントが
   何を決められてしまうかを説明する

### 8.2 レビュー — AI の出力を審査する

AI が入力型を簡単にするため、次の変更を提案した。少なくとも 2 つの契約違反を
見つけ、`Pick` / `Omit` の意図と照らして指摘する。

```ts
export type BookInput = Partial<Book>

export function createSeedBook(input: BookInput): Book {
  return { ...input } as Book
}
```

### 8.3 改修 — AI の失敗を直す

AI に README の学習課題 1 (`description` の追加) を実装させる。backend の
`Book`、`BookInput`、frontend の API 型を更新し、`npm run typecheck` が通るまで
修正する。生成差分に `id`・時刻・`borrower` の責務変更が混ざっていないかも
レビュー記録に残す。

## 9. まとめ

- ユニオン型は「名前の揺れを型で防ぐ」最強の道具
- `as const` + `(typeof X)[number]` で定数配列を型の単一情報源にできる
- `Pick` / `Omit` + 交差型で「入力用の型」を導出する
- `BookCategory | (string & {})` — 補完は出すが検査は緩くするテクニック

## 10. 次回予告

第 03 回は npm workspaces に立ち戻り、この「型が重複している」問題を含めて
モノレポの依存管理・スクリプト設計・パッケージ分割の勘所を学びます。
