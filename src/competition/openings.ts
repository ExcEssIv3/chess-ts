// A small opening book for the Engine Competition page — used to randomize
// each game's starting position so repeated matches between the same two
// engines (at a fixed movetime, engines are close to deterministic) don't
// always replay the exact same game.
//
// Stored as UCI move sequences from the standard start, not raw FEN strings:
// a hand-typed FEN is an easy place to introduce a subtle, hard-to-notice
// bug (wrong castling rights, wrong halfmove clock) that's much harder to
// slip up on when the "data" is just a well-known sequence of book moves
// checked against opening theory. MatchSession.resolveOpeningBook replays
// these through the real engine (WASM applyMove) to get a guaranteed-correct
// FEN for each one.
export interface Opening {
  name: string;
  moves: string[];
}

export const OPENING_BOOK: Opening[] = [
  { name: "Ruy Lopez", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5"] },
  { name: "Italian Game", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4"] },
  { name: "Scotch Game", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "d2d4"] },
  { name: "Vienna Game", moves: ["e2e4", "e7e5", "b1c3"] },
  { name: "Sicilian Defense", moves: ["e2e4", "c7c5"] },
  { name: "Sicilian Najdorf", moves: ["e2e4", "c7c5", "g1f3", "d7d6", "d2d4", "c5d4", "f3d4", "g8f6", "b1c3", "a7a6"] },
  { name: "French Defense", moves: ["e2e4", "e7e6"] },
  { name: "Caro-Kann Defense", moves: ["e2e4", "c7c6"] },
  { name: "Scandinavian Defense", moves: ["e2e4", "d7d5"] },
  { name: "Pirc Defense", moves: ["e2e4", "d7d6", "d2d4", "g8f6"] },
  { name: "Queen's Gambit", moves: ["d2d4", "d7d5", "c2c4"] },
  { name: "Queen's Gambit Declined", moves: ["d2d4", "d7d5", "c2c4", "e7e6"] },
  { name: "Slav Defense", moves: ["d2d4", "d7d5", "c2c4", "c7c6"] },
  { name: "King's Indian Defense", moves: ["d2d4", "g8f6", "c2c4", "g7g6"] },
  { name: "Grünfeld Defense", moves: ["d2d4", "g8f6", "c2c4", "g7g6", "b1c3", "d7d5"] },
  { name: "Nimzo-Indian Defense", moves: ["d2d4", "g8f6", "c2c4", "e7e6", "b1c3", "f8b4"] },
  { name: "Dutch Defense", moves: ["d2d4", "f7f5"] },
  { name: "English Opening", moves: ["c2c4"] },
  { name: "Réti Opening", moves: ["g1f3", "d7d5", "c2c4"] },
  { name: "London System", moves: ["d2d4", "d7d5", "g1f3", "g8f6", "c1f4"] },
];
