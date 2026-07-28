import type { TsEngineVersion } from "../worker/tsEngineProtocol";
import { START_FEN } from "../worker/protocol";
import { TsWorkerClient } from "./tsWorkerClient";
import { WorkerClient } from "./workerClient";

// Orchestration for the Engine Competition page — adapted from
// scripts/tournament.ts's playGame/runMatch (alternating colors each game,
// a maxPlies draw cap, win/loss/draw tallying), but async and driven through
// worker instances instead of calling TS engine modules directly. The WASM
// engine honors movetimeMs internally via Search.RunIterative, so a WASM
// competitor only needs one findBestMove call per move; a TS-engine
// competitor (frozen snapshot or "latest") doesn't honor movetimeMs at all,
// so tsEngine.worker.ts replicates tournament.ts's external per-call
// iterative-deepening loop (pickMove) internally instead.
//
// WASM competitors and the referee are also repetition-aware: they take the
// game's full move history (replayed via EngineInterop.ReplayHistory, see
// engine-cs/EngineInterop.cs) rather than just the current FEN, so a
// threefold repetition is recognized both by search (scored as a draw) and
// by the referee (an actual game-ending status). TS competitors stay
// history-naive/frozen, matching their "reference only" status — they're
// only ever asked for a move given the current FEN, same as before.

// "current" is the live build (public/dotnet-engine/); any other string is a
// label naming an additional build produced by
// `npm run build:compare-engine -- <ref> <label>` (public/dotnet-engine-<label>/)
// — there's no fixed limit on how many labeled comparison builds can coexist.
export type BuildId = "current" | string;

function wasmBasePathFor(build: BuildId): string {
  return build === "current" ? "dotnet-engine" : `dotnet-engine-${build}`;
}

export type EngineRef = { kind: "wasm"; build: BuildId } | { kind: "ts"; version: TsEngineVersion };

export interface Competitor {
  label: string;
  engine: EngineRef;
  movetimeMs: number;
}

// WASM and TS competitors genuinely need different inputs to choose a move
// (full history vs. just the current FEN) — rather than force a fake-uniform
// interface, this tags which shape a given competitor's worker expects.
type CompetitorWorker =
  | { kind: "wasm"; client: WorkerClient }
  | { kind: "ts"; client: TsWorkerClient };

async function createCompetitorWorker(engine: EngineRef): Promise<CompetitorWorker> {
  if (engine.kind === "wasm") {
    const client = new WorkerClient();
    await client.init(wasmBasePathFor(engine.build));
    return { kind: "wasm", client };
  }
  const client = new TsWorkerClient();
  await client.init(engine.version);
  return { kind: "ts", client };
}

async function findBestMove(
  worker: CompetitorWorker,
  moves: string[],
  fen: string,
  movetimeMs: number
): Promise<string> {
  if (worker.kind === "wasm") return worker.client.findBestMove(fen, START_FEN, moves, movetimeMs);
  return worker.client.findBestMove(fen, movetimeMs);
}

export interface GameResult {
  status: "checkmate" | "stalemate" | "threefold-repetition" | "max-ply-draw" | "stopped";
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
  private readonly workerA: CompetitorWorker;
  private readonly workerB: CompetitorWorker;
  private readonly a: Competitor;
  private readonly b: Competitor;

  private constructor(referee: WorkerClient, workerA: CompetitorWorker, workerB: CompetitorWorker, a: Competitor, b: Competitor) {
    this.referee = referee;
    this.workerA = workerA;
    this.workerB = workerB;
    this.a = a;
    this.b = b;
  }

  static async create(a: Competitor, b: Competitor): Promise<MatchSession> {
    const referee = new WorkerClient();
    const [, workerA, workerB] = await Promise.all([
      referee.init(wasmBasePathFor("current")),
      createCompetitorWorker(a.engine),
      createCompetitorWorker(b.engine),
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
    const moves: string[] = [];
    let ply = 0;

    while (ply < maxPlies) {
      if (shouldStop?.()) return { status: "stopped", winner: null, plies: ply, finalFen: fen };

      const status = await this.referee.gameStatus(START_FEN, moves);
      if (status !== "ongoing") {
        const winner = status === "checkmate" ? (activeColor(fen) === "w" ? "black" : "white") : null;
        return { status, winner, plies: ply, finalFen: fen };
      }

      const isWhiteToMove = activeColor(fen) === "w";
      const mover = isWhiteToMove ? whiteWorker : blackWorker;
      const movetimeMs = isWhiteToMove ? whiteMovetimeMs : blackMovetimeMs;

      const move = await findBestMove(mover, moves, fen, movetimeMs);
      const { from, to, promotion } = parseMove(move);
      fen = await this.referee.applyMove(fen, from, to, promotion);
      moves.push(move);
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
    this.workerA.client.terminate();
    this.workerB.client.terminate();
  }
}
