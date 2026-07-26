// Derives captured pieces and material advantage straight from the FEN's
// board field — no move-history tracking needed, since "captured" is just
// "missing relative to the starting count" for each piece type/color.
import { pieceIconUrl } from "./board";

// Standard human piece values (not the engine's tuned centipawn weights in
// src/engine/evaluation.ts) — queen 9, rook 5, bishop/knight 3, pawn 1.
const STANDARD_VALUES: Record<"p" | "n" | "b" | "r" | "q", number> = {
  q: 9,
  r: 5,
  b: 3,
  n: 3,
  p: 1,
};

// Display order: most valuable first, pawns last.
const DISPLAY_ORDER: Array<"p" | "n" | "b" | "r" | "q"> = ["q", "r", "b", "n", "p"];

const STARTING_COUNTS: Record<"p" | "n" | "b" | "r" | "q", number> = {
  p: 8,
  n: 2,
  b: 2,
  r: 2,
  q: 1,
};

function countPieces(fenBoard: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const char of fenBoard) {
    if (char === "/" || (char >= "1" && char <= "8")) continue;
    counts[char] = (counts[char] ?? 0) + 1;
  }
  return counts;
}

interface CapturedSummary {
  /** Pieces captured BY white, i.e. missing black pieces, one entry per lost piece. */
  capturedByWhite: Array<"p" | "n" | "b" | "r" | "q">;
  /** Pieces captured BY black, i.e. missing white pieces, one entry per lost piece. */
  capturedByBlack: Array<"p" | "n" | "b" | "r" | "q">;
  /** Positive = white ahead on material, negative = black ahead. */
  advantage: number;
}

export function computeCaptured(fen: string): CapturedSummary {
  const fenBoard = fen.split(" ")[0] ?? "";
  const counts = countPieces(fenBoard);

  const capturedByWhite: Array<"p" | "n" | "b" | "r" | "q"> = [];
  const capturedByBlack: Array<"p" | "n" | "b" | "r" | "q"> = [];
  let advantage = 0;

  for (const type of DISPLAY_ORDER) {
    const missingBlack = STARTING_COUNTS[type] - (counts[type] ?? 0);
    const missingWhite = STARTING_COUNTS[type] - (counts[type.toUpperCase()] ?? 0);
    for (let i = 0; i < missingBlack; i++) capturedByWhite.push(type);
    for (let i = 0; i < missingWhite; i++) capturedByBlack.push(type);
    advantage += (missingBlack - missingWhite) * STANDARD_VALUES[type];
  }

  return { capturedByWhite, capturedByBlack, advantage };
}

function renderTray(containerId: string, pieces: Array<"p" | "n" | "b" | "r" | "q">, color: "w" | "b", advantage: number) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = "";

  for (const type of pieces) {
    const img = document.createElement("img");
    img.className = "captured-piece";
    img.src = pieceIconUrl(color + type.toUpperCase());
    img.alt = color + type.toUpperCase();
    el.appendChild(img);
  }

  if (advantage > 0) {
    const badge = document.createElement("span");
    badge.className = "captured-advantage";
    badge.textContent = `+${advantage}`;
    el.appendChild(badge);
  }
}

export function updateCapturedPieces(fen: string): void {
  const { capturedByWhite, capturedByBlack, advantage } = computeCaptured(fen);
  // The tray next to white's captures shows the black pieces white has
  // taken, and vice versa.
  renderTray("captures-by-white", capturedByWhite, "b", advantage > 0 ? advantage : 0);
  renderTray("captures-by-black", capturedByBlack, "w", advantage < 0 ? -advantage : 0);
}
