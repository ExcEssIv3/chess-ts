// Placeholder engine API. Replace these with real move generation, legality
// checking, and search — everything here just throws so the UI <-> worker
// wiring can be verified before any chess logic exists.

import { Board } from "./board";
import { evaluateLegal } from "./legality";
import { findLegalMoves } from "./movegen";
import { isPromotionPieceChar, type PromotionPieceChar } from "./types";
import { algebraicToSquare, bitToSquare, getRankFromBit, squareToAlgebraic, squareToBit } from "./utils";

export class IllegalMoveError extends Error {}
export class NoLegalMovesError extends Error {}

export interface MoveResult {
  fen: string;
}

export function applyMove(
  _fen: string,
  _from: string,
  _to: string,
  _promotion?: string,
): MoveResult {
  if (_promotion !== undefined && !isPromotionPieceChar(_promotion)) {
    throw new IllegalMoveError("Invalid move");
  }

  const board: Board = new Board(_fen);
  const fromBit = squareToBit(algebraicToSquare(_from));
  const toBit = squareToBit(algebraicToSquare(_to));
  if (evaluateLegal(board, fromBit, toBit)) {
    board.move(fromBit, toBit, _promotion);
    return { fen: board.convertFen() };
  } else {
    throw new IllegalMoveError("Invalid move");
  }
}

export interface SearchOptions {
  depth?: number;
  movetimeMs?: number;
}

export interface SearchResult {
  move: string;
}

export function findBestMove(_fen: string, _options: SearchOptions): SearchResult {
  const board = new Board(_fen);
  const legalMoves = findLegalMoves(board);
  if (legalMoves.length === 0) {
    throw new NoLegalMovesError("No legal moves available");
  }
  const move = legalMoves[
    Math.floor(Math.random() * legalMoves.length)
  ];
  let promotion: PromotionPieceChar | undefined = undefined;
  if (board.whiteToMove) {
    if ((board.wPawns & move[0]) > 0n && getRankFromBit(move[1]) === 7n) {
      const promoteTo = Math.floor(Math.random() * 4);
      switch (promoteTo) {
        case 0:
          promotion = 'N';
          break;
        case 1:
          promotion = 'B';
          break;
        case 2:
          promotion = 'R';
          break;
        case 3:
          promotion = 'Q';
          break;
      }
    }
  } else {
    if ((board.bPawns & move[0]) > 0n && getRankFromBit(move[1]) === 0n) {
      const promoteTo = Math.floor(Math.random() * 4);
      switch (promoteTo) {
        case 0:
          promotion = 'n';
          break;
        case 1:
          promotion = 'b';
          break;
        case 2:
          promotion = 'r';
          break;
        case 3:
          promotion = 'q';
          break;
      }
    }
  }
  const from = squareToAlgebraic(Number(bitToSquare(move[0])));
  const to = squareToAlgebraic(Number(bitToSquare(move[1])));
  board.move(move[0], move[1], promotion);
  return {
    move: from + to + (promotion ?? "")
  }
}
