import { IntPair, Quantifier, Backref, LookaroundType, GroupType } from "./types";
import { UngrammaticalError, InternalError, isPunct, puncts } from "./util";
import { StrAndTokens } from "./regex";


export enum TokenType {
    CHAR = 0, QUANTIFIER, SHORTHAND, BOUNDARY, BACKREF, VERTICAL_BAR,
    L_BRACKET, NEGATE, R_BRACKET, HYPHEN_IN_CLASS,
    R_P, L_P, L_P_L
}

export type Token = { loc: IntPair } & (
    | { type: TokenType.CHAR | TokenType.SHORTHAND | TokenType.BOUNDARY, chr: string }
    | { type: TokenType.QUANTIFIER, quantifier: Quantifier }
    | { type: TokenType.BACKREF, pointTo: number | string }
    | {
        type: TokenType.VERTICAL_BAR | TokenType.L_BRACKET | TokenType.NEGATE
        | TokenType.R_BRACKET | TokenType.HYPHEN_IN_CLASS | TokenType.R_P
    }
    | { type: TokenType.L_P, gType: GroupType.ATOM | GroupType.NON_CAPTURE | GroupType.NORMAL }
    | { type: TokenType.L_P, gType: GroupType.NAME, name: string }
    | { type: TokenType.L_P_L, laType: LookaroundType }
)

// export interface Token {
//     type: TokenType;
//     loc: IntPair;

//     chr?: string;                    // CHARACTER, SHORTHAND, BOUNDARY
//     quantifier?: Quantifier;         // QUANTIFIER
//     num?: number;                    // BACKREF
//     name?: string;                   // L_P (NAME GROUP), BACKREF
//     laType?: LookaroundType;
//     gType?: GroupType;
// }

let regex: string;
let i: number;

export function tokenize(_regex: string): StrAndTokens {
    let ret: Token[] = [];
    regex = _regex;

    let in_char_class: boolean = false;

    for (i = 0; i < regex.length; i++) {
        let c = regex[i];
        switch (c) {
            case "\\": {
                if (i + 1 === regex.length) {
                    throw new UngrammaticalError("Dangling \\ near index: " + i);
                }
                c = regex[++i];
                switch (c) {
                    case "t":
                        ret.push({ type: TokenType.CHAR, loc: { begin: i - 1, end: i + 1 }, chr: "\t" });
                        break;
                    case "n":
                        ret.push({ type: TokenType.CHAR, loc: { begin: i - 1, end: i + 1 }, chr: "\n" });
                        break;
                    case "r":
                        ret.push({ type: TokenType.CHAR, loc: { begin: i - 1, end: i + 1 }, chr: "\r" });
                        break;
                    case "f":
                        ret.push({ type: TokenType.CHAR, loc: { begin: i - 1, end: i + 1 }, chr: "\f" });
                        break;
                    // TODO could be more ...

                    // TODO octal and hexadecimal
                    case "x": {
                        if (i + 2 >= regex.length) {
                            throw new UngrammaticalError("ill formed \\xhh construction near index: " + i);
                        }
                        let sub_str = regex.substring(i + 1, i + 3);
                        if (!isH(sub_str[0]) || !isH(sub_str[1])) {
                            throw new UngrammaticalError("ill formed \\xhh construction near index: " + i);
                        }
                        let chr = String.fromCharCode(parseInt(sub_str, 16));
                        ret.push({ type: TokenType.CHAR, loc: { begin: i - 1, end: i + 3 }, chr });
                        i += 2;
                        break;
                    }
                    case "u": {
                        if (i + 4 >= regex.length) {
                            throw new UngrammaticalError("ill formed \\uhhhh construction near index: " + i);
                        }
                        let sub_str = regex.substring(i + 1, i + 5);
                        if (!isH(sub_str[0]) || !isH(sub_str[1]) || !isH(sub_str[2]) || !isH(sub_str[3])) {
                            throw new UngrammaticalError("ill formed \\uhhhh construction near index: " + i);
                        }
                        let chr = String.fromCharCode(parseInt(sub_str, 16));
                        ret.push({ type: TokenType.CHAR, loc: { begin: i - 1, end: i + 5 }, chr });
                        i += 4;
                        break;
                    }
                    // shorthand
                    case "d":
                    case "D":
                    case "s":
                    case "S":
                    case "w":
                    case "W":
                        ret.push({ type: TokenType.SHORTHAND, loc: { begin: i - 1, end: i + 1 }, chr: c });
                        break;

                    // boundary
                    case "b": // TODO inside class?
                    case "B":
                    case "A":
                    case "G":
                    case "Z":
                    case "z":
                        if (in_char_class) {
                            throw new UngrammaticalError("Illegal/unsupported escape sequence near index: " + i);
                        }
                        ret.push({ type: TokenType.BOUNDARY, loc: { begin: i - 1, end: i + 1 }, chr: c });
                        break;

                    // backref and default
                    case "k": {
                        if (in_char_class) {
                            throw new UngrammaticalError("Illegal/unsupported escape sequence near index: " + i);
                        }
                        if (i + 1 === regex.length || regex[i + 1] !== '<') {
                            throw new UngrammaticalError("Ill-formed \\k<name> near index: " + i);
                        }
                        i++; // then, charAt(i) == '<'
                        let loc_from = i - 1;
                        let str_start = i + 1;
                        while (true) {
                            if (i + 1 === regex.length) {
                                throw new UngrammaticalError("Ill-formed \\k<name> near index: " + i);
                            }

                            if ((c = regex[++i]) === '>') { // TODO empty name and nonexistent name
                                break;
                            }

                            if (!isAlphanumeric(c)) {
                                throw new UngrammaticalError("Ill-formed \\k<name> near index: " + i);
                            }
                        }
                        ret.push({
                            type: TokenType.BACKREF,
                            loc: { begin: loc_from, end: i + 1 },
                            pointTo: regex.substring(str_start, i)
                        });
                        break;
                    }
                    default:
                        if (isDigit(c)) { // c cannot be 0 here, 0 already handled above
                            if (in_char_class) {
                                throw new UngrammaticalError("Illegal/unsupported escape sequence near index: " + i);
                            }

                            let loc_from = i - 1;
                            let num = parseInt(c, 10);
                            while (i + 1 != regex.length && isDigit(c = regex[i + 1])) {
                                num = num * 10 + parseInt(c, 10);
                                i++;
                            }
                            ret.push({ type: TokenType.BACKREF, loc: { begin: loc_from, end: i + 1 }, pointTo: num });
                        } else { // real default case
                            ret.push({ type: TokenType.CHAR, loc: { begin: i - 1, end: i + 1 }, chr: c })
                            if (isPunct(c)) {
                                puncts.push(c);
                            }
                        }
                }
                break;
            }
            // end of \\

            case "{": {  // {01,} is ok, {,3} is not
                if (in_char_class) {
                    ret.push({ type: TokenType.CHAR, loc: { begin: i, end: i + 1 }, chr: "{" });
                    if (isPunct(c)) {
                        puncts.push(c);
                    }
                    break;
                }
                // { must be followed by a digit, can't be } or ,
                if (i + 1 === regex.length || !isDigit(c = regex.charAt(++i))) {
                    throw new UngrammaticalError("Illegal repetition near index: " + i);
                }

                let loc_from = i - 1;
                let floor = parseInt(c, 10);
                let ceil_exist = false;
                let newToken: Token;

                while (i + 1 !== regex.length && isDigit(c = regex.charAt(++i))) {
                    floor = floor * 10 + parseInt(c, 10);
                }

                if (isDigit(c) && i + 1 === regex.length) { // 如果上面是因为第二个条件停下来的，那么isDigit(c) === false;
                    throw new UngrammaticalError("Illegal repetition near index: " + i);
                }

                if (c === '}') {
                    newToken = {
                        type: TokenType.QUANTIFIER,
                        loc: { begin: loc_from, end: i + 1 },
                        quantifier: { floor: floor, ceil: floor }
                    }
                } else if (c === ',') {
                    let ceil = 0;
                    while (i + 1 !== regex.length && isDigit(c = regex.charAt(++i))) {
                        ceil = ceil * 10 + parseInt(c, 10);
                        ceil_exist = true;
                    }
                    if (isDigit(c) && i + 1 === regex.length || c !== '}') {
                        throw new UngrammaticalError("Illegal repetition near index: " + i);
                    }
                    if (ceil_exist && ceil < floor) {
                        throw new UngrammaticalError("Illegal repetition floor > ceil, near index: " + i);
                    }
                    newToken = {
                        type: TokenType.QUANTIFIER,
                        loc: { begin: loc_from, end: i + 1 },
                        quantifier: { floor: floor, ceil: ceil_exist ? ceil : -1 }
                    };
                } else {
                    throw new UngrammaticalError("Illegal repetition near index: " + i);
                }

                checkAfterQuantifier(newToken);

                ret.push(newToken);
                break;
            }
            case '}': // normal character
                ret.push({ type: TokenType.CHAR, loc: { begin: i, end: i + 1 }, chr: "}" });
                if (isPunct(c)) {
                    puncts.push(c);
                }
                break;
            case '[':
                if (in_char_class) {
                    throw new UngrammaticalError("unsupported embedded character class near index: " + i);
                }
                ret.push({ type: TokenType.L_BRACKET, loc: { begin: i, end: i + 1 } });
                in_char_class = true;
                break;
            case ']':
                if (!in_char_class) {
                    ret.push({ type: TokenType.CHAR, loc: { begin: i, end: i + 1 }, chr: '[' });
                    if (isPunct(c)) {
                        puncts.push(c);
                    }
                    break;
                }
                if (firstInCharClass(i)) {
                    throw new UngrammaticalError("empty character class near index: " + i);
                }
                ret.push({ type: TokenType.R_BRACKET, loc: { begin: i, end: i + 1 } });
                in_char_class = false;
                break;
            case '-':
                if (in_char_class && !(firstInCharClass(i) || lastInCharClass(i))) {
                    // never check hyphen_in_class as a character, consecutive hyphens sometimes can also be character
                    // this is handled in parser
                    ret.push({ type: TokenType.HYPHEN_IN_CLASS, loc: { begin: i, end: i + 1 } });
                    break;
                }
                ret.push({ type: TokenType.CHAR, loc: { begin: i, end: i + 1 }, chr: '-' });
                if (isPunct(c)) {
                    puncts.push(c);
                }
                break;
            case '^':
                if (in_char_class) {
                    if (regex[i - 1] === '[') {
                        ret.push({ type: TokenType.NEGATE, loc: { begin: i, end: i + 1 } });
                    } else {
                        ret.push({ type: TokenType.CHAR, loc: { begin: i, end: i + 1 }, chr: '^' });
                        if (isPunct(c)) {
                            puncts.push(c);
                        }
                    }
                    break;
                }
                ret.push({ type: TokenType.BOUNDARY, loc: { begin: i, end: i + 1 }, chr: '^' });
                break;
            case '$':
                if (in_char_class) {
                    ret.push({ type: TokenType.CHAR, loc: { begin: i, end: i + 1 }, chr: '$' });
                    if (isPunct(c)) {
                        puncts.push(c);
                    }
                    break;
                }
                ret.push({ type: TokenType.BOUNDARY, loc: { begin: i, end: i + 1 }, chr: '$' });
                break;
            case '.':
                if (in_char_class) {
                    ret.push({ type: TokenType.CHAR, loc: { begin: i, end: i + 1 }, chr: '.' });
                    if (isPunct(c)) {
                        puncts.push(c);
                    }
                    break;
                }
                ret.push({ type: TokenType.SHORTHAND, loc: { begin: i, end: i + 1 }, chr: '.' });
                break;
            case '*':
            case '+':
            case '?': {
                if (in_char_class) {
                    ret.push({ type: TokenType.CHAR, loc: { begin: i, end: i + 1 }, chr: c });
                    if (isPunct(c)) {
                        puncts.push(c);
                    }
                    break;
                }
                let newToken: Token = {
                    type: TokenType.QUANTIFIER,
                    loc: { begin: i, end: i + 1 },
                    quantifier: { floor: c === "+" ? 1 : 0, ceil: c === "?" ? 1 : -1 }
                }
                checkAfterQuantifier(newToken);
                ret.push(newToken);
                break;
            }
            case '(': {// 8种
                if (in_char_class) {
                    ret.push({ type: TokenType.CHAR, loc: { begin: i, end: i + 1 }, chr: "(" });
                    if (isPunct(c)) {
                        puncts.push(c);
                    }
                    break;
                }

                if (i + 1 === regex.length || regex[i + 1] !== '?') {
                    // unbalanced parentheses pair is handled later
                    ret.push({ type: TokenType.L_P, loc: { begin: i, end: i + 1 }, gType: GroupType.NORMAL });
                    break;
                }

                i++; // then, regex[i] == '?';
                let loc_from = i - 1;

                switch (c = regex[++i]) {
                    case ":":
                        ret.push({ type: TokenType.L_P, loc: { begin: loc_from, end: i + 1 }, gType: GroupType.NON_CAPTURE });
                        break;
                    case ">":
                        ret.push({ type: TokenType.L_P, loc: { begin: loc_from, end: i + 1 }, gType: GroupType.ATOM });
                        break;
                    case "=":
                        ret.push({ type: TokenType.L_P_L, loc: { begin: loc_from, end: i + 1 }, laType: LookaroundType.AHEAD });
                        break;
                    case "!":
                        ret.push({ type: TokenType.L_P_L, loc: { begin: loc_from, end: i + 1 }, laType: LookaroundType.N_AHEAD });
                        break;
                    case "<": // 3种
                        if (i + 1 === regex.length) {
                            throw new UngrammaticalError("ill-formed (?< sequence near index: " + i);
                        }

                        switch (c = regex[++i]) {
                            case "=":
                                ret.push({ type: TokenType.L_P_L, loc: { begin: loc_from, end: i + 1 }, laType: LookaroundType.BEHIND });
                                break;
                            case "!":
                                ret.push({ type: TokenType.L_P_L, loc: { begin: loc_from, end: i + 1 }, laType: LookaroundType.N_BEHIND });
                                break;
                            default: // (?<name>
                                i--; // then, charAt(i) == '<'
                                let str_start = i + 1; // name starts here
                                let str_end;
                                while (true) {
                                    if (i + 1 === regex.length) {
                                        throw new UngrammaticalError("Ill-formed (?<name> near index: " + i);
                                    }

                                    if ((c = regex[++i]) === '>') {
                                        str_end = i;
                                        break;
                                    }

                                    if (!isAlphanumeric(c)) {
                                        throw new UngrammaticalError("Ill-formed (?<name> near index: " + i);
                                    }
                                }
                                ret.push({
                                    type: TokenType.L_P,
                                    loc: { begin: loc_from, end: i + 1 },
                                    gType: GroupType.NAME,
                                    name: regex.substring(str_start, str_end)
                                });
                        }
                        break;
                    default:
                        throw new UngrammaticalError("Ill-formed (? near index: " + i);
                }
                break;
            }
            case ')':
                if (in_char_class) {
                    ret.push({ type: TokenType.CHAR, loc: { begin: i, end: i + 1 }, chr: ')' });
                    if (isPunct(c)) {
                        puncts.push(c);
                    }
                    break;
                }
                ret.push({ type: TokenType.R_P, loc: { begin: i, end: i + 1 } });
                break;
            case '|':
                if (in_char_class) {
                    ret.push({ type: TokenType.CHAR, loc: { begin: i, end: i + 1 }, chr: '|' });
                    if (isPunct(c)) {
                        puncts.push(c);
                    }
                    break;
                }
                ret.push({ type: TokenType.VERTICAL_BAR, loc: { begin: i, end: i + 1 } });
                break;
            default:
                ret.push({ type: TokenType.CHAR, loc: { begin: i, end: i + 1 }, chr: c });
                if (isPunct(c)) {
                    puncts.push(c);
                }
                break;
        }
    }
    return { str: _regex, tokens: ret };
}

// TODO when checking <name>, add not starting with an 9
function isAlphanumeric(c: string) {
    return 'a' <= c && c <= 'z'
        || 'A' <= c && c <= 'Z'
        || '0' <= c && c <= '9';
}

function isH(c: string) {
    // assert c.length == 1
    return '0' <= c && c <= '9' || 'A' <= c && c <= 'F' || 'a' <= c && c <= 'f';
}

function isDigit(c: string) {
    return '0' <= c && c <= '9';
}

// 接受的i是newToken最后的i
function checkAfterQuantifier<T extends Token>(newToken: T extends { type: TokenType.QUANTIFIER } ? T : never) {
    if (i + 1 !== regex.length && regex[i + 1] === '?') {
        newToken.quantifier.lazy = true;
        newToken.loc.end++;
        i++;
    } else if (i + 1 !== regex.length && regex[i + 1] === '+') {
        newToken.quantifier.possessive = true;
        newToken.loc.end++;
        i++;
    }
}

function firstInCharClass(i: number) {
    // assert in_char_class == true
    // no need for range checking
    // impossible for i - 1 < 0
    // impossible for i - 2 < 0 when regex.charAt(i) == '^'
    return regex[i - 1] === '['
        || regex[i - 1] === '^' && regex[i - 2] === '[';
}

function lastInCharClass(i: number) {
    return i + 1 < regex.length && regex[i + 1] === ']';
}
