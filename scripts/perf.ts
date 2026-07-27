// Tracked performance benchmark: runs a fixed suite (perft + full search),
// appends the result to scripts/perf-log.jsonl (one JSON object per line,
// git-committed so history survives across sessions), and diffs against the
// previous entry so a regression/improvement is visible without having to
// go re-run an old benchmark by hand. Run with `npm run perf`.
//
// Not a correctness check (see scripts/bench.ts for perft node counts) —
// purely wall-clock/nps tracking.

import { execSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { Board } from "../src/engine/board";
import { search } from "../src/engine/engine";
import { findLegalMoves } from "../src/engine/movegen";
import { START_FEN } from "../src/worker/protocol";

const LOG_PATH = fileURLToPath(new URL("./perf-log.jsonl", import.meta.url));

interface PerfRecord {
  timestamp: string;
  commit: string;
  dirty: boolean;
  perftDepth: number;
  perftNps: number;
  searchDepth: number;
  searchTrials: number;
  searchAvgMs: number;
  searchMinMs: number;
  searchMaxMs: number;
}

function perft(board: Board, depth: number): number {
  if (depth === 0) return 1;
  const moves = findLegalMoves(board);
  if (depth === 1) return moves.length;

  let nodes = 0;
  for (const [from, to] of moves) {
    const next = board.clone();
    next.move(from, to);
    nodes += perft(next, depth - 1);
  }
  return nodes;
}

function benchPerft(depth: number): number {
  perft(new Board(START_FEN), Math.min(depth, 2)); // JIT warmup
  const start = performance.now();
  const nodes = perft(new Board(START_FEN), depth);
  const elapsedMs = performance.now() - start;
  return nodes / (elapsedMs / 1000);
}

function benchSearch(depth: number, trials: number): number[] {
  // JIT warmup
  search(new Board(START_FEN), { depth: Math.min(depth, 2), movetimeMs: 0 }, -Infinity, Infinity);

  const times: number[] = [];
  for (let i = 0; i < trials; i++) {
    const board = new Board(START_FEN);
    const start = performance.now();
    search(board, { depth, movetimeMs: 0 }, -Infinity, Infinity);
    times.push(performance.now() - start);
  }
  return times;
}

function gitInfo(): { commit: string; dirty: boolean } {
  try {
    const commit = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
    const status = execSync("git status --porcelain", { encoding: "utf-8" });
    return { commit, dirty: status.trim().length > 0 };
  } catch {
    return { commit: "unknown", dirty: false };
  }
}

function loadLastRecord(): PerfRecord | null {
  if (!existsSync(LOG_PATH)) return null;
  const lines = readFileSync(LOG_PATH, "utf-8").trim().split("\n").filter(Boolean);
  if (lines.length === 0) return null;
  return JSON.parse(lines[lines.length - 1]);
}

function pctChange(before: number, after: number): string {
  const pct = ((after - before) / before) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

const perftDepth = process.argv[2] ? parseInt(process.argv[2], 10) : 4;
const searchDepth = process.argv[3] ? parseInt(process.argv[3], 10) : 4;
const searchTrials = process.argv[4] ? parseInt(process.argv[4], 10) : 5;

console.log(`Running perf suite: perft(${perftDepth}), search(${searchDepth}) x${searchTrials} trials...`);

const perftNps = benchPerft(perftDepth);
const searchTimes = benchSearch(searchDepth, searchTrials);
const searchAvgMs = searchTimes.reduce((a, b) => a + b, 0) / searchTimes.length;
const searchMinMs = Math.min(...searchTimes);
const searchMaxMs = Math.max(...searchTimes);

const { commit, dirty } = gitInfo();
const record: PerfRecord = {
  timestamp: new Date().toISOString(),
  commit,
  dirty,
  perftDepth,
  perftNps,
  searchDepth,
  searchTrials,
  searchAvgMs,
  searchMinMs,
  searchMaxMs,
};

const previous = loadLastRecord();

console.log(`\ncommit: ${commit}${dirty ? " (dirty)" : ""}`);
console.log(`perft(${perftDepth}): ${Math.round(perftNps).toLocaleString()} nps`);
console.log(`search(${searchDepth}) avg: ${searchAvgMs.toFixed(1)}ms  (min ${searchMinMs.toFixed(1)}ms, max ${searchMaxMs.toFixed(1)}ms)`);

if (previous && previous.perftDepth === perftDepth && previous.searchDepth === searchDepth) {
  console.log(`\nvs previous run (${previous.commit}${previous.dirty ? " dirty" : ""}, ${previous.timestamp}):`);
  console.log(`  perft nps:      ${pctChange(previous.perftNps, perftNps)}`);
  console.log(`  search avg ms:  ${pctChange(previous.searchAvgMs, searchAvgMs)} (negative = faster)`);
} else if (previous) {
  console.log(`\n(previous run used different depths — skipping comparison)`);
} else {
  console.log(`\n(no previous run recorded yet — this is the first entry)`);
}

appendFileSync(LOG_PATH, JSON.stringify(record) + "\n");
console.log(`\nRecorded to ${LOG_PATH}`);
