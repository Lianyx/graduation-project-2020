import { Node, parse } from './parse'
import { Token, tokenize } from './token'
import { IntPair } from './types';
import { UngrammaticalError, warnings, emptyArray, InternalError } from './util';
import { check } from './warn';
import { NFA } from './nfa';

export type ParsedRegex = {
    root: Node;
    groups: Map<number | string, Node>; // number那里其实可以直接array[num] = xx
}

export type StrAndTokens = {
    tokens: Token[];
    str: string;
}

export type Regex = ParsedRegex & StrAndTokens & {
    nfa?: NFA
}

export function processRegex(str: string, isLiteral: boolean): Regex {
    emptyArray(warnings)

    if (!isLiteral) {
        str = str_to_literal(str);
    }
    let str_and_tokens = tokenize(str);
    let pr = parse(str_and_tokens);
    // check();
    return { ...str_and_tokens, root: pr.root, groups: pr.groups };
}

export function strBetween(st: StrAndTokens, loc: IntPair): string {
    if (loc.begin === loc.end) {
        return "";
    }
    let begin = st.tokens[loc.begin].loc.begin;
    let end = st.tokens[loc.end - 1].loc.end;
    return st.str.substring(begin, end);
}

export function strAt(st: StrAndTokens, at: number): string {
    let begin = st.tokens[at].loc.begin;
    let end = st.tokens[at].loc.end;
    return st.str.substring(begin, end);
}

export function tokenLocBegin(st: StrAndTokens, loc: IntPair): number {
    return st.tokens[loc.begin].loc.begin;
}

function str_to_literal(str: string): string {
    if (str.endsWith("\\")) {
        throw new UngrammaticalError("escape is not followed by any char, near index; " + (str.length - 1));
    }
    // \\r这种也可以这么干就可以了
    return str.replace(/\\(.)/g, '$1');
}

// let str = "\\\\s\\\\d\\x";
// console.log(str);
// console.log(str_to_literal(str));

export function shorthandToStr(chr: string) {
    switch (chr) {
        case ".":
            return "."
        case "d":
        case "D":
        case "s":
        case "S":
        case "w":
        case "W":
            return "\\" + chr
        default:
            throw new InternalError()
    }
}