import { MatchSession, type BuildId, type ClockSnapshot, type Competitor, type EngineRef, type GameResult } from "./competition/match";
import { OPENING_BOOK } from "./competition/openings";
import type { TsEngineVersion } from "./worker/tsEngineProtocol";
import { createBoard, type ChessboardInstance } from "./ui/board";

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

interface CompareManifest {
  label: string;
  ref: string;
  resolvedCommit: string;
  builtAt: string;
}

// Additional labeled comparison builds the UI offers — each corresponds to
// an `npm run build:compare-engine -- <ref> <label>` output directory
// (public/dotnet-engine-<label>/). Add another entry here (and a matching
// <option> in competition.html) to offer a further comparison slot.
const COMPARE_LABELS = ["pre-quiescence", "pre-repetition", "pre-mate-scoring", "pre-tt", "pre-king-drive"] as const;

const compareManifests = new Map<string, CompareManifest>();

async function loadCompareManifest(label: string): Promise<CompareManifest | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}dotnet-engine-${label}/manifest.json`);
    if (!res.ok) return null;
    return (await res.json()) as CompareManifest;
  } catch {
    return null;
  }
}

async function renderCompareStatus() {
  const statusEl = document.getElementById("compare-status");
  if (!statusEl) return;

  const lines: string[] = [];
  for (const label of COMPARE_LABELS) {
    const manifest = await loadCompareManifest(label);
    if (manifest) {
      compareManifests.set(label, manifest);
      const shortCommit = manifest.resolvedCommit.slice(0, 8);
      const builtAt = new Date(manifest.builtAt).toLocaleString();
      lines.push(`"${label}": ${manifest.ref} (${shortCommit}), built ${builtAt}`);
    } else {
      lines.push(`"${label}": not built — run npm run build:compare-engine -- <git-ref> ${label}`);
    }
  }

  statusEl.textContent = "";
  lines.forEach((line, i) => {
    if (i > 0) statusEl.appendChild(document.createElement("br"));
    statusEl.appendChild(document.createTextNode(line));
  });
}

const TS_VERSION_LABELS: Record<TsEngineVersion, string> = {
  latest: "TS latest",
  v4: "TS v4 (piece-square tables)",
  v3: "TS v3 (alpha-beta)",
  v2: "TS v2 (recursive negamax)",
  v1: "TS v1 (depth-1 material)",
};

function parseEngineSelection(value: string): { engine: EngineRef; label: string } {
  const [kind, id] = value.split(":");
  if (kind === "wasm") {
    const build = id as BuildId;
    const manifest = compareManifests.get(build);
    const label = build === "current" ? "Current" : manifest ? `${build} (${manifest.ref})` : build;
    return { engine: { kind: "wasm", build }, label };
  }
  const version = id as TsEngineVersion;
  return { engine: { kind: "ts", version }, label: TS_VERSION_LABELS[version] };
}

function readCompetitor(prefix: "a" | "b"): Competitor {
  const engineSelect = document.getElementById(`competitor-${prefix}-engine`) as HTMLSelectElement;
  const startMsInput = document.getElementById(`competitor-${prefix}-start-ms`) as HTMLInputElement;
  const incrementMsInput = document.getElementById(`competitor-${prefix}-increment-ms`) as HTMLInputElement;
  const startMs = parseInt(startMsInput.value, 10) || 60_000;
  const incrementMs = parseInt(incrementMsInput.value, 10) || 0;
  const { engine, label } = parseEngineSelection(engineSelect.value);
  return { label, engine, clock: { startMs, incrementMs } };
}

function describeResult(result: GameResult, a: Competitor, b: Competitor, aIsWhite: boolean): string {
  const whiteLabel = aIsWhite ? a.label : b.label;
  const blackLabel = aIsWhite ? b.label : a.label;
  if (result.status === "stopped") return `Stopped after ${result.plies} plies.`;
  if (result.winner === null) {
    return `Draw (${result.status}) after ${result.plies} plies — White: ${whiteLabel}, Black: ${blackLabel}`;
  }
  const winnerLabel = result.winner === "white" ? whiteLabel : blackLabel;
  const reason = result.status === "time-forfeit" ? "on time" : `(${result.status})`;
  return `${winnerLabel} wins as ${result.winner} ${reason} after ${result.plies} plies`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const MATE_THRESHOLD = 900_000;

// value is White-relative centipawns (see EngineInterop.FindBestMoveWithEval)
// except near mate, where Search.cs's ply-adjusted mate scoring means the
// raw number is a distance-to-mate encoding, not a material count — shown as
// "M" rather than a nonsensical pawn count. Undefined for competitors that
// don't report an eval yet (frozen TS versions v1..v4, or a comparison WASM
// build predating FindBestMoveWithEval — see competitionEngine.worker.ts).
function formatEval(value: number | undefined): string {
  if (value === undefined) return "—";
  if (Math.abs(value) > MATE_THRESHOLD) return value > 0 ? "+M" : "-M";
  const pawns = value / 100;
  return (pawns >= 0 ? "+" : "") + pawns.toFixed(2);
}

const evalDisplayEl = document.getElementById("eval-display")!;
function updateEvalDisplay(value: number | undefined): void {
  evalDisplayEl.textContent = `Eval: ${formatEval(value)}`;
}

// "119000" -> "1:59". Clamped to 0 since a flagged clock can otherwise show
// a negative remainder (see match.ts's time-forfeit check).
function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

const whiteClockEl = document.getElementById("white-clock")!;
const blackClockEl = document.getElementById("black-clock")!;
function updateClockDisplay(clocks: ClockSnapshot | undefined): void {
  whiteClockEl.textContent = `White: ${clocks ? formatClock(clocks.whiteMs) : "—"}`;
  blackClockEl.textContent = `Black: ${clocks ? formatClock(clocks.blackMs) : "—"}`;
}

renderCompareStatus();

// --- Mode toggle ---

const livePanel = document.getElementById("live-panel")!;
const batchPanel = document.getElementById("batch-panel")!;

document.getElementById("mode-live")?.addEventListener("change", () => {
  livePanel.classList.remove("hidden");
  batchPanel.classList.add("hidden");
});
document.getElementById("mode-batch")?.addEventListener("change", () => {
  livePanel.classList.add("hidden");
  batchPanel.classList.remove("hidden");
});

// --- Live single-game mode ---

// Shared spectator board — both live and batch modes draw into the same
// #board element (see competition.html); no drag handlers wired, dragStart
// always returns false, so this is purely a visualization of moves applied
// by match.ts.
let board: ChessboardInstance | undefined;
function getBoard(): ChessboardInstance {
  if (!board) board = createBoard({ containerId: "board", onUserMove: () => {}, onDragStart: () => false });
  return board;
}

let liveSession: MatchSession | null = null;
let liveStopRequested = false;

const liveStatusEl = document.getElementById("live-status")!;
const liveStartBtn = document.getElementById("live-start") as HTMLButtonElement;
const liveStopBtn = document.getElementById("live-stop") as HTMLButtonElement;

liveStartBtn.addEventListener("click", async () => {
  liveStartBtn.disabled = true;
  liveStopBtn.disabled = false;
  liveStopRequested = false;
  liveStatusEl.textContent = "Loading engines…";

  const board = getBoard();
  board.position("start");
  updateEvalDisplay(undefined);

  const a = readCompetitor("a");
  const b = readCompetitor("b");
  // Live mode always plays a as white, b as black (see the `true` below).
  updateClockDisplay({ whiteMs: a.clock.startMs, blackMs: b.clock.startMs });

  try {
    liveSession = await MatchSession.create(a, b);
    const resolvedOpenings = await liveSession.resolveOpeningBook(OPENING_BOOK);
    const { opening, fen: openingFen } = pickRandom(resolvedOpenings);
    board.position(openingFen);
    liveStatusEl.textContent = `Playing (${opening.name})…`;
    const result = await liveSession.playGame(
      true,
      openingFen,
      (fen, _ply, value, clocks) => {
        board.position(fen);
        updateEvalDisplay(value);
        updateClockDisplay(clocks);
      },
      () => liveStopRequested
    );
    liveStatusEl.textContent = describeResult(result, a, b, true);
  } catch (err) {
    liveStatusEl.textContent = `Error: ${errorMessage(err)}`;
  } finally {
    liveSession?.dispose();
    liveSession = null;
    liveStartBtn.disabled = false;
    liveStopBtn.disabled = true;
  }
});

liveStopBtn.addEventListener("click", () => {
  liveStopRequested = true;
});

// --- Headless batch mode ---

const batchGamesEl = document.getElementById("batch-games") as HTMLInputElement;
const batchStartBtn = document.getElementById("batch-start") as HTMLButtonElement;
const batchStatusEl = document.getElementById("batch-status")!;
const batchLogEl = document.getElementById("batch-log")!;
const scoreAEl = document.getElementById("score-a")!;
const scoreBEl = document.getElementById("score-b")!;
const scoreDrawsEl = document.getElementById("score-draws")!;

batchStartBtn.addEventListener("click", async () => {
  batchStartBtn.disabled = true;
  batchLogEl.innerHTML = "";
  scoreAEl.textContent = "0";
  scoreBEl.textContent = "0";
  scoreDrawsEl.textContent = "0";
  batchStatusEl.textContent = "Loading engines…";

  const board = getBoard();
  board.position("start");
  updateEvalDisplay(undefined);

  const a = readCompetitor("a");
  const b = readCompetitor("b");
  const games = parseInt(batchGamesEl.value, 10) || 1;

  let session: MatchSession | null = null;
  let aWins = 0;
  let bWins = 0;
  let draws = 0;
  let currentOpeningName = "";

  try {
    session = await MatchSession.create(a, b);
    const resolvedOpenings = await session.resolveOpeningBook(OPENING_BOOK);
    batchStatusEl.textContent = `Running ${games} games…`;

    await session.runBatch(
      games,
      (gameNumber, aIsWhite, result) => {
        if (result.winner === null) draws++;
        else if ((result.winner === "white") === aIsWhite) aWins++;
        else bWins++;

        scoreAEl.textContent = String(aWins);
        scoreBEl.textContent = String(bWins);
        scoreDrawsEl.textContent = String(draws);

        const li = document.createElement("li");
        li.textContent = `Game ${gameNumber + 1}/${games} (${currentOpeningName}): ${describeResult(result, a, b, aIsWhite)}`;
        batchLogEl.appendChild(li);
      },
      (fen, _ply, value, clocks) => {
        board.position(fen);
        updateEvalDisplay(value);
        updateClockDisplay(clocks);
      },
      () => {
        // Picks (and displays) a fresh random opening for each game in the
        // batch — called once per game, right before it starts. Which
        // competitor is white flips every game (see runBatch), so the clock
        // display is left as-is here and picked back up by the first onMove
        // of the new game rather than guessed at.
        const { opening, fen } = pickRandom(resolvedOpenings);
        currentOpeningName = opening.name;
        board.position(fen);
        updateEvalDisplay(undefined);
        return fen;
      }
    );

    batchStatusEl.textContent = `Done: ${a.label} ${aWins} - ${bWins} ${b.label} (${draws} draws)`;
  } catch (err) {
    batchStatusEl.textContent = `Error: ${errorMessage(err)}`;
  } finally {
    session?.dispose();
    batchStartBtn.disabled = false;
  }
});
