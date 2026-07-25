# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start Vite dev server
- `npm run build` — typecheck (`tsc`) then build for production (`vite build`)
- `npm run preview` — preview the production build
- No test suite and no lint script exist yet. `npm run build` is the closest thing to a correctness check (`tsc` has `noUnusedLocals`/`noUnusedParameters` enabled, so unused code fails the build).

## Architecture

Browser chess app: bitboard engine + move generation on the main thread's `Worker`, `chessboard.js` for rendering, no framework.

**Three layers, one-directional data flow:**

- `src/main.ts` — UI glue. Owns `currentFen`, sends `EngineCommand`s to the worker, applies `EngineEvent`s to the board. Also owns orientation/side-select/promotion-picker UI state that has nothing to do with legality.
- `src/worker/engine.worker.ts` — runs in a Web Worker (`src/worker/protocol.ts` defines the shared `EngineCommand`/`EngineEvent` message types imported by both sides so they can't drift). Holds the authoritative `currentFen`, calls into `src/engine/` and posts events back.
- `src/engine/` — pure chess logic, no DOM/worker knowledge:
  - `types.ts` — `PieceChar`, `PromotionPieceChar`, `SquareInfo` (see note below on bit vs. square).
  - `board.ts` — `Board` class: one bitboard per piece type/color, FEN parsing (`applyFen`) and serialization (`convertFen`), and `move()` which mutates bitboards/castling rights/en passant/halfmove clock for a given start/finish bit pair.
  - `utils.ts` — conversions between bitmask (`bit`, a single set bit, e.g. `1n << 27n`), square index (`square`, 0-63), and algebraic notation (`"e2"`). Read the doc comment on each function before using it — mixing up bit vs. square index is the easiest way to introduce a silent bug here.
  - `legality.ts` — `evaluateLegal(board, start, finish, ...)` checks whether a single from/to bit pair is a legal move for the piece on `start`, including that it doesn't leave the mover's own king in check (via a scratch `Board` clone + `checkDanger`).
  - `movegen.ts` — `findLegalMoves(board)` enumerates all legal moves as `bigint[][]` pairs by driving `evaluateLegal` across every piece/target combination; `checkDanger(board, square, attackerIsWhite)` answers "is this square attacked" by re-using `evaluateLegal` in reverse (attacks-only, no king-safety recursion) from every square.
  - `index.ts` — the two entry points the worker calls: `applyMove(fen, from, to, promotion?)` (throws `IllegalMoveError`) and `findBestMove(fen, options)` (throws `NoLegalMovesError`); currently a placeholder that picks a uniformly random legal move rather than searching.
- `src/ui/board.ts` — thin wrapper around the globally-loaded `chessboard.js` (loaded via `<script>` tags in `index.html`, not an npm import). Knows nothing about the worker or engine; `onUserMove`/`onDragStart` are callbacks main.ts wires up.
- `src/ui/debugPanel.ts` — renders FEN fields into the debug table in `index.html`.

**Promotion is handled above `findLegalMoves`/`applyMove`**: the caller (worker, driven by `main.ts`'s promotion picker or `findBestMove`'s random choice) decides the promotion piece and passes it in; the engine layer only validates it's legal at the given rank in `Board.move()`.

**Bit vs. square index**: this is the most common source of bugs in `engine/`. A "bit" is a bitmask with exactly one set bit (`1n << square`); a "square" is a plain 0-63 index. Functions in `utils.ts` are named and documented to make which one they take/return explicit (`bitToSquare`, `squareToBit`, `getRankFromBit` vs `getRankFromSquare`, etc.) — check the doc comment before calling.

**Build/deploy**: `vite.config.ts` sets `base: "/chess-ts/"` for GitHub Pages. `.github/workflows/` deploys `dist/` to GitHub Pages on push to `main`.
