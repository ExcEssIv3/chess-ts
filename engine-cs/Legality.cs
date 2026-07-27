using System;

namespace EngineCs;

public readonly struct SquareInfo
{
    public readonly ulong Bit;
    public readonly int Square;
    public readonly int Rank;
    public readonly int File;

    public SquareInfo(int square)
    {
        Square = square;
        Bit = 1UL << square;
        Rank = square / 8;
        File = square % 8;
    }

    public static SquareInfo FromBit(ulong bit) => new SquareInfo(Utils.BitToSquare(bit));
}

/// <summary>
/// Port of src/engine/legality.ts: evaluateLegal(board, start, finish, ...)
/// checks whether a single from/to bit pair is legal for the piece on
/// `start`, including that it doesn't leave the mover's own king in check
/// (via make/unmake + Movegen.CheckDanger instead of a board clone).
/// </summary>
public static class Legality
{
    public static bool EvaluateLegal(
        Board board,
        ulong start,
        ulong finish,
        bool? whiteToMoveOverride = null,
        bool evaluateKingDanger = true,
        bool evaluatePawnAttacksOnly = false)
    {
        bool whiteToMove = whiteToMoveOverride ?? board.WhiteToMove;
        var startInfo = SquareInfo.FromBit(start);
        var finishInfo = SquareInfo.FromBit(finish);

        bool canMove = false;
        if (whiteToMove)
        {
            if (!board.AndWhite(start)) return false;
            if (board.AndWhite(finish)) return false;
            if ((board.WPawns & start) != 0) canMove = EvaluatePawnMove(board, true, startInfo, finishInfo, evaluatePawnAttacksOnly);
            else if ((board.WRooks & start) != 0) canMove = EvaluateRookMove(board, true, startInfo, finishInfo);
            else if ((board.WKnights & start) != 0) canMove = EvaluateKnightMove(startInfo, finishInfo);
            else if ((board.WBishops & start) != 0) canMove = EvaluateBishopMove(board, true, startInfo, finishInfo);
            else if ((board.WQueens & start) != 0) canMove = EvaluateQueenMove(board, true, startInfo, finishInfo);
            else if ((board.WKing & start) != 0) canMove = EvaluateKingMove(board, true, startInfo, finishInfo);

            if (canMove)
            {
                if (!evaluateKingDanger) return true;
                var undo = board.MakeMove(start, finish, null);
                bool safe = !Movegen.CheckDanger(board, board.WKing, false);
                board.UnmakeMove(start, finish, null, undo);
                return safe;
            }
        }
        else
        {
            if (!board.AndBlack(start)) return false;
            if (board.AndBlack(finish)) return false;
            if ((board.BPawns & start) != 0) canMove = EvaluatePawnMove(board, false, startInfo, finishInfo, evaluatePawnAttacksOnly);
            else if ((board.BRooks & start) != 0) canMove = EvaluateRookMove(board, false, startInfo, finishInfo);
            else if ((board.BKnights & start) != 0) canMove = EvaluateKnightMove(startInfo, finishInfo);
            else if ((board.BBishops & start) != 0) canMove = EvaluateBishopMove(board, false, startInfo, finishInfo);
            else if ((board.BQueens & start) != 0) canMove = EvaluateQueenMove(board, false, startInfo, finishInfo);
            else if ((board.BKing & start) != 0) canMove = EvaluateKingMove(board, false, startInfo, finishInfo);

            if (canMove)
            {
                if (!evaluateKingDanger) return true;
                var undo = board.MakeMove(start, finish, null);
                bool safe = !Movegen.CheckDanger(board, board.BKing, true);
                board.UnmakeMove(start, finish, null, undo);
                return safe;
            }
        }

        return false;
    }

    private static bool EvaluatePawnMove(Board board, bool whiteToMove, SquareInfo start, SquareInfo finish, bool evaluatePawnAttacksOnly)
    {
        if (start.Bit == finish.Bit) return false;
        int fileDelta = Math.Abs(start.File - finish.File);
        if (fileDelta > 1) return false;

        if (whiteToMove)
        {
            int rankDelta = finish.Rank - start.Rank;
            if (fileDelta == 1)
            {
                if (rankDelta != 1) return false;
                if (evaluatePawnAttacksOnly) return true;
                if (board.EnPassantSquare != -1 && board.EnPassantSquare == finish.Square) return true;
                return board.AndBlack(finish.Bit);
            }
            else if (evaluatePawnAttacksOnly) return false;
            if (board.AndBlack(finish.Bit)) return false;
            if (rankDelta < 1 || rankDelta > 2) return false;
            if (rankDelta == 2)
            {
                if (start.Rank != 1) return false;
                if (board.AndBlack(start.Bit << 8) || board.AndWhite(start.Bit << 8)) return false;
                return true;
            }
            return true;
        }

        // black logic
        {
            int rankDelta = start.Rank - finish.Rank;
            if (fileDelta == 1)
            {
                if (rankDelta != 1) return false;
                if (evaluatePawnAttacksOnly) return true;
                if (board.EnPassantSquare != -1 && board.EnPassantSquare == finish.Square) return true;
                return board.AndWhite(finish.Bit);
            }
            else if (evaluatePawnAttacksOnly) return false;
            if (board.AndWhite(finish.Bit)) return false;
            if (rankDelta < 1 || rankDelta > 2) return false;
            if (rankDelta == 2)
            {
                if (start.Rank != 6) return false;
                if (board.AndBlack(start.Bit >> 8) || board.AndWhite(start.Bit >> 8)) return false;
                return true;
            }
            return true;
        }
    }

    private static bool EvaluateRookMove(Board board, bool whiteToMove, SquareInfo start, SquareInfo finish)
    {
        if (start.Bit == finish.Bit) return false;
        if (start.Rank != finish.Rank)
        {
            if (start.File != finish.File) return false;
            return start.Rank > finish.Rank
                ? EvaluateRepetitiveMovement(board, whiteToMove, start, finish, 0, -1)
                : EvaluateRepetitiveMovement(board, whiteToMove, start, finish, 0, 1);
        }
        else
        {
            return start.File > finish.File
                ? EvaluateRepetitiveMovement(board, whiteToMove, start, finish, -1, 0)
                : EvaluateRepetitiveMovement(board, whiteToMove, start, finish, 1, 0);
        }
    }

    private static bool EvaluateKnightMove(SquareInfo start, SquareInfo finish)
    {
        if (start.Bit == finish.Bit) return false;
        if (Math.Abs(start.Rank - finish.Rank) == 1)
        {
            if (Math.Abs(start.File - finish.File) != 2) return false;
        }
        else if (Math.Abs(start.File - finish.File) == 1)
        {
            if (Math.Abs(start.Rank - finish.Rank) != 2) return false;
        }
        else return false;
        return true;
    }

    private static bool EvaluateBishopMove(Board board, bool whiteToMove, SquareInfo start, SquareInfo finish)
    {
        if (start.Bit == finish.Bit) return false;
        if (Math.Abs(start.Rank - finish.Rank) != Math.Abs(start.File - finish.File)) return false;
        if (start.Rank > finish.Rank)
        {
            if (start.File > finish.File) return EvaluateRepetitiveMovement(board, whiteToMove, start, finish, -1, -1);
            return EvaluateRepetitiveMovement(board, whiteToMove, start, finish, 1, -1);
        }
        if (start.File < finish.File) return EvaluateRepetitiveMovement(board, whiteToMove, start, finish, 1, 1);
        return EvaluateRepetitiveMovement(board, whiteToMove, start, finish, -1, 1);
    }

    private static bool EvaluateQueenMove(Board board, bool whiteToMove, SquareInfo start, SquareInfo finish)
    {
        if (start.Bit == finish.Bit) return false;
        if (start.Rank != finish.Rank && start.File != finish.File) return EvaluateBishopMove(board, whiteToMove, start, finish);
        return EvaluateRookMove(board, whiteToMove, start, finish);
    }

    private static bool EvaluateKingMove(Board board, bool whiteToMove, SquareInfo start, SquareInfo finish)
    {
        if (start.Bit == finish.Bit) return false;
        int rankDelta = Math.Abs(start.Rank - finish.Rank);
        int fileDelta = Math.Abs(start.File - finish.File);
        if (rankDelta > 1) return false;
        if (rankDelta == 1 && fileDelta > 1) return false;
        if (fileDelta > 2) return false;
        if (Movegen.CheckDanger(board, finish.Bit, !whiteToMove)) return false;

        if (fileDelta == 2)
        {
            if (Movegen.CheckDanger(board, start.Bit, !whiteToMove)) return false;
            if (whiteToMove)
            {
                if (start.File - finish.File < 0)
                {
                    // kingside: only f1/g1 must be empty (h1 holds the rook itself)
                    if ((board.CastlingRights & 1) == 0) return false;
                    if (Movegen.CheckDanger(board, start.Bit << 1, !whiteToMove)) return false;
                    if (board.AndWhite(start.Bit << 1) || board.AndBlack(start.Bit << 1)
                        || board.AndWhite(start.Bit << 2) || board.AndBlack(start.Bit << 2)) return false;
                }
                else
                {
                    // queenside: b1/c1/d1 must be empty (b1 doesn't need to be check-safe, only vacant)
                    if ((board.CastlingRights & 2) == 0) return false;
                    if (Movegen.CheckDanger(board, start.Bit >> 1, !whiteToMove)) return false;
                    if (board.AndWhite(start.Bit >> 1) || board.AndBlack(start.Bit >> 1)
                        || board.AndWhite(start.Bit >> 2) || board.AndBlack(start.Bit >> 2)
                        || board.AndWhite(start.Bit >> 3) || board.AndBlack(start.Bit >> 3)) return false;
                }
            }
            else
            {
                if (start.File - finish.File < 0)
                {
                    // kingside: only f8/g8 must be empty (h8 holds the rook itself)
                    if ((board.CastlingRights & 4) == 0) return false;
                    if (Movegen.CheckDanger(board, start.Bit << 1, !whiteToMove)) return false;
                    if (board.AndWhite(start.Bit << 1) || board.AndBlack(start.Bit << 1)
                        || board.AndWhite(start.Bit << 2) || board.AndBlack(start.Bit << 2)) return false;
                }
                else
                {
                    // queenside: b8/c8/d8 must be empty (b8 doesn't need to be check-safe, only vacant)
                    if ((board.CastlingRights & 8) == 0) return false;
                    if (Movegen.CheckDanger(board, start.Bit >> 1, !whiteToMove)) return false;
                    if (board.AndWhite(start.Bit >> 1) || board.AndBlack(start.Bit >> 1)
                        || board.AndWhite(start.Bit >> 2) || board.AndBlack(start.Bit >> 2)
                        || board.AndWhite(start.Bit >> 3) || board.AndBlack(start.Bit >> 3)) return false;
                }
            }
        }
        return true;
    }

    /// <summary>`fileShift`/`rankShift` are per-step direction deltas (-1/0/1), not bits or squares.</summary>
    private static bool EvaluateRepetitiveMovement(Board board, bool whiteToMove, SquareInfo start, SquareInfo finish, int fileShift, int rankShift)
    {
        bool upDirection = finish.Rank - start.Rank > 0;
        bool leftDirection = finish.File - start.File > 0;

        if ((upDirection && rankShift < 0)
            || (!upDirection && rankShift > 0)
            || (leftDirection && fileShift < 0)
            || (!leftDirection && fileShift > 0))
            throw new Exception("Invalid direction");

        int square = start.Square; // walks as a square index, not a bitmask
        int delta = fileShift + rankShift * 8;

        while (square != finish.Square)
        {
            square += delta;
            ulong current = 1UL << square;
            if (whiteToMove)
            {
                if (board.AndWhite(current)) return false;
                if (square != finish.Square && board.AndBlack(current)) return false;
            }
            else
            {
                if (board.AndBlack(current)) return false;
                if (square != finish.Square && board.AndWhite(current)) return false;
            }
        }

        return true;
    }
}
