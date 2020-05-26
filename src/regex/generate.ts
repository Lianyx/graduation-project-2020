import { Node, NodeType } from "./parse";
import { CharClass, ItemType, isIn } from "./charclass";
import { InternalError, sample, puncts } from "./util";
import { ParsedRegex } from "./regex";
import { GroupType, Quantifier } from "./types";

// export type Generator = {
//     f: () => string;
//     weight: number; // decide the likelyhood of being a paragon, 100 means string, 0 means there is backref
// }

let group_to_string: Map<string | number, string>;

// TODO 其实group也不需要在() => string函数里用for的循环，只要在前面和后面加上一个方程，标记一下当前生成字符串的长度就可以了。
function générer(fs: (() => string)[]): string {
    let ret = "";
    group_to_string = new Map();
    for (const f of fs) {
        ret += f();
    }
    return ret;
}

function promise(str: string): () => string {
    // return { f: () => str, weight: 1 };
    return () => str;
}

export type GenResult = {
    proper: (() => string)[][]; // 典范字符串为proper[0]
    mut: (() => string)[][];

    is_potential_str: number; // 0代表不是，1代表小写，2代表大写
};

export function generate(regexP: ParsedRegex): string[] {
    group_to_string = new Map();
    let tmp = gen(regexP.root);
    return [...new Set([...(tmp.proper).map(g => générer(g)), ...tmp.mut.map(g => générer(g))])];
}

function gen(node: Node): GenResult {
    let proper: (() => string)[][] = [];
    let mut: (() => string)[][] = [];
    let is_potential_str = 0;
    switch (node.type) {
        case NodeType.ALTER: {
            let candidates: GenResult[] = node.children.map(c => gen(c));
            candidates.forEach(c => {
                proper = proper.concat(c.proper);
                mut = mut.concat(c.mut);
            })

            for (const c of candidates) {
                if (c.is_potential_str === 1) {
                    is_potential_str = 1;
                    break;
                }
                if (c.is_potential_str === 2) {
                    is_potential_str = 2;
                    // 但是不break
                }
            }
            // let paragon = candidates.map(c => c.generators_proper[0]).reduce((a, c) => {
            //     return c.weight > a.weight ? c : a;
            // })
            // generators_proper = [paragon, ...generators_proper.filter(g => g !== paragon)];
            break;
        }
        case NodeType.CONCAT: {
            let candidates: GenResult[] = node.children.map(c => gen(c));

            // paragon
            let paragon: (() => string)[] = []
            for (const c of candidates) {
                paragon = paragon.concat(c.proper[0]);
            }
            proper.push(paragon); // 这个是全部生成

            // proper
            for (let i = 0; i < candidates.length; i++) {
                for (const generator of candidates[i].proper) {
                    let tmp: (() => string)[] = [];
                    for (let j = 0; j < candidates.length; j++) {
                        if (j === i) {
                            tmp = tmp.concat(generator);
                        } else {
                            tmp = tmp.concat(candidates[j].proper[0]);
                        }
                    }
                    proper.push(tmp);
                }
            }

            // mut
            for (let i = 0; i < candidates.length; i++) {
                for (const m of candidates[i].mut) {
                    let tmp: (() => string)[] = [];
                    for (let j = 0; j < candidates.length; j++) {
                        if (j === i) {
                            tmp = tmp.concat(m);
                        } else {
                            tmp = tmp.concat(candidates[j].proper[0]);
                        }
                    }
                    mut.push(tmp);
                }
            }
            break;
        }
        case NodeType.REPEAT: {
            let candidate = gen(node.child);

            let sequence: (() => string)[][] = [];
            let sequence_length: number = node.qt.ceil === -1 ? node.qt.floor + sample._.length : node.qt.ceil + 1;

            // construct sequence
            if (isStr(candidate, node.qt)) { // 如果是str                
                let temp = sample;
                for (let i = 0; i < sequence_length; i++) {
                    let next_char = candidate.is_potential_str === 1 ? temp._.charAt(i % temp._.length) : temp._.charAt(i % temp._.length).toUpperCase();
                    sequence.push([promise(next_char)]);
                }
            } else if (digits(node.child)) {
                let temp = "";
                for (let i = 0; i < sequence_length; i++) {
                    temp += gen_digit(node.child);
                }

                for (let i = 0; i < sequence_length; i++) {
                    let next_char = temp.charAt(i);
                    sequence.push([promise(next_char)]);
                }
            } else {
                // TODO 可能可以改成有50%的可能都用paragon，其他的有50%概率用
                for (let i = 0; i < sequence_length; i++) {
                    sequence.push(random_item(candidate.proper));
                }
            }

            // paragon
            let paragon_length: number = isStr(candidate, node.qt) ?
                (sample._.length >= node.qt.floor ? sample._.length : node.qt.floor)
                : node.qt.floor === node.qt.ceil ? node.qt.floor : node.qt.floor + 1;
            let paragon: (() => string)[] = [];
            for (let i = 0; i < paragon_length; i++) {
                paragon = paragon.concat(sequence[i]);
            }
            proper.push(paragon);

            // proper
            for (const generator of candidate.proper) {
                let tmp: (() => string)[] = [...generator];
                for (let i = 1; i < paragon_length; i++) {
                    tmp = tmp.concat(sequence[i]);
                }
                proper.push(tmp);
            }

            // mut
            for (const generator of candidate.mut) {
                let next: (() => string)[] = [...generator];
                for (let i = 1; i < paragon_length; i++) {
                    next = next.concat(sequence[i]);
                }
                mut.push(next);
            }

            // proper and mut for iter
            // floor - 1
            if (node.qt.floor !== 0) {
                let next: (() => string)[] = [];
                for (let i = 0; i < node.qt.floor - 1; i++) {
                    next = next.concat(sequence[i]);
                }
                mut.push(next);
            }

            // floor
            if (node.qt.floor !== node.qt.ceil) {
                let next: (() => string)[] = [];
                for (let i = 0; i < node.qt.floor; i++) {
                    next = next.concat(sequence[i]);
                }
                proper.push(next);
            }

            // ceil
            if (node.qt.ceil === -1) {
                let next: (() => string)[] = [];
                for (let i = 0; i < node.qt.floor + 3; i++) {
                    next = next.concat(sequence[i]);
                }
                proper.push(next);
            } else {
                if (node.qt.ceil > node.qt.floor + 1) {
                    let next: (() => string)[] = [];
                    for (let i = 0; i < node.qt.ceil; i++) {
                        next = next.concat(sequence[i]);
                    }
                    proper.push(next);
                }

                // ceil + 1
                let next: (() => string)[] = [];
                for (let i = 0; i < node.qt.ceil + 1; i++) {
                    next = next.concat(sequence[i]);
                }
                mut.push(next);
            }
            break;
        }
        case NodeType.BACKREF:
            proper = [[() => group_to_string.get(node.pointTo)!]];
            mut = [];
            break;
        case NodeType.GROUP: {
            let candidate = gen(node.child);
            switch (node.gType) {
                case GroupType.NON_CAPTURE:
                case GroupType.ATOM:
                    proper = candidate.proper;
                    mut = candidate.mut;
                    is_potential_str = candidate.is_potential_str;
                    break;
                case GroupType.NAME:
                    proper = candidate.proper.map(fs => [
                        () => {
                            let temp: string = "";
                            for (const f of fs) {
                                temp += f();
                            }
                            group_to_string.set(node.name, temp);
                            group_to_string.set(node.num, temp);
                            return temp;
                        }
                    ]);
                    mut = candidate.mut.map(fs => [
                        () => {
                            let temp = "";
                            for (const f of fs) {
                                temp += f();
                            }
                            group_to_string.set(node.name, temp);
                            group_to_string.set(node.num, temp);
                            return temp;
                        }
                    ]);
                    is_potential_str = candidate.is_potential_str;
                    break;
                case GroupType.NORMAL:
                    proper = candidate.proper.map(fs => [
                        () => {
                            let temp: string = "";
                            for (const f of fs) {
                                temp += f();
                            }
                            group_to_string.set(node.num, temp);
                            return temp;
                        }
                    ]);
                    mut = candidate.mut.map(fs => [
                        () => {
                            let temp = "";
                            for (const f of fs) {
                                temp += f();
                            }
                            group_to_string.set(node.num, temp);
                            return temp;
                        }
                    ]);
                    is_potential_str = candidate.is_potential_str;
                    break;
            }
            break;
        }
        case NodeType.CHAR:
            proper = [[promise(node.chr)]];
            mut = [];
            break;
        case NodeType.CHARCLASS: {
            return genFromCharClass(node.cc)
        }
        case NodeType.LOOKAROUND:
        case NodeType.BOUNDARY:
        case NodeType.EMPTY:
            proper = [[promise("")]];
            mut = [];
            break;
        case NodeType.SHORTHAND:
            if (node.chr === ".") {
                // TODO add "
                proper = [[promise("a")], [promise("9")], [promise("Z")], [promise(" ")], [promise(getWildCardPunct())]];
                mut = [];
                is_potential_str = 1;
                break;
            } else {
                return genFromCharClass({
                    items: [{ type: ItemType.SHORTHAND, chr: node.chr, loc: { begin: -1, end: -1 } }],
                    loc: { begin: -1, end: -1 }
                });
            }
    }
    return { proper: proper, mut: mut, is_potential_str };
}

function genFromCharClass(cc: CharClass): GenResult {
    // digit, space, uppercase, lowercase, punctuation

    let retSet: Set<string> = new Set();
    let retMutSet: Set<string> = new Set();
    let is_potential_str = 0;

    if (!cc.negate) {
        for (const ci of cc.items) {
            switch (ci.type) {
                case ItemType.CHAR:
                    retSet.add(ci.chr);
                    break;
                case ItemType.RANGE: {
                    if (ci.range.from === "a".charCodeAt(0) && ci.range.to === "z".charCodeAt(0)) {
                        retSet.add("a");
                        if (!isIn(cc, "_")) {
                            retMutSet.add("_");
                        }
                        if (!isIn(cc, "A")) {
                            retMutSet.add("A");
                        }
                        is_potential_str = 1;
                    } else if (ci.range.from === "A".charCodeAt(0) && ci.range.to === "Z".charCodeAt(0)) {
                        retSet.add("A");
                        if (!isIn(cc, "_")) {
                            retMutSet.add("_");
                        }
                        if (!isIn(cc, "a")) {
                            retMutSet.add("a");
                        }
                        is_potential_str = 2;
                    } else {
                        retSet.add(String.fromCharCode(ci.range.from));
                        retSet.add(String.fromCharCode(ci.range.to));
                        retSet.add(String.fromCharCode(Math.floor((ci.range.to + ci.range.from) / 2)));
                        if (isProperRangeBoundary(ci.range.from)
                            && ci.range.from !== "0".charCodeAt(0)
                            && ci.range.from !== "a".charCodeAt(0)
                            && ci.range.from !== "A".charCodeAt(0)) {
                            retMutSet.add(String.fromCharCode(ci.range.from - 1));
                        }
                        if (isProperRangeBoundary(ci.range.to)
                            && ci.range.to !== "9".charCodeAt(0)
                            && ci.range.to !== "z".charCodeAt(0)
                            && ci.range.to !== "Z".charCodeAt(0)) {
                            retMutSet.add(String.fromCharCode(ci.range.to + 1));
                        }
                    }
                    break;
                }
                case ItemType.SHORTHAND:
                    switch (ci.chr) {
                        case "d":
                            retSet.add("" + getRandomInt(10));
                            break;
                        case "s":
                            retSet.add(" ");
                            break;
                        case "w":
                            retSet.add("a");
                            retSet.add("A"); // TODO 应该不要紧的吧，反正上面的string会
                            retSet.add("0");
                            retSet.add("_");
                            is_potential_str = 1;
                            break;
                        case "D":
                            genFromNegated(cc).forEach(item => retSet.add(item));
                            is_potential_str = containAlphabet(cc);
                            retMutSet.add("0");
                        case "W":
                            genFromNegated(cc).forEach(item => retSet.add(item));
                            is_potential_str = containAlphabet(cc);
                            retMutSet.add("a");
                        case "S":
                            genFromNegated(cc).forEach(item => retSet.add(item));
                            is_potential_str = containAlphabet(cc);
                            retMutSet.add(" ");
                            break;
                    }
                    break;
            }
        }
    } else {
        genFromNegated(cc).forEach(item => retSet.add(item));
        for (const ci of cc.items) { // 这些也有些随意了
            switch (ci.type) {
                case ItemType.CHAR: {
                    if (!isIn(cc, ci.chr)) {
                        retMutSet.add(ci.chr);
                    }
                    break;
                }
                case ItemType.RANGE: {
                    if (!isIn(cc, String.fromCharCode(ci.range.from))) {
                        retMutSet.add(String.fromCharCode(ci.range.from));
                    }
                }
            }
        }
        is_potential_str = containAlphabet(cc);
    }
    return {
        proper: Array.from(retSet).map(x => [promise(x)]),
        mut: Array.from(retMutSet).map(x => [promise(x)]),
        is_potential_str
    };
}

function isProperRangeBoundary(cn: number) {
    return "0".charCodeAt(0) <= cn && cn <= "9".charCodeAt(0)
        || "a".charCodeAt(0) <= cn && cn <= "z".charCodeAt(0)
        || "A".charCodeAt(0) <= cn && cn <= "Z".charCodeAt(0);

}

function containAlphabet(cc: CharClass): number {
    let lower = true;
    for (let c = "a".charCodeAt(0); c <= 'z'.charCodeAt(0); c++) {
        if (!isIn(cc, String.fromCharCode(c))) {
            lower = false;
            break;
        }
    }
    if (lower) {
        return 1;
    }

    let upper = true;
    for (let c = "A".charCodeAt(0); c <= 'Z'.charCodeAt(0); c++) {
        if (!isIn(cc, String.fromCharCode(c))) {
            upper = false;
            break;
        }
    }
    if (upper) {
        return 2;
    }
    return 0;
}

function genFromNegated(cc: CharClass): string[] {
    let ret: string[] = [];

    for (let c = 'a'.charCodeAt(0); c <= 'z'.charCodeAt(0); c++) {
        if (isIn(cc, String.fromCharCode(c))) {
            ret.push(String.fromCharCode(c));
            break;
        }
    }
    for (let c = 'A'.charCodeAt(0); c <= 'Z'.charCodeAt(0); c++) {
        if (isIn(cc, String.fromCharCode(c))) {
            ret.push(String.fromCharCode(c));
            break;
        }
    }
    for (let c = '0'.charCodeAt(0); c <= '9'.charCodeAt(0); c++) {
        if (isIn(cc, String.fromCharCode(c))) {
            ret.push(String.fromCharCode(c));
            break;
        }
    }

    if (isIn(cc, " ")) {
        ret.push(" ");
    }

    let isPunctSet = false;

    for (const c of puncts) {
        if (isIn(cc, c)) {
            ret.push(c);
            isPunctSet = true;
            break;
        }
    }

    if (!isPunctSet) {
        for (let c = 33; c <= 47; c++) {
            if (isIn(cc, String.fromCharCode(c))) {
                ret.push(String.fromCharCode(c));
                isPunctSet = true;
                break;
            }
        }
    }

    if (!isPunctSet) {
        for (let c = 58; c <= 64; c++) {
            if (isIn(cc, String.fromCharCode(c))) {
                ret.push(String.fromCharCode(c));
                isPunctSet = true;
                break;
            }
        }
    }

    if (!isPunctSet) {
        for (let c = 91; c <= 96; c++) {
            if (isIn(cc, String.fromCharCode(c))) {
                ret.push(String.fromCharCode(c));
                isPunctSet = true;
                break;
            }
        }
    }

    if (!isPunctSet) {
        for (let c = 123; c <= 126; c++) {
            if (isIn(cc, String.fromCharCode(c))) {
                ret.push(String.fromCharCode(c));
                isPunctSet = true;
                break;
            }
        }
    }

    if (ret.length !== 0) {
        return ret;
    }

    for (let c = 126; c <= 1000; c++) {
        if (isIn(cc, String.fromCharCode(c))) {
            return [String.fromCharCode(c)];
        }
    }

    throw new InternalError("can't find a suitable char");
}

function random_item<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)];
}

function getRandomInt(max: number) {
    return Math.floor(Math.random() * Math.floor(max));
}

function digits(node: Node): boolean {
    switch (node.type) {
        case NodeType.SHORTHAND:
            if (node.chr === "d") {
                return true;
            }
            break;
        case NodeType.CHARCLASS:
            if (node.cc.negate) {
                return false;
            }
            for (const it of node.cc.items) {
                switch (it.type) {
                    case ItemType.CHAR:
                        if (!isDigitRange(it.chr.charCodeAt(0))) {
                            return false;
                        }
                        break;
                    case ItemType.RANGE:
                        if (!isDigitRange(it.range.from) || !isDigitRange(it.range.to)) {
                            return false;
                        }
                        break;
                    case ItemType.SHORTHAND:
                        if (it.chr !== "d") {
                            return false;
                        }
                        break;
                }
            }
            return true;
    }
    return false;
}

function isDigitRange(x: number): boolean {
    return "0".charCodeAt(0) <= x && x <= "9".charCodeAt(0);
}

function gen_digit(node: Node): string {
    switch (node.type) {
        case NodeType.SHORTHAND:
            // must be \d
            return "" + getRandomInt(10);
        case NodeType.CHARCLASS:
            let array: string[] = [];
            for (let i = 0; i < 10; i++) {
                if (isIn(node.cc, i + "")) {
                    array.push(i + "");
                }
            }
            return random_item(array);
    }
    throw new InternalError("shouldn't be here");
}

function isStr(candidate: GenResult, qt: Quantifier): boolean {
    return candidate.is_potential_str !== 0 && (qt.ceil === -1 || qt.ceil >= sample._.length);
}

function getWildCardPunct() {
    if (puncts.includes('"')) {
        return '"'
    } else if (puncts.includes("'")) {
        return "'"
    }
    return puncts.length > 0 ? random_item(puncts) : "_"
}
