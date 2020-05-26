import { IntPair } from "./types";

export type Range = {
    from: number;
    to: number;
}

export enum ItemType {
    CHAR, RANGE, SHORTHAND
}

export type ClassItem = { loc: IntPair } & (
    | { type: ItemType.CHAR | ItemType.SHORTHAND, chr: string }
    | { type: ItemType.RANGE, range: Range }
);

export type CharClass = {
    negate?: boolean;
    items: ClassItem[];
    loc: IntPair
}

export function isIn(cc: CharClass, chr: string) {
    if (chr.length !== 1) {
        return false;
    }

    if (!cc.negate) {
        return nonNegateIsIn(cc, chr);
    } else {
        return negateIsIn(cc, chr);
    }
}

export function isInShorthand(sh: string, chr: string) {
    if (chr.length !== 1) {
        return false;
    }

    switch (sh) {
        case "d":
            return is_d(chr);
        case "D":
            return !is_d(chr);
        case "s":
            return is_s(chr);
        case "S":
            return !is_s(chr);
        case "w":
            return is_w(chr);
        case "W":
            return !is_w(chr);
        case ".":
            return chr !== '\n';
        default:
            return false;
    }
}

function negateIsIn(cc: CharClass, chr: string) {
    return !nonNegateIsIn(cc, chr);
}

function nonNegateIsIn(cc: CharClass, chr: string) {
    for (const ci of cc.items) {
        switch (ci.type) {
            case ItemType.CHAR:
                if (chr == ci.chr) {
                    return true;
                }
                break;
            case ItemType.RANGE:
                if (ci.range.from <= chr.charCodeAt(0) && chr.charCodeAt(0) <= ci.range.to) {
                    return true;
                }
                break;
            case ItemType.SHORTHAND:
                if (isInShorthand(ci.chr, chr)) {
                    return true;
                }
                break;
        }
    }
}

function is_d(chr: string): boolean {
    return "0".charCodeAt(0) <= chr.charCodeAt(0) && chr.charCodeAt(0) <= "9".charCodeAt(0);
}

function is_s(chr: string): boolean {
    // TODO 其他一些\u的
    switch (chr) {
        case " ": case "\t": case "\n": case "\f": case "\r":
            return true;
        default:
            return false;
    }
}

export function is_w(chr: string): boolean {
    const char_code = chr.charCodeAt(0);
    if (is_d(chr)) {
        return true;
    }

    if ("a".charCodeAt(0) <= char_code && char_code <= "z".charCodeAt(0)) {
        return true;
    }

    if ("A".charCodeAt(0) <= char_code && char_code <= "Z".charCodeAt(0)) {
        return true;
    }

    return "_".charCodeAt(0) === char_code;
}
