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
                if ((board.WPawns & loc) != 0) { whiteTotal += PawnValue + PieceSquareTables.PawnMg[i]; }
                else if ((board.WRooks & loc) != 0) { whiteTotal += RookValue + PieceSquareTables.RookMg[i]; }
                else if ((board.WKnights & loc) != 0) { whiteTotal += KnightValue + PieceSquareTables.KnightMg[i]; }
                else if ((board.WBishops & loc) != 0) { whiteTotal += BishopValue + PieceSquareTables.BishopMg[i]; }
                else if ((board.WQueens & loc) != 0) { whiteTotal += QueenValue + PieceSquareTables.QueenMg[i]; }
                else { whiteTotal += PieceSquareTables.KingMg[i]; }
            }
            else if ((board.BOccupancy & loc) != 0)
            {
                int mirrored = i ^ 56;
                if ((board.BPawns & loc) != 0) { blackTotal += PawnValue + PieceSquareTables.PawnMg[mirrored]; }
                else if ((board.BRooks & loc) != 0) { blackTotal += RookValue + PieceSquareTables.RookMg[mirrored]; }
                else if ((board.BKnights & loc) != 0) { blackTotal += KnightValue + PieceSquareTables.KnightMg[mirrored]; }
                else if ((board.BBishops & loc) != 0) { blackTotal += BishopValue + PieceSquareTables.BishopMg[mirrored]; }
                else if ((board.BQueens & loc) != 0) { blackTotal += QueenValue + PieceSquareTables.QueenMg[mirrored]; }
                else { blackTotal += PieceSquareTables.KingMg[mirrored]; }
            }
        }

        return whiteTotal - blackTotal;
    }
}
