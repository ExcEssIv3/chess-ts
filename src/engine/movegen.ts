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

export function findLegalMoves(board: Board): bigint[][] {
    const moves: bigint[][] = [];
    const startLocations = (board.whiteToMove) ?
        board.wPawns + board.wRooks + board.wKnights + board.wBishops + board.wKing + board.wQueens :
        board.bPawns + board.bRooks + board.bKnights + board.bBishops + board.bKing + board.bQueens

    const locationsToCheck = ~startLocations;
    for (let i = 0n; i < 64n; i++) {
        const location = 1n << i;
        if ((startLocations & location) > 0n) {
            for (let j = 0n; j < 64n; j++) {
                const checkLocation = 1n << j;
                if ((locationsToCheck & checkLocation) > 0n) {
                    if (evaluateLegal(board, location, checkLocation)) moves.push([location, checkLocation]);
                }
            }
        }
    }
    return moves;
}