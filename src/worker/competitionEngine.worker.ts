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
  FindBestMove(fen: string, depth: number, movetimeMs: number): string;
  GameStatus(fen: string): string;
}

const ILLEGAL_MOVE_MESSAGE = "Invalid move";

let enginePromise: Promise<EngineCsExports> | null = null;

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
        const move = engine.FindBestMove(cmd.fen, 0, cmd.movetimeMs);
        post({ type: "bestMove", move });
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
        const status = engine.GameStatus(cmd.fen) as "ongoing" | "checkmate" | "stalemate";
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
