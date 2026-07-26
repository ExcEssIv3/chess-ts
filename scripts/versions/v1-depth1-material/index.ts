// Placeholder engine API. Replace these with real move generation, legality
// checking, and search — everything here just throws so the UI <-> worker
// wiring can be verified before any chess logic exists.

import { Board } from "./board";
import { search } from "./engine";
import { evaluateLegal } from "./legality";
import { isPromotionPieceChar } from "./types";
import { algebraicToSquare, squareToBit } from "./utils";

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
  const fromBit = squareToBit(BigInt(algebraicToSquare(_from)));
  const toBit = squareToBit(BigInt(algebraicToSquare(_to)));
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
  return search(board, _options);
}
