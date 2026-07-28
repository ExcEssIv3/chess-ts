using System;

namespace EngineCs;

public class Zobrist
{
    private static readonly Random Rng = new(123);
    public static readonly ulong[][] PieceSquares = new ulong[12][];
    public static readonly ulong[] CastlingRights = new ulong[16];
    public static readonly ulong[] EnPassantAvailability = new ulong[8];
    public static readonly ulong BlackToMove = NextULong();


    static Zobrist()
    {

        for (int i = 0; i < 12; i++)
        {
            PieceSquares[i] = new ulong[64];
            for (int j = 0; j < 64; j++)
            {
                PieceSquares[i][j] = NextULong();
            }
        }
        for (int i = 0; i < 16; i++)
        {
            CastlingRights[i] = NextULong();
        }
        for (int i = 0; i < 8; i++)
        {
            EnPassantAvailability[i] = NextULong();
        }
    }

    private static ulong  NextULong()
    {
        Span<byte> bytes = stackalloc byte[8];
        Rng.NextBytes(bytes);
        return BitConverter.ToUInt64(bytes);
    }

}