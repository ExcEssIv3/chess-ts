import { BLACK_PAWN_ATTACKERS, KING_ATTACKS, KNIGHT_ATTACKS, WHITE_PAWN_ATTACKERS } from "./attacks";
import { KING_OFFSETS, KNIGHT_OFFSETS } from "./attacks-generator";
import { Board } from "./board";
import { evaluateLegal } from "./legality";
import { bitmaskToSquareArray, bitToSquare, getFileFromSquare, getRankFromSquare, squareToBit, toSquareInfo } from "./utils";

export function checkDanger(board: Board, bit: bigint, whiteToMove: boolean): boolean {
    const square = bitToSquare(bit);
    const lookupSquare = Number(square);
    if (whiteToMove) {
        if ((board.wPawns & WHITE_PAWN_ATTACKERS[lookupSquare])) return true;
        if ((board.wKnights & KNIGHT_ATTACKS[lookupSquare])) return true;
        if ((board.wKing & KING_ATTACKS[lookupSquare])) return true;
    } else {
        if ((board.bPawns & BLACK_PAWN_ATTACKERS[lookupSquare])) return true;
        if ((board.bKnights & KNIGHT_ATTACKS[lookupSquare])) return true;
        if ((board.bKing & KING_ATTACKS[lookupSquare])) return true;
    }

    if (checkRookDanger(board, square, whiteToMove)) return true;
    if (checkBishopDanger(board, square, whiteToMove)) return true;
    if (checkQueenDanger(board, square, whiteToMove)) return true;

    return false;
}

export function checkRookDanger(board: Board, square: bigint, whiteToMove: boolean): boolean {
    const destinationBit = squareToBit(square);
    const file = getFileFromSquare(square);
    const rank = getRankFromSquare(square);
    const rooks = bitmaskToSquareArray(whiteToMove ? board.wRooks : board.bRooks);

    return rooks.some(rook => {
        // aligned on file or rank, but not both — "both" means the rook is
        // already sitting on the destination square, which isn't a real attack
        const sameFile = rook.file === file;
        const sameRank = rook.rank === rank;
        if (!((sameFile || sameRank) && !(sameFile && sameRank))) return false;

        let loc = rook.bit;
        if (sameFile) {
            const up = (rank - rook.rank) > 0;
            while (loc !== destinationBit) {
                loc <<= (up) ? 8n : -8n;
                // same color as the rook blocks even at the destination (nothing to
                // capture there); opposite color only blocks before the destination —
                // landing on it is the attack itself.
                if (whiteToMove ? board.andWhite(loc) : board.andBlack(loc)) return false;
                if ((whiteToMove ? board.andBlack(loc) : board.andWhite(loc)) && loc !== destinationBit) return false;
            }
        } else {
            const right = (file - rook.file) > 0;
            while (loc !== destinationBit) {
                loc <<= (right) ? 1n : -1n;
                if (whiteToMove ? board.andWhite(loc) : board.andBlack(loc)) return false;
                if ((whiteToMove ? board.andBlack(loc) : board.andWhite(loc)) && loc !== destinationBit) return false;
            }
        }
        return true;
    });
}

export function checkBishopDanger(board: Board, square: bigint, whiteToMove: boolean): boolean {
    const destinationBit = squareToBit(square);
    const file = getFileFromSquare(square);
    const rank = getRankFromSquare(square);
    const bishops = bitmaskToSquareArray(whiteToMove ? board.wBishops : board.bBishops);

    return bishops.some(bishop=> {
        if (file === bishop.file || rank === bishop.rank) return false;
        const fileDelta = file - bishop.file;
        const rankDelta = rank - bishop.rank;

        if (!(fileDelta === rankDelta || -fileDelta === rankDelta)) return false;

        let loc = bishop.bit;
        if (fileDelta > 0) {
            if (rankDelta > 0) {
                while (loc !== destinationBit) {
                    loc <<= 9n;
                    // same color as the bishop blocks even at the destination (nothing to
                    // capture there); opposite color only blocks before the destination —
                    // landing on it is the attack itself.
                    if (whiteToMove ? board.andWhite(loc) : board.andBlack(loc)) return false;
                    if ((whiteToMove ? board.andBlack(loc) : board.andWhite(loc)) && loc !== destinationBit) return false;
                }
            } else {
                while (loc !== destinationBit) {
                    loc >>= 7n;
                    // same color as the bishop blocks even at the destination (nothing to
                    // capture there); opposite color only blocks before the destination —
                    // landing on it is the attack itself.
                    if (whiteToMove ? board.andWhite(loc) : board.andBlack(loc)) return false;
                    if ((whiteToMove ? board.andBlack(loc) : board.andWhite(loc)) && loc !== destinationBit) return false;
                }
            }
        } else {
            if (rankDelta > 0) {
                while (loc !== destinationBit) {
                    loc <<= 7n;
                    // same color as the bishop blocks even at the destination (nothing to
                    // capture there); opposite color only blocks before the destination —
                    // landing on it is the attack itself.
                    if (whiteToMove ? board.andWhite(loc) : board.andBlack(loc)) return false;
                    if ((whiteToMove ? board.andBlack(loc) : board.andWhite(loc)) && loc !== destinationBit) return false;
                }
            } else {
                while (loc !== destinationBit) {
                    loc >>= 9n;
                    // same color as the bishop blocks even at the destination (nothing to
                    // capture there); opposite color only blocks before the destination —
                    // landing on it is the attack itself.
                    if (whiteToMove ? board.andWhite(loc) : board.andBlack(loc)) return false;
                    if ((whiteToMove ? board.andBlack(loc) : board.andWhite(loc)) && loc !== destinationBit) return false;
                }
            }
        }
        return true;
    });
}

export function checkQueenDanger(board: Board, square: bigint, whiteToMove: boolean): boolean {
    const destinationBit = squareToBit(square);
    const file = getFileFromSquare(square);
    const rank = getRankFromSquare(square);
    const queens = bitmaskToSquareArray(whiteToMove ? board.wQueens : board.bQueens);

    const straights = queens.some(queen => {
        // aligned on file or rank, but not both — "both" means the queen is
        // already sitting on the destination square, which isn't a real attack
        const sameFile = queen.file === file;
        const sameRank = queen.rank === rank;
        if (!((sameFile || sameRank) && !(sameFile && sameRank))) return false;

        let loc = queen.bit;
        if (sameFile) {
            const up = (rank - queen.rank) > 0;
            while (loc !== destinationBit) {
                loc <<= (up) ? 8n : -8n;
                // same color as the queen blocks even at the destination (nothing to
                // capture there); opposite color only blocks before the destination —
                // landing on it is the attack itself.
                if (whiteToMove ? board.andWhite(loc) : board.andBlack(loc)) return false;
                if ((whiteToMove ? board.andBlack(loc) : board.andWhite(loc)) && loc !== destinationBit) return false;
            }
        } else {
            const right = (file - queen.file) > 0;
            while (loc !== destinationBit) {
                loc <<= (right) ? 1n : -1n;
                if (whiteToMove ? board.andWhite(loc) : board.andBlack(loc)) return false;
                if ((whiteToMove ? board.andBlack(loc) : board.andWhite(loc)) && loc !== destinationBit) return false;
            }
        }
        return true;
    });

    if (straights) return straights;

    return queens.some(queen=> {
        if (file === queen.file || rank === queen.rank) return false;
        const fileDelta = file - queen.file;
        const rankDelta = rank - queen.rank;

        if (!(fileDelta === rankDelta || -fileDelta === rankDelta)) return false;

        let loc = queen.bit;
        if (fileDelta > 0) {
            if (rankDelta > 0) {
                while (loc !== destinationBit) {
                    loc <<= 9n;
                    // same color as the queen blocks even at the destination (nothing to
                    // capture there); opposite color only blocks before the destination —
                    // landing on it is the attack itself.
                    if (whiteToMove ? board.andWhite(loc) : board.andBlack(loc)) return false;
                    if ((whiteToMove ? board.andBlack(loc) : board.andWhite(loc)) && loc !== destinationBit) return false;
                }
            } else {
                while (loc !== destinationBit) {
                    loc >>= 7n;
                    // same color as the queen blocks even at the destination (nothing to
                    // capture there); opposite color only blocks before the destination —
                    // landing on it is the attack itself.
                    if (whiteToMove ? board.andWhite(loc) : board.andBlack(loc)) return false;
                    if ((whiteToMove ? board.andBlack(loc) : board.andWhite(loc)) && loc !== destinationBit) return false;
                }
            }
        } else {
            if (rankDelta > 0) {
                while (loc !== destinationBit) {
                    loc <<= 7n;
                    // same color as the queen blocks even at the destination (nothing to
                    // capture there); opposite color only blocks before the destination —
                    // landing on it is the attack itself.
                    if (whiteToMove ? board.andWhite(loc) : board.andBlack(loc)) return false;
                    if ((whiteToMove ? board.andBlack(loc) : board.andWhite(loc)) && loc !== destinationBit) return false;
                }
            } else {
                while (loc !== destinationBit) {
                    loc >>= 9n;
                    // same color as the queen blocks even at the destination (nothing to
                    // capture there); opposite color only blocks before the destination —
                    // landing on it is the attack itself.
                    if (whiteToMove ? board.andWhite(loc) : board.andBlack(loc)) return false;
                    if ((whiteToMove ? board.andBlack(loc) : board.andWhite(loc)) && loc !== destinationBit) return false;
                }
            }
        }
        return true;
    });
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