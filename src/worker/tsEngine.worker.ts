import type { TsEngineCommand, TsEngineEvent, TsEngineVersion } from "./tsEngineProtocol";

// Runs one of the frozen TS engine snapshots (scripts/versions/v1..v4) or the
// "latest" live src/engine as a competitor in the Engine Competition page.
// Only ever asked findBestMove — see tsEngineProtocol.ts's header comment for
// why applyMove/gameStatus aren't part of this worker's job.
interface EngineModule {
  findBestMove(fen: string, options: { depth?: number; movetimeMs?: number }): { move: string };
}

function loadModule(version: TsEngineVersion): Promise<EngineModule> {
  switch (version) {
    case "v1":
      return import("../../scripts/versions/v1-depth1-material/index");
    case "v2":
      return import("../../scripts/versions/v2-recursive-negamax/index");
    case "v3":
      return import("../../scripts/versions/v3-alphabeta-fixed/index");
    case "v4":
      return import("../../scripts/versions/v4-piece-square-tables/index");
    case "latest":
      return import("../engine/index");
  }
}

let modulePromise: Promise<EngineModule> | null = null;

// The client (src/competition/tsWorkerClient.ts) always sends `init` before
// `findBestMove`, so modulePromise is guaranteed set by the time this runs.
function getModule(): Promise<EngineModule> {
  if (!modulePromise) throw new Error("TS engine worker used before init");
  return modulePromise;
}

// Safety valve mirroring scripts/tournament.ts's MAX_DEPTH: v1 ignores depth
// entirely, so iterative deepening would otherwise spin doing identical work
// until the time budget's spent for zero behavioral difference.
const MAX_DEPTH = 8;

// None of these versions honor movetimeMs internally (they only obey a fixed
// depth, and can't be interrupted mid-search) — "equal thinking time" is
// approximated the same way scripts/tournament.ts's pickMove does: increase
// depth while the wall-clock budget remains, then play the best move from
// the last depth that finished in time.
function pickMove(engineModule: EngineModule, fen: string, movetimeMs: number): string {
  const start = performance.now();
  let result = engineModule.findBestMove(fen, { depth: 1, movetimeMs });
  let depth = 1;
  while (depth < MAX_DEPTH) {
    const elapsed = performance.now() - start;
    if (elapsed >= movetimeMs) break;
    depth++;
    result = engineModule.findBestMove(fen, { depth, movetimeMs: movetimeMs - elapsed });
  }
  return result.move;
}

self.addEventListener("message", async (e: MessageEvent<TsEngineCommand>) => {
  const cmd = e.data;
  try {
    switch (cmd.type) {
      case "init":
        modulePromise = loadModule(cmd.version);
        await modulePromise;
        post({ type: "ready" });
        break;

      case "findBestMove": {
        const engineModule = await getModule();
        const move = pickMove(engineModule, cmd.fen, cmd.movetimeMs);
        post({ type: "bestMove", move });
        break;
      }
    }
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
});

function post(event: TsEngineEvent) {
  (self as unknown as Worker).postMessage(event);
}
