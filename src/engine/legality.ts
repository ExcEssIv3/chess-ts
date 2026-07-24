import { Board } from "./board";
import { checkDanger } from "./movegen";
import type { SquareInfo } from "./types";
import { toSquareInfo } from "./utils";

/** `start`/`finish` are bitmasks (a single set bit), not square indices — checked directly against board bitboards via `&`. 
 * evaluate king danger lets the function know if it needs to check if the move will put a king in danger, useful for when checking attacks
 * evaluate pawn attacks only will mark pawn advancement moves (non attack moves) as not legal, only checks the way pawns take
*/
export function evaluateLegal(board: Board, start: bigint, finish: bigint, whiteToMove?: boolean, evaluateKingDanger?: boolean, evaluatePawnAttacksOnly?: boolean): boolean {
    const startInfo = toSquareInfo(start);
    const finishInfo = toSquareInfo(finish);

    if (whiteToMove === undefined) whiteToMove = board.whiteToMove;

    let canMove = false;
    if (whiteToMove) {
        if (!board.andWhite(start)) return false;
        if (board.andWhite(finish)) return false;
        if ((board.wPawns & start) > 0) {
            canMove = evaluatePawnMove(board, true, startInfo, finishInfo, evaluatePawnAttacksOnly);
        } else if ((board.wRooks & start) > 0) {
            canMove = evaluateRookMove(board, true, startInfo, finishInfo);
        } else if ((board.wKnights & start) > 0) {
            canMove = evaluateKnightMove(startInfo, finishInfo);
        } else if ((board.wBishops & start) > 0) {
            canMove = evaluateBishopMove(board, true, startInfo, finishInfo);
        } else if ((board.wQueens & start) > 0) {
            canMove = evaluateQueenMove(board, true, startInfo, finishInfo);
        } else if ((board.wKing & start) > 0) {
            canMove = evaluateKingMove(board, true, startInfo, finishInfo);
        }
        if (canMove) {
            if (evaluateKingDanger !== undefined && evaluateKingDanger === false) return true;
            const newBoard = new Board(board.convertFen());
            newBoard.move(start, finish);
            return !checkDanger(newBoard, newBoard.wKing, false);
        }
    } else {
        if (!board.andBlack(start)) return false;
        if (board.andBlack(finish)) return false;
        if ((board.bPawns & start) > 0) {
            canMove = evaluatePawnMove(board, false, startInfo, finishInfo, evaluatePawnAttacksOnly);
        } else if ((board.bRooks & start) > 0) {
            canMove = evaluateRookMove(board, false, startInfo, finishInfo);
        } else if ((board.bKnights & start) > 0) {
            canMove = evaluateKnightMove(startInfo, finishInfo);
        } else if ((board.bBishops & start) > 0) {
            canMove = evaluateBishopMove(board, false, startInfo, finishInfo);
        } else if ((board.bQueens & start) > 0) {
            canMove = evaluateQueenMove(board, false, startInfo, finishInfo);
        } else if ((board.bKing & start) > 0) {
            canMove = evaluateKingMove(board, false, startInfo, finishInfo);
        }
        if (canMove) {
            if (evaluateKingDanger !== undefined && evaluateKingDanger === false) return true;
            const newBoard = new Board(board.convertFen());
            newBoard.move(start, finish);
            return !checkDanger(newBoard, newBoard.bKing, true);
        }
    }

    return false;
}

function evaluatePawnMove(board: Board, whiteToMove: boolean, start: SquareInfo, finish: SquareInfo, evaluatePawnAttacksOnly?: boolean): boolean {
    if (start.bit === finish.bit) return false;
    const fileDelta = Math.abs(Number(start.file - finish.file));
    if (fileDelta > 1) return false;
    if (whiteToMove) {
        const rankDelta = Number(finish.rank - start.rank);
        if (fileDelta === 1) {
            if (rankDelta !== 1) return false;
            if (evaluatePawnAttacksOnly) return true;
            if (board.enPassantSquare && board.enPassantSquare === Number(finish.square)) return true;
            return board.andBlack(finish.bit);
        } else if (evaluatePawnAttacksOnly) return false;
        if (board.andBlack(finish.bit)) return false;
        if (rankDelta < 1 || rankDelta > 2) return false;
        if (rankDelta === 2) {
            if (start.rank !== 1n) return false;
            if (board.andBlack(start.bit << 8n) || board.andWhite(start.bit << 8n)) return false;
            return true;
        }
        return true;
    }
    // black logic
    const rankDelta = Number(start.rank - finish.rank);
    if (fileDelta === 1) {
        if (rankDelta !== 1) return false;
        if (evaluatePawnAttacksOnly) return true;
        if (board.enPassantSquare && board.enPassantSquare === Number(finish.square)) return true;
        return board.andWhite(finish.bit);
    } else if (evaluatePawnAttacksOnly) return false;
    if (board.andWhite(finish.bit)) return false;
    if (rankDelta < 1 || rankDelta > 2) return false;
    if (rankDelta === 2) {
        if (start.rank !== 6n) return false;
        if (board.andBlack(start.bit >> 8n) || board.andWhite(start.bit >> 8n)) return false;
        return true;
    }
    return true;
}

function evaluateRookMove(board: Board, whiteToMove: boolean, start: SquareInfo, finish: SquareInfo): boolean {
    if (start.bit === finish.bit) return false;
    if (start.rank != finish.rank) {
        if (start.file != finish.file) return false;
        if (start.rank > finish.rank) {
            return evaluateRepetitiveMovement(board, whiteToMove, start, finish, 0n, -1n);
        } else {
            return evaluateRepetitiveMovement(board, whiteToMove, start, finish, 0n, 1n);
        }
    } else {
        if (start.file > finish.file) {
            return evaluateRepetitiveMovement(board, whiteToMove, start, finish, -1n, 0n);
        } else {
            return evaluateRepetitiveMovement(board, whiteToMove, start, finish, 1n, 0n);
        }
    }
}

function evaluateKnightMove(start: SquareInfo, finish: SquareInfo): boolean {
    if (start.bit === finish.bit) return false;
    if (Math.abs(Number(start.rank - finish.rank)) === 1) {
        if (Math.abs(Number(start.file - finish.file)) !== 2) return false;
    } else if (Math.abs(Number(start.file - finish.file)) === 1) {
        if (Math.abs(Number(start.rank - finish.rank)) !== 2) return false;
    } else {
        return false;
    }
    return true;
}

function evaluateBishopMove(board: Board, whiteToMove: boolean, start: SquareInfo, finish: SquareInfo): boolean {
    if (start.bit === finish.bit) return false;
    if (Math.abs(Number(start.rank - finish.rank)) !== Math.abs(Number(start.file - finish.file))) return false;
    if (start.rank > finish.rank) {
        if (start.file > finish.file) return evaluateRepetitiveMovement(board, whiteToMove, start, finish, -1n, -1n);
        return evaluateRepetitiveMovement(board, whiteToMove, start, finish, 1n, -1n);
    }
    if (start.file < finish.file) return evaluateRepetitiveMovement(board, whiteToMove, start, finish, 1n, 1n);
    return evaluateRepetitiveMovement(board, whiteToMove, start, finish, -1n, 1n);
}

function evaluateQueenMove(board: Board, whiteToMove: boolean, start: SquareInfo, finish: SquareInfo): boolean {
    if (start.bit === finish.bit) return false;
    if (start.rank !== finish.rank && start.file !== finish.file) return evaluateBishopMove(board, whiteToMove, start, finish);
    return evaluateRookMove(board, whiteToMove, start, finish);
}

function evaluateKingMove(board: Board, whiteToMove: boolean, start: SquareInfo, finish: SquareInfo): boolean {
    if (start.bit === finish.bit) return false;
    const rankDelta = Math.abs(Number(start.rank - finish.rank));
    const fileDelta = Math.abs(Number(start.file - finish.file));
    if (rankDelta > 1) return false;
    if (rankDelta === 1 && fileDelta > 1) return false;
    if (fileDelta > 2) return false;
    if (checkDanger(board, finish.bit, !whiteToMove)) return false;
    if (fileDelta === 2) {
        if (checkDanger(board, start.bit, !whiteToMove)) return false;
        if (whiteToMove) {
            if (start.file - finish.file < 0) {
                if (!((board.castlingRights & 1) > 0)) return false;
                if (checkDanger(board, start.bit << 1n, !whiteToMove)) return false;
            } else {
                if (!((board.castlingRights & 2) > 0)) return false;
                if (checkDanger(board, start.bit >> 1n, !whiteToMove)) return false;
            }
        } else {
            if (start.file - finish.file < 0) {
                if (!((board.castlingRights & 4) > 0)) return false;
                if (checkDanger(board, start.bit << 1n, !whiteToMove)) return false;
            } else {
                if (!((board.castlingRights & 8) > 0)) return false;
                if (checkDanger(board, start.bit >> 1n, !whiteToMove)) return false;
            }
        }
    }
    return true;
}

/** `fileShift`/`rankShift` are per-step direction deltas (-1n/0n/1n), not bits or squares. */
function evaluateRepetitiveMovement(board: Board, whiteToMove: boolean, start: SquareInfo, finish: SquareInfo, fileShift: bigint, rankShift: bigint): boolean {
    const upDirection: boolean = (finish.rank - start.rank) > 0n;
    const leftDirection: boolean = (finish.file - start.file) > 0n;

    if ((upDirection && rankShift < 0)
        || (!upDirection && rankShift > 0)
        || (leftDirection && fileShift < 0)
        || (!leftDirection && fileShift > 0)
    ) throw new Error("Invalid direction");

    let square = start.square; // walks as a square index, not a bitmask
    const delta = fileShift + rankShift * 8n;

    while (square !== finish.square) {
        square += delta;
        const current = 1n << square; // re-derived bitmask for this step, for board and* checks
        if (whiteToMove) {
            if (board.andWhite(current)) return false;
            if (square !== finish.square && board.andBlack(current)) return false;
        } else {
            if (board.andBlack(current)) return false;
            if (square !== finish.square && board.andWhite(current)) return false;
        }
    }

    return true;
}