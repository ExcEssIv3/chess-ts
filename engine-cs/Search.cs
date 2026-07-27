namespace EngineCs;

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Text.RegularExpressions;

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
        EngineMove? recommendedMove = null,
        Stopwatch? rootDeadlineClock = null,
        long? rootDeadlineMs = null)
    {
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
                var childOptions = new SearchOptions { Depth = searchOptions.Depth - 1, MovetimeMs = searchOptions.MovetimeMs };
                // negamax: recurse with bounds swapped-and-negated. Don't
                // forward recommendedMove — it's only legal at THIS node's
                // position; Movegen.FindLegalMoves adds it unchecked, so
                // passing it into a child (a different position after
                // MakeMove) injects a fabricated "legal move" that corrupts
                // the board when later applied there.
                var childEval = Run(board, childOptions, -beta, -alpha);
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

        return new SearchEvaluation { Move = null, Value = Quiesce(board, alpha, beta) };
    }

    public static SearchEvaluation RunIterative(Board board, SearchOptions searchOptions)
    {
        if (searchOptions.MovetimeMs is null) throw new Exception("Movetime cannot be null for iterative runs");

        var sw = Stopwatch.StartNew();
        SearchEvaluation best = default;
        int depth = 1;

        do
        {
            var candidate = Run(board, new SearchOptions { Depth = depth }, int.MinValue + 1, int.MaxValue, best.Move, sw, searchOptions.MovetimeMs);
            if (candidate.Move is not null) best = candidate;
            depth++;
        } while (sw.ElapsedMilliseconds < searchOptions.MovetimeMs);

        return best;
    }

    private static int Quiesce(
        Board board,
        int alpha,
        int beta
    )
    {
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
            int perspective = board.WhiteToMove ? 1 : -1;
            int standPat = Evaluation.EvaluatePosition(board) * perspective;
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
            // negamax: recurse with bounds swapped-and-negated, then flip the
            // result back since it's scored from the opponent's perspective.
            int childEval = Quiesce(board, -beta, -alpha);
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
}
