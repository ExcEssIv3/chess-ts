export type PieceChar = "p" | "n" | "b" | "r" | "q" | "k" | "P" | "N" | "B" | "R" | "Q" | "K";
export type PromotionPieceChar = "n" | "b" | "r" | "q" | "N" | "B" | "R" | "Q";

export const PROMOTION_PIECE_CHARS: readonly PromotionPieceChar[] = ["n", "b", "r", "q", "N", "B", "R", "Q"];

export function isPromotionPieceChar(value: string): value is PromotionPieceChar {
    return (PROMOTION_PIECE_CHARS as readonly string[]).includes(value);
}

export interface SquareInfo {
    /** Bitmask with a single bit set (e.g. 1n << 27n) — use for `board.and*`/bitboard `&` checks. */
    bit: bigint;
    /** 0-63 square index — use for rank/file arithmetic and shifting (1n << square). */
    square: bigint;
    rank: bigint;
    file: bigint;
}
