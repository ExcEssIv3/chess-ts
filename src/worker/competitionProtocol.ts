// Message shapes for src/worker/competitionEngine.worker.ts, used by the
// Engine Competition page (src/competition.ts, src/competition/). Kept
// separate from src/worker/protocol.ts (the interactive-play protocol) since
// this worker plays a different role: it's parameterized by which WASM build
// to load, and one instance is spun up per competitor/referee role in a
// match rather than one instance per game.

export type CompetitionCommand =
  | { type: "init"; wasmBasePath: string }
  | { type: "findBestMove"; fen: string; movetimeMs: number }
  | { type: "applyMove"; fen: string; from: string; to: string; promotion?: string }
  | { type: "gameStatus"; fen: string };

export type CompetitionEvent =
  | { type: "ready" }
  | { type: "bestMove"; move: string }
  | { type: "moveApplied"; fen: string }
  | { type: "illegalMove" }
  | { type: "status"; status: "ongoing" | "checkmate" | "stalemate" }
  | { type: "error"; message: string };
