using System.Collections.Generic;
using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;

namespace EngineCs;

// JS <-> WASM boundary — mirrors src/engine/index.ts's two entry points.
// Kept narrow: strings in, strings out, no marshalled objects/arrays.
[SupportedOSPlatform("browser")]
public static partial class EngineInterop
{
    // Large-but-safe stand-ins for JS's +/-Infinity: checkmate score is only
    // +/-10000 and material+PST evals are far smaller, so these never get
    // reached by a real evaluation, but stay well clear of int under/overflow
    // when negated during negamax recursion (unlike int.MinValue/MaxValue).
    private const int Infinity = 1_000_000;

    /// <summary>
    /// Applies a single move to `fen` and returns the resulting FEN.
    /// Throws IllegalMoveError (propagated to JS as a catchable exception)
    /// if the move is illegal or malformed. Doesn't need game history —
    /// a single move's legality never depends on repetition.
    /// </summary>
    [JSExport]
    internal static string ApplyMove(string fen, string from, string to, string? promotion)
    {
        if (promotion is not null && !Utils.IsPromotionPieceChar(promotion))
        {
            throw new IllegalMoveError("Invalid move");
        }
        char? promotionChar = promotion is { Length: 1 } ? promotion[0] : null;

        var board = new Board(fen);
        int fromSquare = Utils.AlgebraicToSquare(from);
        int toSquare = Utils.AlgebraicToSquare(to);
        ulong fromBit = 1UL << fromSquare;
        ulong toBit = 1UL << toSquare;

        if (Legality.EvaluateLegal(board, fromBit, toBit))
        {
            board.MakeMove(fromBit, toBit, promotionChar);
            return board.ConvertFen();
        }

        throw new IllegalMoveError("Invalid move");
    }

    /// <summary>
    /// Reconstructs the current position by replaying `moves` (each in the
    /// same algebraic form FindBestMove returns, e.g. "e2e4"/"e7e8q",
    /// delimited by "|") on top of `startFen`, building a positionCounts
    /// dictionary along the way via the same Search.PushPosition used
    /// inside the search tree itself — so the real game history and any
    /// hypothetical search-path repeats are tracked the same way. `moves`
    /// is already-legal by construction (every entry was previously applied
    /// via ApplyMove when it was actually played), so this replays via
    /// MakeMove directly with no legality re-checking.
    ///
    /// If the caller can't supply history (e.g. the user pasted an
    /// arbitrary FEN mid-game via the UI), `moves` is just empty and
    /// `startFen` is treated as a fresh start with no prior occurrences —
    /// a real repetition spanning the paste would then only be caught after
    /// recurring 3 more times post-paste, not 3 total. Accepted tradeoff:
    /// there's no way to recover history that was never provided.
    /// </summary>
    private static (Board board, Dictionary<ulong, PositionInfo> positionCounts) ReplayHistory(string startFen, string moves)
    {
        var board = new Board(startFen);
        var positionCounts = new Dictionary<ulong, PositionInfo>();
        Search.PushPosition(positionCounts, board.PositionKey);

        if (!string.IsNullOrEmpty(moves))
        {
            foreach (var moveStr in moves.Split('|'))
            {
                string from = moveStr.Substring(0, 2);
                string to = moveStr.Substring(2, 2);
                char? promotionChar = moveStr.Length > 4 ? moveStr[4] : null;

                ulong fromBit = 1UL << Utils.AlgebraicToSquare(from);
                ulong toBit = 1UL << Utils.AlgebraicToSquare(to);
                board.MakeMove(fromBit, toBit, promotionChar);
                Search.PushPosition(positionCounts, board.PositionKey);
            }
        }

        return (board, positionCounts);
    }

    /// <summary>
    /// Searches the position reached by replaying `moves` on `startFen` (see
    /// ReplayHistory) and returns the best move in algebraic form, e.g.
    /// "e2e4" or "e7e8q" (lowercase promotion letter, uppercase-vs-lowercase
    /// determined by the mover's color via Utils.PromotionCharFromCode).
    /// If `movetimeMs` is positive, iterative deepening runs until that time
    /// budget elapses (see Search.RunIterative) and `depth` is ignored.
    /// Otherwise searches a fixed `depth` plies (0/negative means "no
    /// recursion", matching the TS engine's `depth` being left undefined).
    /// Throws NoLegalMovesError (propagated to JS as a catchable exception)
    /// if there is no legal move.
    /// </summary>
    [JSExport]
    internal static string FindBestMove(string startFen, string moves, int depth, int movetimeMs)
    {
        var (board, positionCounts) = ReplayHistory(startFen, moves);

        SearchEvaluation result;
        if (movetimeMs > 0)
        {
            result = Search.RunIterative(board, new SearchOptions { MovetimeMs = movetimeMs }, positionCounts);
        }
        else
        {
            var options = new SearchOptions { Depth = depth > 0 ? depth : null };
            result = Search.Run(board, options, -Infinity, Infinity, positionCounts);
        }

        if (result.Move is null)
        {
            // Move==null from Run/RunIterative means one of two different
            // things: genuinely no legal moves (checkmate/stalemate), or the
            // starting position itself was already a confirmed 3rd
            // occurrence, so Run's repetition shortcut returned before ever
            // generating moves. The caller (match.ts's referee.gameStatus
            // check) should normally catch a real repetition before ever
            // calling FindBestMove, but this is a safety net for callers
            // that don't (e.g. interactive play) — the game isn't actually
            // over, so fall back to any legal move rather than throwing.
            var fallbackMoves = Movegen.FindLegalMoves(board);
            if (fallbackMoves.Count == 0) throw new NoLegalMovesError("No legal moves available");
            result = new SearchEvaluation { Move = fallbackMoves[0], Value = 0 };
        }

        var move = result.Move.Value;
        string fromAlg = Utils.SquareToAlgebraic(move.From);
        string toAlg = Utils.SquareToAlgebraic(move.To);
        string promo = move.Promotion >= 0 ? Utils.PromotionCharFromCode(move.Promotion, board.WhiteToMove).ToString() : "";
        return fromAlg + toAlg + promo;
    }

    /// <summary>
    /// Returns "ongoing", "checkmate", "stalemate", or "threefold-repetition"
    /// for the position reached by replaying `moves` on `startFen` (see
    /// ReplayHistory). Only ever called against the current build acting as
    /// match referee (see src/competition/match.ts) — a comparison build
    /// checked out from an older git ref may not export this at all.
    /// </summary>
    [JSExport]
    internal static string GameStatus(string startFen, string moves)
    {
        var (board, positionCounts) = ReplayHistory(startFen, moves);

        if (Movegen.FindLegalMoves(board).Count == 0)
        {
            bool inCheck = Movegen.CheckDanger(board, board.WhiteToMove ? board.WKing : board.BKing, !board.WhiteToMove);
            return inCheck ? "checkmate" : "stalemate";
        }

        if (positionCounts.TryGetValue(board.PositionKey, out var info) && info.Count >= 3)
        {
            return "threefold-repetition";
        }

        return "ongoing";
    }
}
