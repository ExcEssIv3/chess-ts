import type { SearchOptions } from ".";
import type { Board } from "./board";
import { PIECE_VALUES } from "./evaluation";
import { checkDanger, findLegalMoves } from "./movegen";
import { BISHOP_MG, KING_MG, KNIGHT_MG, PAWN_MG, QUEEN_MG, ROOK_MG } from "./pieceSquareTables";
import { promotionCharFromCode } from "./utils";

export interface SearchEvaluation {
    move: bigint[] | null,
    value: number
}

// TODO: honor _searchOptions.depth/movetimeMs once search goes beyond depth 1.
export function search(board: Board, searchOptions: SearchOptions, alpha: number, beta: number): SearchEvaluation {
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
    if (searchOptions.depth) {
        let maxMoveValue = -Infinity;
        let bestMove: bigint[] | null = null;
        for (const move of legalMoves) {
            const searchBoard = board.clone();
            searchBoard.move(move[0], move[1], (move.length > 2) ? promotionCharFromCode(move[2], board.whiteToMove) : undefined);
            const searchEval = search(searchBoard, {
                    depth: searchOptions.depth - 1,
                    movetimeMs: searchOptions.movetimeMs,
                },
                -beta,
                -alpha
            );
            // negamax: searchEval.value is from the opponent's perspective
            // (searchBoard's mover), so flip it to score this move from ours.
            const evaluation = -searchEval.value;
            if (evaluation > maxMoveValue) {
                bestMove = move;
                maxMoveValue = evaluation;
            }
            if (maxMoveValue > alpha) alpha = maxMoveValue;
            if (alpha >= beta) return {
                move: bestMove,
                value: maxMoveValue
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
    const boardPositions = 
        board.wPawns
        + board.wRooks
        + board.wKnights
        + board.wBishops
        + board.wQueens
        + board.wKing
        + board.bPawns
        + board.bRooks
        + board.bKnights
        + board.bBishops
        + board.bQueens
        + board.bKing;

    const wPositions = 
        board.wPawns
        + board.wRooks
        + board.wKnights
        + board.wBishops
        + board.wQueens
        + board.wKing;
    
    const bPositions = 
        board.bPawns
        + board.bRooks
        + board.bKnights
        + board.bBishops
        + board.bQueens
        + board.bKing;

    let whiteTotal = 0;
    let blackTotal = 0;
    let numIndex = 0;
    for (let i = 0n; i < 64n; i++) {
        if (boardPositions === 0n) break;
        const loc = 1n << i;
        if ((wPositions & loc) > 0) {
            if ((board.wPawns & loc) > 0) {
                whiteTotal += PIECE_VALUES.P;
                whiteTotal += PAWN_MG[numIndex];
            } else if ((board.wRooks & loc) > 0) {
                whiteTotal += PIECE_VALUES.R;
                whiteTotal += ROOK_MG[numIndex];
            } else if ((board.wKnights & loc) > 0) {
                whiteTotal += PIECE_VALUES.N;
                whiteTotal += KNIGHT_MG[numIndex];
            } else if ((board.wBishops & loc) > 0) {
                whiteTotal += PIECE_VALUES.B;
                whiteTotal += BISHOP_MG[numIndex];
            } else if ((board.wQueens & loc) > 0) {
                whiteTotal += PIECE_VALUES.Q;
                whiteTotal += QUEEN_MG[numIndex];
            } else {
                whiteTotal += KING_MG[numIndex];
            }
        } else if ((bPositions & loc) > 0) {
            if ((board.bPawns & loc) > 0) {
                blackTotal += PIECE_VALUES.P;
                blackTotal += PAWN_MG[numIndex ^ 56];
            } else if ((board.bRooks & loc) > 0) {
                blackTotal += PIECE_VALUES.R;
                blackTotal += ROOK_MG[numIndex ^ 56];
            } else if ((board.bKnights & loc) > 0) {
                blackTotal += PIECE_VALUES.N;
                blackTotal += KNIGHT_MG[numIndex ^ 56];
            } else if ((board.bBishops & loc) > 0) {
                blackTotal += PIECE_VALUES.B;
                blackTotal += BISHOP_MG[numIndex ^ 56];
            } else if ((board.bQueens & loc) > 0) {
                blackTotal += PIECE_VALUES.Q;
                blackTotal += QUEEN_MG[numIndex ^ 56];
            } else {
                blackTotal += KING_MG[numIndex ^ 56];
            }
        }
        numIndex++;
    }

    return whiteTotal - blackTotal;
}