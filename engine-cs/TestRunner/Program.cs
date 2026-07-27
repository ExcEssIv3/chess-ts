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
foreach (int depth in new[] { 1, 2, 3 })
{
    var board = new Board(StartFen);
    var options = new SearchOptions { Depth = depth };
    sw.Restart();
    var result = Search.Run(board, options, -1_000_000, 1_000_000);
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
