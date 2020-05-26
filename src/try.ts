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

// "1".charCodeAt(0);
// let a: string | null;
// let b: string = a!!!!.charAt(1);








// let re = processRegex("(?=abc(?!123))\\w*", true);
// let nfa = construct(re);

// let _puncts = puncts;
// let _warnings = warnings;

// _warnings.forEach(x => console.log(x));

// // let strs = generate(re);
// // strs.forEach(x => console.log(x));
// // console.log();

// // printNFA(nfa);
// let boo = match(nfa, "abc123");
// console.log(boo);


// Regexp?Buddy is (aweful|acceptable|awesome)
// RegexBuddy is awesome

// ([^,\\r\\n]*,){11}P
// (?>[^,\\r\\n]*,){11}P
// 1,2,3,4,5,6,7,8,9,10,11,12,13

// \\(?[2-9]\\d{2}\\)?(-|.)\\d{3}(-|.)\\d{4}

// ((b)|a){2,3}b\\2
// aabb，或者aabbb
// backtrack的时候恢复所有之前存留的信息
// aabb第一次match到aabb的时候，是按aab b来的
// 第二次match到aabb的时候，是按aa b来的，这时是否会match最后一个\\2呢？按理应该不会才对
// 这个为什么是对的 ...

// TODO a* 为什么生成的那么奇怪呃






function evil(str: string): string {
    return "("+ str + "){100}"
}

let str = "a"
for (let i = 0; i < 20; i++) {
    str = evil(str)
}

console.log(str.length)
