// 有些像是charclass的那两个，在parse的时候就做了吧

import { CharClass, ItemType, Range, ClassItem } from "./charclass";
import { UngrammaticalError, warnings, suggestions, } from "./util";
import { strBetween, Regex, tokenLocBegin, StrAndTokens } from "./regex";
import { Node, NodeType } from "./parse";

let regex: Regex;

enum Answer {
    YES, NO, POSSIBLE
}

export function check(_regex: Regex) {
    regex = _regex;
}

function check_anchor(node: Node) {
    switch (node.type) {
        case NodeType.ALTER:
        case NodeType.CONCAT:
        case NodeType.REPEAT:
        case NodeType.CHAR:
        case NodeType.CHARCLASS:
        case NodeType.EMPTY:
        case NodeType.GROUP:
        case NodeType.BACKREF:
        case NodeType.BOUNDARY:
        case NodeType.LOOKAROUND:
        case NodeType.SHORTHAND:
    }
}

function start_with_caret(node: Node): Answer {
    switch (node.type) {
        case NodeType.ALTER:
            return node.children.map(c => start_with_caret(c)).reduce((a, c) => {
                switch (a) {
                    case Answer.POSSIBLE:
                        return Answer.POSSIBLE;
                    case Answer.NO:
                    case Answer.YES:
                        switch (c) {
                            case Answer.POSSIBLE:
                                return Answer.POSSIBLE;
                            case Answer.NO:
                            case Answer.YES:
                                if (c === a) {
                                    return a;
                                }
                                return Answer.POSSIBLE;
                        }
                }
            })
        case NodeType.CONCAT: // TODO
            return start_with_caret(node.children[0]);
        case NodeType.REPEAT:
            if (node.qt.floor === 1 && node.qt.ceil === 1) {
                return start_with_caret(node.child);
            }
            switch (start_with_caret(node.child)) {
                case Answer.NO:
                    return Answer.NO;
                case Answer.POSSIBLE:
                case Answer.YES:
                    return Answer.POSSIBLE;
            }
        case NodeType.CHAR:
        case NodeType.CHARCLASS:
        case NodeType.SHORTHAND:
        case NodeType.EMPTY:
        case NodeType.BACKREF: // 不可能到这儿吧
            return Answer.NO;
        case NodeType.GROUP:
            return start_with_caret(node.child);
        case NodeType.BOUNDARY:
            if (node.chr === "^") {
                return Answer.YES;
            }
            return Answer.NO;
        case NodeType.LOOKAROUND:
            return Answer.NO;
    }
}

function check_no_caret_in_middle(node: Node) {
    switch (node.type) {
        case NodeType.ALTER:
            node.children.forEach(c => {
                check_no_caret_in_middle(c);
            })
            break;
        case NodeType.CONCAT:
            let afterNonEmpty = false;
            for (const child of node.children) {
                if (afterNonEmpty) {
                    check_no_anchor(child, "^");
                } else {
                    let answer = isEmpty(child);
                    if (answer === Answer.YES) {
                        continue;
                    }
                    check_no_caret_in_middle(child);
                    afterNonEmpty = true;
                }
            }
            break;
        case NodeType.REPEAT:
            if (node.qt.ceil === 1) { // {0,1} or {1}
                check_no_caret_in_middle(node.child);
            } else {
                check_no_anchor(node.child, "^");
            }
        case NodeType.BOUNDARY: // 就算是caret也不要紧
        case NodeType.CHAR:
        case NodeType.CHARCLASS:
        case NodeType.EMPTY:
        case NodeType.SHORTHAND:
            break;
        case NodeType.GROUP:
            check_no_caret_in_middle(node.child);
            break;
        case NodeType.BACKREF: // 不check了
        case NodeType.LOOKAROUND: // TODO
            break;
    }
}

function check_no_dollar_in_middle(node: Node) {
    switch (node.type) {
        case NodeType.ALTER:
            node.children.forEach(c => {
                check_no_dollar_in_middle(c);
            })
            break;
        case NodeType.CONCAT:
            let afterNonEmpty = false;
            for (let i = node.children.length - 1; i >= 0; i--) {
                const child = node.children[i];

                if (afterNonEmpty) {
                    check_no_anchor(child, "$");
                } else {
                    let answer = isEmpty(child);
                    if (answer === Answer.YES) {
                        continue;
                    }
                    check_no_dollar_in_middle(child);
                    afterNonEmpty = true;
                }
            }
            break;
        case NodeType.REPEAT:
            if (node.qt.ceil === 1) {
                // {0,1} or {1}
                // 其实{0,1}时也有问题，但不是这个问题了
                check_no_dollar_in_middle(node.child);
            } else {
                check_no_anchor(node.child, "$");
            }
        case NodeType.BOUNDARY: // 就算是caret也不要紧
        case NodeType.CHAR:
        case NodeType.CHARCLASS:
        case NodeType.EMPTY:
        case NodeType.SHORTHAND:
            break;
        case NodeType.GROUP:
            check_no_dollar_in_middle(node.child);
            break;
        case NodeType.BACKREF: // 不check了
        case NodeType.LOOKAROUND: // TODO
            break;
    }
}

// 只会在上面被调用
function check_no_anchor(node: Node, anchor: string) {
    switch (node.type) {
        case NodeType.ALTER:
        case NodeType.CONCAT:
            node.children.forEach(c => {
                check_no_anchor(c, anchor);
            })
            break;
        case NodeType.REPEAT:
        case NodeType.GROUP:
            check_no_anchor(node.child, anchor);
            break;
        case NodeType.BOUNDARY:
            if (node.chr === anchor) {
                warnings.push(`unexpected anchor ${anchor} near index: ${tokenLocBegin(regex, node.loc)}`);
            }
            break;
        case NodeType.CHAR:
        case NodeType.CHARCLASS:
        case NodeType.EMPTY:
        case NodeType.BACKREF:
        case NodeType.LOOKAROUND: // TODO
        case NodeType.SHORTHAND:
            break;
    }
}

function isEmpty(node: Node): Answer {
    switch (node.type) {
        case NodeType.ALTER:
            return node.children.map(x => isEmpty(x)).reduce((a, c) => {
                if (a === Answer.POSSIBLE) {
                    return Answer.POSSIBLE;
                }
                if (a !== c) {
                    return Answer.POSSIBLE;
                }
                return a;
            })
        case NodeType.CONCAT:
            return node.children.map(x => isEmpty(x)).reduce((a, c) => {
                switch (a) {
                    case Answer.NO:
                        return Answer.NO;
                    case Answer.YES:
                        return c;
                    case Answer.POSSIBLE:
                        switch (c) {
                            case Answer.NO:
                                return Answer.NO;
                            case Answer.YES:
                            case Answer.POSSIBLE:
                                return Answer.POSSIBLE;
                        }
                }
            });
        case NodeType.REPEAT:
        case NodeType.GROUP:
            return isEmpty(node.child);
        case NodeType.CHAR:
        case NodeType.CHARCLASS:
        case NodeType.SHORTHAND:
            return Answer.NO;
        case NodeType.EMPTY:
        case NodeType.BOUNDARY:
        case NodeType.LOOKAROUND:
            return Answer.YES;
        case NodeType.BACKREF:
            return isEmpty(regex.groups.get(node.pointTo)!);
    }
}

// TODO 这个生成的时候check一下就可以了
export function check_char_class<T extends Node>(st: StrAndTokens, node: T extends { type: NodeType.CHARCLASS } ? T : never) {
    let letterSet: Set<string> = new Set();
    let number = 0;
    for (const item of node.cc.items) {
        switch (item.type) {
            case ItemType.CHAR:
                number++;
                letterSet.add(item.chr);
                break;
            case ItemType.SHORTHAND:
                break;
            case ItemType.RANGE:
                _check_range(st, item);
                number += 2;
                letterSet.add(String.fromCharCode(item.range.from));
                letterSet.add(String.fromCharCode(item.range.to));
                break;
        }
    }
    if (number > letterSet.size) {
        warnings.push(`Redundant letter in character class ${strBetween(st, node.loc)} near index: ${tokenLocBegin(st, node.loc)}`);
    }
}

function _check_range<T extends ClassItem>(st: StrAndTokens, rangeItem: T extends { type: ItemType.RANGE } ? T : never) {
    // TODO from > to 的情况应该是编译错误
    if (rangeItem.range.from > rangeItem.range.to) {
        throw new UngrammaticalError(`Bad Range ${strBetween(st, rangeItem.loc)} near index: ${tokenLocBegin(st, rangeItem.loc)}`);
    }

    if (rangeItem.range.from === rangeItem.range.to) {
        suggestions.push(`Redundant range ${strBetween(st, rangeItem.loc)} near index: ${tokenLocBegin(st, rangeItem.loc)}`);
    }

    if (!_is_proper_range(rangeItem.range)) {
        warnings.push(`Possible Bad Range ${strBetween(st, rangeItem.loc)} near index: ${tokenLocBegin(st, rangeItem.loc)}`);
    }
}

function _is_proper_range(range: Range) {
    return "0".charCodeAt(0) <= range.from && range.to <= "9".charCodeAt(0)
        || "a".charCodeAt(0) <= range.from && range.to <= "z".charCodeAt(0)
        || "A".charCodeAt(0) <= range.from && range.to <= "Z".charCodeAt(0)
        || !isProperRangeBoundary(range.from) && !isProperRangeBoundary(range.to) && range.from > 255 && range.to > 255
}

function isProperRangeBoundary(cn: number) {
    return "0".charCodeAt(0) <= cn && cn <= "9".charCodeAt(0)
        || "a".charCodeAt(0) <= cn && cn <= "z".charCodeAt(0)
        || "A".charCodeAt(0) <= cn && cn <= "Z".charCodeAt(0);

}