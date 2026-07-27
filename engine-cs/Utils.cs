namespace EngineCs;

/// <summary>
/// Conversions between bitmask ("bit", a single set 64-bit flag), square index
/// (0-63), and algebraic notation ("e2") — port of src/engine/utils.ts.
/// Bit-vs-square-index confusion is the most common source of bugs here, same
/// as the TS original: check which one a function takes/returns before using it.
/// </summary>
public static class Utils
{
    /// <summary>bit (bitmask, single set bit) -> square (0-63 index).</summary>
    public static int BitToSquare(ulong bit) => System.Numerics.BitOperations.TrailingZeroCount(bit);

    /// <summary>square (0-63 index) -> bit (bitmask, single set bit)</summary>
    public static ulong SquareToBit(int square) => 1UL << square;

    public static int GetRankFromSquare(int square) => square / 8;
    public static int GetFileFromSquare(int square) => square % 8;
    public static int GetRankFromBit(ulong bit) => GetRankFromSquare(BitToSquare(bit));
    public static int GetFileFromBit(ulong bit) => GetFileFromSquare(BitToSquare(bit));

    public static int RankFileToSquare(int rank, int file) => rank * 8 + file;

    public static int AlgebraicToSquare(string square)
    {
        int file = square[0] - 'a';
        int rank = int.Parse(square.Substring(1)) - 1;
        return rank * 8 + file;
    }

    public static string SquareToAlgebraic(int square)
    {
        int file = square % 8;
        int rank = square / 8;
        return $"{(char)('a' + file)}{rank + 1}";
    }

    /// <summary>
    /// Matches the promotion-code convention findLegalMoves attaches to a
    /// move: 0=rook, 1=knight, 2=bishop, anything else=queen.
    /// </summary>
    public static char PromotionCharFromCode(int code, bool whiteToMove)
    {
        char letter = code == 0 ? 'r' : code == 1 ? 'n' : code == 2 ? 'b' : 'q';
        return whiteToMove ? char.ToUpperInvariant(letter) : letter;
    }

    public static bool IsPromotionPieceChar(string? value) =>
        value is { Length: 1 } && "nbrqNBRQ".Contains(value[0]);
}
