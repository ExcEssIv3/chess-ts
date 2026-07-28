import type { CompetitionCommand, CompetitionEvent } from "../worker/competitionProtocol";
// The `?worker` suffix is Vite's constructor-import form for workers — unlike
// `new Worker(new URL(...), ...)`, it's statically detectable from any file
// (not just wherever `new Worker(...)` is literally written), which matters
// here since the Worker is constructed inside this reusable wrapper class
// rather than inline at each call site. Vite's own type for this comes from
// the `vite/client` types referenced in tsconfig.json.
import CompetitionEngineWorker from "../worker/competitionEngine.worker.ts?worker";

// Thin request/response wrapper around one competitionEngine.worker.ts
// instance. Assumes at most one in-flight request at a time — true for every
// caller in src/competition/match.ts, since a match is always driven as a
// strict sequence (ask for a move, wait, apply it, wait, check status,
// wait, repeat), never concurrently. That invariant is what lets this skip
// request IDs entirely.
export class WorkerClient {
  private worker: Worker;
  private pending: {
    resolve: (event: CompetitionEvent) => void;
    reject: (err: Error) => void;
  } | null = null;

  constructor() {
    this.worker = new CompetitionEngineWorker();
    this.worker.onmessage = (e: MessageEvent<CompetitionEvent>) => {
      const pending = this.pending;
      this.pending = null;
      if (!pending) return;
      if (e.data.type === "error") reject(pending, e.data.message);
      else pending.resolve(e.data);
    };
    this.worker.onerror = (e: ErrorEvent) => {
      const pending = this.pending;
      this.pending = null;
      if (pending) reject(pending, e.message);
    };
  }

  async init(wasmBasePath: string): Promise<void> {
    await this.send({ type: "init", wasmBasePath });
  }

  async findBestMove(fen: string, startFen: string, moves: string[], movetimeMs: number): Promise<string> {
    const event = await this.send({ type: "findBestMove", fen, startFen, moves, movetimeMs });
    if (event.type !== "bestMove") throw new Error(`Expected bestMove, got ${event.type}`);
    return event.move;
  }

  async applyMove(fen: string, from: string, to: string, promotion?: string): Promise<string> {
    const event = await this.send({ type: "applyMove", fen, from, to, promotion });
    if (event.type === "illegalMove") throw new Error(`Illegal move ${from}${to}${promotion ?? ""}`);
    if (event.type !== "moveApplied") throw new Error(`Expected moveApplied, got ${event.type}`);
    return event.fen;
  }

  async gameStatus(startFen: string, moves: string[]): Promise<"ongoing" | "checkmate" | "stalemate" | "threefold-repetition"> {
    const event = await this.send({ type: "gameStatus", startFen, moves });
    if (event.type !== "status") throw new Error(`Expected status, got ${event.type}`);
    return event.status;
  }

  terminate(): void {
    this.worker.terminate();
  }

  private send(command: CompetitionCommand): Promise<CompetitionEvent> {
    if (this.pending) throw new Error("WorkerClient only supports one in-flight request at a time");
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      this.worker.postMessage(command);
    });
  }
}

function reject(pending: { reject: (err: Error) => void }, message: string): void {
  pending.reject(new Error(message));
}
