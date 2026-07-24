// Thin wrapper around chessboard.js. This file only knows about rendering
// and drag events — it has no idea a worker or engine exists.

// chessboard.js is loaded globally via <script> tags in index.html (it isn't
// published as an ESM package), so it isn't `import`ed — just declared here.
declare const Chessboard: (containerId: string, config: ChessboardConfig) => ChessboardInstance;

export interface ChessboardConfig {
  draggable?: boolean;
  position?: string;
  orientation?: "white" | "black";
  pieceTheme?: string;
  onDrop?: (source: string, target: string) => string | void;
  onDragStart?: (source: string, piece: string) => boolean | void;
}

export interface ChessboardInstance {
  position(fen: string): void;
  position(fen: string, useAnimation: boolean): void;
  orientation(side: "white" | "black"): void;
}

export interface CreateBoardOptions {
  containerId: string;
  orientation?: "white" | "black";
  onUserMove: (from: string, to: string) => void;
  onDragStart?: (source: string, piece: string) => boolean;
}

export function createBoard({ containerId, orientation, onUserMove, onDragStart }: CreateBoardOptions): ChessboardInstance {
  return Chessboard(containerId, {
    draggable: true,
    position: "start",
    orientation,
    pieceTheme:
      "https://cdn.jsdelivr.net/gh/oakmac/chessboardjs@1.0.0/website/img/chesspieces/wikipedia/{piece}.png",
    onDragStart,
    onDrop: (source, target) => {
      if (source === target) return;
      onUserMove(source, target);
    },
  });
}

// chessboard.js's own orientation() swaps instantly with no transition, which
// reads as a jump cut. This fakes a card-flip by rotating the container out
// of view (via the CSS "flipping" class on #<containerId>), swapping the
// orientation while it's invisible, then rotating back in from the far side.
export function flipOrientation(containerId: string, board: ChessboardInstance, side: "white" | "black"): void {
  const el = document.getElementById(containerId);
  if (!el) {
    board.orientation(side);
    return;
  }

  el.classList.add("flipping");
  const finishHalfway = () => {
    el.removeEventListener("transitionend", finishHalfway);
    board.orientation(side);

    el.style.transition = "none";
    el.classList.remove("flipping");
    el.style.transform = "rotateY(-90deg)";
    el.style.opacity = "0";
    void el.offsetHeight; // force layout so the transition-disabled jump applies before re-enabling it
    el.style.transition = "";

    requestAnimationFrame(() => {
      el.style.transform = "";
      el.style.opacity = "";
    });
  };
  el.addEventListener("transitionend", finishHalfway, { once: true });
}
