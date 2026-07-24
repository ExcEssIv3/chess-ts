import { createBoard, type ChessboardInstance } from "./ui/board";
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

worker.onmessage = (e: MessageEvent<EngineEvent>) => {
  const event = e.data;
  switch (event.type) {
    case "ready":
      board = createBoard({
        containerId: "board",
        onUserMove: (from, to) => {
          sendCommand({ type: "userMove", from, to });
        },
      });
      break;

    case "reset":
      currentFen = event.fen;
      board?.position(currentFen);
      break;

    case "moveApplied":
      currentFen = event.fen;
      board?.position(currentFen);
      if (event.by === "user") {
        sendCommand({ type: "go", movetimeMs: 1000 });
      }
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

sendCommand({ type: "init" });
