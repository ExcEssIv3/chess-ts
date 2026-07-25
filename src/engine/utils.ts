import type { SquareInfo } from "./types";

/** bit (bitmask, single set bit) -> square (0-63 index) */
export function bitToSquare(bit: bigint): bigint {
    return BigInt(Math.round(Math.log2(Number(bit))));
}

/** square (0-63 index) -> bit (bitmask, single set bit) */
export function squareToBit(square: number): bigint {
    return 1n << BigInt(square);
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