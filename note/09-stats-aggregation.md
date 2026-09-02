# 第 09 回 統計エンドポイントとデータ集計

- **ゴール**: 効率的な集計処理と「集計結果の型設計」を習得する
- **対象ファイル**: `backend/src/store.ts` 209-245 行 (`getStats`)、`frontend/src/components/BookManager.tsx` (StatCard 表示部分)、`frontend/src/lib/api.ts` (Stats 型)

## 1. 統計はなぜ別エンドポイントか

一覧 (`GET /api/books`) を取ってフロントで数えても統計は作れます。
あえて `GET /api/stats` を分ける理由:

1. **関心の分離**: 一覧は「並べ替えられた本」、統計は「蔵書の現況」。
   必要な粒度・更新タイミングが違う (統計は検索条件の影響を受けない)
2. **計算場所**: 平均や最大最小は「全件」に基づく。検索フィルタ後の
   `items.length` からは出せない
3. **将来の拡張**: SQL の `GROUP BY` / `AVG` に置き換えやすい境界にしておく
   (第 15 回の D1 化で効いてくる)

UI では一覧と統計を `Promise.all` で並行取得します (第 12 回) — 
「別エンドポイントだから並行で引ける」も分割の副次効果です。

## 2. 結果の型 — 「null になりうる値」を型で表明

```ts
// backend/src/store.ts:211-217
export interface Stats {
  total: number
  byStatus: Record<BookStatus, number>
  byCategory: { category: string; count: number }[]
  averageRating: number
  publishedYearRange: { oldest: number | null; newest: number | null }
}
```

型から読み取れる設計判断:

- **`byStatus: Record<BookStatus, number>`** — キーは 3 つ (在庫あり/貸出中/予約中)
  に **固定**。ステータスを増やすとこの型が壊れ、全 UI の修正を強制する
  (第 02 回のユニオン型の連携)
- **`byCategory` は配列** — カテゴリは自由な文字列 (第 02 回) なので
  `Record` にできない。代わりに「集計対象の昇順/降順」という **順序** を
  持たせられる形にしている (実際は件数降順でソート済み)
- **`oldest: number | null`** — 本が 1 冊も無ければ「最古年」は存在しない。
  「計算できない」ことを 0 ではなく `null` で表現 (0 年は有効な西暦ではないが、
  「無いこと」と「値が 0 であること」の混同は事故の元)

## 3. 実装 — 1 ループで全指標を集める

```ts
// backend/src/store.ts:219-233
export function getStats(): Stats {
  const all = [...books.values()]
  const byStatus = { "在庫あり": 0, "貸出中": 0, "予約中": 0 } as Record<BookStatus, number>
  const categoryCount = new Map<string, number>()
  let ratingSum = 0
  let oldest: number | null = null
  let newest: number | null = null

  for (const b of all) {
    byStatus[b.status] += 1
    categoryCount.set(b.category, (categoryCount.get(b.category) ?? 0) + 1)
    ratingSum += b.rating
    oldest = oldest === null ? b.publishedYear : Math.min(oldest, b.publishedYear)
    newest = newest === null ? b.publishedYear : Math.max(newest, b.publishedYear)
  }
  ...
```

### 3.1. 「配列を何度も走る」より「1 度で全員に聞く」

指標は 5 種類あります。書き方の選択肢:

```ts
// (a) 指標ごとに filter/reduce を回す — 読みやすいが全件を 5 回走査
const total = all.length
const rated = all.filter(b => b.rating > 0).length
const avg = rated ? all.reduce((s, b) => s + b.rating, 0) / all.length : 0
// ...oldest/newest/byStatus/byCategory もそれぞれ…

// (b) 本採用: for 1 回で全指標を更新
```

本の 15 冊なら差はありませんが、**データ件数 × 指標数** の積が走査回数になる
意識は重要です。集計 SQL で `COUNT(*)` を指標の数だけ発行しないのと同じ理屈です。

### 3.2. トリビアなテクニック

- `Math.min(oldest, x)` は `oldest` が `null` だと `NaN` になる → 
  **`oldest === null ? x : Math.min(...)` と初期化を兼ねる** 分岐
- `categoryCount` に `Map` を使う: キーが「任意の文字列」だから
  (Record は未知キーに対応できない)。`?? 0` でデフォルトを埋めて加算する
  イディオムは頻出です
- `byStatus` の初期値 `{ 在庫あり: 0, ... }` を **as Record<BookStatus, number>** で
  明示 — 3 キーの object literal の型推論は `Record` に widen しないため

### 3.3. 仕上げ — Map を「ソート済み配列」に変換

```ts
// backend/src/store.ts:236-244
const rated = all.filter((b) => b.rating > 0)
return {
  total: all.length,
  byStatus,
  byCategory: [...categoryCount.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count),
  averageRating: rated.length > 0 ? Math.round((ratingSum / all.length) * 10) / 10 : 0,
  publishedYearRange: { oldest, newest },
}
```

`[...map.entries()] → map → sort` は **Map を UI 向けデータに整える定番チェーン** です。
平均の行は後で単独で解説します。

## 4. `averageRating` の定義を議論する

```ts
averageRating: rated.length > 0 ? Math.round((ratingSum / all.length) * 10) / 10 : 0
```

この 1 行には判断が 3 つ詰まっています。

1. **分母は `all.length` (全蔵書)** — `rated.length` (評価済みのみ) ではない。
   「未評価 (0) を 0 点として数える」定義。未評価を除外した平均と
   どちらが「らしい」かは、サービスの性格次第です
   (蔵書全体の質の目安なら全数、レビューの平均なら評価済みのみ)
2. **`Math.round(x * 10) / 10`** — 小数第 2 位で四捨五入して 1 桁に。
   JS の浮動小数点を扱うときの小数点数丸めの基本句
3. **ガードが `rated.length > 0` なのに分母が `all.length`** — 
   「1 冊でも評価済みがあれば、全冊で割る」。`all.length = 0` (空蔵書) のとき
   `0 / 0 = NaN` になるのを防ぐにはこのガードで十分ですが、
   「評価済み 0 冊 + 蔵書 15 冊」のときも `0` を返す — 
   分母を all にするなら `all.length > 0` がより直接の条件に見えます。
   **微妙にねじれている条件** であり、単体テストの好対象です (README 学習課題 5)

「集計ロジックは一見正しそうで境界で壊れる」の好例として覚えてください。

## 5. UI 側との接続

```tsx
// frontend/src/components/BookManager.tsx (要旨)
const [{ items }, s] = await Promise.all([api.list({...}), api.stats()])
setStats(s)

// 249-259 行
<StatCard label="総蔵書数" value={stats.total} />
<StatCard label="在庫あり" value={stats.byStatus["在庫あり"]} />
```

- 統計は 4 枚のカードとして表示。`byCategory` (カテゴリ別件数) と
  `averageRating`、`publishedYearRange` は **API が返しているが UI は未使用**
  — 「サーバーは汎用に、UI は必要なだけ」の例であり、
  「カテゴリ別内訳を表示せよ」は自然な発展演習です
- 第 02 回の復習: `stats.byStatus["在庫あり"]` が `Record<BookStatus, number>` の
  型恩恵 (typo しない、全キーを列挙できる) を受けている

## 6. ハンズオン

```bash
# 1. 統計を取る
curl http://localhost:8787/api/stats | jq .   # jq が無ければそのまま読む

# 2. 状態を変えると統計がどう動くか
curl -X PATCH http://localhost:8787/api/books/b02 \
  -H 'Content-Type: application/json' -d '{"status":"貸出中","borrower":"試験 太郎"}'
curl http://localhost:8787/api/stats
# → byStatus の 在庫あり -1 / 貸出中 +1

# 3. 空データの境界を試す (全部消す)
for i in $(seq -w 1 15); do curl -X DELETE http://localhost:8787/api/books/b$i > /dev/null; done
curl http://localhost:8787/api/stats
# → averageRating: 0, publishedYearRange が { oldest: null, newest: null }

# 4. 戻す
curl -X POST http://localhost:8787/api/reset
```

## 7. 演習

1. **`averageRating` を「評価済みのみの平均」に変更** せよ。ただし
   評価済み 0 冊のときは 0 を返すこと (変わった挙動を上のハンズオン 3 で確認)
2. **`byCategory` を UI に表示** せよ — `StatCard` を並べるだけでもよい。
   `averageRating`・`publishedYearRange` も加えるとさらに良い
3. **`maxRatingBook`** (最高評価の本のタイトル) を stats に追加せよ。
   「同点が複数」のときどう表現するか (`string[]` にする? 1 つだけ?) まで決める
4. **思考問題**: 本が 10 万冊になったら `getStats` は毎リクエスト計算させるべきか?
   (検討候補: 計算タイミングの遅延、キャッシュ、第 05 回の isolate の性質)

## 8. まとめ

- 統計は一覧と関心が違う → 別エンドポイント、並行取得
- 「無い」は `null`、カテゴリ集計は `Map` → ソート済み配列に変換して返す
- 1 ループ多重集計で走査回数を指標数に依存させない
- `averageRating` の分母とガードの関係 — 集計は境界条件で壊れる

## 9. 次回予告

第 10 回はいよいよフロントとバックの「間」に立ち、Same-Origin Policy と CORS、
そして `app.use("/api/*", cors())` の 1 行が何をしているかを学びます。
