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

interface CaptureRanking {
    queenCapture: bigint[][],
    rookCapture: bigint[][],
    bishopCapture: bigint[][],
    knightCapture: bigint[][],
    pawnCapture: bigint[][],
    nothing: bigint[][]
}

function determineCaptureRank(
    board: Board,
    from: bigint,
    to: bigint,
    ranking: CaptureRanking,
    promotion: bigint = -1n
) {
    const move = (promotion > -1n) ? [from, to, promotion] : [from, to];
    if (board.whiteToMove) {
        if (board.andBlack(to)) {
            if ((board.bQueens & to) > 0) {
                ranking.queenCapture.push(move);
            } else if ((board.bRooks & to) > 0) {
                ranking.rookCapture.push(move);
            } else if ((board.bBishops & to) > 0) {
                ranking.bishopCapture.push(move);
            } else if ((board.bKnights & to) > 0) {
                ranking.knightCapture.push(move);
            } else if ((board.bPawns & to) > 0) {
                ranking.pawnCapture.push(move);
            } else {
                ranking.nothing.push(move);
            }
        } else {
            ranking.nothing.push(move);
        }
    } else {
        if (board.andWhite(to)) {
            if ((board.wQueens & to) > 0) {
                ranking.queenCapture.push(move);
            } else if ((board.wRooks & to) > 0) {
                ranking.rookCapture.push(move);
            } else if ((board.wBishops & to) > 0) {
                ranking.bishopCapture.push(move);
            } else if ((board.wKnights & to) > 0) {
                ranking.knightCapture.push(move);
            } else if ((board.wPawns & to) > 0) {
                ranking.pawnCapture.push(move);
            } else {
                ranking.nothing.push(move);
            }
        } else {
            ranking.nothing.push(move);
        }
    }
}

function repetitiveMovementCaptureRank(
    moves: bigint[][],
    board: Board,
    ranking: CaptureRanking
) {
    for (let i = 0; i < moves.length; i++) {
        // only the last step might take a piece
        if (i < moves.length - 1) {
            ranking.nothing.push(moves[i])
        } else {
            determineCaptureRank(board, moves[i][0], moves[i][1], ranking);
        }
    }
}

// A promoting pawn move (push or capture) is 4 distinct moves — one per
// promotion piece — not one arbitrary choice, since search needs to weigh
// them separately.
function pushPawnMove(
    board: Board,
    from: bigint,
    to: bigint,
    isPromotion: boolean,
    ranking: CaptureRanking
): void {
    if (isPromotion) {
        // ROOK
        determineCaptureRank(board, from, to, ranking, 0n);
        // KNIGHT
        determineCaptureRank(board, from, to, ranking, 1n);
        // BISHOP
        determineCaptureRank(board, from, to, ranking, 2n);
        // QUEEN
        determineCaptureRank(board, from, to, ranking, 3n);
    } else {
        determineCaptureRank(board, from, to, ranking);
    }
}

export function findLegalMoves(board: Board): bigint[][] {
    // want to know what big event a move causes for better ordering for pruning
    const ranking: CaptureRanking = {
        queenCapture: [],
        rookCapture: [],
        bishopCapture: [],
        knightCapture: [],
        pawnCapture: [],
        nothing: []
    }
    if (board.whiteToMove) {
        const pawns = bitmaskToSquareArray(board.wPawns);
        pawns.forEach(pawn => {
            if (evaluateLegal(board, pawn.bit, pawn.bit << 8n)) {
                pushPawnMove(board, pawn.bit, pawn.bit << 8n, pawn.rank === 6n, ranking);
            }
            if (pawn.rank === 1n) {
                if (evaluateLegal(board, pawn.bit, pawn.bit << 16n)) {
                    determineCaptureRank(board, pawn.bit, pawn.bit << 16n, ranking);
                }
            }
            if (pawn.file > 0) {
                if (evaluateLegal(board, pawn.bit, pawn.bit << 7n)) {
                    pushPawnMove(board, pawn.bit, pawn.bit << 7n, pawn.rank === 6n, ranking);
                }
            }
            if (pawn.file < 7) {
                if (evaluateLegal(board, pawn.bit, pawn.bit << 9n)) {
                    pushPawnMove(board, pawn.bit, pawn.bit << 9n, pawn.rank === 6n, ranking);
                }
            }
        });

        const rooks = bitmaskToSquareArray(board.wRooks);
        rooks.forEach(rook => {
            repetitiveMovementCaptureRank(saveRepetitiveMovements(board, rook.bit, 1n, 0n), board, ranking);
            repetitiveMovementCaptureRank(saveRepetitiveMovements(board, rook.bit, 0n, 1n), board, ranking);
            repetitiveMovementCaptureRank(saveRepetitiveMovements(board, rook.bit, -1n, 0n), board, ranking);
            repetitiveMovementCaptureRank(saveRepetitiveMovements(board, rook.bit, 0n, -1n), board, ranking);
        });

        const knights = bitmaskToSquareArray(board.wKnights);
        knights.forEach(knight => {
            KNIGHT_OFFSETS.forEach(([fileDelta, rankDelta]) => {
                const targetFile = knight.file + fileDelta;
                const targetRank = knight.rank + rankDelta;
                if (targetFile < 0n || targetFile > 7n || targetRank < 0n || targetRank > 7n) return;

                const target = knight.bit << (rankDelta * 8n + fileDelta);
                if (evaluateLegal(board, knight.bit, target)) determineCaptureRank(board, knight.bit, target, ranking);
            });
        });

        const bishops = bitmaskToSquareArray(board.wBishops);
        bishops.forEach(bishop => {
            repetitiveMovementCaptureRank(saveRepetitiveMovements(board, bishop.bit, 1n, -1n), board, ranking);
            repetitiveMovementCaptureRank(saveRepetitiveMovements(board, bishop.bit, 1n, 1n), board, ranking);
            repetitiveMovementCaptureRank(saveRepetitiveMovements(board, bishop.bit, -1n, -1n), board, ranking);
            repetitiveMovementCaptureRank(saveRepetitiveMovements(board, bishop.bit, -1n, 1n), board, ranking);
        })

        const king = toSquareInfo(board.wKing);
        KING_OFFSETS.forEach(([fileDelta, rankDelta]) => {
            const targetFile = king.file + fileDelta;
            const targetRank = king.rank + rankDelta;
            if (targetFile < 0n || targetFile > 7n || targetRank < 0n || targetRank > 7n) return;

            const target = king.bit << (rankDelta * 8n + fileDelta);
            if (evaluateLegal(board, king.bit, target)) determineCaptureRank(board, king.bit, target, ranking);
        });
        // kingside (toward the h-file) increases file index, queenside decreases it.
        if ((board.castlingRights & 1) > 0 && evaluateLegal(board, king.bit, king.bit << 2n)) determineCaptureRank(board, king.bit, king.bit << 2n, ranking);
        if ((board.castlingRights & 2) > 0 && evaluateLegal(board, king.bit, king.bit >> 2n)) determineCaptureRank(board, king.bit, king.bit >> 2n, ranking);

        const queens = bitmaskToSquareArray(board.wQueens);
        queens.forEach(queen => {
            repetitiveMovementCaptureRank(saveRepetitiveMovements(board, queen.bit, 1n, 0n), board, ranking);
            repetitiveMovementCaptureRank(saveRepetitiveMovements(board, queen.bit, 0n, 1n), board, ranking);
            repetitiveMovementCaptureRank(saveRepetitiveMovements(board, queen.bit, -1n, 0n), board, ranking);
            repetitiveMovementCaptureRank(saveRepetitiveMovements(board, queen.bit, 0n, -1n), board, ranking);
            repetitiveMovementCaptureRank(saveRepetitiveMovements(board, queen.bit, 1n, -1n), board, ranking);
            repetitiveMovementCaptureRank(saveRepetitiveMovements(board, queen.bit, 1n, 1n), board, ranking);
            repetitiveMovementCaptureRank(saveRepetitiveMovements(board, queen.bit, -1n, -1n), board, ranking);
            repetitiveMovementCaptureRank(saveRepetitiveMovements(board, queen.bit, -1n, 1n), board, ranking);
        })
    } else {
        const pawns = bitmaskToSquareArray(board.bPawns);
        pawns.forEach(pawn => {
            if (evaluateLegal(board, pawn.bit, pawn.bit >> 8n)) {
                pushPawnMove(board, pawn.bit, pawn.bit >> 8n, pawn.rank === 1n, ranking);
            }
            if (pawn.rank === 6n) {
                if (evaluateLegal(board, pawn.bit, pawn.bit >> 16n)) {
                    determineCaptureRank(board, pawn.bit, pawn.bit >> 16n, ranking);
                }
            }
            if (pawn.file > 0) {
                if (evaluateLegal(board, pawn.bit, pawn.bit >> 9n)) {
                    pushPawnMove(board, pawn.bit, pawn.bit >> 9n, pawn.rank === 1n, ranking);
                }
            }
            if (pawn.file < 7) {
                if (evaluateLegal(board, pawn.bit, pawn.bit >> 7n)) {
                    pushPawnMove(board, pawn.bit, pawn.bit >> 7n, pawn.rank === 1n, ranking);
                }
            }
        });

        const rooks = bitmaskToSquareArray(board.bRooks);
        rooks.forEach(rook => {
            repetitiveMovementCaptureRank(saveRepetitiveMovements(board, rook.bit, 1n, 0n), board, ranking);
            repetitiveMovementCaptureRank(saveRepetitiveMovements(board, rook.bit, 0n, 1n), board, ranking);
            repetitiveMovementCaptureRank(saveRepetitiveMovements(board, rook.bit, -1n, 0n), board, ranking);
            repetitiveMovementCaptureRank(saveRepetitiveMovements(board, rook.bit, 0n, -1n), board, ranking);
        });

        const knights = bitmaskToSquareArray(board.bKnights);
        knights.forEach(knight => {
            KNIGHT_OFFSETS.forEach(([fileDelta, rankDelta]) => {
                const targetFile = knight.file + fileDelta;
                const targetRank = knight.rank + rankDelta;
                if (targetFile < 0n || targetFile > 7n || targetRank < 0n || targetRank > 7n) return;

                const target = knight.bit << (rankDelta * 8n + fileDelta);
                if (evaluateLegal(board, knight.bit, target)) determineCaptureRank(board, knight.bit, target, ranking);
            });
        });

        const bishops = bitmaskToSquareArray(board.bBishops);
        bishops.forEach(bishop => {
            repetitiveMovementCaptureRank(saveRepetitiveMovements(board, bishop.bit, 1n, -1n), board, ranking);
            repetitiveMovementCaptureRank(saveRepetitiveMovements(board, bishop.bit, 1n, 1n), board, ranking);
            repetitiveMovementCaptureRank(saveRepetitiveMovements(board, bishop.bit, -1n, -1n), board, ranking);
            repetitiveMovementCaptureRank(saveRepetitiveMovements(board, bishop.bit, -1n, 1n), board, ranking);
        })

        const king = toSquareInfo(board.bKing);
        KING_OFFSETS.forEach(([fileDelta, rankDelta]) => {
            const targetFile = king.file + fileDelta;
            const targetRank = king.rank + rankDelta;
            if (targetFile < 0n || targetFile > 7n || targetRank < 0n || targetRank > 7n) return;

            const target = king.bit << (rankDelta * 8n + fileDelta);
            if (evaluateLegal(board, king.bit, target)) determineCaptureRank(board, king.bit, target, ranking);
        });
        // kingside (toward the h-file) increases file index, queenside decreases it.
        if ((board.castlingRights & 4) > 0 && evaluateLegal(board, king.bit, king.bit << 2n)) determineCaptureRank(board, king.bit, king.bit << 2n, ranking);
        if ((board.castlingRights & 8) > 0 && evaluateLegal(board, king.bit, king.bit >> 2n)) determineCaptureRank(board, king.bit, king.bit >> 2n, ranking);

        const queens = bitmaskToSquareArray(board.bQueens);
        queens.forEach(queen => {
            repetitiveMovementCaptureRank(saveRepetitiveMovements(board, queen.bit, 1n, 0n), board, ranking);
            repetitiveMovementCaptureRank(saveRepetitiveMovements(board, queen.bit, 0n, 1n), board, ranking);
            repetitiveMovementCaptureRank(saveRepetitiveMovements(board, queen.bit, -1n, 0n), board, ranking);
            repetitiveMovementCaptureRank(saveRepetitiveMovements(board, queen.bit, 0n, -1n), board, ranking);
            repetitiveMovementCaptureRank(saveRepetitiveMovements(board, queen.bit, 1n, -1n), board, ranking);
            repetitiveMovementCaptureRank(saveRepetitiveMovements(board, queen.bit, 1n, 1n), board, ranking);
            repetitiveMovementCaptureRank(saveRepetitiveMovements(board, queen.bit, -1n, -1n), board, ranking);
            repetitiveMovementCaptureRank(saveRepetitiveMovements(board, queen.bit, -1n, 1n), board, ranking);
        })
    }
    const moves: bigint[][] = [];
    moves.push(...ranking.queenCapture);
    moves.push(...ranking.rookCapture);
    moves.push(...ranking.bishopCapture);
    moves.push(...ranking.knightCapture);
    moves.push(...ranking.pawnCapture);
    moves.push(...ranking.nothing);

    return moves;
}

// Only the king-safety half of evaluateLegal — the geometry/blocking check is
// skipped here since the caller (saveRepetitiveMovements) already walked the
// path itself and knows it's clear.
function leavesKingSafe(board: Board, start: bigint, finish: bigint): boolean {
    const newBoard = board.clone();
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