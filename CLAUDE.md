# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start Vite dev server (run `npm run build:engine-cs` at least once first so `public/dotnet-engine/_framework` exists)
- `npm run build` — builds the C#/WASM engine (`build:engine-cs`), then typecheck (`tsc`), then production build (`vite build`)
- `npm run build:engine-cs` — `dotnet publish engine-cs -c Release` and copies the WASM `_framework` output into `public/dotnet-engine/`
- `npm run preview` — preview the production build
- `npm run bench` / `npm run tournament` / `npm run perf` — TS-only tooling, see below. Not part of the production build.
- `npm run build:uci-engine` — `dotnet publish engine-cs/UciEngine -c Release`, produces a native (framework-dependent) UCI executable at `engine-cs/UciEngine/bin/Release/net9.0/publish/UciEngine` for external GUIs/bridges (e.g. `lichess-bot`). Not part of the production build.
- No test suite and no lint script exist yet. `npm run build` is the closest thing to a correctness check (`tsc` has `noUnusedLocals`/`noUnusedParameters` enabled, so unused code fails the build; `dotnet publish` will fail on C# compile errors).

## Architecture

Browser chess app: **C#/WASM engine is the authoritative chess logic**, driven from a Web Worker; `chessboard.js` for rendering, no framework.

**The engine moved from TypeScript to C# compiled to WebAssembly** (commits "Port chess engine to C# compiled to WebAssembly", "Wire the worker to the C#/WASM engine instead of the TS one"). New engine work (search, evaluation) now happens in `engine-cs/`, not `src/engine/`.

- `src/main.ts` — UI glue. Owns `currentFen`, sends `EngineCommand`s to the worker, applies `EngineEvent`s to the board. Also owns orientation/side-select/promotion-picker UI state that has nothing to do with legality.
- `src/worker/engine.worker.ts` — runs in a Web Worker (`src/worker/protocol.ts` defines the shared `EngineCommand`/`EngineEvent` message types imported by both sides so they can't drift). On startup it dynamically imports `dotnet-engine/_framework/dotnet.js`, boots the .NET runtime, and grabs the `EngineCs.EngineInterop` JS-exported class. Holds the authoritative `currentFen`; `userMove`/`go` commands call `engine.ApplyMove(...)` / `engine.FindBestMove(...)` on that WASM object and post events back. It still imports `Board` from `../engine/board` for one narrow purpose — normalizing a pasted FEN in the `setFen` handler — nothing else in `src/engine/` runs in the browser.
- `engine-cs/` — the live chess engine, compiled to WASM via `dotnet publish` (see `build:engine-cs`):
  - `EngineInterop.cs` — `[JSExport]` surface the worker calls: `ApplyMove(fen, from, to, promotion?)` (throws on illegal moves) and `FindBestMove(fen, depth, movetimeMs)` (fixed-depth `Search.Run` or, when `movetimeMs > 0`, iterative-deepening `Search.RunIterative`).
  - `Board.cs`, `Legality.cs`, `Movegen.cs`, `Attacks.cs`, `Utils.cs`, `Evaluation.cs`, `PieceSquareTables.cs`, `Search.cs` — C# port of the same bitboard/movegen/eval/search design described below for `src/engine/`; that description still applies conceptually, just read `.cs` instead of `.ts`.
  - `TestRunner/` — separate console project for exercising the engine outside the browser (e.g. perft).
  - `UciEngine/` — separate console project implementing the UCI protocol (`uci`/`isready`/`position`/`go`/`stop`/`quit`) over stdin/stdout, for external GUIs/bridges like `lichess-bot`. Reuses `EngineInterop.ReplayHistory` to build a `Board`+`positionCounts` from a `position` command, and `Search.RunIterative`/`Search.Run` for the actual move. `go`'s `wtime`/`btime`/`winc`/`binc`/`movestogo` are converted into a single movetime budget by `TimeManagement.ComputeBudgetMs`; `go depth N` with no clock fields runs a plain fixed-depth `Search.Run` instead. Runs the search on a background `Task` so `stop` (setting `SearchDeadline.Stopped`, a new mutable field `Search.Run`'s root-ply loop checks alongside the time budget) can interrupt it without blocking the stdin-reading loop.
- `src/engine/` (TypeScript) — **no longer used at runtime**, except the one `Board` import above. Kept as the base for the TS-only tooling below; treat it as a frozen reference, not a place to add new engine features.
  - `types.ts` — `PieceChar`, `PromotionPieceChar`, `SquareInfo` (see note below on bit vs. square).
  - `board.ts` — `Board` class: one bitboard per piece type/color, FEN parsing (`applyFen`) and serialization (`convertFen`), and `move()` which mutates bitboards/castling rights/en passant/halfmove clock for a given start/finish bit pair.
  - `utils.ts` — conversions between bitmask (`bit`, a single set bit, e.g. `1n << 27n`), square index (`square`, 0-63), and algebraic notation (`"e2"`). Read the doc comment on each function before using it — mixing up bit vs. square index is the easiest way to introduce a silent bug here.
  - `legality.ts` — `evaluateLegal(board, start, finish, ...)` checks whether a single from/to bit pair is a legal move for the piece on `start`, including that it doesn't leave the mover's own king in check (via a scratch `Board` clone + `checkDanger`).
  - `movegen.ts` — `findLegalMoves(board)` enumerates all legal moves as `bigint[][]` pairs by driving `evaluateLegal` across every piece/target combination; `checkDanger(board, square, attackerIsWhite)` answers "is this square attacked" by re-using `evaluateLegal` in reverse (attacks-only, no king-safety recursion) from every square.
  - `engine.ts` — negamax + alpha-beta `search()`, fixed depth, no quiescence search yet.
  - `index.ts` — `applyMove(fen, from, to, promotion?)` (throws `IllegalMoveError`) and `findBestMove(fen, options)` (throws `NoLegalMovesError`); mirrors `EngineInterop.cs`'s API shape.
- `scripts/bench.ts` — perft throughput benchmark against the TS `Board`/`findLegalMoves` only.
- `scripts/tournament.ts` — self-play harness pitting frozen TS engine snapshots (`scripts/versions/v1..v4`) against the live `src/engine`; TS-vs-TS only, doesn't touch `engine-cs`.
- `scripts/perf.ts` — tracked wall-clock/nps benchmark of the TS engine, appends to `scripts/perf-log.jsonl`.
- `src/ui/board.ts` — thin wrapper around the globally-loaded `chessboard.js` (loaded via `<script>` tags in `index.html`, not an npm import). Knows nothing about the worker or engine; `onUserMove`/`onDragStart` are callbacks main.ts wires up.
- `src/ui/debugPanel.ts` — renders FEN fields into the debug table in `index.html`.

**Promotion is handled above move generation**: the caller (worker, driven by `main.ts`'s promotion picker or the engine's own search) decides the promotion piece and passes it in; the engine layer only validates it's legal at the given rank in `Board.move()`.

**Bit vs. square index**: this is the most common source of bugs in both `engine-cs/` and `src/engine/`. A "bit" is a bitmask with exactly one set bit (`1n << square` / `1UL << square`); a "square" is a plain 0-63 index. Utility functions are named and documented to make which one they take/return explicit (`bitToSquare`, `squareToBit`, `getRankFromBit` vs `getRankFromSquare`, etc.) — check the doc comment before calling.

**Build/deploy**: `vite.config.ts` sets `base: "/chess-ts/"` for GitHub Pages. `build:engine-cs` must run before `vite build` so `public/dotnet-engine/_framework` exists (the `build` script already does this). `.github/workflows/` deploys `dist/` to GitHub Pages on push to `main`.
