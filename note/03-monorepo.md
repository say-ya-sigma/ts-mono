# 第 03 回 npm workspaces とモノレポ構成

- **ゴール**: workspaces の仕組みを理解し、統一スクリプトとパッケージ分割の判断ができる
- **対象ファイル**: ルート `package.json`、`backend/package.json`、`frontend/package.json`

## 1. モノレポとは何か、何が嬉しいのか

1 つの Git リポジトリに複数の npm パッケージ (ここでは `frontend` / `backend`) を
同居させる構成です。比較してみます。

| | 別リポジトリ (ポリレポ) | モノレポ |
|---|------------------------|----------|
| API 仕様変更時の作業 | 片方を直して公開 → もう片方を更新 | 1 PR で同時に直せる |
| CI / ツール設定 | リポジトリごとに重複 | 一元化しやすい |
| リポジトリが肥大化 | しにくい | しやすい (管理の腕が要る) |
| 境界の強制 | 物理的に強制される | 自律が必要 |

「フロントとバックを同じ PR で直したい」は Web 開発では頻繁に起こるため、
小規模な製品ならモノレポが定番になっています。

## 2. ルート `package.json` の読み方

```json
// package.json
{
  "name": "ts-mono",
  "private": true,
  "workspaces": ["frontend", "backend"],
  "scripts": {
    "dev:frontend": "npm -w frontend run dev",
    "dev:backend": "npm -w backend run dev",
    "build": "npm run build --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present",
    "typecheck": "npm -w frontend exec tsc -- --noEmit && npm -w backend exec tsc -- --noEmit"
  }
}
```

- `private: true` — このパッケージは npm へ公開しない (モノレポのルートでは必須)
- `workspaces: [...]` — ここが本題 (次節)
- スクリプトはすべて **ルートから各ワークスペースへの委譲** 形式

### 2.1. `npm -w` (workspace 指定)

```bash
npm -w backend run dev       # backend の scripts.dev を実行
npm -w backend exec tsc -- --noEmit   # backend の文脈でコマンド実行
```

第 01 回の `npm run dev:backend` は、この `npm -w backend run dev` を
ラップしたものです。

### 2.2. `--workspaces --if-present`

```
npm run build --workspaces --if-present
```

「全ワークスペースに対して `build` を、存在すれば実行」。
`--if-present` が無いと script が無いパッケージでエラーになります。

### 2.3. `typecheck` の `&&` 接続

```json
"typecheck": "npm -w frontend exec tsc -- --noEmit && npm -w backend exec tsc -- --noEmit"
```

`--noEmit` = 「型検査だけして JS を出力しない」。
frontend が失敗したら backend は実行されません。
`&&` を `;` に変えると「失敗しても続行」になります — CI では全部見たい場合に
使い分けます。

## 3. workspaces の内部動作 — hoisting

`npm install` を **ルートで 1 回** 実行するだけで済む理由:

1. npm は各ワークスペースの `package.json` の依存宣言をすべて読む
2. 互換性のあるバージョンは **ルートの `node_modules/` に 1 つだけ** 置く (hoisting)
3. バージョンが衝突する場合のみ、各ワークスペース配下にも `node_modules/` を作る

- メリット: ディスク容量・インストール時間の節約、バージョンの統一
- デメリット: 「ルートから参照できるが package.json に書いていない」依存
  (いわゆる 幽霊依存, phantom dependency) が生まれうる
  - 対策: `dependencies` に使うものは必ず宣言する。本講義では全ワークスペースが
    正しく宣言しています

`npm ls <pkg>` や `ls node_modules | head` で実態を確認してみてください。

## 4. 各ワークスペースの `package.json` — 違いを見る

| | `backend` | `frontend` |
|---|-----------|------------|
| 実行コマンド | `wrangler dev` | `next dev` (開発時) / OpenNext ビルド (本番) |
| 依存の特徴 | hono が本体 | next / react / tailwind / @opennextjs/cloudflare |
| テスト/ビルド | Workers 向けバンドル | 静的化 + ワーカー化 |

ポイント: **`typescript` は各ワークスペースの devDependencies で管理** されており、
バージョンを揃える責任は (workspaces の hoisting により) 自然に達成されます。

### 4.1. フロントの `next.config.ts` の豆知識

`README.md` 補足にもある通り、この scaffold の `typescript` は
`@typescript/typescript6` エイリアスで `bin/tsc` を持たないため、
Next 16 デフォルトの CLI モード (`useTypeScriptCli: true`) では `next dev` の
依存解決が失敗します。そこで:

```ts
// frontend/next.config.ts
experimental: { useTypeScriptCli: false }  // コンパイラ API モードを使う
```

と設定してあります。**モノレポではツールが想定しない依存の置き方をしがち** で、
このようなワークアラウンドが必要になる好例です。

## 5. ディスカッション: 型はどこに置くべきか?

第 02 回で見た通り、`Book` 型は `backend/src/books.ts` と `frontend/src/lib/api.ts` の
2 か所に (微妙に差を持って) 存在します。モノレポなら共有できます。

```
ts-mono/
├── packages/shared/     ← 新しく作るとしたらここ
│   └── src/types.ts     # Book, BookStatus, Stats ...
├── backend/             # packages/shared を dependencies に追加
└── frontend/            # 同上
```

判断の軸を整理します。

| 観点 | 共有パッケージ化 | 現状のように複製 |
|------|------------------|------------------|
| 整合性 | 機械的に保証 | 人間の記憶に依存 |
| 境界の明確さ | 「契約」が 1 つになり明確 | フロントが勝手に緩められ柔軟 |
| 破壊的変更の検知 | shared を変えると両方で型エラー | 気づきにくい |
| セットアップコスト | tsconfig / package.json の整備が要る | ゼロ |

実務では「API 契約は共有パッケージに置く」か「OpenAPI スキーマ等から生成する」
のが主流です。この講義では**まず現状の複製で動かし**、第 15 回で発展課題にします。

## 6. ハンズオン

```bash
# 1. ワークスペースの一覧と依存グラフを眺める
npm ls --workspaces

# 2. hoisting の実感: ルートの node_modules に hono / next があることを確認
ls node_modules | grep -E '^(hono|next)$'

# 3. 片方だけの型チェックが回ることを確認
npm -w backend exec tsc -- --noEmit

# 4. 統一スクリプト (両方回る)
npm run typecheck
```

## 7. 演習

1. **scripts を増やす**: ルートに `dev:all` (両方並行起動) を追加せよ。
   ヒント: `npm run dev:backend & npm run dev:frontend` では Ctrl-C が片方にしか
   届かない。`npm-run-all2` のようなパッケージを入れるのが正攻法だが、
   `&` 案との違いを言葉で説明できれば OK
2. **幽霊依存の実験**: `backend` のコードに `import ... from "next/..."` を
   書くとどうなるか? (hoisting により参照できてしまうか、壊れるか確認し、
   `package.json` に next を書くべきでない理由を考えよ)
3. **紙上設計**: `packages/shared` を作って `BookStatus` と `Stats` だけ共有する
   構成の `package.json` と `tsconfig.json` を書いてみる (実装は任意)

## 8. まとめ

- `workspaces` で 1 回の `npm install`・統一スクリプト・バージョン統一を実現
- `npm -w <name> run/exec` で特定ワークスペースを操作する
- hoisting は便利だが幽霊依存に注意 — 依存は必ず宣言
- 型の共有は「整合性 vs 境界の自律性」のトレードオフ

## 9. 次回予告

第 04 回からバックエンドに入ります。`backend/src/index.ts` の Hono を読み、
ルーティング・パスパラメータ・JSON レスポンスの基礎を学びます。
