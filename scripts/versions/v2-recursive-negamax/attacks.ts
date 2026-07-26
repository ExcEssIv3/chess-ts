// Attack tables computed once at module load (pure geometry, independent of
// any board state) and reused for the lifetime of the process. See
// attacks-generator.ts for how each table is built.
import { blackPawnAttacks, kingAttacks, knightAttacks, whitePawnAttacks } from "./attacks-generator";

export const WHITE_PAWN_ATTACKERS: readonly bigint[] = whitePawnAttacks();
export const BLACK_PAWN_ATTACKERS: readonly bigint[] = blackPawnAttacks();
export const KNIGHT_ATTACKS: readonly bigint[] = knightAttacks();
export const KING_ATTACKS: readonly bigint[] = kingAttacks();
