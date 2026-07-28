namespace EngineCs.Uci;

/// <summary>
/// Converts a UCI "go"'s clock fields (wtime/btime/winc/binc/movestogo) into
/// a single movetime budget for Search.RunIterative. No pondering, no
/// per-phase tuning — just enough to not flag on a real time control.
/// </summary>
internal static class TimeManagement
{
    // When the server doesn't tell us how many moves remain until the next
    // time control (movestogo absent — true for the increment-only/sudden-
    // death controls Lichess mostly uses), assume the game still has this
    // many moves left rather than trying to budget for "infinity".
    private const int DefaultMovesToGo = 30;

    private const long MinBudgetMs = 50;

    // moveOverheadMs leaves slack for process/GUI/network overhead around
    // the actual search call — claiming every last millisecond of the clock
    // risks flagging on a move that technically finished in time but
    // arrived late. Caller-supplied (UCI's "Move Overhead" option, see
    // Program.cs) rather than a fixed constant, so a slow host/connection
    // can be dialed in without a rebuild.
    internal static long ComputeBudgetMs(long myTimeMs, long myIncMs, int? movesToGo, long moveOverheadMs)
    {
        int assumedMoves = movesToGo is > 0 ? movesToGo.Value : DefaultMovesToGo;
        long budget = myTimeMs / assumedMoves + myIncMs - moveOverheadMs;

        // Never claim so much of the clock that a single move risks
        // flagging the game outright, regardless of how the formula above
        // came out (e.g. a large increment on a near-empty clock).
        long safeMax = System.Math.Max(myTimeMs - moveOverheadMs, MinBudgetMs);
        if (budget > safeMax) budget = safeMax;
        if (budget < MinBudgetMs) budget = MinBudgetMs;

        return budget;
    }
}
