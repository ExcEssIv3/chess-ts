namespace EngineCs;

/// <summary>
/// Attack tables computed once (pure geometry, independent of board state) —
/// port of src/engine/attacks.ts + attacks-generator.ts.
/// </summary>
public static class Attacks
{
    // [fileDelta, rankDelta] pairs, checked against the board edge before use.
    public static readonly (int fileDelta, int rankDelta)[] KnightOffsets =
    {
        (1, 2), (2, 1), (2, -1), (1, -2),
        (-1, -2), (-2, -1), (-2, 1), (-1, 2),
    };

    public static readonly (int fileDelta, int rankDelta)[] KingOffsets =
    {
        (1, 0), (1, 1), (1, -1), (-1, 0),
        (-1, 1), (-1, -1), (0, 1), (0, -1),
    };

    // Indexed by *target* square, not origin: WhitePawnAttackers[i] is the set
    // of squares a white pawn would need to stand on to attack square i.
    public static readonly ulong[] WhitePawnAttackers = new ulong[64];
    public static readonly ulong[] BlackPawnAttackers = new ulong[64];
    public static readonly ulong[] KnightAttacks = new ulong[64];
    public static readonly ulong[] KingAttacks = new ulong[64];

    static Attacks()
    {
        for (int i = 0; i < 64; i++)
        {
            if (i < 8) WhitePawnAttackers[i] = 0UL;
            else if (i % 8 == 0) WhitePawnAttackers[i] = 1UL << (i - 7);
            else if (i % 8 == 7) WhitePawnAttackers[i] = 1UL << (i - 9);
            else WhitePawnAttackers[i] = 5UL << (i - 9);

            if (i > 55) BlackPawnAttackers[i] = 0UL;
            else if (i % 8 == 0) BlackPawnAttackers[i] = 1UL << (i + 9);
            else if (i % 8 == 7) BlackPawnAttackers[i] = 1UL << (i + 7);
            else BlackPawnAttackers[i] = 5UL << (i + 7);

            int file = i % 8;
            int rank = i / 8;

            ulong knightSquares = 0UL;
            foreach (var (fileDelta, rankDelta) in KnightOffsets)
            {
                int targetFile = file + fileDelta;
                int targetRank = rank + rankDelta;
                if (targetFile < 0 || targetFile > 7 || targetRank < 0 || targetRank > 7) continue;
                knightSquares |= 1UL << (targetRank * 8 + targetFile);
            }
            KnightAttacks[i] = knightSquares;

            ulong kingSquares = 0UL;
            foreach (var (fileDelta, rankDelta) in KingOffsets)
            {
                int targetFile = file + fileDelta;
                int targetRank = rank + rankDelta;
                if (targetFile < 0 || targetFile > 7 || targetRank < 0 || targetRank > 7) continue;
                kingSquares |= 1UL << (targetRank * 8 + targetFile);
            }
            KingAttacks[i] = kingSquares;
        }
    }
}
