using System;
using System.Numerics;

namespace EngineCs;

public class IllegalMoveError : Exception
{
    public IllegalMoveError(string message) : base(message) { }
}

public class NoLegalMovesError : Exception
{
    public NoLegalMovesError(string message) : base(message) { }
}

/// <summary>
/// Everything needed to reverse exactly one Board.MakeMove call, captured as
/// a stack-allocatable struct (not a full board snapshot) — see
/// EngineInterop/CLAUDE task notes: this is the architectural improvement
/// over the TS version's clone-per-trial-move pattern.
/// </summary>
public struct BoardUndo
{
    public int PrevCastlingRights;
    /// <summary>-1 = none (mirrors the TS `number | null`).</summary>
    public int PrevEnPassantSquare;
    public int PrevHalfmoveClock;
    public int PrevFullmoveNumber;
    public bool WhiteToMoveBefore;
    /// <summary>The piece as it stood on `start` before the move (pre-promotion).</summary>
    public char MovedPieceOriginal;
    /// <summary>'\0' if the move wasn't a capture (regular or en passant).</summary>
    public char CapturedPiece;
    /// <summary>Square the captured piece stood on — differs from `finish` for en passant. -1 if no capture.</summary>
    public int CapturedSquare;
    public bool WasCastle;
    public int CastleRookFromSquare;
    public int CastleRookToSquare;
}

/// <summary>
/// One ulong bitboard per piece type/color — port of src/engine/board.ts.
/// No lo/hi 32-bit splitting needed: ulong is a real 64-bit integer in C#.
/// </summary>
public class Board
{
    public ulong WPawns, WRooks, WKnights, WBishops, WQueens, WKing;
    public ulong WOccupancy;

    public ulong BPawns, BRooks, BKnights, BBishops, BQueens, BKing;
    public ulong BOccupancy;

    public bool WhiteToMove = true;
    /// <summary>4-bit flag: 1=White kingside, 2=White queenside, 4=Black kingside, 8=Black queenside.</summary>
    public int CastlingRights = 0;
    /// <summary>0-63 square index, or -1 (mirrors the TS `number | null`).</summary>
    public int EnPassantSquare = -1;
    public int HalfmoveClock = 0;
    public int FullmoveNumber = 1;

    public Board(string fen)
    {
        ApplyFen(fen);
    }

    public void ApplyFen(string fen)
    {
        WPawns = WRooks = WKnights = WBishops = WQueens = WKing = 0UL;
        BPawns = BRooks = BKnights = BBishops = BQueens = BKing = 0UL;

        var parts = fen.Split(' ');

        int rank = 7;
        int file = 0;
        foreach (char c in parts[0])
        {
            switch (c)
            {
                case '/': rank--; file = 0; break;
                case 'p': BPawns |= 1UL << Utils.RankFileToSquare(rank, file); file++; break;
                case 'n': BKnights |= 1UL << Utils.RankFileToSquare(rank, file); file++; break;
                case 'b': BBishops |= 1UL << Utils.RankFileToSquare(rank, file); file++; break;
                case 'r': BRooks |= 1UL << Utils.RankFileToSquare(rank, file); file++; break;
                case 'q': BQueens |= 1UL << Utils.RankFileToSquare(rank, file); file++; break;
                case 'k': BKing |= 1UL << Utils.RankFileToSquare(rank, file); file++; break;
                case 'P': WPawns |= 1UL << Utils.RankFileToSquare(rank, file); file++; break;
                case 'N': WKnights |= 1UL << Utils.RankFileToSquare(rank, file); file++; break;
                case 'B': WBishops |= 1UL << Utils.RankFileToSquare(rank, file); file++; break;
                case 'R': WRooks |= 1UL << Utils.RankFileToSquare(rank, file); file++; break;
                case 'Q': WQueens |= 1UL << Utils.RankFileToSquare(rank, file); file++; break;
                case 'K': WKing |= 1UL << Utils.RankFileToSquare(rank, file); file++; break;
                default:
                    if (!char.IsDigit(c)) throw new Exception("Invalid fen.");
                    int num = c - '0';
                    if (num > 8 || num < 1) throw new Exception("Invalid fen.");
                    file += num;
                    break;
            }
        }

        RecomputeOccupancy();

        WhiteToMove = parts[1] == "w";

        CastlingRights = 0;
        if (parts[2].Contains('K')) CastlingRights |= 1;
        if (parts[2].Contains('Q')) CastlingRights |= 2;
        if (parts[2].Contains('k')) CastlingRights |= 4;
        if (parts[2].Contains('q')) CastlingRights |= 8;

        EnPassantSquare = parts[3] == "-" ? -1 : Utils.AlgebraicToSquare(parts[3]);

        HalfmoveClock = int.Parse(parts[4]);
        FullmoveNumber = int.Parse(parts[5]);
    }

    /// <summary>`mask` is a bitmask (single set bit), not a square index.</summary>
    public char? PieceAt(ulong mask)
    {
        if ((WPawns & mask) != 0) return 'P';
        if ((WKnights & mask) != 0) return 'N';
        if ((WBishops & mask) != 0) return 'B';
        if ((WRooks & mask) != 0) return 'R';
        if ((WQueens & mask) != 0) return 'Q';
        if ((WKing & mask) != 0) return 'K';
        if ((BPawns & mask) != 0) return 'p';
        if ((BKnights & mask) != 0) return 'n';
        if ((BBishops & mask) != 0) return 'b';
        if ((BRooks & mask) != 0) return 'r';
        if ((BQueens & mask) != 0) return 'q';
        if ((BKing & mask) != 0) return 'k';
        return null;
    }

    public string ConvertFen()
    {
        var placement = new System.Text.StringBuilder();
        for (int rank = 7; rank >= 0; rank--)
        {
            int emptyCount = 0;
            for (int file = 0; file < 8; file++)
            {
                ulong mask = 1UL << Utils.RankFileToSquare(rank, file);
                char? piece = PieceAt(mask);
                if (piece is null)
                {
                    emptyCount++;
                }
                else
                {
                    if (emptyCount > 0)
                    {
                        placement.Append(emptyCount);
                        emptyCount = 0;
                    }
                    placement.Append(piece.Value);
                }
            }
            if (emptyCount > 0) placement.Append(emptyCount);
            if (rank > 0) placement.Append('/');
        }

        string activeColor = WhiteToMove ? "w" : "b";

        string castling = "";
        if ((CastlingRights & 1) != 0) castling += "K";
        if ((CastlingRights & 2) != 0) castling += "Q";
        if ((CastlingRights & 4) != 0) castling += "k";
        if ((CastlingRights & 8) != 0) castling += "q";
        if (castling == "") castling = "-";

        string enPassant = EnPassantSquare != -1 ? Utils.SquareToAlgebraic(EnPassantSquare) : "-";

        return string.Join(" ", placement.ToString(), activeColor, castling, enPassant, HalfmoveClock, FullmoveNumber);
    }

    private void RecomputeOccupancy()
    {
        // Bitwise-OR, not addition: TS used `+` (relying on same-color piece
        // bitboards never overlapping), but `|` expresses the same invariant
        // without depending on it holding for correctness.
        WOccupancy = WPawns | WRooks | WBishops | WKnights | WQueens | WKing;
        BOccupancy = BPawns | BRooks | BBishops | BKnights | BQueens | BKing;
    }

    /// <summary>`mask` is a bitmask, typically a single set bit.</summary>
    public bool AndWhite(ulong mask) => (WOccupancy & mask) != 0;
    /// <summary>`mask` is a bitmask, typically a single set bit.</summary>
    public bool AndBlack(ulong mask) => (BOccupancy & mask) != 0;

    private void SetPieceBit(char piece, ulong bit, bool set)
    {
        switch (piece)
        {
            case 'P': WPawns = set ? WPawns | bit : WPawns & ~bit; break;
            case 'N': WKnights = set ? WKnights | bit : WKnights & ~bit; break;
            case 'B': WBishops = set ? WBishops | bit : WBishops & ~bit; break;
            case 'R': WRooks = set ? WRooks | bit : WRooks & ~bit; break;
            case 'Q': WQueens = set ? WQueens | bit : WQueens & ~bit; break;
            case 'K': WKing = set ? WKing | bit : WKing & ~bit; break;
            case 'p': BPawns = set ? BPawns | bit : BPawns & ~bit; break;
            case 'n': BKnights = set ? BKnights | bit : BKnights & ~bit; break;
            case 'b': BBishops = set ? BBishops | bit : BBishops & ~bit; break;
            case 'r': BRooks = set ? BRooks | bit : BRooks & ~bit; break;
            case 'q': BQueens = set ? BQueens | bit : BQueens & ~bit; break;
            case 'k': BKing = set ? BKing | bit : BKing & ~bit; break;
        }
    }

    /// <summary>
    /// `start`/`finish` are bitmasks (single set bit), not square indices —
    /// port of Board.move() in board.ts, restructured to return a
    /// BoardUndo instead of relying on the caller having cloned the board
    /// first (see UnmakeMove).
    /// </summary>
    public BoardUndo MakeMove(ulong start, ulong finish, char? promotion)
    {
        char piece = PieceAt(start) ?? '\0';

        // Compute "was this a capture" from PRE-move occupancy, before any
        // bitboard mutation — reading it after mutating would see stale/wrong
        // occupancy relative to the squares involved.
        bool isCapture = WhiteToMove ? AndBlack(finish) : AndWhite(finish);
        char? capturedPiece = isCapture ? PieceAt(finish) : null;

        var undo = new BoardUndo
        {
            PrevCastlingRights = CastlingRights,
            PrevEnPassantSquare = EnPassantSquare,
            PrevHalfmoveClock = HalfmoveClock,
            PrevFullmoveNumber = FullmoveNumber,
            WhiteToMoveBefore = WhiteToMove,
            MovedPieceOriginal = piece,
            CapturedPiece = capturedPiece ?? '\0',
            CapturedSquare = capturedPiece is not null ? Utils.BitToSquare(finish) : -1,
            WasCastle = false,
            CastleRookFromSquare = -1,
            CastleRookToSquare = -1,
        };

        ulong clearMask = ~(start | finish);
        WPawns &= clearMask; WKnights &= clearMask; WBishops &= clearMask; WRooks &= clearMask; WQueens &= clearMask; WKing &= clearMask;
        BPawns &= clearMask; BKnights &= clearMask; BBishops &= clearMask; BRooks &= clearMask; BQueens &= clearMask; BKing &= clearMask;

        HalfmoveClock++;
        if (isCapture) HalfmoveClock = 0;

        // disable castling when a rook is captured on its home square
        if (finish == 1UL) CastlingRights &= (1 + 4 + 8);
        else if (finish == (1UL << 7)) CastlingRights &= (2 + 4 + 8);
        else if (finish == (1UL << 56)) CastlingRights &= (1 + 2 + 4);
        else if (finish == (1UL << 63)) CastlingRights &= (1 + 2 + 8);

        int startSquare = Utils.BitToSquare(start);
        int finishSquare = Utils.BitToSquare(finish);
        int fileDelta = Utils.GetFileFromSquare(startSquare) - Utils.GetFileFromSquare(finishSquare);

        if (promotion is not null)
        {
            char p = promotion.Value;
            int rank = Utils.GetRankFromSquare(finishSquare);
            bool isBlackPromotion = char.IsLower(p);
            if (isBlackPromotion && rank != 0) throw new IllegalMoveError("Promotion at incorrect rank");
            if (!isBlackPromotion && rank != 7) throw new IllegalMoveError("Promotion at incorrect rank");
            switch (p)
            {
                case 'n': BKnights |= finish; break;
                case 'b': BBishops |= finish; break;
                case 'r': BRooks |= finish; break;
                case 'q': BQueens |= finish; break;
                case 'N': WKnights |= finish; break;
                case 'B': WBishops |= finish; break;
                case 'R': WRooks |= finish; break;
                case 'Q': WQueens |= finish; break;
            }
            EnPassantSquare = -1;
            HalfmoveClock = 0;
        }
        else
        {
            switch (piece)
            {
                case 'p':
                    BPawns |= finish;
                    if (startSquare - finishSquare == 16)
                    {
                        EnPassantSquare = finishSquare + 8;
                    }
                    else
                    {
                        if (finishSquare == PrevEnPassantSquareForCapture(undo))
                        {
                            ulong capBit = finish << 8;
                            WPawns &= ~capBit;
                            undo.CapturedPiece = 'P';
                            undo.CapturedSquare = finishSquare + 8;
                        }
                        EnPassantSquare = -1;
                    }
                    HalfmoveClock = 0;
                    break;
                case 'n': BKnights |= finish; EnPassantSquare = -1; break;
                case 'b': BBishops |= finish; EnPassantSquare = -1; break;
                case 'r':
                    BRooks |= finish;
                    if (Utils.GetFileFromSquare(startSquare) == 0) CastlingRights &= (1 + 2 + 4);
                    else CastlingRights &= (1 + 2 + 8);
                    EnPassantSquare = -1;
                    break;
                case 'q': BQueens |= finish; EnPassantSquare = -1; break;
                case 'k':
                    BKing |= finish;
                    CastlingRights &= (1 + 2);
                    EnPassantSquare = -1;
                    if (fileDelta == 2)
                    {
                        BRooks &= ~(1UL << 56); BRooks |= 1UL << 59;
                        undo.WasCastle = true; undo.CastleRookFromSquare = 56; undo.CastleRookToSquare = 59;
                    }
                    else if (fileDelta == -2)
                    {
                        BRooks &= ~(1UL << 63); BRooks |= 1UL << 61;
                        undo.WasCastle = true; undo.CastleRookFromSquare = 63; undo.CastleRookToSquare = 61;
                    }
                    break;
                case 'P':
                    WPawns |= finish;
                    if (finishSquare - startSquare == 16)
                    {
                        EnPassantSquare = startSquare + 8;
                    }
                    else
                    {
                        if (finishSquare == PrevEnPassantSquareForCapture(undo))
                        {
                            ulong capBit = finish >> 8;
                            BPawns &= ~capBit;
                            undo.CapturedPiece = 'p';
                            undo.CapturedSquare = finishSquare - 8;
                        }
                        EnPassantSquare = -1;
                    }
                    HalfmoveClock = 0;
                    break;
                case 'N': WKnights |= finish; EnPassantSquare = -1; break;
                case 'B': WBishops |= finish; EnPassantSquare = -1; break;
                case 'R':
                    WRooks |= finish;
                    if (Utils.GetFileFromSquare(startSquare) == 0) CastlingRights &= (1 + 4 + 8);
                    else CastlingRights &= (2 + 4 + 8);
                    EnPassantSquare = -1;
                    break;
                case 'Q': WQueens |= finish; EnPassantSquare = -1; break;
                case 'K':
                    WKing |= finish;
                    CastlingRights &= (4 + 8);
                    EnPassantSquare = -1;
                    if (fileDelta == 2)
                    {
                        WRooks &= ~(1UL << 0); WRooks |= 1UL << 3;
                        undo.WasCastle = true; undo.CastleRookFromSquare = 0; undo.CastleRookToSquare = 3;
                    }
                    else if (fileDelta == -2)
                    {
                        WRooks &= ~(1UL << 7); WRooks |= 1UL << 5;
                        undo.WasCastle = true; undo.CastleRookFromSquare = 7; undo.CastleRookToSquare = 5;
                    }
                    break;
            }
        }

        WhiteToMove = !WhiteToMove;
        if (WhiteToMove) FullmoveNumber++;
        RecomputeOccupancy();

        return undo;
    }

    // The en-passant-capture check needs the en passant square as it stood
    // BEFORE this move (undo.PrevEnPassantSquare), not the field we may have
    // already overwritten a few lines above in the same switch case.
    private static int PrevEnPassantSquareForCapture(BoardUndo undo) => undo.PrevEnPassantSquare;

    /// <summary>
    /// Reverses exactly the mutation MakeMove(start, finish, promotion) made,
    /// using the BoardUndo it returned. Must be called with the same
    /// start/finish/promotion arguments as the matching MakeMove call.
    /// </summary>
    public void UnmakeMove(ulong start, ulong finish, char? promotion, in BoardUndo undo)
    {
        WhiteToMove = undo.WhiteToMoveBefore;
        CastlingRights = undo.PrevCastlingRights;
        EnPassantSquare = undo.PrevEnPassantSquare;
        HalfmoveClock = undo.PrevHalfmoveClock;
        FullmoveNumber = undo.PrevFullmoveNumber;

        char pieceOnFinish = promotion ?? undo.MovedPieceOriginal;
        SetPieceBit(pieceOnFinish, finish, false);
        SetPieceBit(undo.MovedPieceOriginal, start, true);

        if (undo.CapturedPiece != '\0')
        {
            ulong capBit = 1UL << undo.CapturedSquare;
            SetPieceBit(undo.CapturedPiece, capBit, true);
        }

        if (undo.WasCastle)
        {
            char rookChar = undo.WhiteToMoveBefore ? 'R' : 'r';
            SetPieceBit(rookChar, 1UL << undo.CastleRookToSquare, false);
            SetPieceBit(rookChar, 1UL << undo.CastleRookFromSquare, true);
        }

        RecomputeOccupancy();
    }
}
