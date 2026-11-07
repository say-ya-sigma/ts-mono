# ts-mono — 書籍管理システム (学習用デモ)

TypeScript モノレポで構築した書籍管理システムのデモです。実際に動かしながら
Next.js (フロントエンド) と Hono / Cloudflare Workers (バックエンド) の連携を学べます。

```
frontend (Next.js 16 App Router + Tailwind CSS 4)   http://localhost:3000
   │  fetch (CORS)
backend  (Hono on Cloudflare Workers, wrangler dev)  http://localhost:8787
```

## 起動方法

前提: Node.js 22+ / npm 11+ (workspaces)

```bash
npm install

# ターミナル 1: バックエンド (http://localhost:8787)
npm run dev:backend

# ターミナル 2: フロントエンド (http://localhost:3000)
npm run dev:frontend
```

ブラウザで http://localhost:3000 を開くと書籍管理画面が使えます。
データは 15 冊のシードデータから始まり、再起動または「デモデータに戻す」ボタンで
元に戻ります (インメモリのため。本番化の課題は後述)。

## できること (デモの見どころ)

| 機能 | 学べること |
|------|-----------|
| 検索・フィルタ・ソート | クエリパラメータ (`q`, `category`, `status`, `sort`) の設計と実装 |
| 新規登録 | サーバー側バリデーションとエラーメッセージの表示 (`400` + `errors[]`) |
| 貸出 / 返却 | `PATCH` による部分更新とステータス遷移 (返却時に `borrower` を自動クリア) |
| 統計カード | 集計エンドポイント (`GET /api/stats`) と `Promise.all` による並行取得 |
| 削除 / リセット | `DELETE`、デモ用リセットエンドポイント |

## API リファレンス (バックエンド)

一覧・検索 (title / author / publisher / isbn の部分一致):

```bash
curl "http://localhost:8787/api/books?q=コード"
curl "http://localhost:8787/api/books?category=技術書&sort=-publishedYear"
curl "http://localhost:8787/api/books?status=貸出中"
```

詳細・登録・更新・削除 (シードデータの ID `b01`〜`b15` は固定なので再起動しても動く):

```bash
curl http://localhost:8787/api/books/b01

curl -X POST http://localhost:8787/api/books \
  -H 'Content-Type: application/json' \
  -d '{"title":"テスト駆動開発","author":"Kent Beck","publisher":"オーム社",
       "isbn":"978-4274210084","category":"技術書","publishedYear":2012,"rating":5}'

# 貸出 (status が貸出中/予約中のときは borrower が必須 → これもバリデーションで学べる)
curl -X PATCH http://localhost:8787/api/books/b02 \
  -H 'Content-Type: application/json' \
  -d '{"status":"貸出中","borrower":"斎藤 花"}'

# 返却 (borrower は自動でクリアされる)
curl -X PATCH http://localhost:8787/api/books/b02 \
  -H 'Content-Type: application/json' -d '{"status":"在庫あり"}'

curl -X DELETE http://localhost:8787/api/books/b15
curl -X POST http://localhost:8787/api/reset
```

データモデル (`backend/src/books.ts`):

```
Book {
  id, title, author, publisher, isbn,
  category (文学/技術書/実用書/ビジネス/科学/歴史),
  publishedYear, rating (0-5, 0=未評価),
  status (在庫あり/貸出中/予約中), borrower (貸出中・予約中時の氏名),
  registeredAt, updatedAt
}
```

## ディレクトリ構成

```
backend/
  src/index.ts     Hono アプリ: ルーティング・CORS・エラーハンドリング
  src/store.ts     インメモリストア: バリデーション・検索・ソート・統計
  src/books.ts     型定義と 15 冊のシードデータ
frontend/
  src/app/page.tsx            エントリ (BookManager を表示)
  src/components/BookManager.tsx  検索・登録・貸出・削除を行う UI
  src/lib/api.ts              型付き API クライアント (フロント↔API の境界)
```

## 学習課題 (AI と協働して改造してみる)

1. **フィールドを増やす** — `Book` に `description` (あらすじ) を追加し、
   バリデーション・UI・詳細表示まで通してみる
2. **ページネーション** — `GET /api/books` に `page` / `limit` を追加
3. **永続化** — 現在はメモリ上のみ (再起動でリセット)。wrangler.jsonc の
   `d1_databases` を有効化して SQLite (D1) に保存すると本番に近い構成になる
4. **貸出履歴** — `lending_logs` の概念を導入し、誰がいつ借りたかを追跡
5. **テスト** — `store.ts` のバリデーション・ソートロジックにユニットテストを追加

これらの課題は、AI に実装を依頼してレビューする卒業課題としても利用できます。
仕様・レビュー指摘・検証結果まで含めた進め方は [`note/16-capstone.md`](note/16-capstone.md)
を参照してください。

## 開発コマンド

```bash
npm run typecheck   # 両ワークスペースの型チェック
npm run lint        # frontend の ESLint
npm run build       # 両ワークスペースのビルド
npm -w backend run deploy    # Workers へデプロイ
npm -w frontend run deploy   # OpenNext + Cloudflare へデプロイ
```

## 補足

- バックエンドのデータはインメモリ (`Map`) のため、`wrangler dev` の再起動で
  元に戻ります。デモではこれで十分ですが、本番では D1 / Durable Objects を使います
- フロントエンドからバックエンドへのアクセスは `NEXT_PUBLIC_API_URL`
  (デフォルト `http://localhost:8787`) で切り替え可能
- `frontend/next.config.ts` の `useTypeScriptCli: false` は必須設定です。
  この scaffold の `typescript` は `@typescript/typescript6` エイリアスで
  `bin/tsc` を持たないため、Next 16 のデフォルト (CLI モード) では
  `next dev` が依存解決に失敗します (コンパイラ API モードなら動作する)
