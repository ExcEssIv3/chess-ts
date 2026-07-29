import type { TsEngineVersion } from "../worker/tsEngineProtocol";
import { START_FEN } from "../worker/protocol";
import type { Opening } from "./openings";
import { computeBudgetMs } from "./timeManagement";
import { TsWorkerClient } from "./tsWorkerClient";
import { WorkerClient } from "./workerClient";

// Orchestration for the Engine Competition page — adapted from
// scripts/tournament.ts's playGame/runMatch (alternating colors each game,
// a real chess clock per side, win/loss/draw tallying), but async and driven
// through worker instances instead of calling TS engine modules directly.
// Each competitor's clock (see ClockConfig) is tracked here, not inside the
// engine — every move's think-time budget is computed from the mover's
// remaining clock via computeBudgetMs, and the clock is debited by the
// *actual* wall-clock time the move took, mirroring a real chess clock
// (running out mid-move is a loss on time, not a draw). The WASM engine
// honors that per-move movetimeMs internally via Search.RunIterative, so a
// WASM competitor only needs one findBestMove call per move; a TS-engine
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
//
// PLY_SAFETY_CAP below is a last-resort circuit breaker, not a real draw
// rule: a generous enough increment (>= the per-move time floor in
// computeBudgetMs) can in principle let a side's clock never run down to
// zero, so this bounds how long a single game can run even in that
// pathological case. Threefold repetition (a real rule, checked every ply
// above) is expected to end any actual shuffling game long before this cap
// is reached.

// "current" is the live build (public/dotnet-engine/); any other string is a
// label naming an additional build produced by
// `npm run build:compare-engine -- <ref> <label>` (public/dotnet-engine-<label>/)
// — there's no fixed limit on how many labeled comparison builds can coexist.
export type BuildId = "current" | string;

function wasmBasePathFor(build: BuildId): string {
  return build === "current" ? "dotnet-engine" : `dotnet-engine-${build}`;
}

export type EngineRef = { kind: "wasm"; build: BuildId } | { kind: "ts"; version: TsEngineVersion };

export interface ClockConfig {
  startMs: number;
  incrementMs: number;
}

export interface Competitor {
  label: string;
  engine: EngineRef;
  clock: ClockConfig;
}

const PLY_SAFETY_CAP = 1000;

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
  startFen: string,
  movetimeMs: number
): Promise<{ move: string; value?: number }> {
  if (worker.kind === "wasm") return worker.client.findBestMove(fen, startFen, moves, movetimeMs);
  return worker.client.findBestMove(fen, movetimeMs);
}

export interface GameResult {
  status: "checkmate" | "stalemate" | "threefold-repetition" | "time-forfeit" | "ply-safety-cap" | "stopped";
  winner: "white" | "black" | null;
  plies: number;
  finalFen: string;
}

export interface MatchTally {
  aWins: number;
  bWins: number;
  draws: number;
}

export interface ClockSnapshot {
  whiteMs: number;
  blackMs: number;
}

type OnMove = (fen: string, ply: number, evalValue: number | undefined, clocks: ClockSnapshot) => void;

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

  // Replays each opening's book moves through the referee (real WASM
  // applyMove) to get a guaranteed-legal starting FEN for each one — see
  // openings.ts for why these are stored as move sequences rather than raw
  // FEN strings. Meant to be called once per session (openings are static),
  // not once per game — playGame/runBatch just take the resulting FEN.
  async resolveOpeningBook(openings: Opening[]): Promise<Array<{ opening: Opening; fen: string }>> {
    const resolved: Array<{ opening: Opening; fen: string }> = [];
    for (const opening of openings) {
      let fen = START_FEN;
      for (const move of opening.moves) {
        const { from, to, promotion } = parseMove(move);
        fen = await this.referee.applyMove(fen, from, to, promotion);
      }
      resolved.push({ opening, fen });
    }
    return resolved;
  }

  async playGame(
    aIsWhite: boolean,
    startFen: string = START_FEN,
    onMove?: OnMove,
    shouldStop?: () => boolean
  ): Promise<GameResult> {
    const whiteWorker = aIsWhite ? this.workerA : this.workerB;
    const blackWorker = aIsWhite ? this.workerB : this.workerA;
    const whiteClock = aIsWhite ? this.a.clock : this.b.clock;
    const blackClock = aIsWhite ? this.b.clock : this.a.clock;

    let fen = startFen;
    const moves: string[] = [];
    let ply = 0;
    let whiteRemainingMs = whiteClock.startMs;
    let blackRemainingMs = blackClock.startMs;

    while (ply < PLY_SAFETY_CAP) {
      if (shouldStop?.()) return { status: "stopped", winner: null, plies: ply, finalFen: fen };

      const status = await this.referee.gameStatus(startFen, moves);
      if (status !== "ongoing") {
        const winner = status === "checkmate" ? (activeColor(fen) === "w" ? "black" : "white") : null;
        return { status, winner, plies: ply, finalFen: fen };
      }

      const isWhiteToMove = activeColor(fen) === "w";
      const mover = isWhiteToMove ? whiteWorker : blackWorker;
      const remainingMs = isWhiteToMove ? whiteRemainingMs : blackRemainingMs;
      const incrementMs = isWhiteToMove ? whiteClock.incrementMs : blackClock.incrementMs;
      const movetimeMs = computeBudgetMs(remainingMs, incrementMs);

      const moveStart = Date.now();
      const { move, value } = await findBestMove(mover, moves, fen, startFen, movetimeMs);
      const remainingAfterThink = remainingMs - (Date.now() - moveStart);

      if (remainingAfterThink <= 0) {
        const winner = isWhiteToMove ? "black" : "white";
        return { status: "time-forfeit", winner, plies: ply, finalFen: fen };
      }
      // Increment is only credited once the move completes within time,
      // same as a real chess clock.
      if (isWhiteToMove) whiteRemainingMs = remainingAfterThink + incrementMs;
      else blackRemainingMs = remainingAfterThink + incrementMs;

      const { from, to, promotion } = parseMove(move);
      fen = await this.referee.applyMove(fen, from, to, promotion);
      moves.push(move);
      ply++;
      onMove?.(fen, ply, value, { whiteMs: whiteRemainingMs, blackMs: blackRemainingMs });
    }

    return { status: "ply-safety-cap", winner: null, plies: ply, finalFen: fen };
  }

  async runBatch(
    games: number,
    onGameDone?: (gameNumber: number, aIsWhite: boolean, result: GameResult) => void,
    onMove?: OnMove,
    pickStartFen?: () => string
  ): Promise<MatchTally> {
    const tally: MatchTally = { aWins: 0, bWins: 0, draws: 0 };

    for (let g = 0; g < games; g++) {
      const aIsWhite = g % 2 === 0;
      const startFen = pickStartFen ? pickStartFen() : START_FEN;
      const result = await this.playGame(aIsWhite, startFen, onMove);

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
