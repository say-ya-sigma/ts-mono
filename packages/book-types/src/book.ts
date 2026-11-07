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
