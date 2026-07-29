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
    // internal (not private): UciEngine reuses this to seed a Board +
    // positionCounts from a UCI "position" command's startFen/move list,
    // the same way this file's own FindBestMove/GameStatus do.
    internal static (Board board, Dictionary<ulong, PositionInfo> positionCounts) ReplayHistory(string startFen, string moves)
    {
        var board = new Board(startFen);
        var positionCounts = new Dictionary<ulong, PositionInfo>();
        Search.PushPosition(positionCounts, board.PositionKey);

        foreach (var moveStr in SplitMoves(moves))
        {
            ApplyMoveString(board, moveStr);
            Search.PushPosition(positionCounts, board.PositionKey);
        }

        return (board, positionCounts);
    }

    // Last position built by GetOrBuildPosition, kept alive across calls
    // instead of being rebuilt from move 1 every time (see that method).
    private static string? _cachedStartFen;
    private static string[] _cachedMoves = System.Array.Empty<string>();
    private static Board? _cachedBoard;
    private static Dictionary<ulong, PositionInfo>? _cachedPositionCounts;

    // Lives for as long as this WASM module is loaded (the whole browser
    // session/game — see engine.worker.ts, which boots the module once and
    // reuses it for every command), same lifetime as the position cache
    // above. Deliberately not owned by Board: a Board is thrown away and
    // rebuilt constantly (ApplyMove, ReplayHistory's fallback path, every
    // TestRunner check), and a transposition table's whole value is
    // persisting across many of those, not living/dying with any one of them.
    private static readonly TranspositionTable _tt = new(sizeMb: 32);

    /// <summary>
    /// Same result as ReplayHistory(startFen, moves), but reuses the
    /// previous call's Board/positionCounts when `moves` is exactly that
    /// call's move list plus some new moves appended (the common case: one
    /// more engine move and one more opposing move since we last searched) —
    /// applying just the new suffix instead of replaying the whole game.
    /// Falls back to a full ReplayHistory rebuild whenever that doesn't
    /// hold (first call, a new game, a pasted FEN, or history that
    /// diverged from what's cached), so this is always correct, only
    /// sometimes faster.
    ///
    /// internal (not private): UciEngine.Program's HandleGo calls this
    /// instead of ReplayHistory directly for the same reason FindBestMove
    /// does — GameStatus still uses ReplayHistory/a fresh Board, since it's
    /// a one-off legality/repetition check, not a hot search path.
    /// </summary>
    internal static (Board board, Dictionary<ulong, PositionInfo> positionCounts) GetOrBuildPosition(string startFen, string moves)
    {
        string[] moveList = SplitMoves(moves);

        if (_cachedBoard is not null && _cachedStartFen == startFen && IsExtensionOf(moveList, _cachedMoves))
        {
            for (int i = _cachedMoves.Length; i < moveList.Length; i++)
            {
                ApplyMoveString(_cachedBoard, moveList[i]);
                Search.PushPosition(_cachedPositionCounts!, _cachedBoard.PositionKey);
            }
            _cachedMoves = moveList;
            return (_cachedBoard, _cachedPositionCounts!);
        }

        var (board, positionCounts) = ReplayHistory(startFen, moves);
        _cachedStartFen = startFen;
        _cachedMoves = moveList;
        _cachedBoard = board;
        _cachedPositionCounts = positionCounts;
        return (board, positionCounts);
    }

    private static bool IsExtensionOf(string[] moveList, string[] cachedMoves)
    {
        if (moveList.Length < cachedMoves.Length) return false;
        for (int i = 0; i < cachedMoves.Length; i++)
        {
            if (moveList[i] != cachedMoves[i]) return false;
        }
        return true;
    }

    private static string[] SplitMoves(string moves) =>
        string.IsNullOrEmpty(moves) ? System.Array.Empty<string>() : moves.Split('|');

    private static void ApplyMoveString(Board board, string moveStr)
    {
        string from = moveStr.Substring(0, 2);
        string to = moveStr.Substring(2, 2);
        char? promotionChar = moveStr.Length > 4 ? moveStr[4] : null;

        ulong fromBit = 1UL << Utils.AlgebraicToSquare(from);
        ulong toBit = 1UL << Utils.AlgebraicToSquare(to);
        board.MakeMove(fromBit, toBit, promotionChar);
    }

    // Shared by FindBestMove and FindBestMoveWithEval so the two JSExports
    // don't duplicate the search/fallback logic — only how much of the
    // result they hand back to JS differs.
    private static (string moveAlgebraic, int whiteRelativeValue) FindBestMoveInternal(string startFen, string moves, int depth, int movetimeMs)
    {
        var (board, positionCounts) = GetOrBuildPosition(startFen, moves);

        SearchEvaluation result;
        if (movetimeMs > 0)
        {
            result = Search.RunIterative(board, new SearchOptions { MovetimeMs = movetimeMs }, positionCounts, tt: _tt);
        }
        else
        {
            var options = new SearchOptions { Depth = depth > 0 ? depth : null };
            result = Search.Run(board, options, -Infinity, Infinity, positionCounts, 0, tt: _tt);
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

        // result.Value is negamax-style (positive = good for whoever's
        // moving here). Flipped to White-relative — the usual "+/- from
        // White's side" convention (like a UCI `score cp`, but anchored to
        // a fixed color instead of whoever's on move) — since this is meant
        // for a spectator display where the mover alternates every ply, and
        // "positive = good for the side that just moved" would flip meaning
        // from one line to the next.
        int whiteRelativeValue = board.WhiteToMove ? result.Value : -result.Value;
        return (fromAlg + toAlg + promo, whiteRelativeValue);
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
        var (moveAlgebraic, _) = FindBestMoveInternal(startFen, moves, depth, movetimeMs);
        return moveAlgebraic;
    }

    /// <summary>
    /// Same search as FindBestMove, but the return also carries the
    /// White-relative evaluation: "e2e4 36" (move, a space, then an int
    /// centipawn-ish score — same units as Evaluation.EvaluatePosition/
    /// Search's mate-distance scoring, not literal centipawns). Added for
    /// the Engine Competition page (src/competition.ts) to show what each
    /// engine thinks of the position, not just which move it played. A
    /// comparison build (see scripts/build-compare-engine.ts) checked out
    /// from before this export existed won't have it — callers need the
    /// same try/FindBestMove-fallback pattern already used for
    /// history-support detection (see competitionEngine.worker.ts).
    /// </summary>
    [JSExport]
    internal static string FindBestMoveWithEval(string startFen, string moves, int depth, int movetimeMs)
    {
        var (moveAlgebraic, whiteRelativeValue) = FindBestMoveInternal(startFen, moves, depth, movetimeMs);
        return $"{moveAlgebraic} {whiteRelativeValue}";
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
