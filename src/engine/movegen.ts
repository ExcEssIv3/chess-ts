import { Board } from "./board";
import { evaluateLegal } from "./legality";
import { bitmaskToSquareArray, toSquareInfo } from "./utils";

// [fileDelta, rankDelta] pairs, checked against the board edge before use.
const KNIGHT_OFFSETS: readonly [bigint, bigint][] = [
    [1n, 2n], [2n, 1n], [2n, -1n], [1n, -2n],
    [-1n, -2n], [-2n, -1n], [-2n, 1n], [-1n, 2n],
];
const KING_OFFSETS: readonly [bigint, bigint][] = [
    [1n, 0n], [1n, 1n], [1n, -1n], [-1n, 0n],
    [-1n, 1n], [-1n, -1n], [0n, 1n], [0n, -1n],
];

export function checkDanger(board: Board, square: bigint, whiteToMove: boolean): boolean {
    // TODO: create a function with a better solution than looping through every square to find pieces
    for (let i = 0n; i < 64n; i++) {
        const bit = 1n << i;
        if (evaluateLegal(board, bit, square, whiteToMove, false, true)) return true;
    }

    return false;
}

export function findLegalMoves(board: Board): bigint[][] {
    const moves: bigint[][] = [];
    if (board.whiteToMove) {
        const pawns = bitmaskToSquareArray(board.wPawns);
        pawns.forEach(pawn => {
            if (evaluateLegal(board, pawn.bit, pawn.bit << 8n)) {
                moves.push([pawn.bit, pawn.bit << 8n]);
            }
            if (pawn.rank === 1n) {
                if (evaluateLegal(board, pawn.bit, pawn.bit << 16n)) {
                    moves.push([pawn.bit, pawn.bit << 16n]);
                }
            }
            if (pawn.file > 0) {
                if (evaluateLegal(board, pawn.bit, pawn.bit << 7n)) {
                    moves.push([pawn.bit, pawn.bit << 7n]);
                }
            }
            if (pawn.file < 7) {
                if (evaluateLegal(board, pawn.bit, pawn.bit << 9n)) {
                    moves.push([pawn.bit, pawn.bit << 9n]);
                }
            }
        });

        const rooks = bitmaskToSquareArray(board.wRooks);
        rooks.forEach(rook => {
            moves.push(...saveRepetitiveMovements(board, rook.bit, 1n, 0n));
            moves.push(...saveRepetitiveMovements(board, rook.bit, 0n, 1n));
            moves.push(...saveRepetitiveMovements(board, rook.bit, -1n, 0n));
            moves.push(...saveRepetitiveMovements(board, rook.bit, 0n, -1n));
        });

        const knights = bitmaskToSquareArray(board.wKnights);
        knights.forEach(knight => {
            KNIGHT_OFFSETS.forEach(([fileDelta, rankDelta]) => {
                const targetFile = knight.file + fileDelta;
                const targetRank = knight.rank + rankDelta;
                if (targetFile < 0n || targetFile > 7n || targetRank < 0n || targetRank > 7n) return;

                const target = knight.bit << (rankDelta * 8n + fileDelta);
                if (evaluateLegal(board, knight.bit, target)) moves.push([knight.bit, target]);
            });
        });

        const bishops = bitmaskToSquareArray(board.wBishops);
        bishops.forEach(bishop => {
            moves.push(...saveRepetitiveMovements(board, bishop.bit, 1n, -1n));
            moves.push(...saveRepetitiveMovements(board, bishop.bit, 1n, 1n));
            moves.push(...saveRepetitiveMovements(board, bishop.bit, -1n, -1n));
            moves.push(...saveRepetitiveMovements(board, bishop.bit, -1n, 1n));
        })

        const king = toSquareInfo(board.wKing);
        KING_OFFSETS.forEach(([fileDelta, rankDelta]) => {
            const targetFile = king.file + fileDelta;
            const targetRank = king.rank + rankDelta;
            if (targetFile < 0n || targetFile > 7n || targetRank < 0n || targetRank > 7n) return;

            const target = king.bit << (rankDelta * 8n + fileDelta);
            if (evaluateLegal(board, king.bit, target)) moves.push([king.bit, target]);
        });
        // kingside (toward the h-file) increases file index, queenside decreases it.
        if ((board.castlingRights & 1) > 0 && evaluateLegal(board, king.bit, king.bit << 2n)) moves.push([king.bit, king.bit << 2n]);
        if ((board.castlingRights & 2) > 0 && evaluateLegal(board, king.bit, king.bit >> 2n)) moves.push([king.bit, king.bit >> 2n]);

        const queens = bitmaskToSquareArray(board.wQueens);
        queens.forEach(queen => {
            moves.push(...saveRepetitiveMovements(board, queen.bit, 1n, 0n));
            moves.push(...saveRepetitiveMovements(board, queen.bit, 0n, 1n));
            moves.push(...saveRepetitiveMovements(board, queen.bit, -1n, 0n));
            moves.push(...saveRepetitiveMovements(board, queen.bit, 0n, -1n));
            moves.push(...saveRepetitiveMovements(board, queen.bit, 1n, -1n));
            moves.push(...saveRepetitiveMovements(board, queen.bit, 1n, 1n));
            moves.push(...saveRepetitiveMovements(board, queen.bit, -1n, -1n));
            moves.push(...saveRepetitiveMovements(board, queen.bit, -1n, 1n));
        })
    } else {
        const pawns = bitmaskToSquareArray(board.bPawns);
        pawns.forEach(pawn => {
            if (evaluateLegal(board, pawn.bit, pawn.bit >> 8n)) {
                moves.push([pawn.bit, pawn.bit >> 8n]);
            }
            if (pawn.rank === 6n) {
                if (evaluateLegal(board, pawn.bit, pawn.bit >> 16n)) {
                    moves.push([pawn.bit, pawn.bit >> 16n]);
                }
            }
            if (pawn.file > 0) {
                if (evaluateLegal(board, pawn.bit, pawn.bit >> 9n)) {
                    moves.push([pawn.bit, pawn.bit >> 9n]);
                }
            }
            if (pawn.file < 7) {
                if (evaluateLegal(board, pawn.bit, pawn.bit >> 7n)) {
                    moves.push([pawn.bit, pawn.bit >> 7n]);
                }
            }
        });

        const rooks = bitmaskToSquareArray(board.bRooks);
        rooks.forEach(rook => {
            moves.push(...saveRepetitiveMovements(board, rook.bit, 1n, 0n));
            moves.push(...saveRepetitiveMovements(board, rook.bit, 0n, 1n));
            moves.push(...saveRepetitiveMovements(board, rook.bit, -1n, 0n));
            moves.push(...saveRepetitiveMovements(board, rook.bit, 0n, -1n));
        });

        const knights = bitmaskToSquareArray(board.bKnights);
        knights.forEach(knight => {
            KNIGHT_OFFSETS.forEach(([fileDelta, rankDelta]) => {
                const targetFile = knight.file + fileDelta;
                const targetRank = knight.rank + rankDelta;
                if (targetFile < 0n || targetFile > 7n || targetRank < 0n || targetRank > 7n) return;

                const target = knight.bit << (rankDelta * 8n + fileDelta);
                if (evaluateLegal(board, knight.bit, target)) moves.push([knight.bit, target]);
            });
        });

        const bishops = bitmaskToSquareArray(board.bBishops);
        bishops.forEach(bishop => {
            moves.push(...saveRepetitiveMovements(board, bishop.bit, 1n, -1n));
            moves.push(...saveRepetitiveMovements(board, bishop.bit, 1n, 1n));
            moves.push(...saveRepetitiveMovements(board, bishop.bit, -1n, -1n));
            moves.push(...saveRepetitiveMovements(board, bishop.bit, -1n, 1n));
        })

        const king = toSquareInfo(board.bKing);
        KING_OFFSETS.forEach(([fileDelta, rankDelta]) => {
            const targetFile = king.file + fileDelta;
            const targetRank = king.rank + rankDelta;
            if (targetFile < 0n || targetFile > 7n || targetRank < 0n || targetRank > 7n) return;

            const target = king.bit << (rankDelta * 8n + fileDelta);
            if (evaluateLegal(board, king.bit, target)) moves.push([king.bit, target]);
        });
        // kingside (toward the h-file) increases file index, queenside decreases it.
        if ((board.castlingRights & 4) > 0 && evaluateLegal(board, king.bit, king.bit << 2n)) moves.push([king.bit, king.bit << 2n]);
        if ((board.castlingRights & 8) > 0 && evaluateLegal(board, king.bit, king.bit >> 2n)) moves.push([king.bit, king.bit >> 2n]);

        const queens = bitmaskToSquareArray(board.bQueens);
        queens.forEach(queen => {
            moves.push(...saveRepetitiveMovements(board, queen.bit, 1n, 0n));
            moves.push(...saveRepetitiveMovements(board, queen.bit, 0n, 1n));
            moves.push(...saveRepetitiveMovements(board, queen.bit, -1n, 0n));
            moves.push(...saveRepetitiveMovements(board, queen.bit, 0n, -1n));
            moves.push(...saveRepetitiveMovements(board, queen.bit, 1n, -1n));
            moves.push(...saveRepetitiveMovements(board, queen.bit, 1n, 1n));
            moves.push(...saveRepetitiveMovements(board, queen.bit, -1n, -1n));
            moves.push(...saveRepetitiveMovements(board, queen.bit, -1n, 1n));
        })
    }

    return moves;
}

// Only the king-safety half of evaluateLegal — the geometry/blocking check is
// skipped here since the caller (saveRepetitiveMovements) already walked the
// path itself and knows it's clear.
function leavesKingSafe(board: Board, start: bigint, finish: bigint): boolean {
    const newBoard = new Board(board.convertFen());
    newBoard.move(start, finish);
    return !checkDanger(newBoard, board.whiteToMove ? newBoard.wKing : newBoard.bKing, !board.whiteToMove);
}

function saveRepetitiveMovements(board: Board, start: bigint, fileShift: bigint, rankShift: bigint): bigint[][] {
    const moves: bigint[][] = [];

    let square = start;
    const delta = fileShift + rankShift * 8n;

    while (true) {

        const { file, rank } = toSquareInfo(square);
        if (fileShift > 0n && file === 7n) break;
        if (fileShift < 0n && file === 0n) break;
        if (rankShift > 0n && rank === 7n) break;
        if (rankShift < 0n && rank === 0n) break;

        square <<= delta;
        if (board.whiteToMove) {
            if (board.andWhite(square)) break;
            if (board.andBlack(square)) {
                if (leavesKingSafe(board, start, square)) moves.push([start, square]);
                break;
            }
            if (leavesKingSafe(board, start, square)) moves.push([start, square]);
        } else {
            if (board.andBlack(square)) break;
            if (board.andWhite(square)) {
                if (leavesKingSafe(board, start, square)) moves.push([start, square]);
                break;
            }
            if (leavesKingSafe(board, start, square)) moves.push([start, square]);
        }
    }

    return moves;
}