using EngineCs;

const string StartFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

long Perft(Board board, int depth)
{
    if (depth == 0) return 1;
    var moves = Movegen.FindLegalMoves(board);
    if (depth == 1) return moves.Count;

    long nodes = 0;
    foreach (var move in moves)
    {
        ulong from = 1UL << move.From;
        ulong to = 1UL << move.To;
        char? promotion = move.Promotion >= 0 ? Utils.PromotionCharFromCode(move.Promotion, board.WhiteToMove) : null;
        var undo = board.MakeMove(from, to, promotion);
        nodes += Perft(board, depth - 1);
        board.UnmakeMove(from, to, promotion, undo);
    }
    return nodes;
}

Console.WriteLine("=== Perft ===");
var sw = System.Diagnostics.Stopwatch.StartNew();
var b4 = new Board(StartFen);
long p4 = Perft(b4, 4);
Console.WriteLine($"perft(4) = {p4} (expected 197281) -> {(p4 == 197281 ? "PASS" : "FAIL")}   [{sw.ElapsedMilliseconds}ms]");

sw.Restart();
var b5 = new Board(StartFen);
long p5 = Perft(b5, 5);
Console.WriteLine($"perft(5) = {p5} (expected 4865609) -> {(p5 == 4865609 ? "PASS" : "FAIL")}   [{sw.ElapsedMilliseconds}ms]");

Console.WriteLine();
Console.WriteLine("=== Eval sanity ===");
int evalStart = Evaluation.EvaluatePosition(new Board(StartFen));
Console.WriteLine($"start pos eval = {evalStart} (expected 0) -> {(evalStart == 0 ? "PASS" : "FAIL")}");

int evalNoWhiteKnight = Evaluation.EvaluatePosition(new Board("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/R1BQKBNR w KQkq - 0 1"));
Console.WriteLine($"missing white knight eval = {evalNoWhiteKnight} (expected < 0) -> {(evalNoWhiteKnight < 0 ? "PASS" : "FAIL")}");

int evalNoBlackQueen = Evaluation.EvaluatePosition(new Board("rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"));
Console.WriteLine($"missing black queen eval = {evalNoBlackQueen} (expected > 0, ~queen value) -> {(evalNoBlackQueen > 0 ? "PASS" : "FAIL")}");

Console.WriteLine();
Console.WriteLine("=== FindBestMove smoke test ===");
foreach (int depth in new[] { 1, 2, 3, 4 })
{
    var board = new Board(StartFen);
    var options = new SearchOptions { Depth = depth };
    sw.Restart();
    var result = Search.Run(board, options, -1_000_000, 1_000_000, new Dictionary<ulong, PositionInfo>(), 0);
    sw.Stop();
    if (result.Move is null)
    {
        Console.WriteLine($"depth={depth}: NO MOVE (FAIL)");
        continue;
    }
    var mv = result.Move.Value;
    string from = Utils.SquareToAlgebraic(mv.From);
    string to = Utils.SquareToAlgebraic(mv.To);
    string promo = mv.Promotion >= 0 ? Utils.PromotionCharFromCode(mv.Promotion, board.WhiteToMove).ToString() : "";
    Console.WriteLine($"depth={depth}: move={from}{to}{promo} value={result.Value} [{sw.ElapsedMilliseconds}ms]");
}

Console.WriteLine();
Console.WriteLine("=== Quiesce/check-evasion: fool's mate ===");
{
    // 1.f3 e5 2.g4 Qh4# — White is checkmated. Regression check for the
    // inverted-attacker-color bug in Search's CheckDanger calls, which
    // caused unbounded recursion once Quiesce started exercising it.
    var board = new Board(StartFen);
    void Play(string from, string to)
    {
        ulong f = 1UL << Utils.AlgebraicToSquare(from);
        ulong t = 1UL << Utils.AlgebraicToSquare(to);
        board.MakeMove(f, t, null);
    }
    Play("f2", "f3");
    Play("e7", "e5");
    Play("g2", "g4");
    Play("d8", "h4");
    Console.WriteLine($"position: {board.ConvertFen()} (expect White checkmated)");

    bool noMoves = Movegen.FindLegalMoves(board).Count == 0;
    bool inCheck = Movegen.CheckDanger(board, board.WKing, false);
    Console.WriteLine($"no legal moves for White -> {(noMoves ? "PASS" : "FAIL")}");
    Console.WriteLine($"White king in check -> {(inCheck ? "PASS" : "FAIL")}");

    sw.Restart();
    var result = Search.Run(board, new SearchOptions { Depth = 2 }, -1_000_000, 1_000_000, new Dictionary<ulong, PositionInfo>(), 0);
    sw.Stop();
    bool scoredAsMate = result.Move is null && result.Value == -1_000_000;
    Console.WriteLine($"Search.Run scores position as mate (move=null, value=-1000000) -> {(scoredAsMate ? "PASS" : "FAIL")}   [{sw.ElapsedMilliseconds}ms]");
}

Console.WriteLine();
Console.WriteLine("=== Mate-found early exit: RunIterative stops well before the movetime budget ===");
{
    // Black to move, one ply before fool's mate: 1.f3 e5 2.g4 and Qh4# is
    // mate-in-1. With a generous movetime budget, RunIterative should find
    // it at depth 1 and break out of its do-while loop immediately, rather
    // than spinning through deeper iterations until time runs out.
    var board = new Board(StartFen);
    void Play(string from, string to)
    {
        ulong f = 1UL << Utils.AlgebraicToSquare(from);
        ulong t = 1UL << Utils.AlgebraicToSquare(to);
        board.MakeMove(f, t, null);
    }
    Play("f2", "f3");
    Play("e7", "e5");
    Play("g2", "g4");
    Console.WriteLine($"position: {board.ConvertFen()} (Black to move, Qh4# available)");

    sw.Restart();
    var result = Search.RunIterative(board, new SearchOptions { MovetimeMs = 2000 }, new Dictionary<ulong, PositionInfo>());
    sw.Stop();

    bool foundMove = result.Move is not null;
    string move = foundMove
        ? $"{Utils.SquareToAlgebraic(result.Move.Value.From)}{Utils.SquareToAlgebraic(result.Move.Value.To)}"
        : "none";
    bool foundQh4 = move == "d8h4";
    bool scoredAsMate = result.Value > 900_000;
    bool returnedFast = sw.ElapsedMilliseconds < 500;
    Console.WriteLine($"move={move} value={result.Value} [{sw.ElapsedMilliseconds}ms] (budget=2000ms)");
    Console.WriteLine($"found Qh4# -> {(foundQh4 ? "PASS" : "FAIL")}");
    Console.WriteLine($"scored as mate (>900000) -> {(scoredAsMate ? "PASS" : "FAIL")}");
    Console.WriteLine($"returned well under the 2000ms budget -> {(returnedFast ? "PASS" : "FAIL")}");
}

Console.WriteLine();
Console.WriteLine("=== Threefold repetition scores as an immediate draw ===");
{
    var board = new Board(StartFen);
    var positionCounts = new Dictionary<ulong, PositionInfo>
    {
        [board.PositionKey] = new PositionInfo { Count = 3 }
    };
    var result = Search.Run(board, new SearchOptions { Depth = 3 }, -1_000_000, 1_000_000, positionCounts, 0);
    bool scoredAsDraw = result.Move is null && result.Value == 0;
    Console.WriteLine($"Search.Run scores a pre-seeded 3rd occurrence as a draw (move=null, value=0) -> {(scoredAsDraw ? "PASS" : "FAIL")}");
}

Console.WriteLine();
Console.WriteLine("=== EngineInterop.GameStatus: real history replay detects threefold repetition ===");
{
    // Bare kings shuffling back and forth: e3<->d3 (White), e5<->d5 (Black),
    // twice over, lands back on the exact starting position for the 3rd
    // time — exercises the actual startFen+moves replay path EngineInterop
    // exposes to JS, not just a directly-seeded dictionary.
    const string kingsFen = "8/8/8/4k3/8/4K3/8/8 w - - 0 1";
    const string shuffleMoves = "e3d3|e5d5|d3e3|d5e5|e3d3|e5d5|d3e3|d5e5";

    string status = EngineInterop.GameStatus(kingsFen, shuffleMoves);
    Console.WriteLine($"status after 2x shuffle cycles = {status} (expected threefold-repetition) -> {(status == "threefold-repetition" ? "PASS" : "FAIL")}");

    string statusOneCycle = EngineInterop.GameStatus(kingsFen, "e3d3|e5d5|d3e3|d5e5");
    Console.WriteLine($"status after 1x shuffle cycle = {statusOneCycle} (expected ongoing) -> {(statusOneCycle == "ongoing" ? "PASS" : "FAIL")}");

    // FindBestMove with the same history shouldn't throw and should still
    // return a legal-shaped move string.
    string move = EngineInterop.FindBestMove(kingsFen, shuffleMoves, 2, 0);
    Console.WriteLine($"FindBestMove with repetition-heavy history returns a move -> {(move.Length is 4 or 5 ? "PASS" : "FAIL")} (move={move})");
}

Console.WriteLine();
Console.WriteLine("=== FindCaptureMoves: en passant ===");
{
    var board = new Board(StartFen);
    void Play(string from, string to)
    {
        ulong f = 1UL << Utils.AlgebraicToSquare(from);
        ulong t = 1UL << Utils.AlgebraicToSquare(to);
        board.MakeMove(f, t, null);
    }
    Play("e2", "e4");
    Play("e7", "e6");
    Play("e4", "e5");
    Play("d7", "d5");
    Console.WriteLine($"position: {board.ConvertFen()} (expect en passant square d6)");

    int exSquare = Utils.AlgebraicToSquare("e5");
    int d6Square = Utils.AlgebraicToSquare("d6");
    var captures = Movegen.FindCaptureMoves(board);
    bool foundEp = captures.Exists(m => m.From == exSquare && m.To == d6Square);
    Console.WriteLine($"exd6 e.p. present in FindCaptureMoves -> {(foundEp ? "PASS" : "FAIL")}");

    bool isEpMove(EngineMove m) => m.From == exSquare && m.To == d6Square;
    bool anyQuietLeaked = captures.Exists(m => !isEpMove(m) &&
        ((1UL << m.To) & (board.WOccupancy | board.BOccupancy)) == 0);
    Console.WriteLine($"no quiet (non-capture, non-e.p.) moves leaked into FindCaptureMoves -> {(!anyQuietLeaked ? "PASS" : "FAIL")}");
}

Console.WriteLine();
Console.WriteLine("=== Zobrist PositionKey consistency across make/unmake ===");
{
    // At every node, the incrementally-maintained PositionKey must match a
    // hash freshly recomputed from that position's FEN — this is the
    // definitive check that MakeMove/UnmakeMove's incremental XORs (piece
    // moves, captures, en passant, promotion, castling rook relocation,
    // castling rights, en passant availability, side to move) exactly
    // agree with GeneratePositionKey's from-scratch computation.
    int mismatches = 0;
    long nodesChecked = 0;

    long PerftWithHashCheck(Board board, int depth)
    {
        nodesChecked++;
        ulong expected = new Board(board.ConvertFen()).PositionKey;
        if (board.PositionKey != expected) mismatches++;

        if (depth == 0) return 1;
        var moves = Movegen.FindLegalMoves(board);

        long nodes = 0;
        foreach (var move in moves)
        {
            ulong from = 1UL << move.From;
            ulong to = 1UL << move.To;
            char? promotion = move.Promotion >= 0 ? Utils.PromotionCharFromCode(move.Promotion, board.WhiteToMove) : null;
            var undo = board.MakeMove(from, to, promotion);
            nodes += PerftWithHashCheck(board, depth - 1);
            board.UnmakeMove(from, to, promotion, undo);
            if (board.PositionKey != expected) mismatches++; // post-unmake restoration check
        }
        return nodes;
    }

    // Start position: broad general-move coverage (quiet moves, captures).
    PerftWithHashCheck(new Board(StartFen), 4);

    // Kiwipete: standard perft stress position exercising both-side
    // castling, promotions, and en passant right from the root.
    const string Kiwipete = "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1";
    PerftWithHashCheck(new Board(Kiwipete), 3);

    Console.WriteLine($"{nodesChecked} nodes checked, {mismatches} PositionKey mismatches -> {(mismatches == 0 ? "PASS" : "FAIL")}");
}

Console.WriteLine();
Console.WriteLine("=== King-drive bonus: closer king scores higher, without dominating material ===");
{
    // KRK, Black king boxed into a8. Comparing White king at e6 (distance 4
    // from a8) vs b6 (distance 2) isolates just the king-drive bonus (same
    // material, same rook) to confirm rescaling from 800cp to 160cp still
    // rewards closing the box without swinging the eval by pawns' worth.
    int evalFar = Evaluation.EvaluatePosition(new Board("k7/8/4K3/8/8/8/8/7R w - - 0 1"));
    int evalNear = Evaluation.EvaluatePosition(new Board("k7/8/1K6/8/8/8/8/7R w - - 0 1"));
    Console.WriteLine($"White king e6 (distance 4): eval={evalFar}");
    Console.WriteLine($"White king b6 (distance 2): eval={evalNear}");
    bool closerIsBetter = evalNear > evalFar;
    bool swingIsModest = Math.Abs(evalNear - evalFar) <= 160;
    Console.WriteLine($"closer king scores higher -> {(closerIsBetter ? "PASS" : "FAIL")}");
    Console.WriteLine($"swing between the two stays within the 160cp cap -> {(swingIsModest ? "PASS" : "FAIL")}");
}

Console.WriteLine();
Console.WriteLine("=== Single-legal-move root fast path: mover-relative sign, root-only ===");
{
    // Black king a8, in check from Qa1 along the a-file, with Nd7 covering
    // b8 — a7 stays illegal (same file as the checking queen) and b8 is
    // covered by the knight, leaving Kb7 as the only legal move. White is
    // up a queen and knight, so from Black's (the mover's) perspective this
    // should score as a large negative number, not a large positive one.
    var board = new Board("k7/3N4/8/8/8/8/8/Q3K3 b - - 0 1");
    var legal = Movegen.FindLegalMoves(board);
    bool exactlyOneLegalMove = legal.Count == 1;
    Console.WriteLine($"exactly one legal move for Black -> {(exactlyOneLegalMove ? "PASS" : "FAIL")} (count={legal.Count})");

    var result = Search.Run(board, new SearchOptions { Depth = 3 }, -1_000_000 + 1, 1_000_000, new Dictionary<ulong, PositionInfo>(), 0);
    bool foundKb7 = result.Move is not null && result.Move.Value.From == Utils.AlgebraicToSquare("a8") && result.Move.Value.To == Utils.AlgebraicToSquare("b7");
    bool scoredAsBadForBlack = result.Value < -400; // mover-relative: Black is down a queen+knight
    Console.WriteLine($"move={(result.Move is not null ? $"{Utils.SquareToAlgebraic(result.Move.Value.From)}{Utils.SquareToAlgebraic(result.Move.Value.To)}" : "none")} value={result.Value}");
    Console.WriteLine($"found Kb7 -> {(foundKb7 ? "PASS" : "FAIL")}");
    Console.WriteLine($"value is mover-relative (large negative for Black, not positive) -> {(scoredAsBadForBlack ? "PASS" : "FAIL")}");
}

Console.WriteLine();
Console.WriteLine("=== ApplyMove-equivalent smoke test (e2e4) ===");
{
    var board = new Board(StartFen);
    ulong from = 1UL << Utils.AlgebraicToSquare("e2");
    ulong to = 1UL << Utils.AlgebraicToSquare("e4");
    if (Legality.EvaluateLegal(board, from, to))
    {
        board.MakeMove(from, to, null);
        Console.WriteLine($"resulting fen: {board.ConvertFen()}");
    }
    else
    {
        Console.WriteLine("FAIL: e2e4 evaluated illegal");
    }
}
