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
    /// if the move is illegal or malformed.
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
    /// Searches `fen` and returns the best move in algebraic form, e.g.
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
    internal static string FindBestMove(string fen, int depth, int movetimeMs)
    {
        var board = new Board(fen);

        SearchEvaluation result;
        if (movetimeMs > 0)
        {
            result = Search.RunIterative(board, new SearchOptions { MovetimeMs = movetimeMs });
        }
        else
        {
            var options = new SearchOptions { Depth = depth > 0 ? depth : null };
            result = Search.Run(board, options, -Infinity, Infinity);
        }

        if (result.Move is null) throw new NoLegalMovesError("No legal moves available");

        var move = result.Move.Value;
        string fromAlg = Utils.SquareToAlgebraic(move.From);
        string toAlg = Utils.SquareToAlgebraic(move.To);
        string promo = move.Promotion >= 0 ? Utils.PromotionCharFromCode(move.Promotion, board.WhiteToMove).ToString() : "";
        return fromAlg + toAlg + promo;
    }
}
