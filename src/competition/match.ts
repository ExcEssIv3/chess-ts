import type { TsEngineVersion } from "../worker/tsEngineProtocol";
import { START_FEN } from "../worker/protocol";
import { TsWorkerClient } from "./tsWorkerClient";
import { WorkerClient } from "./workerClient";

// Orchestration for the Engine Competition page — adapted from
// scripts/tournament.ts's playGame/runMatch (alternating colors each game,
// a maxPlies draw cap, win/loss/draw tallying), but async and driven through
// worker instances instead of calling TS engine modules directly. The WASM
// engine honors movetimeMs internally via Search.RunIterative, so a WASM
// competitor only needs one findBestMove(fen, movetimeMs) call per move; a
// TS-engine competitor (frozen snapshot or "latest") doesn't honor
// movetimeMs at all, so tsEngine.worker.ts replicates tournament.ts's
// external per-call iterative-deepening loop (pickMove) internally instead —
// either way, from here a competitor is just "something with findBestMove".

export type BuildId = "current" | "compare";

const WASM_BASE_PATH: Record<BuildId, string> = {
  current: "dotnet-engine",
  compare: "dotnet-engine-compare",
};

export type EngineRef = { kind: "wasm"; build: BuildId } | { kind: "ts"; version: TsEngineVersion };

export interface Competitor {
  label: string;
  engine: EngineRef;
  movetimeMs: number;
}

// What playGame actually needs from a competitor's worker — satisfied
// structurally by both WorkerClient (WASM) and TsWorkerClient (TS engine).
interface MoverClient {
  findBestMove(fen: string, movetimeMs: number): Promise<string>;
  terminate(): void;
}

async function createMoverClient(engine: EngineRef): Promise<MoverClient> {
  if (engine.kind === "wasm") {
    const client = new WorkerClient();
    await client.init(WASM_BASE_PATH[engine.build]);
    return client;
  }
  const client = new TsWorkerClient();
  await client.init(engine.version);
  return client;
}

export interface GameResult {
  status: "checkmate" | "stalemate" | "max-ply-draw" | "stopped";
  winner: "white" | "black" | null;
  plies: number;
  finalFen: string;
}

export interface MatchTally {
  aWins: number;
  bWins: number;
  draws: number;
}

function parseMove(move: string): { from: string; to: string; promotion?: string } {
  return { from: move.slice(0, 2), to: move.slice(2, 4), promotion: move.slice(4) || undefined };
}

function activeColor(fen: string): "w" | "b" {
  return fen.split(" ")[1] as "w" | "b";
}

// Holds one persistent worker per competitor plus a dedicated referee worker
// (always the current build, since it's the only one guaranteed to export
// GameStatus — see engine-cs/EngineInterop.cs) across a whole session of
// games, so a batch of N games doesn't pay the WASM-load cost N times.
export class MatchSession {
  private readonly referee: WorkerClient;
  private readonly workerA: MoverClient;
  private readonly workerB: MoverClient;
  private readonly a: Competitor;
  private readonly b: Competitor;

  private constructor(referee: WorkerClient, workerA: MoverClient, workerB: MoverClient, a: Competitor, b: Competitor) {
    this.referee = referee;
    this.workerA = workerA;
    this.workerB = workerB;
    this.a = a;
    this.b = b;
  }

  static async create(a: Competitor, b: Competitor): Promise<MatchSession> {
    const referee = new WorkerClient();
    const [, workerA, workerB] = await Promise.all([
      referee.init(WASM_BASE_PATH.current),
      createMoverClient(a.engine),
      createMoverClient(b.engine),
    ]);
    return new MatchSession(referee, workerA, workerB, a, b);
  }

  async playGame(
    aIsWhite: boolean,
    maxPlies: number,
    onMove?: (fen: string, ply: number) => void,
    shouldStop?: () => boolean
  ): Promise<GameResult> {
    const whiteWorker = aIsWhite ? this.workerA : this.workerB;
    const blackWorker = aIsWhite ? this.workerB : this.workerA;
    const whiteMovetimeMs = aIsWhite ? this.a.movetimeMs : this.b.movetimeMs;
    const blackMovetimeMs = aIsWhite ? this.b.movetimeMs : this.a.movetimeMs;

    let fen = START_FEN;
    let ply = 0;

    while (ply < maxPlies) {
      if (shouldStop?.()) return { status: "stopped", winner: null, plies: ply, finalFen: fen };

      const status = await this.referee.gameStatus(fen);
      if (status !== "ongoing") {
        const winner = status === "checkmate" ? (activeColor(fen) === "w" ? "black" : "white") : null;
        return { status, winner, plies: ply, finalFen: fen };
      }

      const isWhiteToMove = activeColor(fen) === "w";
      const mover = isWhiteToMove ? whiteWorker : blackWorker;
      const movetimeMs = isWhiteToMove ? whiteMovetimeMs : blackMovetimeMs;

      const move = await mover.findBestMove(fen, movetimeMs);
      const { from, to, promotion } = parseMove(move);
      fen = await this.referee.applyMove(fen, from, to, promotion);
      ply++;
      onMove?.(fen, ply);
    }

    return { status: "max-ply-draw", winner: null, plies: ply, finalFen: fen };
  }

  async runBatch(
    games: number,
    maxPlies: number,
    onGameDone?: (gameNumber: number, aIsWhite: boolean, result: GameResult) => void
  ): Promise<MatchTally> {
    const tally: MatchTally = { aWins: 0, bWins: 0, draws: 0 };

    for (let g = 0; g < games; g++) {
      const aIsWhite = g % 2 === 0;
      const result = await this.playGame(aIsWhite, maxPlies);

      if (result.winner === null) {
        tally.draws++;
      } else {
        const winnerIsA = (result.winner === "white") === aIsWhite;
        if (winnerIsA) tally.aWins++;
        else tally.bWins++;
      }

      onGameDone?.(g, aIsWhite, result);
    }

    return tally;
  }

  dispose(): void {
    this.referee.terminate();
    this.workerA.terminate();
    this.workerB.terminate();
  }
}
