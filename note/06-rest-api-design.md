# 第 06 回 REST API 設計 — メソッドとステータスコード

- **ゴール**: リソース指向の URL 設計と、適切な HTTP メソッド/ステータスコードを選べる
- **対象ファイル**: `backend/src/index.ts` (全ルート)、`README.md` (API リファレンス)

## 1. REST のこころ — 「URL はリソースを表す」

この API のパスを眺めてください。

```
GET    /api/books        本の一覧 (コレクション)
POST   /api/books        本を 1 冊追加
GET    /api/books/:id    本の詳細 (メンバー)
PATCH  /api/books/:id    本を部分的に更新
DELETE /api/books/:id    本を削除
GET    /api/stats        統計情報
POST   /api/reset        (デモ用の操作)
```

REST の基本則は **「URL は名詞 (リソース) を表し、動詞は HTTP メソッドで表現する」** です。

- 良い例: `DELETE /api/books/b15` = 「b15 という本 (リソース) を削除する」
- 悪い例: `POST /api/deleteBook?id=b15` = 「削除という動詞を URL と body に押し込む」

悪い例でも「動く」には動きます。では何が問題か?

1. **HTTP の道具と噛み合わない**: キャッシュ・ログ・ルータがメソッドという
   情報を活かせない
2. **命名が爆発する**: `deleteBook` / `returnBook` / `lendBook`... と
   操作の数だけパスが増える (一方 `PATCH /api/books/:id` は 1 つで済む)
3. **統一性**: 一覧/詳細/追加/更新/削除が機械的に予測できる

### 1.1. リソースではないもの

- `GET /api/stats` — 「統計」という派生リソース。GET なので冪等で安全
- `POST /api/reset` — リソースでなく **操作 (action)**。REST 厳密には
  例外的なパスですが、開発・デモ用のユーティリティとして割り切っています。
  実務では「管理用エンドポイントは別パス (`/_admin` 等) や別認証で分離」が定石

## 2. HTTP メソッドの性質 — 安全/冪等を制する

| メソッド | 安全 (状態を変えない) | 冪等 (n 回実行しても 1 回と同じ) | この API での役 |
|----------|:---:|:---:|------------------|
| GET | ○ | ○ | 一覧・詳細・統計の取得 |
| POST | × | × | **新規作成** (毎回別の ID が生まれる) |
| PATCH | × | △* | 部分更新 (貸出・返却) |
| DELETE | × | ○ | 削除 (2 回目は同じ 404) |
| PUT | × | ○ | 置き換え (この API では不使用) |

*この API の PATCH は `{status:"在庫あり"}` を 2 回送っても同じ結果になるため
実質冪等ですが、規格上 PATCH の冪等性は保証外です。

### 2.1. PATCH と PUT の使い分け

- **PUT** = リソースの**全体置き換え**。冪等。「この本の全フィールドをこれにする」
- **PATCH** = **部分更新**。「status だけ変える」

「貸出」は `{ status: "貸出中", borrower: "斎藤 花" }` の 2 フィールドだけを
送りたいので PATCH が適切です。実際にフロントの貸出ボタンはこう送っています
(第 12 回 `handleLend`)。

## 3. ステータスコード — この API の使い分け表

| コード | 意味 | この API での使用箇所 |
|--------|------|------------------------|
| 200 OK | 成功 | GET / PATCH / DELETE / stats / reset の成功 |
| 201 Created | 作成成功 | POST /api/books の成功 |
| 400 Bad Request | クライアントの入力が不正 | バリデーションエラー (第 07 回) |
| 404 Not Found | リソースが無い | ID 不一致、未知のパス (notFound) |
| 500 Internal Server Error | サーバー内部の例外 | onError ハンドラ |

```ts
// backend/src/index.ts:49
if (!result.ok) return c.json({ errors: result.errors }, 400)
return c.json({ item: result.book }, 201)
```

### 3.1. なぜ「ステータスコードだけじゃなく body にもエラーを書く」のか

- 機械向け: `res.ok` でフロントが一発判定できる (第 13 回)
- 人間向け: `errors` に日本語の理由が入っていて UI にそのまま出せる
- **双方の消費者を 1 つの応答で賄う** 設計です

### 3.2. コードの選び方を間違えたら?

たとえば「登録失敗も 200 で `{error: ...}` を返す」API を想像してください。

- `fetch` の `res.ok` が true になってしまい、フロントは body を全部読まないと
  判定できない
- HTTP の監視・キャッシュ・リトライ戦略がすべて破綻する

「200 でエラーを返す」のは JSON API のアンチパターンの代表です。

### 3.3. 404 と 400 の境界線

PATCH では「ID が無い」は 404、「ID はあるが内容が不正」は 400 です。

```ts
// backend/src/index.ts:56
if (!result.ok) return c.json({ errors: result.errors }, result.notFound ? 404 : 400)
```

`store.updateBook` は「ID が見つからない」ことを `notFound: true` という
フラグで返してきます (第 07 回で結果型として詳説)。
**「なぜ失敗したか」を、ルーティング層がステータスコードに翻訳する責任を担う**
— 層の役割分担の好例です。

## 4. 貸出/返却を PATCH で表現する設計判断

「貸す」という操作は `POST /api/books/:id/lend` のような action パスでも
設計できます。この API が「`PATCH /api/books/:id` で `status` を変える」だけに
した理由を考えてみましょう。

- 状態遷移の実体は「本の status / borrower フィールドの変更」であり、
  リソース (`books/:id`) の部分更新と **同じ形** だから
- 「予約取消」は lend と違う操作名ですが、`{status:"在庫あり"}` の PATCH として
  **同じエンドポイント** で表現できる (フロントの「予約取消」ボタンが
  「返却」と同じ `handleReturn` を使っているのは第 12 回で確認)

逆に言えば、状態遷移に副作用や履歴が伴う (「貸出履歴を 1 件作る」) ようになると、
「履歴」という別リソース (`POST /api/lendings`) を作るほうが素直になります。
README の学習課題 4 がまさにこれです。

## 5. レスポンスボディの設計

成功時の形にも一貫性を持たせています。

- 一覧: `{ total, items }` — total は「フィルタ後の件数」
- 単一: `{ item }`
- 削除: `{ deleted: true }`
- リセット: `{ reset: true }`

**なぜ `Book[]` を裸で返さないのか?** → 将来 `page` / `limit` (学習課題 2) を
足すとき、`{ total, items, page }` なら **破壊的変更なしに拡張** できます。
配列を裸で返す API は後からフィールドを足せません。これは実務でよく
「最初から包んでおく」理由とされる予見的设计です。

## 6. ハンズオン

```bash
# 1. 201 と 400 を見比べる (-i でステータスラインを確認)
curl -i -X POST http://localhost:8787/api/books \
  -H 'Content-Type: application/json' \
  -d '{"title":"テスト駆動開発","author":"Kent Beck","publisher":"オーム社",
       "isbn":"978-4274210084","category":"技術書","publishedYear":2012,"rating":5}'
# → HTTP/1.1 201 Created

curl -i -X POST http://localhost:8787/api/books \
  -H 'Content-Type: application/json' -d '{"title":""}'
# → HTTP/1.1 400 Bad Request

# 2. DELETE の冪等性を確認
curl -X DELETE http://localhost:8787/api/books/b15   # → {deleted: true}
curl -i -X DELETE http://localhost:8787/api/books/b15  # → 404

# 3. 後始末
curl -X POST http://localhost:8787/api/reset
```

## 7. 演習

1. **ステータスコード当てクイズ**: (a) 存在しない category で検索
   (b) `publishedYear: "二千" ` で登録 (c) 削除済み ID を PATCH —
   それぞれ何が返るか予想してから curl で確認せよ
2. **PUT を実装してみる**: `PUT /api/books/:id` を「全フィールド必須の置き換え」
   として追加し、PATCH との挙動の差を確認する (store.ts は使い回してよい)
3. **思考問題**: `GET /api/books?status=貸出中` を「貸出中一覧」という
   別リソース `GET /api/loans` にすべき状況を 1 つ挙げよ
   (ヒント: 貸出に「貸出日」「返却期限」などの属性が付いたとき)

## 8. まとめ

- URL はリソース (名詞)、操作は HTTP メソッド (動詞)
- 安全/冪等の性質がメソッド選択の基準。部分更新には PATCH
- 200/201/400/404/500 の使い分け — 失敗の「理由」がコードを選ぶ
- レスポンスは `{ total, items }` / `{ item }` と包んで拡張余地を残す

## 9. 次回予告

第 07 回は 400 を返す中身、すなわち `store.ts` のバリデーションを実装から読み、
「`unknown` との付き合い方」「判別可能ユニオンによる結果型」を学びます。
