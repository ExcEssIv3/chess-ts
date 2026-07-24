// Renders the raw FEN state fields (active color, castling, en passant,
// halfmove/fullmove clocks) so board-state bugs are visible without opening
// devtools.

export function updateDebugPanel(fen: string): void {
  const [, activeColor, castling, enPassant, halfmove, fullmove] = fen.split(" ");

  setText("debug-turn", activeColor === "w" ? "White" : "Black");
  setText("debug-castling", castling === "-" ? "none" : castling);
  setText("debug-en-passant", enPassant === "-" ? "none" : enPassant);
  setText("debug-halfmove", halfmove);
  setText("debug-fullmove", fullmove);
  setText("debug-fen", fen);
}

function setText(id: string, value: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}
