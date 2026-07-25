import { createBoard, flipOrientation, pieceIconUrl, type ChessboardInstance } from "./ui/board";
import { updateDebugPanel } from "./ui/debugPanel";
import type { EngineCommand, EngineEvent } from "./worker/protocol";
import { START_FEN } from "./worker/protocol";

const worker = new Worker(new URL("./worker/engine.worker.ts", import.meta.url), {
  type: "module",
});

function sendCommand(cmd: EngineCommand) {
  worker.postMessage(cmd);
}

let currentFen = START_FEN;
let board: ChessboardInstance | undefined;
let engineEnabled = true;
let userSide: "w" | "b" = "w";
let currentOrientation: "white" | "black" = "white";

function activeColor(fen: string): "w" | "b" {
  return fen.split(" ")[1] as "w" | "b";
}

// In engine mode the board always shows the human's side. In hot-seat mode
// (engine disabled) it flips to whoever is on move, so each player sees
// their own side at the bottom.
function updateOrientation() {
  const side = (engineEnabled ? userSide : activeColor(currentFen)) === "b" ? "black" : "white";
  if (side === currentOrientation || !board) return;
  currentOrientation = side;
  flipOrientation("board", board, side);
}

function updateSideSelectVisibility() {
  const label = document.getElementById("side-select-label");
  if (label) label.style.display = engineEnabled ? "" : "none";
}

let goSentAt: number | null = null;

function maybeTriggerEngine() {
  if (!engineEnabled) return;
  if (activeColor(currentFen) !== userSide) {
    goSentAt = performance.now();
    sendCommand({ type: "go", movetimeMs: 1000 });
  }
}

function reportEngineThinkTime() {
  if (goSentAt === null) return;
  const elapsedMicros = Math.round((performance.now() - goSentAt) * 1000);
  goSentAt = null;
  const message = `Thought for ${elapsedMicros.toLocaleString()} μs...`;
  console.log(message);
  const statusEl = document.getElementById("engine-status");
  if (statusEl) statusEl.textContent = message;
}

// chessboard.js's `piece` format is a color+type pair, e.g. "wP", "bN".
function isPromotionMove(piece: string, target: string): boolean {
  if (piece[1]?.toLowerCase() !== "p") return false;
  const targetRank = target[1];
  return (piece[0] === "w" && targetRank === "8") || (piece[0] === "b" && targetRank === "1");
}

let pendingPromotion: { from: string; to: string; color: "w" | "b" } | null = null;

function showPromotionPicker(color: "w" | "b") {
  const picker = document.getElementById("promotion-picker");
  picker?.querySelectorAll<HTMLButtonElement>("button[data-piece]").forEach((button) => {
    const piece = button.dataset.piece;
    const img = button.querySelector("img");
    if (piece && img) img.src = pieceIconUrl(color + piece.toUpperCase());
  });
  picker?.classList.remove("hidden");
}

function hidePromotionPicker() {
  document.getElementById("promotion-picker")?.classList.add("hidden");
}

document.getElementById("promotion-picker")?.addEventListener("click", (e) => {
  const button = (e.target as HTMLElement).closest("button");
  const piece = button?.dataset.piece;
  if (!piece || !pendingPromotion) return;
  const { from, to, color } = pendingPromotion;
  pendingPromotion = null;
  hidePromotionPicker();
  sendCommand({ type: "userMove", from, to, promotion: color === "w" ? piece.toUpperCase() : piece });
});

document.getElementById("promotion-cancel")?.addEventListener("click", () => {
  pendingPromotion = null;
  hidePromotionPicker();
  board?.position(currentFen);
});

worker.onmessage = (e: MessageEvent<EngineEvent>) => {
  const event = e.data;
  switch (event.type) {
    case "ready":
      currentOrientation = userSide === "b" ? "black" : "white";
      board = createBoard({
        containerId: "board",
        orientation: currentOrientation,
        onUserMove: (from, to, piece) => {
          if (isPromotionMove(piece, to)) {
            const color = piece[0] as "w" | "b";
            pendingPromotion = { from, to, color };
            showPromotionPicker(color);
            return;
          }
          sendCommand({ type: "userMove", from, to });
        },
        onDragStart: (_source, piece) => {
          const active = activeColor(currentFen);
          if (piece[0] !== active) return false;
          if (engineEnabled && active !== userSide) return false;
          return true;
        },
      });
      updateDebugPanel(currentFen);
      updateSideSelectVisibility();
      break;

    case "reset":
      currentFen = event.fen;
      board?.position(currentFen);
      updateDebugPanel(currentFen);
      updateOrientation();
      maybeTriggerEngine();
      break;

    case "moveApplied":
      currentFen = event.fen;
      board?.position(currentFen);
      updateDebugPanel(currentFen);
      if (event.by === "engine") reportEngineThinkTime();
      updateOrientation();
      maybeTriggerEngine();
      break;

    case "illegalMove":
      board?.position(currentFen);
      break;

    case "error":
      console.error("[engine]", event.message);
      board?.position(currentFen);
      break;

    case "gameOver":
      console.log("Game over:", event.result);
      break;

    case "info":
      break;
  }
};

document.getElementById("reset-button")?.addEventListener("click", () => {
  sendCommand({ type: "newGame" });
});

document.getElementById("engine-toggle")?.addEventListener("change", (e) => {
  engineEnabled = (e.target as HTMLInputElement).checked;
  updateSideSelectVisibility();
  updateOrientation();
  maybeTriggerEngine();
});

document.getElementById("side-select")?.addEventListener("change", (e) => {
  userSide = (e.target as HTMLSelectElement).value as "w" | "b";
  sendCommand({ type: "newGame" });
});

document.getElementById("fen-form")?.addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("fen-input") as HTMLInputElement | null;
  const fen = input?.value.trim();
  if (fen) sendCommand({ type: "setFen", fen });
});

sendCommand({ type: "init" });
