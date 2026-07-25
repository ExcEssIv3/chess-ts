import { IllegalMoveError } from ".";
import type { PieceChar, PromotionPieceChar } from "./types";
import { algebraicToSquare, bitToSquare, getFileFromSquare, getRankFromSquare, rankFileToSquare, squareToAlgebraic } from "./utils";

export class Board {
    wPawns: bigint = 0n;
    wRooks: bigint = 0n;
    wKnights: bigint = 0n;
    wBishops: bigint = 0n;
    wQueens: bigint = 0n;
    wKing: bigint = 0n;

    bPawns: bigint = 0n;
    bRooks: bigint = 0n;
    bKnights: bigint = 0n;
    bBishops: bigint = 0n;
    bQueens: bigint = 0n;
    bKing: bigint = 0n;

    whiteToMove: boolean = true;
    castlingRights: number = 0;
    /** 0-63 square index, not a bitmask */
    enPassantSquare: number | null = null;
    halfmoveClock: number = 0;
    fullmoveNumber: number = 1;

    constructor(fen: string) {
        // TODO: validate the FEN before accepting it (exactly one king per
        // side, at minimum) — applyFen currently accepts any piece placement
        // string, and the pasted-FEN UI path is a real way to construct a
        // Board with zero/two kings, which the eval function assumes can't
        // happen for any position reached through legal play.
        this.applyFen(fen);
    }

    // Every field is an immutable primitive (bigint/boolean/number), so a
    // field-by-field copy is already a full independent clone — no FEN
    // serialize/reparse round trip needed, and no risk of shared mutable
    // state with the original.
    // TODO: for search, even this per-move allocation adds up — the further
    // step is make/unmake (mutate this board in place for a trial move, then
    // reverse exactly that mutation from a small saved snapshot) instead of
    // cloning at all.
    clone(): Board {
        const board = Object.create(Board.prototype) as Board;
        return Object.assign(board, this);
    }

    applyFen(fen: string): void {
        this.andEqualsWhite(0n);
        this.andEqualsBlack(0n);

        const parts = fen.split(" ");

        // piece placement
        let rank = 7;
        let file = 0;
        for (const char of parts[0]) {
            switch(char) {
                case '/':
                    rank--;
                    file = 0;
                    break;
                case 'p':
                    this.bPawns |= 1n << BigInt(rankFileToSquare(rank, file));
                    file++;
                    break;
                case 'n':
                    this.bKnights |= 1n << BigInt(rankFileToSquare(rank, file));
                    file++;
                    break;
                case 'b':
                    this.bBishops |= 1n << BigInt(rankFileToSquare(rank, file));
                    file++;
                    break;
                case 'r':
                    this.bRooks |= 1n << BigInt(rankFileToSquare(rank, file));
                    file++;
                    break;
                case 'q':
                    this.bQueens |= 1n << BigInt(rankFileToSquare(rank, file));
                    file++;
                    break;
                case 'k':
                    this.bKing |= 1n << BigInt(rankFileToSquare(rank, file));
                    file++;
                    break;
                case 'P':
                    this.wPawns |= 1n << BigInt(rankFileToSquare(rank, file));
                    file++;
                    break;
                case 'N':
                    this.wKnights |= 1n << BigInt(rankFileToSquare(rank, file));
                    file++;
                    break;
                case 'B':
                    this.wBishops |= 1n << BigInt(rankFileToSquare(rank, file));
                    file++;
                    break;
                case 'R':
                    this.wRooks |= 1n << BigInt(rankFileToSquare(rank, file));
                    file++;
                    break;
                case 'Q':
                    this.wQueens |= 1n << BigInt(rankFileToSquare(rank, file));
                    file++;
                    break;
                case 'K':
                    this.wKing |= 1n << BigInt(rankFileToSquare(rank, file));
                    file++;
                    break;

                default:
                    const num = parseInt(char);
                    if (isNaN(num) || num > 8 || num < 1) throw new Error("Invalid fen.");
                    file += num;
            }
        }

        // active color
        if (parts[1] === "w") {
            this.whiteToMove = true;
        } else {
            this.whiteToMove = false;
        }

        // castling rights
        this.castlingRights = 0;
        if (parts[2].includes("K")) {
            this.castlingRights |= 1; // White kingside
        }
        if (parts[2].includes("Q")) {
            this.castlingRights |= 2; // White queenside
        }
        if (parts[2].includes("k")) {
            this.castlingRights |= 4; // Black kingside
        }
        if (parts[2].includes("q")) {
            this.castlingRights |= 8; // Black queenside
        }
        
        // en passant square
        if (parts[3] === "-") {
            this.enPassantSquare = null;
        } else {
            this.enPassantSquare = algebraicToSquare(parts[3]);
        }

        // half move clock
        this.halfmoveClock = parseInt(parts[4]);

        // full move number
        this.fullmoveNumber = parseInt(parts[5]);       
    }

    /** `mask` is a bitmask (single set bit), not a square index */
    private pieceAt(mask: bigint): PieceChar | null {
        if (this.wPawns & mask) return 'P';
        if (this.wKnights & mask) return 'N';
        if (this.wBishops & mask) return 'B';
        if (this.wRooks & mask) return 'R';
        if (this.wQueens & mask) return 'Q';
        if (this.wKing & mask) return 'K';
        if (this.bPawns & mask) return 'p';
        if (this.bKnights & mask) return 'n';
        if (this.bBishops & mask) return 'b';
        if (this.bRooks & mask) return 'r';
        if (this.bQueens & mask) return 'q';
        if (this.bKing & mask) return 'k';
        return null;
    }

    convertFen(): string {
        let placement = "";
        for (let rank = 7; rank >= 0; rank--) {
            let emptyCount = 0;
            for (let file = 0; file < 8; file++) {
                const mask = 1n << BigInt(rankFileToSquare(rank, file));
                const piece = this.pieceAt(mask);
                if (piece === null) {
                    emptyCount++;
                } else {
                    if (emptyCount > 0) {
                        placement += emptyCount;
                        emptyCount = 0;
                    }
                    placement += piece;
                }
            }
            if (emptyCount > 0) {
                placement += emptyCount;
            }
            if (rank > 0) placement += "/";
        }

        const activeColor = this.whiteToMove ? "w" : "b";

        let castling = "";
        if (this.castlingRights & 1) castling += "K";
        if (this.castlingRights & 2) castling += "Q";
        if (this.castlingRights & 4) castling += "k";
        if (this.castlingRights & 8) castling += "q";
        if (castling === "") castling = "-";

        const enPassant = this.enPassantSquare !== null ? squareToAlgebraic(this.enPassantSquare) : "-";

        return [placement, activeColor, castling, enPassant, this.halfmoveClock, this.fullmoveNumber].join(" ");
    }

    /** `start`/`finish` are bitmasks (single set bit), not square indices */
    move(start: bigint, finish: bigint, promotion?: PromotionPieceChar): void {
        const piece = this.pieceAt(start);

        let preMaskSum = 0n;
        if (this.whiteToMove) {
            preMaskSum += this.bPawns + this.bRooks + this.bKnights + this.bBishops + this.bKing + this.bQueens;
        } else {
            preMaskSum += this.wPawns + this.wRooks + this.wKnights + this.wBishops + this.wKing + this.wQueens;
        }
        const clearMask = ~(start | finish);
        this.andEqualsWhite(clearMask);
        this.andEqualsBlack(clearMask);

        this.halfmoveClock++;
        if (this.whiteToMove) {
            if (preMaskSum > this.bPawns + this.bRooks + this.bKnights + this.bBishops + this.bKing + this.bQueens) this.halfmoveClock = 0;
        } else {
            if (preMaskSum > this.wPawns + this.wRooks + this.wKnights + this.wBishops + this.wKing + this.wQueens) this.halfmoveClock = 0;
        }

        // disable castling when rook is taken
        if (finish === 1n) {
            this.castlingRights &= (1 + 4 + 8);
        } else if (finish === 1n << 7n) {
            this.castlingRights &= (2 + 4 + 8);
        } else if (finish === 1n << 56n) {
            this.castlingRights &= (1 + 2 + 4);
        } else if (finish === 1n << 63n) {
            this.castlingRights &= (1 + 2 + 8);
        }

        const startSquare = bitToSquare(start);
        const finishSquare = bitToSquare(finish);
        const fileDelta = getFileFromSquare(startSquare) - getFileFromSquare(finishSquare);
        
        // piece unused in this case, just converting straight to promotion piece
        if (promotion) {
            const rank = getRankFromSquare(finishSquare);
            const isBlackPromotion = promotion === promotion.toLowerCase();
            if (isBlackPromotion && rank !== 0n) throw new IllegalMoveError("Promotion at incorrect rank");
            if (!isBlackPromotion && rank !== 7n) throw new IllegalMoveError("Promotion at incorrect rank");
            switch (promotion) {
                case 'n':
                    this.bKnights |= finish;
                    break;
                case 'b':
                    this.bBishops |= finish;
                    break;
                case 'r':
                    this.bRooks |= finish;
                    break;
                case 'q':
                    this.bQueens |= finish;
                    break;
                case 'N':
                    this.wKnights |= finish;
                    break;
                case 'B':
                    this.wBishops |= finish;
                    break;
                case 'R':
                    this.wRooks |= finish;
                    break;
                case 'Q':
                    this.wQueens |= finish;
                    break;
            }
            this.enPassantSquare = null;
            this.halfmoveClock = 0;

        } else {
            switch (piece) {
                case 'p':
                    this.bPawns |= finish;
                    if (startSquare - finishSquare === 16n) {
                        this.enPassantSquare = Number(finishSquare) + 8;
                    } else {
                        if (Number(finishSquare) === this.enPassantSquare) {
                            this.wPawns &= ~(finish << 8n);
                        }
                        this.enPassantSquare = null;
                    }
                    this.halfmoveClock = 0;
                    break;
                case 'n':
                    this.bKnights |= finish;
                    this.enPassantSquare = null;
                    break;
                case 'b':
                    this.bBishops |= finish;
                    this.enPassantSquare = null;
                    break;
                case 'r':
                    this.bRooks |= finish;
                    if (getFileFromSquare(startSquare) === 0n) {
                        this.castlingRights &= (1 + 2 + 4);
                    } else {
                        this.castlingRights &= (1 + 2 + 8);
                    }
                    this.enPassantSquare = null;
                    break;
                case 'q':
                    this.bQueens |= finish;
                    this.enPassantSquare = null;
                    break;
                case 'k':
                    this.bKing |= finish;
                    this.castlingRights &= (1 + 2);
                    this.enPassantSquare = null;
                    if (fileDelta === 2n) {
                        // queenside: a8 rook -> d8
                        this.bRooks &= ~(1n << 56n);
                        this.bRooks |= 1n << 59n;
                    } else if (fileDelta === -2n) {
                        // kingside: h8 rook -> f8
                        this.bRooks &= ~(1n << 63n);
                        this.bRooks |= 1n << 61n;
                    }
                    break;
                case 'P':
                    this.wPawns |= finish;
                    if (finishSquare - startSquare === 16n) {
                        this.enPassantSquare = Number(startSquare) + 8;
                    } else {
                        if (Number(finishSquare) === this.enPassantSquare) {
                            this.bPawns &= ~(finish >> 8n);
                        }
                        this.enPassantSquare = null;
                    }
                    this.halfmoveClock = 0;
                    break;
                case 'N':
                    this.wKnights |= finish;
                    this.enPassantSquare = null;
                    break;
                case 'B':
                    this.wBishops |= finish;
                    this.enPassantSquare = null;
                    break;
                case 'R':
                    this.wRooks |= finish;
                    if (getFileFromSquare(startSquare) === 0n) {
                        this.castlingRights &= (1 + 4 + 8);
                    } else {
                        this.castlingRights &= (2 + 4 + 8);
                    }
                    this.enPassantSquare = null;
                    break;
                case 'Q':
                    this.wQueens |= finish;
                    this.enPassantSquare = null;
                    break;
                case 'K':
                    this.wKing |= finish;
                    this.castlingRights &= (4 + 8)
                    this.enPassantSquare = null;
                    if (fileDelta === 2n) {
                        // queenside: a1 rook -> d1
                        this.wRooks &= ~(1n << 0n);
                        this.wRooks |= 1n << 3n;
                    } else if (fileDelta === -2n) {
                        // kingside: h1 rook -> f1
                        this.wRooks &= ~(1n << 7n);
                        this.wRooks |= 1n << 5n;
                    }
                    break;
            }
        }
        this.whiteToMove = !this.whiteToMove;
        if (this.whiteToMove) this.fullmoveNumber++;
    }

    /** returns a full occupancy bitboard (many bits set), not a single-square bit or index */
    private whiteOccupancy(): bigint {
        return this.wPawns | this.wKnights | this.wBishops | this.wRooks | this.wQueens | this.wKing;
    }

    /** returns a full occupancy bitboard (many bits set), not a single-square bit or index */
    private blackOccupancy(): bigint {
        return this.bPawns | this.bKnights | this.bBishops | this.bRooks | this.bQueens | this.bKing;
    }

    /** `num` is a bitmask (typically a single set bit), not a square index */
    andWhite(num: bigint): boolean {
        return (this.whiteOccupancy() & num) > 0n;
    }

    /** `num` is a bitmask (typically a single set bit), not a square index */
    andBlack(num: bigint): boolean {
        return (this.blackOccupancy() & num) > 0n;
    }

    /** `num` is a bitmask (e.g. a clear-mask), not a square index */
    andEqualsWhite(num: bigint): void {
        this.wPawns &= num;
        this.wKnights &= num;
        this.wBishops &= num;
        this.wRooks &= num;
        this.wQueens &= num;
        this.wKing &= num;
    }

    /** `num` is a bitmask (e.g. a set-mask), not a square index */
    orEqualsWhite(num: bigint): void {
        this.wPawns |= num;
        this.wKnights |= num;
        this.wBishops |= num;
        this.wRooks |= num;
        this.wQueens |= num;
        this.wKing |= num;
    }

    /** `num` is a bitmask (e.g. a clear-mask), not a square index */
    andEqualsBlack(num: bigint): void {
        this.bPawns &= num;
        this.bKnights &= num;
        this.bBishops &= num;
        this.bRooks &= num;
        this.bQueens &= num;
        this.bKing &= num;
    }

    /** `num` is a bitmask (e.g. a set-mask), not a square index */
    orEqualsBlack(num: bigint): void {
        this.bPawns |= num;
        this.bKnights |= num;
        this.bBishops |= num;
        this.bRooks |= num;
        this.bQueens |= num;
        this.bKing |= num;
    }

}