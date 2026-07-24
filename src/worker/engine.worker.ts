import type { EngineCommand, EngineEvent } from "./protocol";
import { START_FEN } from "./protocol";
import { applyMove, findBestMove, IllegalMoveError } from "../engine";

let currentFen: string = START_FEN;

self.onmessage = (e: MessageEvent<EngineCommand>) => {
  const cmd = e.data;
  try {
    switch (cmd.type) {
      case "init":
        post({ type: "ready" });
        break;

      case "newGame":
        currentFen = START_FEN;
        post({ type: "reset", fen: currentFen });
        break;

      case "userMove": {
        try {
          const result = applyMove(currentFen, cmd.from, cmd.to, cmd.promotion);
          currentFen = result.fen;
          post({
            type: "moveApplied",
            fen: currentFen,
            from: cmd.from,
            to: cmd.to,
            promotion: cmd.promotion,
            by: "user",
          });
        } catch (err) {
          if (err instanceof IllegalMoveError) {
            post({ type: "illegalMove", from: cmd.from, to: cmd.to });
          } else {
            throw err;
          }
        }
        break;
      }

      case "go": {
        const { move } = findBestMove(currentFen, {
          depth: cmd.depth,
          movetimeMs: cmd.movetimeMs,
        });
        const [from, to, promotion] = [move.slice(0, 2), move.slice(2, 4), move.slice(4) || undefined];
        const result = applyMove(currentFen, from, to, promotion);
        currentFen = result.fen;
        post({ type: "moveApplied", fen: currentFen, from, to, promotion, by: "engine" });
        break;
      }

      case "stop":
        // TODO(user): implement cancellation once search is iterative/async.
        break;
    }
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};

function post(event: EngineEvent) {
  (self as unknown as Worker).postMessage(event);
}
