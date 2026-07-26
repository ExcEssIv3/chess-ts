// Self-play harness: pits engine versions against each other. Each version
// is either a frozen snapshot under scripts/versions/<label>/ (extracted via
// `git archive <ref> -- src/engine`, self-contained — only sibling imports)
// or "latest", which imports the live src/engine directly.
//
// Versions are only compared through findBestMove(fen, options) => { move }
// — the one entrypoint whose signature has stayed stable across every
// commit in the roster, even though the internal search() signature hasn't
// (v1 takes no alpha/beta at all; v2 introduces it with the swap bug fixed
// in v3, etc). Game-state advancement and game-over detection always use
// the *latest* engine's Board/applyMove/movegen as the referee, since
// board.ts/legality.ts/movegen.ts's actual move rules haven't changed since
// v1 — only engine.ts (search/eval) and movegen.ts's ordering have.
//
// Time control: none of these versions honor movetimeMs internally (they
// only obey a fixed depth, and can't be interrupted mid-search), so "equal
// thinking time" is approximated at the harness level via iterative
// deepening between whole-depth calls — increase depth while the wall-clock
// budget remains, then play the best move from the last depth that
// finished in time. This makes newer, slower-per-node versions (e.g. PST)
// comparable to older, faster-per-node ones on equal footing instead of
// equal (and very unequal-effort) fixed depth.
//
// Run with: npm run tournament -- [gamesPerPairing] [budgetMs] [maxPlies]

import { performance } from "node:perf_hooks";
import { Board } from "../src/engine/board";
import { checkDanger, findLegalMoves } from "../src/engine/movegen";
import * as latest from "../src/engine";
import * as v1 from "./versions/v1-depth1-material/index";
import * as v2 from "./versions/v2-recursive-negamax/index";
import * as v3 from "./versions/v3-alphabeta-fixed/index";
import * as v4 from "./versions/v4-piece-square-tables/index";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

interface SearchOptions {
  depth?: number;
  movetimeMs?: number;
}

interface EngineModule {
  findBestMove(fen: string, options: SearchOptions): { move: string };
}

interface EngineVersion {
  label: string;
  module: EngineModule;
}

// Order oldest to newest — this is the roster requested: every commit that
// changed engine behavior, starting from the last state before recursive
// search was introduced.
const ROSTER: EngineVersion[] = [
  { label: "v1-depth1-material", module: v1 },
  { label: "v2-recursive-negamax", module: v2 },
  { label: "v3-alphabeta-fixed", module: v3 },
  { label: "v4-piece-square-tables", module: v4 },
  { label: "latest", module: latest },
];

// Safety valve: some versions (v1) ignore depth entirely, so iterative
// deepening would otherwise spin doing identical work until the time
// budget's spent for zero behavioral difference. Capping depth bounds that
// waste without affecting any version that actually uses depth meaningfully
// within a normal per-move budget.
const MAX_DEPTH = 8;

function parseMove(move: string): { from: string; to: string; promotion?: string } {
  return { from: move.slice(0, 2), to: move.slice(2, 4), promotion: move.slice(4) || undefined };
}

function activeColor(fen: string): "w" | "b" {
  return fen.split(" ")[1] as "w" | "b";
}

type GameStatus = "ongoing" | "checkmate" | "stalemate";

function gameStatus(fen: string): GameStatus {
  const board = new Board(fen);
  const moves = findLegalMoves(board);
  if (moves.length > 0) return "ongoing";
  const inCheck = checkDanger(board, board.whiteToMove ? board.wKing : board.bKing, board.whiteToMove);
  return inCheck ? "checkmate" : "stalemate";
}

function pickMove(engine: EngineModule, fen: string, budgetMs: number): { move: string; depthReached: number } {
  const start = performance.now();
  let result = engine.findBestMove(fen, { depth: 1, movetimeMs: budgetMs });
  let depth = 1;
  while (depth < MAX_DEPTH) {
    const elapsed = performance.now() - start;
    if (elapsed >= budgetMs) break;
    depth++;
    result = engine.findBestMove(fen, { depth, movetimeMs: budgetMs - elapsed });
  }
  return { move: result.move, depthReached: depth };
}

interface GameResult {
  result: "checkmate" | "stalemate" | "max-ply-draw";
  winner: "white" | "black" | null;
  plies: number;
}

function playGame(white: EngineVersion, black: EngineVersion, budgetMs: number, maxPlies: number): GameResult {
  let fen = START_FEN;
  let ply = 0;

  while (ply < maxPlies) {
    const status = gameStatus(fen);
    if (status !== "ongoing") {
      const winner = status === "checkmate" ? (activeColor(fen) === "w" ? "black" : "white") : null;
      return { result: status, winner, plies: ply };
    }

    const mover = activeColor(fen) === "w" ? white : black;
    const { move } = pickMove(mover.module, fen, budgetMs);
    const { from, to, promotion } = parseMove(move);
    fen = latest.applyMove(fen, from, to, promotion).fen;
    ply++;
  }

  return { result: "max-ply-draw", winner: null, plies: ply };
}

interface MatchTally {
  aWins: number;
  bWins: number;
  draws: number;
}

function runMatch(a: EngineVersion, b: EngineVersion, games: number, budgetMs: number, maxPlies: number): MatchTally {
  const tally: MatchTally = { aWins: 0, bWins: 0, draws: 0 };

  for (let g = 0; g < games; g++) {
    const aIsWhite = g % 2 === 0;
    const white = aIsWhite ? a : b;
    const black = aIsWhite ? b : a;
    const start = performance.now();
    const outcome = playGame(white, black, budgetMs, maxPlies);
    const elapsedS = ((performance.now() - start) / 1000).toFixed(1);

    let outcomeLabel: string;
    if (outcome.winner === null) {
      tally.draws++;
      outcomeLabel = `draw (${outcome.result})`;
    } else {
      const winnerIsA = (outcome.winner === "white") === aIsWhite;
      if (winnerIsA) tally.aWins++; else tally.bWins++;
      outcomeLabel = `${winnerIsA ? a.label : b.label} wins (${outcome.result})`;
    }

    console.log(
      `  game ${g + 1}/${games}: ${a.label} as ${aIsWhite ? "white" : "black"} — ` +
      `${outcomeLabel}, ${outcome.plies} plies, ${elapsedS}s`
    );
  }

  return tally;
}

function main() {
  const games = process.argv[2] ? parseInt(process.argv[2], 10) : 2;
  const budgetMs = process.argv[3] ? parseInt(process.argv[3], 10) : 1000;
  const maxPlies = process.argv[4] ? parseInt(process.argv[4], 10) : 150;

  console.log(`Roster: ${ROSTER.map((v) => v.label).join(", ")}`);
  console.log(`${games} games/pairing, ${budgetMs}ms/move budget, ${maxPlies}-ply draw cap\n`);

  for (let i = 0; i < ROSTER.length; i++) {
    for (let j = i + 1; j < ROSTER.length; j++) {
      const a = ROSTER[i];
      const b = ROSTER[j];
      console.log(`${a.label} vs ${b.label}:`);
      const tally = runMatch(a, b, games, budgetMs, maxPlies);
      console.log(`  => ${a.label} ${tally.aWins} - ${tally.bWins} ${b.label} (${tally.draws} draws)\n`);
    }
  }
}

main();
