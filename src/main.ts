import { createBoard, flipOrientation, type ChessboardInstance } from "./ui/board";
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
  const elapsed = Math.round(performance.now() - goSentAt);
  goSentAt = null;
  const message = `Thought for ${elapsed} ms...`;
  console.log(message);
  const statusEl = document.getElementById("engine-status");
  if (statusEl) statusEl.textContent = message;
}

worker.onmessage = (e: MessageEvent<EngineEvent>) => {
  const event = e.data;
  switch (event.type) {
    case "ready":
      currentOrientation = userSide === "b" ? "black" : "white";
      board = createBoard({
        containerId: "board",
        orientation: currentOrientation,
        onUserMove: (from, to) => {
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

sendCommand({ type: "init" });
