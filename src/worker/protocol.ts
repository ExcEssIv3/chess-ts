// Shared message shapes between the main thread (src/main.ts) and the
// engine worker (src/worker/engine.worker.ts). Importing this file from both
// sides is what keeps their message shapes from drifting out of sync.
//
// Loosely modeled on UCI (position/go/bestmove/info) so this stays familiar
// if the engine is ever made to speak real UCI outside the browser.

export type Square = string; // e.g. "e2"

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export type EngineCommand =
  | { type: "init" }
  | { type: "newGame" }
  | { type: "userMove"; from: Square; to: Square; promotion?: string }
  | { type: "go"; depth?: number; movetimeMs?: number }
  | { type: "stop" };

export type EngineEvent =
  | { type: "ready" }
  | { type: "reset"; fen: string }
  | {
      type: "moveApplied";
      fen: string;
      from: Square;
      to: Square;
      promotion?: string;
      by: "user" | "engine";
    }
  | { type: "illegalMove"; from: Square; to: Square }
  | { type: "info"; depth: number; score: number; pv: string[] }
  | { type: "gameOver"; result: string }
  | { type: "error"; message: string };
