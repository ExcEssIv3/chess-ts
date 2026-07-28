namespace EngineCs;

using System;
using System.Collections.Generic;
using System.Diagnostics;

public struct SearchOptions
{
    /// <summary>null mirrors the TS `depth?: number` left undefined (JS falsy) — leaf-only, no recursion.</summary>
    public int? Depth;
    public int? MovetimeMs;
}

public struct SearchEvaluation
{
    public EngineMove? Move;
    public int Value;
}

/// <summary>
/// Per-position-hash bookkeeping shared across one Run/RunIterative call.
/// Count is how many times this exact position (game history + current
/// search path) has occurred — reaching 3 is an automatic draw. Eval is a
/// lazily-cached static evaluation (perspective-adjusted): safe to reuse
/// across the whole search tree regardless of depth/alpha-beta context,
/// since it's a pure function of the position (unlike a searched score,
/// which depends on depth and bounds and would NOT be safe to cache this
/// way). HasEval distinguishes "not computed yet" from a genuine 0 eval.
/// </summary>
public struct PositionInfo
{
    public int Count;
    public int Eval;
    public bool HasEval;
}

/// <summary>
/// Recursive negamax search with alpha-beta pruning — port of
/// src/engine/engine.ts's `search`. Uses make/unmake instead of board.clone()
/// for each candidate move.
/// </summary>
public static class Search
{
    public static SearchEvaluation Run(
        Board board,
        SearchOptions searchOptions,
        int alpha,
        int beta,
        Dictionary<ulong, PositionInfo> positionCounts,
        EngineMove? recommendedMove = null,
        Stopwatch? rootDeadlineClock = null,
        long? rootDeadlineMs = null)
    {
        // Checked before movegen: a threefold repetition is a draw
        // unconditionally, regardless of whose move it is or what moves
        // exist. The caller is responsible for having already pushed this
        // node's own position count (see the per-move push/pop below and
        // RunIterative's initial push of the root).
        if (IsThreefoldRepetition(positionCounts, board.PositionKey))
        {
            return new SearchEvaluation { Move = null, Value = 0 };
        }

        var legalMoves = Movegen.FindLegalMoves(board, recommendedMove);

        if (legalMoves.Count == 0)
        {
            bool inCheck = Movegen.CheckDanger(board, board.WhiteToMove ? board.WKing : board.BKing, !board.WhiteToMove);
            return new SearchEvaluation { Move = null, Value = inCheck ? -10000 : 0 };
        }

        // JS `if (searchOptions.depth)` is falsy for both undefined AND 0 —
        // match that quirk exactly: depth 0 behaves like "no depth given"
        // (one flat ply of material+PST eval, no recursion, no pruning).
        if (searchOptions.Depth.HasValue && searchOptions.Depth.Value != 0)
        {
            int maxMoveValue = int.MinValue;
            EngineMove? bestMove = null;

            foreach (var move in legalMoves)
            {
                // Only the root ply (rootDeadlineClock passed in by
                // RunIterative) bails early on a blown time budget — each
                // depth here costs roughly branching-factor-times the last,
                // so without this a slow depth can run for minutes past its
                // budget. Recursive calls below don't forward the clock, so
                // deeper plies always finish normally; `bestMove is not null`
                // guarantees at least one root move is fully searched before
                // we're allowed to bail, so we never return an unevaluated node.
                if (rootDeadlineClock is not null && bestMove is not null
                    && rootDeadlineClock.ElapsedMilliseconds >= rootDeadlineMs) break;

                ulong from = 1UL << move.From;
                ulong to = 1UL << move.To;
                char? promotion = move.Promotion >= 0 ? Utils.PromotionCharFromCode(move.Promotion, board.WhiteToMove) : null;

                var undo = board.MakeMove(from, to, promotion);
                PushPosition(positionCounts, board.PositionKey);
                var childOptions = new SearchOptions { Depth = searchOptions.Depth - 1, MovetimeMs = searchOptions.MovetimeMs };
                // negamax: recurse with bounds swapped-and-negated. Don't
                // forward recommendedMove — it's only legal at THIS node's
                // position; Movegen.FindLegalMoves adds it unchecked, so
                // passing it into a child (a different position after
                // MakeMove) injects a fabricated "legal move" that corrupts
                // the board when later applied there.
                var childEval = Run(board, childOptions, -beta, -alpha, positionCounts);
                PopPosition(positionCounts, board.PositionKey);
                board.UnmakeMove(from, to, promotion, undo);

                // childEval.Value is from the opponent's perspective; flip it
                // to score this move from ours.
                int evaluation = -childEval.Value;
                if (evaluation > maxMoveValue)
                {
                    bestMove = move;
                    maxMoveValue = evaluation;
                }
                if (maxMoveValue > alpha) alpha = maxMoveValue;
                if (alpha >= beta) return new SearchEvaluation { Move = bestMove, Value = maxMoveValue };
            }

            return new SearchEvaluation { Move = bestMove, Value = maxMoveValue };
        }

        return new SearchEvaluation { Move = null, Value = Quiesce(board, alpha, beta, positionCounts) };
    }

    public static SearchEvaluation RunIterative(Board board, SearchOptions searchOptions, Dictionary<ulong, PositionInfo> positionCounts)
    {
        if (searchOptions.MovetimeMs is null) throw new Exception("Movetime cannot be null for iterative runs");

        var sw = Stopwatch.StartNew();
        SearchEvaluation best = default;
        int depth = 1;

        do
        {
            var candidate = Run(
                board,
                new SearchOptions { Depth = depth },
                int.MinValue + 1,
                int.MaxValue,
                positionCounts,
                best.Move,
                sw,
                searchOptions.MovetimeMs);
            if (candidate.Move is not null) best = candidate;
            depth++;
        } while (sw.ElapsedMilliseconds < searchOptions.MovetimeMs);

        return best;
    }

    private static int Quiesce(
        Board board,
        int alpha,
        int beta,
        Dictionary<ulong, PositionInfo> positionCounts
    )
    {
        if (IsThreefoldRepetition(positionCounts, board.PositionKey)) return 0;

        bool inCheck = Movegen.CheckDanger(board, board.WhiteToMove ? board.WKing : board.BKing, !board.WhiteToMove);

        List<EngineMove> moves;
        int best;
        if (inCheck)
        {
            // Can't stand pat while in check — the mover has no choice but to
            // address it, so search every legal evasion, not just captures.
            moves = Movegen.FindLegalMoves(board);
            if (moves.Count == 0) return -10000; // checkmated at this node
            best = int.MinValue;
        }
        else
        {
            int standPat = GetOrComputeEval(positionCounts, board);
            if (standPat >= beta) return standPat;
            if (standPat > alpha) alpha = standPat;
            best = standPat;
            moves = Movegen.FindCaptureMoves(board);
        }

        foreach (EngineMove move in moves)
        {
            ulong from = 1UL << move.From;
            ulong to = 1UL << move.To;
            char? promotion = move.Promotion >= 0 ? Utils.PromotionCharFromCode(move.Promotion, board.WhiteToMove) : null;

            var undo = board.MakeMove(from, to, promotion);
            PushPosition(positionCounts, board.PositionKey);
            // negamax: recurse with bounds swapped-and-negated, then flip the
            // result back since it's scored from the opponent's perspective.
            int childEval = Quiesce(board, -beta, -alpha, positionCounts);
            PopPosition(positionCounts, board.PositionKey);
            board.UnmakeMove(from, to, promotion, undo);

            int evaluation = -childEval;
            if (evaluation > best)
            {
                best = evaluation;
            }
            if (best > alpha) alpha = best;
            if (alpha >= beta) break;
        }

        return best;
    }

    // True once a position has occurred for (at least) the 3rd time, per the
    // Count already pushed by the caller for the current node.
    private static bool IsThreefoldRepetition(Dictionary<ulong, PositionInfo> positionCounts, ulong key)
    {
        return positionCounts.TryGetValue(key, out var info) && info.Count >= 3;
    }

    // Increment this position's occurrence count — called right after
    // MakeMove, before recursing, mirroring the make/unmake symmetry.
    // Internal (not private): EngineInterop's history-replay helper reuses
    // this same push to seed positionCounts from the real game history.
    internal static void PushPosition(Dictionary<ulong, PositionInfo> positionCounts, ulong key)
    {
        positionCounts.TryGetValue(key, out var info); // defaults to Count=0 if absent
        info.Count++;
        positionCounts[key] = info;
    }

    // Decrement this position's occurrence count — called right after the
    // recursive call returns, before UnmakeMove. The entry is intentionally
    // left in the dictionary (not removed at Count 0) so any cached Eval
    // survives for reuse if a sibling branch revisits the same position.
    private static void PopPosition(Dictionary<ulong, PositionInfo> positionCounts, ulong key)
    {
        var info = positionCounts[key];
        info.Count--;
        positionCounts[key] = info;
    }

    // Static eval is a pure function of the position, so once computed for a
    // given hash it's safe to reuse anywhere else in the tree that reaches
    // the same position — unlike a searched score, it has no dependency on
    // remaining depth or the alpha-beta window it was computed under.
    private static int GetOrComputeEval(Dictionary<ulong, PositionInfo> positionCounts, Board board)
    {
        ulong key = board.PositionKey;
        if (positionCounts.TryGetValue(key, out var info) && info.HasEval)
        {
            return info.Eval;
        }

        int perspective = board.WhiteToMove ? 1 : -1;
        int eval = Evaluation.EvaluatePosition(board) * perspective;

        info.Eval = eval;
        info.HasEval = true;
        positionCounts[key] = info;
        return eval;
    }
}
