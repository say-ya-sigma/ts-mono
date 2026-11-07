# 第 01 回 ガイダンス — 全体像と開発環境

- **ゴール**: システムの全体像を把握し、手元でデモを動かせるようになる
- **対象ファイル**: `README.md`、ルート `package.json`、各 `wrangler.jsonc`
- **AI 時代の位置づけ**: AI に構成を説明させ、実際の通信と照合して正しさを判定する

## 1. この講義シリーズで学ぶこと

本講義では「書籍管理システム」という 1 つの動くアプリを通して、
モダンな TypeScript フルスタック開発の全体を学びます。

```
frontend (Next.js 16 App Router + Tailwind CSS 4)   http://localhost:3000
    │  fetch (CORS)
backend  (Hono on Cloudflare Workers, wrangler dev)  http://localhost:8787
```

ポイントは **構成技術の典型性** です。

| 題材 | この世のどこにありがちか |
|------|--------------------------|
| TypeScript モノレポ (npm workspaces) | 中規模以上の Web サービス |
| Hono on Cloudflare Workers | エッジで動く軽量 API |
| Next.js App Router | React 製フロントエンドの現行標準 |
| fetch による REST API 連携 | ほぼすべての Web アプリ |

「検索・登録・貸出・返却・削除・統計」という一見単純な CRUD に、
実務で必要になる要素 (バリデーション、クエリ設計、エラー表示、状態管理) が
コンパクトに詰まっているのがこの題材の利点です。

## 2. ディレクトリ構成

```
ts-mono/
├── package.json        # workspaces 定義 + 統一スクリプト
├── backend/            # API サーバー (Hono + Workers)
│   ├── src/index.ts    #   ルーティング・CORS・エラーハンドリング
│   ├── src/store.ts    #   バリデーション・検索・ソート・統計 (ロジック層)
│   ├── src/books.ts    #   型定義と 15 冊のシードデータ (データ層)
│   └── wrangler.jsonc  #   Workers の設定
└── frontend/           # UI (Next.js)
    ├── src/app/        #   App Router のエントリ (layout.tsx / page.tsx)
    ├── src/components/BookManager.tsx  # 画面本体
    ├── src/lib/api.ts  #   型付き API クライアント (境界)
    └── wrangler.jsonc  #   OpenNext (Cloudflare) 向け設定
```

**3 層構成** を意識してください。この分離が第 04〜09 回 (バックエンド) と
第 11〜14 回 (フロントエンド) の各回の構成にそのまま対応します。

## 3. ハンズオン: 環境を起動する

```bash
# 0. 前提確認 (Node.js 22+ / npm 11+)
node -v && npm -v

# 1. 依存関係のインストール (ルートで 1 回だけ。両ワークスペースに入る)
npm install

# 2. ターミナル 1: バックエンド → http://localhost:8787
npm run dev:backend

# 3. ターミナル 2: フロントエンド → http://localhost:3000
npm run dev:frontend
```

ブラウザで `http://localhost:3000` を開き、次を確認します。

1. 上段に統計カード (総蔵書数 / 在庫あり / 貸出中 / 予約中) が出る
2. 検索ボックスに「コード」と入れると `吾輩は猫である` などが引っかかる
   (` isbn` に `9784001001094` のような数字を入れても検索できる)
3. 「貸出」ボタン → 借用者名を入力 → ステータスが「貸出中」になる
4. 「返却」ボタン → 借用者名が自動で消える ← **この挙動を第 07 回で自作します**

### API を直接叩いてみる (ターミナル 3)

```bash
curl http://localhost:8787/                # API の自己説明 (エンドポイント一覧)
curl http://localhost:8787/api/books       # 全 15 冊
curl "http://localhost:8787/api/books?q=コード"
curl "http://localhost:8787/api/books?category=技術書&sort=-publishedYear"
curl http://localhost:8787/api/stats       # 統計
```

`curl` は以降の回でも多用します。ブラウザからは見えない
「生の JSON」「ステータスコード」を確認できるのが利点です。

## 4. フロントとバックの役割分担

| 関心ごと | 担当 | 備考 |
|----------|------|------|
| データの整合性・バリデーション | backend | 第 07 回 |
| 検索・ソートのロジック | backend | 第 08 回 |
| ユーザー操作・表示・エラーの見せ方 | frontend | 第 11, 12, 14 回 |
| 両者をつなぐ約束 (API 仕様) | 両方 | 第 06, 10, 13 回 |

「同一オリジン (localhost:3000) から別オリジン (localhost:8787) へ fetch する」
ために CORS という仕組みが要る、という話が第 10 回のテーマです。

## 5. AI と一緒に学ぶルール

このシリーズでは AI の利用を禁止しません。むしろ、実際に AI に説明・実装・
修正案を出させてください。ただし、評価するのは生成されたコードの量ではなく、
次の 3 つです。

- **予測**: 実行前に結果を説明できるか
- **レビュー**: AI の出力にある前提漏れ・設計ミスを指摘できるか
- **改修**: 指摘を検証し、最小の修正と根拠を示せるか

AI の回答をそのまま提出するのではなく、プロンプト・実行結果・判断理由を
残してください。コードは手段であり、判定の過程がこの授業の成果物です。

## 6. AI ドリル — 予測・レビュー・改修

### 6.1 予測 — 実行前に当てる

1. `GET /api/books/b99` と `GET /api/nothing` は、それぞれどの HTTP ステータスと
   JSON を返すかを予測してから `curl -i` で確認する
2. `POST /api/books` を実行したとき、ブラウザでは `OPTIONS` が追加されるのに
   `curl` では追加されない理由を、構成図のどの境界に対応するか説明する

### 6.2 レビュー — AI の出力を審査する

AI が次の起動手順を提案した。正しい箇所と誤っている箇所を分け、誤りがあれば
このリポジトリのファイル名を根拠に指摘する。

```text
1. npm install
2. npm run dev:frontend
3. ブラウザから http://localhost:3000/api/books を開く
```

### 6.3 改修 — AI の失敗を直す

AI に「このアプリの起動確認を自動化して」と依頼し、backend と frontend の
両方に対する HTTP ステータス確認を含むシェルコマンドを作らせる。コマンドを
実行して、誤ったポート・順序・エンドポイントがあれば自分で修正し、最後に
`/api/reset` でデータを戻す。

## 7. まとめ

- モノレポ `ts-mono` = Next.js フロントエンド + Hono バックエンド
- `npm run dev:backend` / `dev:frontend` の 2 プロセス構成
- シードデータ 15 冊・再起動 or リセットで元に戻る安全な実験環境
- HTTP ステータスコードと生の JSON は `curl -i` で観察する

## 8. 次回予告

第 02 回は `backend/src/books.ts` を読み、TypeScript の型システム
(ユニオン型 / `as const` / `Pick` / 交差型) でデータモデルをどう表現するかを学びます。
