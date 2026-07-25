// Throughput benchmark for the movegen/legality layer. Not a perft correctness
// check: promotions aren't expanded into per-piece moves here (findLegalMoves
// returns bare [from, to] pairs for a pawn reaching the last rank), so node
// counts will diverge from a real perft table. Run with `npm run bench [depth]`.

import { performance } from "node:perf_hooks";
import { Board } from "../src/engine/board";
import { findLegalMoves } from "../src/engine/movegen";
import { START_FEN } from "../src/worker/protocol";

function perft(board: Board, depth: number): number {
  if (depth === 0) return 1;
  const moves = findLegalMoves(board);
  if (depth === 1) return moves.length;

  let nodes = 0;
  for (const [from, to] of moves) {
    const next = new Board(board.convertFen());
    next.move(from, to);
    nodes += perft(next, depth - 1);
  }
  return nodes;
}

const depth = process.argv[2] ? parseInt(process.argv[2], 10) : 3;

console.log(`perft(${depth}) from startpos`);
// Warm up the JIT before the timed run so we're not measuring cold-start cost.
perft(new Board(START_FEN), Math.min(depth, 2));

const start = performance.now();
const nodes = perft(new Board(START_FEN), depth);
const elapsedMs = performance.now() - start;

console.log(`nodes=${nodes}`);
console.log(`time=${elapsedMs.toFixed(2)}ms`);
console.log(`nps=${Math.round(nodes / (elapsedMs / 1000)).toLocaleString()}`);
