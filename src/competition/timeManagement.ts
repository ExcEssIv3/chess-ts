// Port of engine-cs/UciEngine/TimeManagement.cs's ComputeBudgetMs — converts
// a chess clock (remaining time + increment) into a single move's think-time
// budget, so the harnesses' clock bookkeeping (scripts/tournament.ts,
// src/competition/match.ts) allocates time the same way the engine does when
// it's actually playing on a clock via the UCI front-end.

const DEFAULT_MOVES_TO_GO = 30;
const MIN_BUDGET_MS = 50;

export function computeBudgetMs(myTimeMs: number, myIncMs: number, moveOverheadMs = 100): number {
  let budget = myTimeMs / DEFAULT_MOVES_TO_GO + myIncMs - moveOverheadMs;

  // Never claim so much of the clock that a single move risks flagging the
  // game outright, regardless of how the formula above came out (e.g. a
  // large increment on a near-empty clock).
  const safeMax = Math.max(myTimeMs - moveOverheadMs, MIN_BUDGET_MS);
  if (budget > safeMax) budget = safeMax;
  if (budget < MIN_BUDGET_MS) budget = MIN_BUDGET_MS;

  // Crosses into a C# `int movetimeMs` parameter via the WASM JS interop,
  // which asserts the JS value is a safe integer — myTimeMs/DEFAULT_MOVES_TO_GO
  // is a float on almost every call, so this must be rounded before crossing.
  return Math.round(budget);
}
