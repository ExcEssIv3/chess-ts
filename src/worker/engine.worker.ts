import type { EngineCommand, EngineEvent } from "./protocol";
import { START_FEN } from "./protocol";
import { Board } from "../engine/board";

// The engine itself now lives in engine-cs/ (C# compiled to WebAssembly) —
// see EngineInterop.cs for ApplyMove/FindBestMove, the exact analogues of
// src/engine/index.ts's applyMove/findBestMove. Board is still used here
// (TS, not WASM) purely to validate/normalize a pasted FEN in `setFen` —
// that's cheap, self-contained parsing that doesn't need the engine loaded.
interface EngineCsExports {
  ApplyMove(fen: string, from: string, to: string, promotion: string | null): string;
  FindBestMove(startFen: string, moves: string, depth: number, movetimeMs: number): string;
}

// Exceptions thrown by EngineInterop.cs cross the JS/WASM boundary as plain
// JS Errors — the original C# exception type (IllegalMoveError vs. some
// other failure) isn't preserved for an `instanceof` check on this side, so
// illegal moves are distinguished by message text instead, matching the
// exact string EngineInterop.cs's ApplyMove throws.
const ILLEGAL_MOVE_MESSAGE = "Invalid move";

let currentFen: string = START_FEN;
// FindBestMove needs the position replayed from a starting FEN + move list
// (see EngineInterop.ReplayHistory) rather than just the current FEN, so it
// can track repetition across the real game — gameStartFen/moveHistory are
// that pair, reset together whenever the game itself restarts (newGame) or
// the user pastes an arbitrary FEN (setFen, which is treated as a fresh
// start with no prior history, since there's no way to know what led there).
let gameStartFen: string = START_FEN;
let moveHistory: string[] = [];
let enginePromise: Promise<EngineCsExports> | null = null;

async function loadEngine(): Promise<EngineCsExports> {
  const base = import.meta.env.BASE_URL;
  const dotnetJsUrl = `${base}dotnet-engine/_framework/dotnet.js`;
  const { dotnet } = await import(/* @vite-ignore */ dotnetJsUrl);
  const { getAssemblyExports, getConfig } = await dotnet.create();
  const config = getConfig();
  const exports = await getAssemblyExports(config.mainAssemblyName);
  return exports.EngineCs.EngineInterop as EngineCsExports;
}

function getEngine(): Promise<EngineCsExports> {
  if (!enginePromise) enginePromise = loadEngine();
  return enginePromise;
}

// addEventListener, not `self.onmessage = ...` — the latter occupies the
// single onmessage property slot, which dotnet's WASM runtime also needs
// during dotnet.create() for internal thread-pool/startup coordination.
// Assigning onmessage before that call resolves silently stalls it forever;
// addEventListener registers an additional listener instead of claiming
// that slot, so it doesn't conflict.
self.addEventListener("message", async (e: MessageEvent<EngineCommand>) => {
  const cmd = e.data;
  try {
    const engine = await getEngine();
    switch (cmd.type) {
      case "init":
        post({ type: "ready" });
        break;

      case "newGame":
        currentFen = START_FEN;
        gameStartFen = START_FEN;
        moveHistory = [];
        post({ type: "reset", fen: currentFen });
        break;

      case "setFen":
        // round-trip through Board so a malformed FEN throws here (caught below)
        // rather than corrupting currentFen with something later calls can't parse.
        currentFen = new Board(cmd.fen).convertFen();
        gameStartFen = currentFen;
        moveHistory = [];
        post({ type: "reset", fen: currentFen });
        break;

      case "userMove": {
        try {
          currentFen = engine.ApplyMove(currentFen, cmd.from, cmd.to, cmd.promotion ?? null);
          moveHistory.push(cmd.from + cmd.to + (cmd.promotion ?? ""));
          post({
            type: "moveApplied",
            fen: currentFen,
            from: cmd.from,
            to: cmd.to,
            promotion: cmd.promotion,
            by: "user",
          });
        } catch (err) {
          if (err instanceof Error && err.message.includes(ILLEGAL_MOVE_MESSAGE)) {
            post({ type: "illegalMove", from: cmd.from, to: cmd.to });
          } else {
            throw err;
          }
        }
        break;
      }

      case "go": {
        const move = engine.FindBestMove(gameStartFen, moveHistory.join("|"), cmd.depth ?? 0, cmd.movetimeMs ?? 0);
        const [from, to, promotion] = [move.slice(0, 2), move.slice(2, 4), move.slice(4) || undefined];
        currentFen = engine.ApplyMove(currentFen, from, to, promotion ?? null);
        moveHistory.push(move);
        post({ type: "moveApplied", fen: currentFen, from, to, promotion, by: "engine" });
        break;
      }

      case "stop":
        // TODO(user): implement cancellation once search is iterative/async.
        break;
    }
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
});

function post(event: EngineEvent) {
  (self as unknown as Worker).postMessage(event);
}
