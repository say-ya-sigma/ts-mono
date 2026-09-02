// 書籍データの型定義・シードデータ・インメモリストア
// ※ デモ用のためメモリ上に保持(再起動でリセット)。本番では D1 / Durable Objects を使う。

export type BookStatus = "在庫あり" | "貸出中" | "予約中"

export const BOOK_STATUSES: BookStatus[] = ["在庫あり", "貸出中", "予約中"]

export const BOOK_CATEGORIES = [
  "文学",
  "技術書",
  "実用書",
  "ビジネス",
  "科学",
  "歴史",
] as const

export type BookCategory = (typeof BOOK_CATEGORIES)[number]

export interface Book {
  id: string
  title: string
  author: string
  publisher: string
  isbn: string
  category: BookCategory | (string & {})
  publishedYear: number
  status: BookStatus
  rating: number
  borrower: string | null
  registeredAt: string
  updatedAt: string
}

export type BookInput = Pick<
  Book,
  "title" | "author" | "publisher" | "isbn" | "category" | "publishedYear" | "rating"
> & { status?: BookStatus; borrower?: string | null }

const iso = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 86_400_000).toISOString()

type SeedBook = Omit<Book, "id" | "borrower" | "registeredAt" | "updatedAt"> & {
  borrower?: string
  registeredDaysAgo?: number
}

function seedBook({
  borrower,
  registeredDaysAgo = 0,
  ...fields
}: SeedBook & { id: string }): Book {
  const now = iso(registeredDaysAgo)
  return {
    ...fields,
    borrower: borrower ?? null,
    registeredAt: now,
    updatedAt: now,
  }
}

// 学習用シードデータ: 文学・技術書・実用書など、検索・フィルタ・ソートが試せる構成
// (ID は固定にしてあるので、curl のサンプルが再起動後もそのまま動く)
export const SEED_BOOKS: Book[] = [
  seedBook({ id: "b01", title: "吾輩は猫である", author: "夏目 漱石", publisher: "岩波書店", isbn: "9784001001094", category: "文学", publishedYear: 1906, status: "貸出中", rating: 4, borrower: "佐藤 健一", registeredDaysAgo: 90 }),
  seedBook({ id: "b02", title: "走れメロス", author: "太宰 治", publisher: "新潮社", isbn: "9784101006059", category: "文学", publishedYear: 1940, status: "在庫あり", rating: 5, registeredDaysAgo: 88 }),
  seedBook({ id: "b03", title: "山月記", author: "中島 敦", publisher: "角川書店", isbn: "9784041099162", category: "文学", publishedYear: 1942, status: "貸出中", rating: 4, borrower: "田中 美咲", registeredDaysAgo: 75 }),
  seedBook({ id: "b04", title: "雪国", author: "川端 康成", publisher: "新潮社", isbn: "9784101001079", category: "文学", publishedYear: 1948, status: "在庫あり", rating: 4, registeredDaysAgo: 70 }),
  seedBook({ id: "b05", title: "ノルウェイの森", author: "村上 春樹", publisher: "講談社", isbn: "9784062749676", category: "文学", publishedYear: 1987, status: "予約中", rating: 5, borrower: "伊藤 陽子", registeredDaysAgo: 60 }),
  seedBook({ id: "b06", title: "リーダブルコード", author: "Dustin Boswell / Trevor Foucher", publisher: "オライリー・ジャパン", isbn: "9784873115658", category: "技術書", publishedYear: 2012, status: "貸出中", rating: 5, borrower: "鈴木 一郎", registeredDaysAgo: 55 }),
  seedBook({ id: "b07", title: "Webを支える技術", author: "山本 陽平", publisher: "技術評論社", isbn: "9784774142302", category: "技術書", publishedYear: 2010, status: "在庫あり", rating: 5, registeredDaysAgo: 50 }),
  seedBook({ id: "b08", title: "SQLアンチパターン", author: "Bill Karwin", publisher: "オライリー・ジャパン", isbn: "9784873116709", category: "技術書", publishedYear: 2013, status: "在庫あり", rating: 4, registeredDaysAgo: 48 }),
  seedBook({ id: "b09", title: "プリンシプル オブ プログラミング", author: "上田 勲", publisher: "秀和システム", isbn: "9784798039344", category: "技術書", publishedYear: 2015, status: "貸出中", rating: 4, borrower: "高橋 大輔", registeredDaysAgo: 42 }),
  seedBook({ id: "b10", title: "達人プログラマー", author: "David Thomas / Andrew Hunt", publisher: "オーム社", isbn: "9784274222648", category: "技術書", publishedYear: 2020, status: "在庫あり", rating: 5, registeredDaysAgo: 40 }),
  seedBook({ id: "b11", title: "嫌われる勇気", author: "岸見 一郎 / 古賀 史健", publisher: "ダイヤモンド社", isbn: "9784478100262", category: "実用書", publishedYear: 2013, status: "予約中", rating: 5, borrower: "渡辺 由紀", registeredDaysAgo: 35 }),
  seedBook({ id: "b12", title: "人を動かす", author: "Dale Carnegie", publisher: "創元社", isbn: "9784422100869", category: "ビジネス", publishedYear: 1958, status: "在庫あり", rating: 4, registeredDaysAgo: 30 }),
  seedBook({ id: "b13", title: "影響力の武器", author: "Robert B. Cialdini", publisher: "誠信書房", isbn: "9784414302031", category: "ビジネス", publishedYear: 2007, status: "貸出中", rating: 4, borrower: "山本 拓海", registeredDaysAgo: 25 }),
  seedBook({ id: "b14", title: "宇宙の果てへの旅", author: "Carl Sagan", publisher: "早川書房", isbn: "9784150502664", category: "科学", publishedYear: 1997, status: "在庫あり", rating: 5, registeredDaysAgo: 20 }),
  seedBook({ id: "b15", title: "地域を見る眼", author: "網野 善彦", publisher: "平凡社", isbn: "9784582765464", category: "歴史", publishedYear: 2004, status: "在庫あり", rating: 3, registeredDaysAgo: 15 }),
]
