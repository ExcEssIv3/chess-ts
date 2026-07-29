using System;

namespace EngineCs;

/// <summary>
/// Standard centipawn piece values (1 pawn = 100) — port of
/// src/engine/evaluation.ts. Source: https://www.chessprogramming.org/Point_Value
/// </summary>
public static class Evaluation
{
    public const int PawnValue = 100;
    public const int KnightValue = 320;
    public const int BishopValue = 330;
    public const int RookValue = 500;
    public const int QueenValue = 900;
    public const int KingValue = 0;

    public static int PieceValue(char piece) => char.ToUpperInvariant(piece) switch
    {
        'P' => PawnValue,
        'N' => KnightValue,
        'B' => BishopValue,
        'R' => RookValue,
        'Q' => QueenValue,
        'K' => KingValue,
        _ => 0,
    };

    /// <summary>
    /// Game-phase weight per piece type, for tapering mg/eg evaluation —
    /// standard CPW "tapered eval" weights. Pawns and kings don't move the
    /// needle since their count barely changes across a game. Max phase sum
    /// at the start position is 24 (4+4+8+8).
    /// </summary>
    public const int MaxPhase = 24;

    public static int PhaseValue(char piece) => char.ToUpperInvariant(piece) switch
    {
        'N' => 1,
        'B' => 1,
        'R' => 2,
        'Q' => 4,
        _ => 0,
    };

    /// <summary>Returns difference between white and black material+PST. Negative favors black.</summary>
    public static int EvaluatePosition(Board board)
    {
        int whiteTotal = 0;
        int blackTotal = 0;

        for (int i = 0; i < 64; i++)
        {
            ulong loc = 1UL << i;
            if ((board.WOccupancy & loc) != 0)
            {
                if ((board.WPawns & loc) != 0) { whiteTotal += PawnValue + CalculateSquareValue(i, board.PhaseSum, PieceSquareTables.PawnMg, PieceSquareTables.PawnEg); }
                else if ((board.WRooks & loc) != 0) { whiteTotal += RookValue + CalculateSquareValue(i, board.PhaseSum, PieceSquareTables.RookMg, PieceSquareTables.RookEg); }
                else if ((board.WKnights & loc) != 0) { whiteTotal += KnightValue + CalculateSquareValue(i, board.PhaseSum, PieceSquareTables.KnightMg, PieceSquareTables.KnightEg); }
                else if ((board.WBishops & loc) != 0) { whiteTotal += BishopValue + CalculateSquareValue(i, board.PhaseSum, PieceSquareTables.BishopMg, PieceSquareTables.BishopEg); }
                else if ((board.WQueens & loc) != 0) { whiteTotal += QueenValue + CalculateSquareValue(i, board.PhaseSum, PieceSquareTables.QueenMg, PieceSquareTables.QueenEg); }
                else { whiteTotal += CalculateSquareValueKingDriveBonus(board, i, i, true, PieceSquareTables.KingMg, PieceSquareTables.KingEg); }
            }
            else if ((board.BOccupancy & loc) != 0)
            {
                int mirrored = i ^ 56;
                if ((board.BPawns & loc) != 0) { blackTotal += PawnValue + CalculateSquareValue(mirrored, board.PhaseSum, PieceSquareTables.PawnMg, PieceSquareTables.PawnEg); }
                else if ((board.BRooks & loc) != 0) { blackTotal += RookValue + CalculateSquareValue(mirrored, board.PhaseSum, PieceSquareTables.RookMg, PieceSquareTables.RookEg); }
                else if ((board.BKnights & loc) != 0) { blackTotal += KnightValue + CalculateSquareValue(mirrored, board.PhaseSum, PieceSquareTables.KnightMg, PieceSquareTables.KnightEg); }
                else if ((board.BBishops & loc) != 0) { blackTotal += BishopValue + CalculateSquareValue(mirrored, board.PhaseSum, PieceSquareTables.BishopMg, PieceSquareTables.BishopEg); }
                else if ((board.BQueens & loc) != 0) { blackTotal += QueenValue + CalculateSquareValue(mirrored, board.PhaseSum, PieceSquareTables.QueenMg, PieceSquareTables.QueenEg); }
                else { blackTotal += CalculateSquareValueKingDriveBonus(board, mirrored, i, false, PieceSquareTables.KingMg, PieceSquareTables.KingEg); }
            }
        }

        return whiteTotal - blackTotal;
    }

    private static int CalculateSquareValue(int square, int phaseSum, int[] midgameBoard, int[] endgameBoard)
    {
        return (midgameBoard[square] * phaseSum + endgameBoard[square] * (MaxPhase - phaseSum)) / MaxPhase;
    }

    private static int CalculateDistance(int startSquare, int finishSquare)
    {
        int fileDelta = (startSquare % 8) - (finishSquare % 8);
        int rankDelta = (startSquare / 8) - (finishSquare / 8);

        return Math.Max(Math.Abs(fileDelta), Math.Abs(rankDelta));
    }

    // pstSquare is the (possibly mirrored) square used only for the PST table
    // lookup; realSquare is this king's actual board square, used for the
    // king-distance calculation — the two differ for Black, whose PST lookup
    // mirrors vertically (see the `mirrored` call site) but whose real
    // position on the board is not mirrored.
    private static int CalculateSquareValueKingDriveBonus(Board board, int pstSquare, int realSquare, bool isWhiteKing, int[] midgameBoard, int[] endgameBoard)
    {
        int baseValue = CalculateSquareValue(pstSquare, board.PhaseSum, midgameBoard, endgameBoard);

        int advantage = board.WValue - board.BValue;
        bool thisKingIsWinning = isWhiteKing ? advantage > 0 : advantage < 0;
        if (!thisKingIsWinning) return baseValue;

        int enemyKingPosition = Utils.BitToSquare(isWhiteKing ? board.BKing : board.WKing);
        int distance = CalculateDistance(realSquare, enemyKingPosition);
        return baseValue + (800 - distance * 100) * (MaxPhase - board.PhaseSum) / MaxPhase;
    }
}
