import type { CompetitionCommand, CompetitionEvent } from "./competitionProtocol";

// Generic engine worker for the Engine Competition feature — unlike
// src/worker/engine.worker.ts (one hardcoded WASM build, one game's worth of
// state), this worker is parameterized by wasmBasePath on `init` so it can
// load either the current build (public/dotnet-engine) or the comparison
// build (public/dotnet-engine-compare, see scripts/build-compare-engine.ts).
// It holds no game state of its own — src/competition/match.ts passes the
// FEN explicitly on every command — since a single worker instance may be
// asked about different games/positions across a batch run.
interface EngineCsExports {
  ApplyMove(fen: string, from: string, to: string, promotion: string | null): string;
  FindBestMove(startFen: string, moves: string, depth: number, movetimeMs: number): string;
  // Not actually guaranteed present — same caveat as FindBestMove's history
  // shape below: a comparison build predating this export will throw
  // "not a function" when called, caught by the supportsEval fallback.
  FindBestMoveWithEval(startFen: string, moves: string, depth: number, movetimeMs: number): string;
  GameStatus(startFen: string, moves: string): string;
}

// A comparison build's FindBestMove may actually be the pre-history shape
// (fen: string, depth: number, movetimeMs: number) — same export name, fewer
// params. TS can't express "call this the old way" against the typed
// interface above, so this narrow cast is exactly the pre-history signature,
// used only by the fallback path.
type LegacyFindBestMove = (fen: string, depth: number, movetimeMs: number) => string;

// "|"-delimited move list — matches EngineInterop.ReplayHistory's parsing.
function serializeMoves(moves: string[]): string {
  return moves.join("|");
}

const ILLEGAL_MOVE_MESSAGE = "Invalid move";

let enginePromise: Promise<EngineCsExports> | null = null;

// A comparison build (see scripts/build-compare-engine.ts) may predate the
// history-aware FindBestMove signature (startFen, moves, depth, movetimeMs)
// — older builds only have the original (fen, depth, movetimeMs). There's no
// way to introspect a loaded WASM module's exported signature directly, so
// this is detected by trying the new shape once and falling back to the old
// one if it throws, then remembered for the rest of this worker's lifetime
// (one worker instance = one competitor's build for the whole match/batch).
let supportsHistory: boolean | null = null;

// Same idea as supportsHistory, one tier up: a comparison build may support
// history-aware FindBestMove but predate FindBestMoveWithEval (added later,
// for the eval display on the Engine Competition page). Detected/remembered
// the same way — try the richer shape once, fall back if it throws.
let supportsEval: boolean | null = null;

// Parses "e2e4 36" / "e7e8q -14" (see EngineInterop.FindBestMoveWithEval) —
// splitting on the *last* space rather than the first in case a future move
// encoding ever contains one, though none does today.
function parseMoveWithEval(raw: string): { move: string; value: number } {
  const spaceIdx = raw.lastIndexOf(" ");
  return { move: raw.slice(0, spaceIdx), value: Number(raw.slice(spaceIdx + 1)) };
}

// A missing JSExport surfaces as a plain JS TypeError ("X is not a
// function") when the call is attempted — that's the only case that
// actually means "this build predates the newer API." Any other error
// (a bad argument type, a real search failure, etc.) must propagate instead
// of being silently reinterpreted as "old build" and routed into the
// mismatched-arity legacy fallback below, which expects different argument
// positions entirely.
function isMissingExportError(err: unknown): boolean {
  return err instanceof TypeError && /is not a function/.test(err.message);
}

async function resolveMove(
  engine: EngineCsExports,
  cmd: Extract<CompetitionCommand, { type: "findBestMove" }>
): Promise<{ move: string; value?: number }> {
  const legacyFindBestMove = engine.FindBestMove as unknown as LegacyFindBestMove;

  if (supportsEval !== false && supportsHistory !== false) {
    try {
      const raw = engine.FindBestMoveWithEval(cmd.startFen, serializeMoves(cmd.moves), 0, cmd.movetimeMs);
      supportsEval = true;
      supportsHistory = true;
      return parseMoveWithEval(raw);
    } catch (err) {
      if (!isMissingExportError(err)) throw err;
      supportsEval = false;
      // Fall through — this build might still support plain history-aware
      // FindBestMove even without the WithEval export.
    }
  }

  if (supportsHistory !== false) {
    try {
      const move = engine.FindBestMove(cmd.startFen, serializeMoves(cmd.moves), 0, cmd.movetimeMs);
      supportsHistory = true;
      return { move };
    } catch (err) {
      if (!isMissingExportError(err)) throw err;
      supportsHistory = false;
    }
  }

  return { move: legacyFindBestMove(cmd.fen, 0, cmd.movetimeMs) };
}

async function loadEngine(wasmBasePath: string): Promise<EngineCsExports> {
  const base = import.meta.env.BASE_URL;
  const dotnetJsUrl = `${base}${wasmBasePath}/_framework/dotnet.js`;
  const { dotnet } = await import(/* @vite-ignore */ dotnetJsUrl);
  const { getAssemblyExports, getConfig } = await dotnet.create();
  const config = getConfig();
  const exports = await getAssemblyExports(config.mainAssemblyName);
  return exports.EngineCs.EngineInterop as EngineCsExports;
}

// The client (src/competition/workerClient.ts) always sends `init` before
// any other command, so `enginePromise` is guaranteed set by the time these
// other cases run.
function getEngine(): Promise<EngineCsExports> {
  if (!enginePromise) throw new Error("Competition engine worker used before init");
  return enginePromise;
}

// addEventListener, not `self.onmessage = ...` — see engine.worker.ts for why
// (dotnet.create() needs the onmessage slot free during its own startup).
self.addEventListener("message", async (e: MessageEvent<CompetitionCommand>) => {
  const cmd = e.data;
  try {
    switch (cmd.type) {
      case "init": {
        enginePromise = loadEngine(cmd.wasmBasePath);
        await enginePromise;
        post({ type: "ready" });
        break;
      }

      case "findBestMove": {
        const engine = await getEngine();
        const { move, value } = await resolveMove(engine, cmd);
        post({ type: "bestMove", move, value });
        break;
      }

      case "applyMove": {
        const engine = await getEngine();
        try {
          const fen = engine.ApplyMove(cmd.fen, cmd.from, cmd.to, cmd.promotion ?? null);
          post({ type: "moveApplied", fen });
        } catch (err) {
          if (err instanceof Error && err.message.includes(ILLEGAL_MOVE_MESSAGE)) {
            post({ type: "illegalMove" });
          } else {
            throw err;
          }
        }
        break;
      }

      case "gameStatus": {
        const engine = await getEngine();
        const status = engine.GameStatus(cmd.startFen, serializeMoves(cmd.moves)) as
          | "ongoing"
          | "checkmate"
          | "stalemate"
          | "threefold-repetition";
        post({ type: "status", status });
        break;
      }
    }
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
});

function post(event: CompetitionEvent) {
  (self as unknown as Worker).postMessage(event);
}
