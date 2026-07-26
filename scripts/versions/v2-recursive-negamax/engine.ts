import type { SearchOptions } from ".";
import type { Board } from "./board";
import { PIECE_VALUES } from "./evaluation";
import { checkDanger, findLegalMoves } from "./movegen";
import { promotionCharFromCode } from "./utils";

export interface SearchEvaluation {
    move: bigint[] | null,
    value: number
}

// TODO: honor _searchOptions.depth/movetimeMs once search goes beyond depth 1.
export function search(board: Board, _searchOptions: SearchOptions): SearchEvaluation {
    const legalMoves = findLegalMoves(board);

    if (legalMoves.length === 0) {
        if (checkDanger(board, board.whiteToMove ? board.wKing : board.bKing, board.whiteToMove)) {
            return {
                move: [],
                value: -10000
            };
        } else return {
            move: [],
            value: 0
        };
    }
    if (_searchOptions.depth) {
        let maxMoveValue = -Infinity;
        let bestMove: bigint[] | null = null;
        for (const move of legalMoves) {
            const searchBoard = board.clone();
            searchBoard.move(move[0], move[1], (move.length > 2) ? promotionCharFromCode(move[2], board.whiteToMove) : undefined);
            const searchEval = search(searchBoard, {
                depth: _searchOptions.depth - 1,
                movetimeMs: _searchOptions.movetimeMs
            });
            // negamax: searchEval.value is from the opponent's perspective
            // (searchBoard's mover), so flip it to score this move from ours.
            const evaluation = -searchEval.value;
            if (evaluation > maxMoveValue) {
                bestMove = move;
                maxMoveValue = evaluation;
            }
        }

        return {
            move: bestMove,
            value: maxMoveValue
        };
    }
    // evaluatePosition is always white-minus-black; flip perspective so
    // "higher is better for whoever's actually moving" holds for both sides.
    const perspective = board.whiteToMove ? 1 : -1;

    // TODO: figure out what to do for stalemate / checkmate
    let maxMoveValue = -Infinity;
    let bestMove: bigint[] | null = null;
    for (const move of legalMoves) {
        const newBoard = board.clone();
        const promotion = move.length === 3 ? promotionCharFromCode(move[2], board.whiteToMove) : undefined;
        newBoard.move(move[0], move[1], promotion);
        const evaluation = evaluatePosition(newBoard) * perspective;
        if (evaluation > maxMoveValue) {
            maxMoveValue = evaluation;
            bestMove = move;
        }
    }

    return {
        move: bestMove,
        value: maxMoveValue
    }
}

// returns difference between black pieces and white pieces. negative is black
export function evaluatePosition(board: Board): number {
    // EXCLUDING KINGS: POSITIONS SHOULD ALWAYS HAVE KINGS
    const boardPositions = 
        board.wPawns
        + board.wRooks
        + board.wKnights
        + board.wBishops
        + board.wQueens
        + board.bPawns
        + board.bRooks
        + board.bKnights
        + board.bBishops
        + board.bQueens;

    const wPositions = 
        board.wPawns
        + board.wRooks
        + board.wKnights
        + board.wBishops
        + board.wQueens;
    
    const bPositions = 
        board.bPawns
        + board.bRooks
        + board.bKnights
        + board.bBishops
        + board.bQueens;

    let whiteTotal = 0;
    let blackTotal = 0;
    for (let i = 0n; i < 64n; i++) {
        if (boardPositions === 0n) break;
        const loc = 1n << i;
        if ((wPositions & loc) > 0) {
            if ((board.wPawns & loc) > 0) {
                whiteTotal += PIECE_VALUES.P;
            } else if ((board.wRooks & loc) > 0) {
                whiteTotal += PIECE_VALUES.R;
            } else if ((board.wKnights & loc) > 0) {
                whiteTotal += PIECE_VALUES.N;
            } else if ((board.wBishops & loc) > 0) {
                whiteTotal += PIECE_VALUES.B;
            } else {
                whiteTotal += PIECE_VALUES.Q;
            }
        } else if ((bPositions & loc) > 0) {
            if ((board.bPawns & loc) > 0) {
                blackTotal += PIECE_VALUES.P;
            } else if ((board.bRooks & loc) > 0) {
                blackTotal += PIECE_VALUES.R;
            } else if ((board.bKnights & loc) > 0) {
                blackTotal += PIECE_VALUES.N;
            } else if ((board.bBishops & loc) > 0) {
                blackTotal += PIECE_VALUES.B;
            } else {
                blackTotal += PIECE_VALUES.Q;
            }
        }
    }

    return whiteTotal - blackTotal;
}