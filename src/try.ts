// export enum NodeType {
//     ALTER, CONCAT, ITER,
//     CHAR, CHARCLASS, EMPTY, BACKREF, BOUNDARY
// }

// export interface IntPair {
//     begin: number;
//     end: number;
// }

// export enum TokenType {
//     CHARACTER = 0, QUANTIFIER, SHORTHAND, BOUNDARY, BACKREF, VERTICAL_BAR,
//     L_BRACKET, NEGATE, R_BRACKET, HYPHEN_IN_CLASS,
//     R_P, L_P
// }

// export type Token = { loc: IntPair } & (
//     | { type: TokenType.CHARACTER | TokenType.SHORTHAND | TokenType.BOUNDARY, chr: string }
//     | { type: TokenType.QUANTIFIER, quantifier: Quantifier }
//     | { type: TokenType.BACKREF, num: number }
//     | { type: TokenType.BACKREF, name: string }
//     | { type: TokenType.VERTICAL_BAR | TokenType.L_BRACKET | TokenType.NEGATE | TokenType.R_BRACKET | TokenType.HYPHEN_IN_CLASS | TokenType.R_P }
//     | { type: TokenType.L_P, gType: GroupType.ATOM | GroupType.NON_CAPTURE | GroupType.NORMAL }
//     | { type: TokenType.L_P, gType: GroupType.NAME, name: string }
//     | { type: TokenType.L_P, laType: LookaroundType }
// )

"1".charCodeAt(0);
let a: string | null;
let b: string = a!!!!.charAt(1);