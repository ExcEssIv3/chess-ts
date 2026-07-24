// Thin wrapper around chessboard.js. This file only knows about rendering
// and drag events — it has no idea a worker or engine exists.

// chessboard.js is loaded globally via <script> tags in index.html (it isn't
// published as an ESM package), so it isn't `import`ed — just declared here.
declare const Chessboard: (containerId: string, config: ChessboardConfig) => ChessboardInstance;

export interface ChessboardConfig {
  draggable?: boolean;
  position?: string;
  pieceTheme?: string;
  onDrop?: (source: string, target: string) => string | void;
}

export interface ChessboardInstance {
  position(fen: string): void;
  position(fen: string, useAnimation: boolean): void;
}

export interface CreateBoardOptions {
  containerId: string;
  onUserMove: (from: string, to: string) => void;
}

export function createBoard({ containerId, onUserMove }: CreateBoardOptions): ChessboardInstance {
  return Chessboard(containerId, {
    draggable: true,
    position: "start",
    pieceTheme:
      "https://cdn.jsdelivr.net/gh/oakmac/chessboardjs@1.0.0/website/img/chesspieces/wikipedia/{piece}.png",
    onDrop: (source, target) => {
      if (source === target) return;
      onUserMove(source, target);
    },
  });
}
