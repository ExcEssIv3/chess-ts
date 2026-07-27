using System;
using System.Collections.Generic;

namespace EngineCs;

/// <summary>Promotion code: 0=rook, 1=knight, 2=bishop, 3=queen, -1=not a promotion.</summary>
public readonly struct EngineMove
{
    public readonly int From;
    public readonly int To;
    public readonly int Promotion;

    public EngineMove(int from, int to, int promotion = -1)
    {
        From = from;
        To = to;
        Promotion = promotion;
    }
}

/// <summary>
/// Port of src/engine/movegen.ts: CheckDanger answers "is this square
/// attacked" by walking outward from the square in all directions;
/// FindLegalMoves enumerates all legal moves, bucketed by captured-piece
/// value for alpha-beta move ordering.
/// </summary>
public static class Movegen
{
    public static bool CheckDanger(Board board, ulong bit, bool whiteToMove)
    {
        int square = Utils.BitToSquare(bit);
        if (whiteToMove)
        {
            if ((board.WPawns & Attacks.WhitePawnAttackers[square]) != 0) return true;
            if ((board.WKnights & Attacks.KnightAttacks[square]) != 0) return true;
            if ((board.WKing & Attacks.KingAttacks[square]) != 0) return true;
        }
        else
        {
            if ((board.BPawns & Attacks.BlackPawnAttackers[square]) != 0) return true;
            if ((board.BKnights & Attacks.KnightAttacks[square]) != 0) return true;
            if ((board.BKing & Attacks.KingAttacks[square]) != 0) return true;
        }

        if (CheckSlidingDanger(board, square, whiteToMove, whiteToMove ? board.WRooks : board.BRooks, straights: true, diagonals: false)) return true;
        if (CheckSlidingDanger(board, square, whiteToMove, whiteToMove ? board.WBishops : board.BBishops, straights: false, diagonals: true)) return true;
        if (CheckSlidingDanger(board, square, whiteToMove, whiteToMove ? board.WQueens : board.BQueens, straights: true, diagonals: true)) return true;

        return false;
    }

    private static IEnumerable<SquareInfo> SquaresOf(ulong mask)
    {
        while (mask != 0)
        {
            ulong lowBit = mask & (~mask + 1); // isolate lowest set bit
            yield return SquareInfo.FromBit(lowBit);
            mask &= mask - 1;
        }
    }

    /// <summary>
    /// Shared walk for rook/bishop/queen "does a piece of mine attack this
    /// square" checks (checkRookDanger/checkBishopDanger/checkQueenDanger in
    /// the TS original) — walks square-index deltas rather than shifting a
    /// bitmask, since ulong has no signed-shift equivalent to bigint's `<<`
    /// with a negative count.
    /// </summary>
    private static bool CheckSlidingDanger(Board board, int destSquare, bool whiteToMove, ulong pieces, bool straights, bool diagonals)
    {
        int destFile = destSquare % 8;
        int destRank = destSquare / 8;

        foreach (var piece in SquaresOf(pieces))
        {
            int fileDelta = destFile - piece.File;
            int rankDelta = destRank - piece.Rank;

            int stepFile, stepRank;
            if (straights && (piece.File == destFile || piece.Rank == destRank) && !(piece.File == destFile && piece.Rank == destRank))
            {
                stepFile = piece.File == destFile ? 0 : (fileDelta > 0 ? 1 : -1);
                stepRank = piece.Rank == destRank ? 0 : (rankDelta > 0 ? 1 : -1);
            }
            else if (diagonals && piece.File != destFile && piece.Rank != destRank && Math.Abs(fileDelta) == Math.Abs(rankDelta))
            {
                stepFile = fileDelta > 0 ? 1 : -1;
                stepRank = rankDelta > 0 ? 1 : -1;
            }
            else
            {
                continue;
            }

            int delta = stepFile + stepRank * 8;
            int square = piece.Square;
            bool blocked = false;
            while (square != destSquare)
            {
                square += delta;
                ulong current = 1UL << square;
                // same color as the attacker blocks even at the destination
                // (nothing to capture there); opposite color only blocks
                // before the destination — landing on it is the attack itself.
                if (whiteToMove ? board.AndWhite(current) : board.AndBlack(current)) { blocked = true; break; }
                if ((whiteToMove ? board.AndBlack(current) : board.AndWhite(current)) && square != destSquare) { blocked = true; break; }
            }
            if (!blocked) return true;
        }

        return false;
    }

    private class CaptureRanking
    {
        public readonly List<EngineMove> QueenCapture = new();
        public readonly List<EngineMove> RookCapture = new();
        public readonly List<EngineMove> BishopCapture = new();
        public readonly List<EngineMove> KnightCapture = new();
        public readonly List<EngineMove> PawnCapture = new();
        public readonly List<EngineMove> Nothing = new();
    }

    private static void DetermineCaptureRank(Board board, int from, int to, CaptureRanking ranking, int promotion = -1)
    {
        var move = new EngineMove(from, to, promotion);
        ulong toBit = 1UL << to;
        ulong fromBit = 1UL << from;
        // En passant captures land on an empty square (the captured pawn sits
        // on an adjacent square), so the AndBlack/AndWhite occupancy check
        // below would otherwise misclassify them as quiet moves.
        bool isEnPassant = board.EnPassantSquare == to &&
            ((board.WhiteToMove ? board.WPawns : board.BPawns) & fromBit) != 0;
        if (board.WhiteToMove)
        {
            if (isEnPassant) ranking.PawnCapture.Add(move);
            else if (board.AndBlack(toBit))
            {
                if ((board.BQueens & toBit) != 0) ranking.QueenCapture.Add(move);
                else if ((board.BRooks & toBit) != 0) ranking.RookCapture.Add(move);
                else if ((board.BBishops & toBit) != 0) ranking.BishopCapture.Add(move);
                else if ((board.BKnights & toBit) != 0) ranking.KnightCapture.Add(move);
                else if ((board.BPawns & toBit) != 0) ranking.PawnCapture.Add(move);
                else ranking.Nothing.Add(move);
            }
            else ranking.Nothing.Add(move);
        }
        else
        {
            if (isEnPassant) ranking.PawnCapture.Add(move);
            else if (board.AndWhite(toBit))
            {
                if ((board.WQueens & toBit) != 0) ranking.QueenCapture.Add(move);
                else if ((board.WRooks & toBit) != 0) ranking.RookCapture.Add(move);
                else if ((board.WBishops & toBit) != 0) ranking.BishopCapture.Add(move);
                else if ((board.WKnights & toBit) != 0) ranking.KnightCapture.Add(move);
                else if ((board.WPawns & toBit) != 0) ranking.PawnCapture.Add(move);
                else ranking.Nothing.Add(move);
            }
            else ranking.Nothing.Add(move);
        }
    }

    private static void RepetitiveMovementCaptureRank(List<(int from, int to)> moves, Board board, CaptureRanking ranking)
    {
        for (int i = 0; i < moves.Count; i++)
        {
            // only the last step might take a piece
            if (i < moves.Count - 1) ranking.Nothing.Add(new EngineMove(moves[i].from, moves[i].to));
            else DetermineCaptureRank(board, moves[i].from, moves[i].to, ranking);
        }
    }

    // A promoting pawn move (push or capture) is 4 distinct moves — one per
    // promotion piece — not one arbitrary choice, since search needs to
    // weigh them separately.
    private static void PushPawnMove(Board board, int from, int to, bool isPromotion, CaptureRanking ranking)
    {
        if (isPromotion)
        {
            DetermineCaptureRank(board, from, to, ranking, 0); // rook
            DetermineCaptureRank(board, from, to, ranking, 1); // knight
            DetermineCaptureRank(board, from, to, ranking, 2); // bishop
            DetermineCaptureRank(board, from, to, ranking, 3); // queen
        }
        else
        {
            DetermineCaptureRank(board, from, to, ranking);
        }
    }

    public static List<EngineMove> FindLegalMoves(Board board, EngineMove? recommendedMove = null)
    {
        var ranking = new CaptureRanking();

        if (board.WhiteToMove)
        {
            foreach (var pawn in SquaresOf(board.WPawns))
            {
                if (Legality.EvaluateLegal(board, pawn.Bit, pawn.Bit << 8))
                    PushPawnMove(board, pawn.Square, pawn.Square + 8, pawn.Rank == 6, ranking);
                if (pawn.Rank == 1 && Legality.EvaluateLegal(board, pawn.Bit, pawn.Bit << 16))
                    DetermineCaptureRank(board, pawn.Square, pawn.Square + 16, ranking);
                if (pawn.File > 0 && Legality.EvaluateLegal(board, pawn.Bit, pawn.Bit << 7))
                    PushPawnMove(board, pawn.Square, pawn.Square + 7, pawn.Rank == 6, ranking);
                if (pawn.File < 7 && Legality.EvaluateLegal(board, pawn.Bit, pawn.Bit << 9))
                    PushPawnMove(board, pawn.Square, pawn.Square + 9, pawn.Rank == 6, ranking);
            }

            foreach (var rook in SquaresOf(board.WRooks)) GenSliding(board, rook, straights: true, diagonals: false, ranking);
            foreach (var knight in SquaresOf(board.WKnights)) GenStep(board, knight, Attacks.KnightOffsets, ranking);
            foreach (var bishop in SquaresOf(board.WBishops)) GenSliding(board, bishop, straights: false, diagonals: true, ranking);

            var king = SquareInfo.FromBit(board.WKing);
            GenStep(board, king, Attacks.KingOffsets, ranking);
            if ((board.CastlingRights & 1) != 0 && Legality.EvaluateLegal(board, king.Bit, king.Bit << 2))
                DetermineCaptureRank(board, king.Square, king.Square + 2, ranking);
            if ((board.CastlingRights & 2) != 0 && Legality.EvaluateLegal(board, king.Bit, king.Bit >> 2))
                DetermineCaptureRank(board, king.Square, king.Square - 2, ranking);

            foreach (var queen in SquaresOf(board.WQueens)) GenSliding(board, queen, straights: true, diagonals: true, ranking);
        }
        else
        {
            foreach (var pawn in SquaresOf(board.BPawns))
            {
                if (Legality.EvaluateLegal(board, pawn.Bit, pawn.Bit >> 8))
                    PushPawnMove(board, pawn.Square, pawn.Square - 8, pawn.Rank == 1, ranking);
                if (pawn.Rank == 6 && Legality.EvaluateLegal(board, pawn.Bit, pawn.Bit >> 16))
                    DetermineCaptureRank(board, pawn.Square, pawn.Square - 16, ranking);
                if (pawn.File > 0 && Legality.EvaluateLegal(board, pawn.Bit, pawn.Bit >> 9))
                    PushPawnMove(board, pawn.Square, pawn.Square - 9, pawn.Rank == 1, ranking);
                if (pawn.File < 7 && Legality.EvaluateLegal(board, pawn.Bit, pawn.Bit >> 7))
                    PushPawnMove(board, pawn.Square, pawn.Square - 7, pawn.Rank == 1, ranking);
            }

            foreach (var rook in SquaresOf(board.BRooks)) GenSliding(board, rook, straights: true, diagonals: false, ranking);
            foreach (var knight in SquaresOf(board.BKnights)) GenStep(board, knight, Attacks.KnightOffsets, ranking);
            foreach (var bishop in SquaresOf(board.BBishops)) GenSliding(board, bishop, straights: false, diagonals: true, ranking);

            var king = SquareInfo.FromBit(board.BKing);
            GenStep(board, king, Attacks.KingOffsets, ranking);
            if ((board.CastlingRights & 4) != 0 && Legality.EvaluateLegal(board, king.Bit, king.Bit << 2))
                ranking.Nothing.Add(new EngineMove(king.Square, king.Square + 2));
            if ((board.CastlingRights & 8) != 0 && Legality.EvaluateLegal(board, king.Bit, king.Bit >> 2))
                ranking.Nothing.Add(new EngineMove(king.Square, king.Square - 2));

            foreach (var queen in SquaresOf(board.BQueens)) GenSliding(board, queen, straights: true, diagonals: true, ranking);
        }

        var moves = new List<EngineMove>(
            (recommendedMove is not null) ? 1 : 0 +
            ranking.QueenCapture.Count + ranking.RookCapture.Count + ranking.BishopCapture.Count +
            ranking.KnightCapture.Count + ranking.PawnCapture.Count + ranking.Nothing.Count);
        if (recommendedMove is not null) moves.Add(recommendedMove.Value);
        moves.AddRange(ranking.QueenCapture);
        moves.AddRange(ranking.RookCapture);
        moves.AddRange(ranking.BishopCapture);
        moves.AddRange(ranking.KnightCapture);
        moves.AddRange(ranking.PawnCapture);
        moves.AddRange(ranking.Nothing);
        return moves;
    }

    public static List<EngineMove> FindCaptureMoves(Board board)
    {
        var ranking = new CaptureRanking();

        if (board.WhiteToMove)
        {
            foreach (var pawn in SquaresOf(board.WPawns))
            {
                if (
                    pawn.File > 0
                    && (board.AndBlack(pawn.Bit << 7) || board.EnPassantSquare == pawn.Square + 7)
                    && Legality.EvaluateLegal(board, pawn.Bit, pawn.Bit << 7))
                    PushPawnMove(board, pawn.Square, pawn.Square + 7, pawn.Rank == 6, ranking);
                if (
                    pawn.File < 7
                    && (board.AndBlack(pawn.Bit << 9) || board.EnPassantSquare == pawn.Square + 9)
                    && Legality.EvaluateLegal(board, pawn.Bit, pawn.Bit << 9))
                    PushPawnMove(board, pawn.Square, pawn.Square + 9, pawn.Rank == 6, ranking);
            }

            foreach (var rook in SquaresOf(board.WRooks)) GenSlidingCapture(board, rook, straights: true, diagonals: false, ranking);
            foreach (var knight in SquaresOf(board.WKnights)) GenStepCapture(board, knight, Attacks.KnightOffsets, ranking);
            foreach (var bishop in SquaresOf(board.WBishops)) GenSlidingCapture(board, bishop, straights: false, diagonals: true, ranking);

            var king = SquareInfo.FromBit(board.WKing);
            GenStepCapture(board, king, Attacks.KingOffsets, ranking);

            foreach (var queen in SquaresOf(board.WQueens)) GenSlidingCapture(board, queen, straights: true, diagonals: true, ranking);
        }
        else
        {
            foreach (var pawn in SquaresOf(board.BPawns))
            {
                if (
                    pawn.File > 0
                    && (board.AndWhite(pawn.Bit >> 9) || board.EnPassantSquare == pawn.Square - 9)
                    && Legality.EvaluateLegal(board, pawn.Bit, pawn.Bit >> 9))
                    PushPawnMove(board, pawn.Square, pawn.Square - 9, pawn.Rank == 1, ranking);
                if (
                    pawn.File < 7
                    && (board.AndWhite(pawn.Bit >> 7) || board.EnPassantSquare == pawn.Square - 7)
                    && Legality.EvaluateLegal(board, pawn.Bit, pawn.Bit >> 7))
                    PushPawnMove(board, pawn.Square, pawn.Square - 7, pawn.Rank == 1, ranking);
            }

            foreach (var rook in SquaresOf(board.BRooks)) GenSlidingCapture(board, rook, straights: true, diagonals: false, ranking);
            foreach (var knight in SquaresOf(board.BKnights)) GenStepCapture(board, knight, Attacks.KnightOffsets, ranking);
            foreach (var bishop in SquaresOf(board.BBishops)) GenSlidingCapture(board, bishop, straights: false, diagonals: true, ranking);

            var king = SquareInfo.FromBit(board.BKing);
            GenStepCapture(board, king, Attacks.KingOffsets, ranking);

            foreach (var queen in SquaresOf(board.BQueens)) GenSlidingCapture(board, queen, straights: true, diagonals: true, ranking);
        }

        var moves = new List<EngineMove>();
        moves.AddRange(ranking.QueenCapture);
        moves.AddRange(ranking.RookCapture);
        moves.AddRange(ranking.BishopCapture);
        moves.AddRange(ranking.KnightCapture);
        moves.AddRange(ranking.PawnCapture);
        return moves;
    }

    private static void GenStep(Board board, SquareInfo piece, (int fileDelta, int rankDelta)[] offsets, CaptureRanking ranking)
    {
        foreach (var (fileDelta, rankDelta) in offsets)
        {
            int targetFile = piece.File + fileDelta;
            int targetRank = piece.Rank + rankDelta;
            if (targetFile < 0 || targetFile > 7 || targetRank < 0 || targetRank > 7) continue;
            int target = piece.Square + rankDelta * 8 + fileDelta;
            if (Legality.EvaluateLegal(board, piece.Bit, 1UL << target)) DetermineCaptureRank(board, piece.Square, target, ranking);
        }
    }

    private static void GenStepCapture(Board board, SquareInfo piece, (int fileDelta, int rankDelta)[] offsets, CaptureRanking ranking)
    {
        foreach (var (fileDelta, rankDelta) in offsets)
        {
            int targetFile = piece.File + fileDelta;
            int targetRank = piece.Rank + rankDelta;
            if (targetFile < 0 || targetFile > 7 || targetRank < 0 || targetRank > 7) continue;
            int target = piece.Square + rankDelta * 8 + fileDelta;
            if (Legality.EvaluateLegal(board, piece.Bit, 1UL << target)) {
                if (board.WhiteToMove ? board.AndBlack(1UL << target) : board.AndWhite(1UL << target))
                {
                    DetermineCaptureRank(board, piece.Square, target, ranking);
                }
            }
        }
    }

    private static readonly (int fileShift, int rankShift)[] StraightDirs = { (1, 0), (0, 1), (-1, 0), (0, -1) };
    private static readonly (int fileShift, int rankShift)[] DiagonalDirs = { (1, -1), (1, 1), (-1, -1), (-1, 1) };

    private static void GenSliding(Board board, SquareInfo piece, bool straights, bool diagonals, CaptureRanking ranking)
    {
        if (straights)
            foreach (var (fileShift, rankShift) in StraightDirs)
                RepetitiveMovementCaptureRank(SaveRepetitiveMovements(board, piece, fileShift, rankShift), board, ranking);
        if (diagonals)
            foreach (var (fileShift, rankShift) in DiagonalDirs)
                RepetitiveMovementCaptureRank(SaveRepetitiveMovements(board, piece, fileShift, rankShift), board, ranking);
    }

    private static void GenSlidingCapture(Board board, SquareInfo piece, bool straights, bool diagonals, CaptureRanking ranking)
    {
        if (straights)
            foreach (var (fileShift, rankShift) in StraightDirs)
                RepetitiveMovementCaptureRank(SaveRepetitiveCaptures(board, piece, fileShift, rankShift), board, ranking);
        if (diagonals)
            foreach (var (fileShift, rankShift) in DiagonalDirs)
                RepetitiveMovementCaptureRank(SaveRepetitiveCaptures(board, piece, fileShift, rankShift), board, ranking);
    }

    private static List<(int from, int to)> SaveRepetitiveMovements(Board board, SquareInfo start, int fileShift, int rankShift)
    {
        var moves = new List<(int, int)>();

        bool originalWhiteToMove = board.WhiteToMove;
        int square = start.Square;
        int delta = fileShift + rankShift * 8;

        while (true)
        {
            int file = square % 8;
            int rank = square / 8;
            if (fileShift > 0 && file == 7) break;
            if (fileShift < 0 && file == 0) break;
            if (rankShift > 0 && rank == 7) break;
            if (rankShift < 0 && rank == 0) break;

            square += delta;
            ulong current = 1UL << square;
            if (originalWhiteToMove)
            {
                if (board.AndWhite(current)) break;
                if (board.AndBlack(current))
                {
                    if (LeavesKingSafeFixed(board, start.Bit, current, originalWhiteToMove)) moves.Add((start.Square, square));
                    break;
                }
                if (LeavesKingSafeFixed(board, start.Bit, current, originalWhiteToMove)) moves.Add((start.Square, square));
            }
            else
            {
                if (board.AndBlack(current)) break;
                if (board.AndWhite(current))
                {
                    if (LeavesKingSafeFixed(board, start.Bit, current, originalWhiteToMove)) moves.Add((start.Square, square));
                    break;
                }
                if (LeavesKingSafeFixed(board, start.Bit, current, originalWhiteToMove)) moves.Add((start.Square, square));
            }
        }

        return moves;
    }

    private static List<(int from, int to)> SaveRepetitiveCaptures(Board board, SquareInfo start, int fileShift, int rankShift)
    {
        var moves = new List<(int, int)>();

        bool originalWhiteToMove = board.WhiteToMove;
        int square = start.Square;
        int delta = fileShift + rankShift * 8;

        while (true)
        {
            int file = square % 8;
            int rank = square / 8;
            if (fileShift > 0 && file == 7) break;
            if (fileShift < 0 && file == 0) break;
            if (rankShift > 0 && rank == 7) break;
            if (rankShift < 0 && rank == 0) break;

            square += delta;
            ulong current = 1UL << square;
            if (originalWhiteToMove)
            {
                if (board.AndWhite(current)) break;
                if (board.AndBlack(current))
                {
                    if (LeavesKingSafeFixed(board, start.Bit, current, originalWhiteToMove)) moves.Add((start.Square, square));
                    break;
                }
            }
            else
            {
                if (board.AndBlack(current)) break;
                if (board.AndWhite(current))
                {
                    if (LeavesKingSafeFixed(board, start.Bit, current, originalWhiteToMove)) moves.Add((start.Square, square));
                    break;
                }
            }
        }

        return moves;
    }

    private static bool LeavesKingSafeFixed(Board board, ulong start, ulong finish, bool originalWhiteToMove)
    {
        var undo = board.MakeMove(start, finish, null);
        bool safe = !CheckDanger(board, originalWhiteToMove ? board.WKing : board.BKing, !originalWhiteToMove);
        board.UnmakeMove(start, finish, null, undo);
        return safe;
    }
}
