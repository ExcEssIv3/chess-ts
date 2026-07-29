import type { TsEngineCommand, TsEngineEvent, TsEngineVersion } from "../worker/tsEngineProtocol";
import TsEngineWorker from "../worker/tsEngine.worker.ts?worker";

// Thin request/response wrapper around one tsEngine.worker.ts instance —
// same one-in-flight-request-at-a-time shape as src/competition/workerClient.ts
// (kept as a separate small class rather than a shared generic base, since
// the two backends' commands/events genuinely differ and this plumbing is
// only ~50 lines either way).
export class TsWorkerClient {
  private worker: Worker;
  private pending: {
    resolve: (event: TsEngineEvent) => void;
    reject: (err: Error) => void;
  } | null = null;

  constructor() {
    this.worker = new TsEngineWorker();
    this.worker.onmessage = (e: MessageEvent<TsEngineEvent>) => {
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

  async init(version: TsEngineVersion): Promise<void> {
    await this.send({ type: "init", version });
  }

  async findBestMove(fen: string, movetimeMs: number): Promise<{ move: string; value?: number }> {
    const event = await this.send({ type: "findBestMove", fen, movetimeMs });
    if (event.type !== "bestMove") throw new Error(`Expected bestMove, got ${event.type}`);
    return { move: event.move, value: event.value };
  }

  terminate(): void {
    this.worker.terminate();
  }

  private send(command: TsEngineCommand): Promise<TsEngineEvent> {
    if (this.pending) throw new Error("TsWorkerClient only supports one in-flight request at a time");
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      this.worker.postMessage(command);
    });
  }
}

function reject(pending: { reject: (err: Error) => void }, message: string): void {
  pending.reject(new Error(message));
}
