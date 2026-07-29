// Message shapes for src/worker/tsEngine.worker.ts — a competitor backed by
// one of the frozen TypeScript engine snapshots (scripts/versions/v1..v4) or
// the "latest" live src/engine, for the Engine Competition page. Unlike
// competitionProtocol.ts's CompetitionCommand, there's no applyMove/
// gameStatus here: a TS-engine competitor is only ever asked for a move —
// the match referee (always the current WASM build, see
// src/competition/match.ts) applies it and checks game status, exactly like
// the WASM comparison-build competitor already works.

export type TsEngineVersion = "v1" | "v2" | "v3" | "v4" | "latest";

export type TsEngineCommand =
  | { type: "init"; version: TsEngineVersion }
  | { type: "findBestMove"; fen: string; movetimeMs: number };

export type TsEngineEvent =
  | { type: "ready" }
  // value is White-relative (positive = good for White), same convention as
  // EngineCs.EngineInterop.FindBestMoveWithEval — undefined for the frozen
  // v1..v4 snapshots, which predate SearchResult.value (see tsEngine.worker.ts).
  | { type: "bestMove"; move: string; value?: number }
  | { type: "error"; message: string };
