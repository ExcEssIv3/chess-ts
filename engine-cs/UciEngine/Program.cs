using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using EngineCs;

namespace EngineCs.Uci;

/// <summary>
/// Standalone UCI front-end for the same Board/Movegen/Search/Evaluation
/// code EngineInterop.cs exposes to the browser — this is the console
/// executable a UCI-speaking bridge (e.g. lichess-bot) launches as a
/// subprocess and talks to over stdin/stdout. Reuses
/// EngineInterop.ReplayHistory to turn a "position" command's startFen +
/// move list into a Board/positionCounts pair exactly like the browser path
/// does, so history/repetition handling can't drift between the two.
/// </summary>
public static class Program
{
    private const string StartFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

    private static string _startFen = StartFen;
    private static string _movesHistory = "";

    // Set/read from both the stdin-reading main thread ("stop"/"quit") and
    // the background Task a "go" spawns — SearchDeadline.Stopped is
    // volatile, and _activeSearch is only ever replaced from the main
    // thread after waiting for the previous one, so there's no unguarded
    // concurrent write to either field.
    private static SearchDeadline? _activeDeadline;
    private static Task? _activeSearch;

    // lichess-bot's default config.yml sends "setoption" for all of these on
    // startup regardless of whether the engine advertised them — an
    // unadvertised name makes python-chess raise and lichess-bot refuses to
    // start. Move Overhead and Hash are the two this engine actually acts
    // on; Threads/SyzygyPath/UCI_ShowWDL are accepted and otherwise ignored
    // (no threading/tablebases/WDL model exist yet to hook them up to).
    private static long _moveOverheadMs = 100;
    private static int _hashMb = 1;

    // Built lazily (first "go") from _hashMb rather than at process start,
    // so a "setoption name Hash" sent before the first "go" (the normal UCI
    // handshake order) takes effect. Lives for the rest of the process —
    // same persistence intent as _startFen/_movesHistory: a transposition
    // table's value comes from surviving across the whole game, not being
    // rebuilt (like Board is) on every "go".
    private static TranspositionTable? _tt;

    public static void Main()
    {
        // Console output can be block-buffered when stdout is a pipe (as it
        // always is under a UCI bridge) — every response here must reach
        // the other side immediately, not whenever the buffer happens to
        // flush.
        var stdout = new StreamWriter(Console.OpenStandardOutput()) { AutoFlush = true };
        Console.SetOut(stdout);

        string? line;
        while ((line = Console.ReadLine()) != null)
        {
            string command = line.Trim();
            if (command.Length == 0) continue;

            if (command == "uci")
            {
                Console.WriteLine("id name ChessTsEngine");
                Console.WriteLine("id author seth");
                Console.WriteLine("option name Move Overhead type spin default 100 min 0 max 10000");
                Console.WriteLine("option name Threads type spin default 1 min 1 max 64");
                Console.WriteLine("option name Hash type spin default 1 min 1 max 4096");
                Console.WriteLine("option name SyzygyPath type string default <empty>");
                Console.WriteLine("option name UCI_ShowWDL type check default false");
                Console.WriteLine("uciok");
            }
            else if (command.StartsWith("setoption"))
            {
                HandleSetOption(command);
            }
            else if (command == "isready")
            {
                Console.WriteLine("readyok");
            }
            else if (command == "ucinewgame")
            {
                if (_activeDeadline is not null) _activeDeadline.Stopped = true;
                _activeSearch?.Wait();
                _startFen = StartFen;
                _movesHistory = "";
            }
            else if (command.StartsWith("position"))
            {
                HandlePosition(command);
            }
            else if (command.StartsWith("go"))
            {
                HandleGo(command);
            }
            else if (command == "stop")
            {
                if (_activeDeadline is not null) _activeDeadline.Stopped = true;
            }
            else if (command == "quit")
            {
                if (_activeDeadline is not null) _activeDeadline.Stopped = true;
                _activeSearch?.Wait();
                break;
            }
        }
    }

    private static void HandleSetOption(string command)
    {
        const string namePrefix = "setoption name ";
        if (!command.StartsWith(namePrefix)) return;
        string rest = command.Substring(namePrefix.Length);

        const string valueMarker = " value ";
        int valueIdx = rest.IndexOf(valueMarker, StringComparison.Ordinal);
        string optName = valueIdx >= 0 ? rest.Substring(0, valueIdx) : rest;
        string optValue = valueIdx >= 0 ? rest.Substring(valueIdx + valueMarker.Length) : "";

        if (optName == "Move Overhead" && long.TryParse(optValue, out long overhead))
        {
            _moveOverheadMs = overhead;
        }
        else if (optName == "Hash" && int.TryParse(optValue, out int hashMb))
        {
            // Rebuilt from scratch on the next "go" (see _tt's lazy build in
            // HandleGo) rather than resized in place — a GUI changing Hash
            // mid-game is rare enough that losing the accumulated cache is
            // an acceptable tradeoff for not having to implement in-place
            // resizing.
            _hashMb = hashMb;
            _tt = null;
        }
        // Threads/SyzygyPath/UCI_ShowWDL: recognized (see the "uci" handler's
        // option list) so lichess-bot's setoption doesn't error, but
        // otherwise unused — see the field comment on _moveOverheadMs.
    }

    private static void HandlePosition(string command)
    {
        var parts = command.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        int i = 1; // parts[0] == "position"
        if (i >= parts.Length) return;

        string fen;
        if (parts[i] == "startpos")
        {
            fen = StartFen;
            i++;
        }
        else if (parts[i] == "fen")
        {
            i++;
            var fenParts = new List<string>();
            while (i < parts.Length && parts[i] != "moves")
            {
                fenParts.Add(parts[i]);
                i++;
            }
            fen = string.Join(' ', fenParts);
        }
        else
        {
            return; // malformed command, ignore
        }

        var moves = new List<string>();
        if (i < parts.Length && parts[i] == "moves")
        {
            i++;
            for (; i < parts.Length; i++) moves.Add(parts[i]);
        }

        _startFen = fen;
        // ReplayHistory expects moves delimited by "|" (see EngineInterop.cs).
        _movesHistory = string.Join('|', moves);
    }

    private static void HandleGo(string command)
    {
        var parts = command.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        int? depth = null;
        long? movetimeMs = null;
        long? wtime = null, btime = null, winc = null, binc = null;
        int? movestogo = null;
        bool infinite = false;

        for (int i = 1; i < parts.Length; i++)
        {
            switch (parts[i])
            {
                case "depth" when i + 1 < parts.Length: depth = int.Parse(parts[++i]); break;
                case "movetime" when i + 1 < parts.Length: movetimeMs = long.Parse(parts[++i]); break;
                case "wtime" when i + 1 < parts.Length: wtime = long.Parse(parts[++i]); break;
                case "btime" when i + 1 < parts.Length: btime = long.Parse(parts[++i]); break;
                case "winc" when i + 1 < parts.Length: winc = long.Parse(parts[++i]); break;
                case "binc" when i + 1 < parts.Length: binc = long.Parse(parts[++i]); break;
                case "movestogo" when i + 1 < parts.Length: movestogo = int.Parse(parts[++i]); break;
                case "infinite": infinite = true; break;
            }
        }

        // Must wait for any previous search to fully finish BEFORE touching
        // the position: GetOrBuildPosition reuses the same Board/
        // positionCounts instance across calls (see EngineInterop.cs), so a
        // still-running search Task mutating it via MakeMove/UnmakeMove
        // while we read/extend it here would be a real race, not just
        // wasted work. The UCI protocol never sends a new "go" before the
        // previous one answered with bestmove (itself only ever preceded
        // by "stop"), but wait defensively anyway.
        _activeSearch?.Wait();

        var (board, positionCounts) = EngineInterop.GetOrBuildPosition(_startFen, _movesHistory);
        _tt ??= new TranspositionTable(_hashMb);

        bool hasClock = wtime is not null || btime is not null;
        if (depth is not null && movetimeMs is null && !infinite && !hasClock)
        {
            // Fixed-depth, no time control involved — e.g. a GUI's manual
            // "search to depth N" rather than a real timed game.
            var fixedDeadline = new SearchDeadline();
            _activeDeadline = fixedDeadline;
            _activeSearch = Task.Run(() =>
            {
                var result = Search.Run(board, new SearchOptions { Depth = depth }, int.MinValue + 1, int.MaxValue, positionCounts, 0, tt: _tt);
                EmitBestMove(board, result);
            });
            return;
        }

        long budgetMs;
        if (movetimeMs is not null)
        {
            budgetMs = movetimeMs.Value;
        }
        else if (infinite || !hasClock)
        {
            // "go infinite", or a bare "go" with no time info at all — search
            // until an explicit "stop" arrives.
            budgetMs = long.MaxValue / 2;
        }
        else
        {
            long myTime = board.WhiteToMove ? wtime ?? 0 : btime ?? 0;
            long myInc = board.WhiteToMove ? winc ?? 0 : binc ?? 0;
            budgetMs = TimeManagement.ComputeBudgetMs(myTime, myInc, movestogo, _moveOverheadMs);
        }

        var deadline = new SearchDeadline();
        _activeDeadline = deadline;
        _activeSearch = Task.Run(() =>
        {
            var result = Search.RunIterative(board, new SearchOptions { MovetimeMs = (int)System.Math.Min(budgetMs, int.MaxValue) }, positionCounts, deadline, _tt);
            EmitBestMove(board, result);
        });
    }

    private static void EmitBestMove(Board board, SearchEvaluation result)
    {
        if (result.Move is null)
        {
            // Mirrors EngineInterop.FindBestMove's fallback: Move==null can
            // mean genuine checkmate/stalemate (no fallback possible, the
            // GUI shouldn't have asked) or a confirmed 3rd-occurrence
            // repetition at the root (game isn't actually over — fall back
            // to any legal move).
            var fallbackMoves = Movegen.FindLegalMoves(board);
            if (fallbackMoves.Count == 0)
            {
                Console.WriteLine("bestmove 0000");
                return;
            }
            result = new SearchEvaluation { Move = fallbackMoves[0], Value = 0 };
        }

        var move = result.Move.Value;
        string fromAlg = Utils.SquareToAlgebraic(move.From);
        string toAlg = Utils.SquareToAlgebraic(move.To);
        string promo = move.Promotion >= 0 ? Utils.PromotionCharFromCode(move.Promotion, board.WhiteToMove).ToString() : "";
        Console.WriteLine($"bestmove {fromAlg}{toAlg}{promo}");
    }
}
