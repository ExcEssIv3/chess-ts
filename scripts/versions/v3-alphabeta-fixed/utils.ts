import type { PromotionPieceChar, SquareInfo } from "./types";

/**
 * bit (bitmask, single set bit) -> square (0-63 index).
 *
 * Binary search for the position of the set bit, entirely in bigint
 * arithmetic (shifts/ANDs only) — no Number(bit)/Math.log2 round trip. Each
 * step asks "is the set bit in the upper half of what's left" and shifts it
 * down if so, halving the search space in 6 steps instead of a float log2 call.
 */
export function bitToSquare(bit: bigint): bigint {
    let square = 0n;
    if (bit & 0xFFFFFFFF00000000n) { square += 32n; bit >>= 32n; }
    if (bit & 0xFFFF0000n) { square += 16n; bit >>= 16n; }
    if (bit & 0xFF00n) { square += 8n; bit >>= 8n; }
    if (bit & 0xF0n) { square += 4n; bit >>= 4n; }
    if (bit & 0xCn) { square += 2n; bit >>= 2n; }
    if (bit & 0x2n) { square += 1n; }
    return square;
}

/** square (0-63 index) -> bit (bitmask, single set bit) */
export function squareToBit(square: bigint): bigint {
    return 1n << square;
}

/** takes/returns a square index, not a bit */
export function getRankFromSquare(square: bigint): bigint {
    return square / 8n;
}

/** takes/returns a square index, not a bit */
export function getFileFromSquare(square: bigint): bigint {
    return square % 8n;
}

/** takes a bit (bitmask), unlike getRankFromSquare */
export function getRankFromBit(bit: bigint): bigint {
    return getRankFromSquare(bitToSquare(bit));
}

/** takes a bit (bitmask), unlike getFileFromSquare */
export function getFileFromBit(bit: bigint): bigint {
    return getFileFromSquare(bitToSquare(bit));
}

/** takes a bit (bitmask); see SquareInfo for which of its fields are bit vs. square */
export function toSquareInfo(bit: bigint): SquareInfo {
    const square = bitToSquare(bit);
    return {
        bit,
        square,
        rank: getRankFromSquare(square),
        file: getFileFromSquare(square),
    };
}

/** returns a 0-63 square index, not a bitmask */
export function rankFileToSquare(rank: number, file: number): number {
    return rank * 8 + file;
}

export function algebraicToSquare(square: string): number {
    const file = square.charCodeAt(0) - "a".charCodeAt(0);
    const rank = parseInt(square[1]) - 1;
    return rank * 8 + file;
}

export function squareToAlgebraic(square: number): string {
    const file = square % 8;
    const rank = Math.floor(square / 8);
    return String.fromCharCode("a".charCodeAt(0) + file) + (rank + 1);
}

export function bitmaskToSquareArray(mask: bigint): SquareInfo[] {
    const squares: SquareInfo[] = [];
    let bitIndex = 1n;
    for (let i = 0n; i < 64n; i++) {
        if (mask === 0n) break;
        if (bitIndex & mask) {
            squares.push({
                bit: bitIndex,
                square: i,
                file: i % 8n,
                rank: i / 8n
            });
            mask &= ~bitIndex;
        }
        bitIndex <<= 1n;
    }
    return squares;
}

// Matches the promotion-code convention findLegalMoves pushes as a move's
// optional 3rd element: 0=rook, 1=knight, 2=bishop, anything else=queen.
export function promotionCharFromCode(code: bigint, whiteToMove: boolean): PromotionPieceChar {
    const letter = code === 0n ? "r" : code === 1n ? "n" : code === 2n ? "b" : "q";
    return (whiteToMove ? letter.toUpperCase() : letter) as PromotionPieceChar;
}