import type { Board } from "./board";
import { evaluateLegal } from "./legality";

export function checkDanger(board: Board, square: bigint, whiteToMove: boolean): boolean {
    // TODO: create a function with a better solution than looping through every square to find pieces
    for (let i = 0n; i < 64n; i++) {
        const bit = 1n << i;
        if (evaluateLegal(board, bit, square, whiteToMove, false)) return true;
    }

    return false;
}