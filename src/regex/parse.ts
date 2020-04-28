import { Token, TokenType } from "./token";
import { LookaroundType, Quantifier, IntPair, GroupType } from "./types";
import { CharClass, ItemType, ClassItem } from "./charclass";
import { UngrammaticalError, InternalError } from "./util";
import { ParsedRegex, StrAndTokens } from "./regex";
import { check_char_class } from "./warn";

export enum NodeType {
    ALTER, CONCAT, REPEAT,
    CHAR, CHARCLASS, EMPTY, BACKREF, BOUNDARY, SHORTHAND,
    GROUP, LOOKAROUND
}
// 可选的：lookaround, group
// 生成：Backref只需要遇到group时全局保存，lookaround和boundary有些难办

export type Node = { loc: IntPair } & (
    | { type: NodeType.ALTER | NodeType.CONCAT, children: Node[] }
    | { type: NodeType.REPEAT, child: Node, qt: Quantifier }
    | { type: NodeType.CHAR | NodeType.BOUNDARY | NodeType.SHORTHAND, chr: string }
    | { type: NodeType.CHARCLASS, cc: CharClass }
    | { type: NodeType.EMPTY }
    | { type: NodeType.BACKREF, pointTo: number | string }
    | { type: NodeType.GROUP, gType: GroupType.NON_CAPTURE, child: Node }
    | { type: NodeType.GROUP, gType: GroupType.ATOM, child: Node, id: number }
    | { type: NodeType.GROUP, gType: GroupType.NORMAL, child: Node, num: number }
    | { type: NodeType.GROUP, gType: GroupType.NAME, child: Node, num: number, name: string }
    | { type: NodeType.LOOKAROUND, laType: LookaroundType, child: Node }
)

/*
http://matt.might.net/articles/grammars-bnf-ebnf/

// 怎么确保一些奇奇怪怪的错发生？比如QUANTIFIER加QUANTIFIER
*/

let tokens: Token[];
let i: number;
let num: number;
let id: number;
let groups: Map<number | string, Node>;
let backrefed_groups: Set<number | string>;
let st: StrAndTokens;

export function parse(str_and_tokens: StrAndTokens): ParsedRegex {
    tokens = str_and_tokens.tokens;
    st = str_and_tokens;
    i = 0;
    groups = new Map();
    backrefed_groups = new Set();
    num = 1;
    id = -1;

    let retNode: Node = alter();
    if (i !== tokens.length) {
        throw new UngrammaticalError("unexpected symbol near index: " + i);
    }
    return { root: retNode, groups: groups };
}


// 1. tokens[i] should either be '|', or isFollow(alter)
// 2. given the greediness of (repeat)*, tokens[i] could not be first(repeat)
// => quantifier is still possible? check here??

function alter(): Node {
    const loc_from = i;
    let children: Node[] = [];

    while (true) {
        children.push(concat());
        if (i === tokens.length) {
            break;
        }
        if (tokens[i].type === TokenType.VERTICAL_BAR) {
            i++;
            continue;
        }
        break;
    }
    if (children.length === 1) {
        return children[0];
    }
    return { type: NodeType.ALTER, loc: { begin: loc_from, end: i }, children };
}

function concat(): Node {
    const loc_from = i;
    if (isFollowConcat()) {
        return { type: NodeType.EMPTY, loc: { begin: loc_from, end: i } };
    }
    let children: Node[] = [];
    let child: Node;
    do {
        children.push(child = repeat());
    } while (!isFollowConcat());

    if (children.length === 1) {
        return child;
    }
    return { type: NodeType.CONCAT, loc: { begin: loc_from, end: i }, children: children };
}

function repeat(): Node {
    const loc_from = i;

    let child: Node = atom();
    if (i === tokens.length) {
        return child;
    }
    const t: Token = tokens[i];
    if (t.type === TokenType.QUANTIFIER) {
        return { type: NodeType.REPEAT, loc: { begin: loc_from, end: ++i }, child: child, qt: t.quantifier };
    }
    return child;
}

function atom(): Node {
    const loc_from = i;

    const t: Token = tokens[i];
    switch (t.type) {
        case TokenType.CHAR:
            return { type: NodeType.CHAR, loc: { begin: loc_from, end: ++i }, chr: t.chr };
        case TokenType.SHORTHAND:
            return { type: NodeType.SHORTHAND, loc: { begin: loc_from, end: ++i }, chr: t.chr };
        // return {
        //     type: NodeType.CHARCLASS,
        //     loc: { begin: loc_from, end: ++i },
        //     cc: { items: [{ type: ItemType.SHORTHAND, chr: t.chr }] }
        // }
        case TokenType.BACKREF: {
            if (groups.get(t.pointTo)) {
                backrefed_groups.add(t.pointTo);
                return { type: NodeType.BACKREF, loc: { begin: loc_from, end: ++i }, pointTo: t.pointTo };
            }
            throw new UngrammaticalError(`uncaught backref near index: ${t.loc.begin}`);
        }
        case TokenType.BOUNDARY:
            return { type: NodeType.BOUNDARY, loc: { begin: loc_from, end: ++i }, chr: t.chr };
        case TokenType.L_BRACKET:
            return charclass();
        case TokenType.L_P:
        case TokenType.L_P_L:
            return groupOrLookaround();
        default:
            // QUANTIFIER, VERTICAL_BAR
            // NEGATE, R_BRACKET, HYPHEN_IN_CLASS
            throw new UngrammaticalError("unexpected symbol near index: " + t.loc.begin);
    }
}

function groupOrLookaround(): Node {
    const loc_from = i;
    const t: Token = tokens[i++];

    let _num: number = 0; // have to initialize
    let _id: number = 0;
    if (t.type === TokenType.L_P) {
        switch (t.gType) {
            case GroupType.NORMAL: case GroupType.NAME:
                _num = num++;
                break;
            case GroupType.ATOM:
                _id = id--;
                break;
        }
    }

    let child: Node = alter();

    if (i === tokens.length || tokens[i].type !== TokenType.R_P) {
        throw new UngrammaticalError("missing ) near index: " + i);
    }

    switch (t.type) {
        case TokenType.L_P: {
            switch (t.gType) {
                case GroupType.NAME:
                    groups.set(t.name, child);
                    groups.set(_num, child);
                    return {
                        type: NodeType.GROUP,
                        loc: { begin: loc_from, end: ++i },
                        gType: t.gType,
                        child: child,
                        num: _num,
                        name: t.name
                    }
                case GroupType.NORMAL:
                    groups.set(_num, child);
                    return {
                        type: NodeType.GROUP,
                        loc: { begin: loc_from, end: ++i },
                        gType: t.gType,
                        child: child,
                        num: _num
                    }
                case GroupType.ATOM:
                    return {
                        type: NodeType.GROUP,
                        loc: { begin: loc_from, end: ++i },
                        gType: t.gType,
                        child: child,
                        id: _id
                    }
                case GroupType.NON_CAPTURE:
                    return {
                        type: NodeType.GROUP,
                        loc: { begin: loc_from, end: ++i },
                        gType: t.gType,
                        child: child
                    }
            }
        }
        case TokenType.L_P_L:
            return {
                type: NodeType.LOOKAROUND,
                loc: { begin: loc_from, end: ++i },
                laType: t.laType,
                child: child
            }
        default:
            throw new InternalError("impossible");
    }
}

function charclass(): Node {
    const loc_from = i;
    let negate = false;
    let items: ClassItem[] = [];
    i++; // already know the first token's type is L_BRACKET

    if (i === tokens.length) {
        throw new UngrammaticalError("ill-formed character class near index: " + i);
    }

    if (tokens[i].type === TokenType.NEGATE) {
        negate = true;
        i++;

        if (i === tokens.length) {
            throw new UngrammaticalError("ill-formed character class near index: " + i);
        }
    }

    if (tokens[i].type === TokenType.R_BRACKET) {
        throw new UngrammaticalError("ill-formed character class near index: " + i);
    }

    let pre_char: string | null = null; // hard to define “previous”
    let pre_loc: number = -1;
    while (true) {
        let t = tokens[i];

        // 每个都要处理prechar
        switch (t.type) {
            case TokenType.SHORTHAND: {
                if (afterHyphen()) {
                    throw new UngrammaticalError("ill-formed range in character class near index: " + i);
                }

                if (pre_char !== null) { // [\da] versus [a\d]
                    items.push({ type: ItemType.CHAR, chr: pre_char, loc: { begin: pre_loc, end: pre_loc } });
                }
                items.push({ type: ItemType.SHORTHAND, chr: t.chr, loc: { begin: i, end: i } });
                pre_char = null;
                break;
            }
            case TokenType.CHAR: {
                if (afterClassStart() || afterShorthand()) {
                    pre_char = t.chr;
                    pre_loc = i;
                } else if (afterChar()) {
                    if (pre_char != null) { // otherwise it's cases such as c in [a-bc]
                        items.push({ type: ItemType.CHAR, chr: pre_char, loc: { begin: i, end: i } });
                    }
                    pre_char = t.chr;
                    pre_loc = i;
                } else if (afterHyphen()) {
                    // assert pre_char != null;
                    items.push(getRangeItem(pre_char!, t.chr, i - 2));
                    pre_char = null;
                }
                break;
            }
            case TokenType.HYPHEN_IN_CLASS: {
                if (afterClassStart()) { // impossible
                    pre_char = "-";
                    pre_loc = i;
                } else if (afterShorthand()) {
                    tokens[i] = { type: TokenType.CHAR, loc: t.loc, chr: "-" };
                    pre_char = "-";
                    pre_loc = i;
                } else if (afterChar()) {
                    if (pre_char == null) { // cases such as the second '-' in [a-b-c]
                        tokens[i] = { type: TokenType.CHAR, loc: t.loc, chr: "-" };
                        pre_char = "-";
                        pre_loc = i;
                    }
                    // cases such as in [a-b]
                    // do nothing
                } else if (afterHyphen()) {
                    // assert pre_char != null;
                    tokens[i] = { type: TokenType.CHAR, loc: t.loc, chr: "-" };

                    items.push(getRangeItem(pre_char!, "-", i - 2));
                    pre_char = null;
                }
                break;
            }
            default:
                throw new InternalError("unknown error parsing character class");
        }


        if (i + 1 === tokens.length) {
            throw new UngrammaticalError("ill-formed character class near index: " + i);
        }

        i++;
        if (tokens[i].type === TokenType.R_BRACKET) {
            if (pre_char !== null) { // 所以[xxx-]的-一定要事先处理成character, e.g. [a-]
                items.push({ type: ItemType.CHAR, chr: pre_char, loc: { begin: pre_loc, end: pre_loc } });
            }
            break;
        }
    }

    let ret: Node = { type: NodeType.CHARCLASS, loc: { begin: loc_from, end: ++i }, cc: { negate: negate, items: items } };
    check_char_class(st, ret);
    return ret;
}

function afterClassStart() {
    return tokens[i - 1].type === TokenType.NEGATE
        || tokens[i - 1].type === TokenType.L_BRACKET;
}

function afterChar() {
    return tokens[i - 1].type === TokenType.CHAR;
}

function afterHyphen() {
    return tokens[i - 1].type === TokenType.HYPHEN_IN_CLASS;
}

function afterShorthand() {
    return tokens[i - 1].type === TokenType.SHORTHAND;
}

function getRangeItem(from: string, to: string, loc_begin: number): ClassItem {
    if (from.charCodeAt(0) > to.charCodeAt(0)) {
        throw new UngrammaticalError("ill-formed range in character class near index: " + i);
    }
    return { type: ItemType.RANGE, range: { from: from.charCodeAt(0), to: to.charCodeAt(0) }, loc: { begin: loc_begin, end: loc_begin + 3 } };
}



function isFollowAlter() {
    return i === tokens.length || tokens[i].type === TokenType.R_P;
}

function isFollowConcat() {
    return isFollowAlter() || tokens[i].type === TokenType.VERTICAL_BAR;
}

function isFirstConcat() {
    return isFirstRepeat(); // and ε
}

function isFirstRepeat() {
    switch (tokens[i].type) {
        case TokenType.L_P:
        case TokenType.L_BRACKET:
        case TokenType.CHAR:
        case TokenType.SHORTHAND:
        case TokenType.BOUNDARY:
        case TokenType.BACKREF:
            return true;
        default:
            return false;
    }
}