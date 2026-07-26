import type { PieceChar } from "./types";

// Standard centipawn piece values (1 pawn = 100), the commonly-cited baseline
// used across chess engines. Knight/bishop are split 320/330 rather than a
// flat 300/300 — bishops are conventionally valued a touch higher since the
// bishop pair tends to be marginally stronger than two knights.
// Source: https://www.chessprogramming.org/Point_Value
export const PAWN_VALUE = 100;
export const KNIGHT_VALUE = 320;
export const BISHOP_VALUE = 330;
export const ROOK_VALUE = 500;
export const QUEEN_VALUE = 900;
// The king is never traded off, so it has no material value — its safety is
// scored by other evaluation terms, not material counting.
export const KING_VALUE = 0;

export const PIECE_VALUES: Readonly<Record<PieceChar, number>> = {
    P: PAWN_VALUE,
    N: KNIGHT_VALUE,
    B: BISHOP_VALUE,
    R: ROOK_VALUE,
    Q: QUEEN_VALUE,
    K: KING_VALUE,
    p: PAWN_VALUE,
    n: KNIGHT_VALUE,
    b: BISHOP_VALUE,
    r: ROOK_VALUE,
    q: QUEEN_VALUE,
    k: KING_VALUE,
};
