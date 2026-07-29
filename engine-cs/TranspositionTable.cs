using System;

namespace EngineCs;

public struct Transposition
{
    public ulong Hash;
    public int Depth;
    public int Evaluation;
    public Bounds Bound;
    public EngineMove? Move;
}

public enum Bounds
{
    Exact,
    Lower,
    Upper
}

public class TranspositionTable
{
    public readonly int Size;
    public Transposition[] Table;

    public TranspositionTable(int sizeMb)
    {
        int entryBytes = System.Runtime.InteropServices.Marshal.SizeOf<Transposition>();
        long budgetBytes = (long)sizeMb * 1024 * 1024;
        Size = (int)(budgetBytes / entryBytes);
        if (Size == 0) Size = 1;
        Table = new Transposition[Size];
    }

    public SearchEvaluation? CheckTable(
        ulong hash,
        int depth,
        int alpha,
        int beta,
        int ply
    )
    {
        Transposition transposition = Table[IndexFor(hash)];
        if (transposition.Hash == hash)
        {
            if (depth <= transposition.Depth)
            {
                if (
                    transposition.Bound == Bounds.Exact
                    || (transposition.Bound == Bounds.Lower && beta <= transposition.Evaluation)
                    || (transposition.Bound == Bounds.Upper && alpha >= transposition.Evaluation)
                )
                {
                    return new SearchEvaluation {
                        Move = transposition.Move,
                        Value = FromStorage(transposition.Evaluation, ply)
                    };
                }
            }
        }
        return null;
    }

    public void Insert(
        ulong hash,
        int depth,
        int ply,
        Bounds bound,
        SearchEvaluation evaluation
    )
    {
        Table[IndexFor(hash)] = new Transposition
        {
            Hash = hash,
            Depth = depth,
            Evaluation = ToStorage(evaluation.Value, ply),
            Bound = bound,
            Move = evaluation.Move
        };
    }

    // zeros out mate plys
    private static int ToStorage(int value, int ply)
    {
        if (value > 900_000) return value + ply;
        if (value < -900_000) return value - ply;
        return value;
    }

    // applies relevant ply for this branch to mate
    private static int FromStorage(int value, int ply)
    {
        if (value > 900_000) return value - ply;
        if (value < -900_000) return value + ply;
        return value;
    }

    private int IndexFor(ulong hash)
    {
        return (int)(hash % (ulong)Size);
    }
}