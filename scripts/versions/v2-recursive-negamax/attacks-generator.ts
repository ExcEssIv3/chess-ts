export // [fileDelta, rankDelta] pairs, checked against the board edge before use.
const KNIGHT_OFFSETS: readonly [bigint, bigint][] = [
    [1n, 2n], [2n, 1n], [2n, -1n], [1n, -2n],
    [-1n, -2n], [-2n, -1n], [-2n, 1n], [-1n, 2n],
];
export const KING_OFFSETS: readonly [bigint, bigint][] = [
    [1n, 0n], [1n, 1n], [1n, -1n], [-1n, 0n],
    [-1n, 1n], [-1n, -1n], [0n, 1n], [0n, -1n],
];

// Each table is indexed by *target* square, not origin: attacks[i] is the set
// of squares a pawn of that color would need to stand on to attack square i.
// This lets checkDanger answer "is square i attacked by a white/black pawn"
// with a single `attacks[i] & board.wPawns` lookup instead of iterating pawns.
export function whitePawnAttacks(): bigint[] {
    const attacks: bigint[] = [];

    for (let i = 0n; i < 64n; i++) {
        if (i < 8n) {
            attacks.push(0n);
        } else if (i % 8n === 0n) {
            attacks.push(1n << (i - 7n));
        } else if (i % 8n === 7n) {
            attacks.push(1n << (i - 9n));
        } else {
            attacks.push(5n << (i - 9n));
        }
    }

    return attacks;
}

export function blackPawnAttacks(): bigint[] {
    const attacks: bigint[] = [];

    for (let i = 0n; i < 64n; i++) {
        if (i > 55n) {
            attacks.push(0n);
        } else if (i % 8n === 0n) {
            attacks.push(1n << (i + 9n));
        } else if (i % 8n === 7n) {
            attacks.push(1n << (i + 7n));
        } else {
            attacks.push(5n << (i + 7n));
        }
    }

    return attacks;
}

export function knightAttacks(): bigint[] {
    const attacks: bigint[] = [];

    for (let i = 0n; i < 64n; i++) {
        const file = i % 8n;
        const rank = i / 8n;
        let squares = 0n;
        KNIGHT_OFFSETS.forEach(([fileDelta, rankDelta]) => {
            const targetFile = file + fileDelta;
            const targetRank = rank + rankDelta;
            if (targetFile < 0n || targetFile > 7n || targetRank < 0n || targetRank > 7n) return;
            squares |= 1n << (targetRank * 8n + targetFile);
        });
        attacks.push(squares);
    }

    return attacks;
}

export function kingAttacks(): bigint[] {
    const attacks: bigint[] = [];

    for (let i = 0n; i < 64n; i++) {
        const file = i % 8n;
        const rank = i / 8n;
        let squares = 0n;
        KING_OFFSETS.forEach(([fileDelta, rankDelta]) => {
            const targetFile = file + fileDelta;
            const targetRank = rank + rankDelta;
            if (targetFile < 0n || targetFile > 7n || targetRank < 0n || targetRank > 7n) return;
            squares |= 1n << (targetRank * 8n + targetFile);
        });
        attacks.push(squares);
    }

    return attacks;
}