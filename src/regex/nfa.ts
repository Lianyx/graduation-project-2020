import { CharClass } from "./charclass";
import { IntPair, Quantifier, LookaroundType, GroupType } from "./types";
import { ParsedRegex } from "./regex";
import { Node, NodeType } from "./parse";

export enum EdgeType {
    CHAR, CHARCLASS, BACKREF, SHORTHAND,
    EPSILON, BOUNDARY, LOOKAROUND
}

export type Edge = { to: State } & (
    | { type: EdgeType.CHAR | EdgeType.BOUNDARY | EdgeType.SHORTHAND, chr: string }
    | { type: EdgeType.CHARCLASS, cc: CharClass }
    | { type: EdgeType.BACKREF, pointTo: number | string }
    | { type: EdgeType.EPSILON }
    | { type: EdgeType.LOOKAROUND, laType: LookaroundType, nfa: NFA }
)
export type State = {
    edges: Edge[];
    enterGroups: (number | string)[];
    exitGroups: (number | string)[];
    enterAtomic: number[];
    exitAtomic: number[];
    iter_body_end?: boolean;
}
export type NFA = {
    start: State;
    finish: State;
}

// export type RegexNFA = NFA
// & { // 好像不需要
//     groupType: Map<number | string, GroupType>
// } // < 0的number就一定是atom，但是还是记一下

function newState(): State {
    return { enterGroups: [], exitGroups: [], enterAtomic: [], exitAtomic: [], edges: [] };
}

function cloneStateWithoutEdges(that: State): State {
    let ret = newState();
    that.enterGroups.forEach(x => {
        ret.enterGroups.push(x);
    })
    that.exitGroups.forEach(x => {
        ret.exitGroups.push(x);
    })
    that.enterAtomic.forEach(x => {
        ret.enterAtomic.push(x);
    })
    that.exitAtomic.forEach(x => {
        ret.exitAtomic.push(x);
    })
    if (that.iter_body_end) {
        ret.iter_body_end = true;
    }
    return ret;
}

function cloneEdgeTo(that: Edge, state: State): Edge {
    switch (that.type) {
        case EdgeType.CHAR:
        case EdgeType.BOUNDARY:
        case EdgeType.SHORTHAND:
            return { type: that.type, to: state, chr: that.chr };
        case EdgeType.CHARCLASS:
            return { type: that.type, to: state, cc: that.cc };
        case EdgeType.BACKREF:
            return { type: that.type, to: state, pointTo: that.pointTo };
        case EdgeType.EPSILON:
            return { type: that.type, to: state };
        case EdgeType.LOOKAROUND:
            return { type: that.type, to: state, laType: that.laType, nfa: that.nfa };
    }
}

// function _cloneStringOrNumber(x: string | number): string | number {
//     if (typeof (x) === "string") {
//         return (' ' + x).slice(1);
//     } else {
//         return x;
//     }
// }

function cloneNFA(nfa: NFA): NFA {
    let oldToNew: Map<State, State> = new Map();
    // let visited: Map<State, boolean> = new Map(); // 这个是旧state
    let queue: { o: State; n: State }[] = [];
    let cloned_state = cloneStateWithoutEdges(nfa.start);
    queue.push({ o: nfa.start, n: cloned_state });
    oldToNew.set(nfa.start, cloned_state);
    while (queue.length !== 0) { // 这里选择BFS而不是DFS是因为可以保留原来的边的顺序，即优先级
        let sp = queue.shift()!;
        // visited.set(sp.o, true);
        for (const edge of sp.o.edges) {
            if (!oldToNew.get(edge.to)) { // 从来沒有发现过
                let cloned_state = cloneStateWithoutEdges(edge.to);

                oldToNew.set(edge.to, cloned_state);
                queue.push({ o: edge.to, n: cloned_state });
            }
            let cloned_state = oldToNew.get(edge.to)!;
            sp.n.edges.push(cloneEdgeTo(edge, cloned_state));
        }
    }
    return { start: oldToNew.get(nfa.start)!, finish: oldToNew.get(nfa.finish)! };
}

let groupType: Map<number | string, GroupType>;

export function construct(regexP: ParsedRegex): NFA {
    return from(regexP.root);
}

function from(node: Node): NFA {
    switch (node.type) {
        case NodeType.ALTER: {
            return alternate(node.children.map(c => from(c)));
        }
        case NodeType.CONCAT: {
            return concatenate(node.children.map(c => from(c)));
        }
        case NodeType.REPEAT: {
            return iterate(from(node.child), node.qt);
        }
        case NodeType.CHAR: {
            return _simpleNFA(fin => { return { type: EdgeType.CHAR, to: fin, chr: node.chr } });
        }
        case NodeType.CHARCLASS: {
            return _simpleNFA(fin => { return { type: EdgeType.CHARCLASS, to: fin, cc: node.cc } });
        }
        case NodeType.EMPTY: {
            return emptyNFA();
        }
        case NodeType.BACKREF: {
            return _simpleNFA(fin => { return { type: EdgeType.BACKREF, to: fin, pointTo: node.pointTo } });
        }
        case NodeType.BOUNDARY: {
            return _simpleNFA(fin => { return { type: EdgeType.BOUNDARY, to: fin, chr: node.chr } });
        }
        case NodeType.SHORTHAND: {
            return _simpleNFA(fin => { return { type: EdgeType.SHORTHAND, to: fin, chr: node.chr } });
        }
        case NodeType.GROUP: {
            let ret = from(node.child);
            switch (node.gType) {
                case GroupType.NON_CAPTURE:
                    return ret;
                case GroupType.ATOM:
                    ret.start.enterAtomic.push(node.id);
                    ret.finish.exitAtomic.push(node.id);
                    return ret;
                case GroupType.NAME:
                    ret.start.enterGroups.push(node.name, node.num);
                    ret.finish.exitGroups.push(node.name, node.num);
                    return ret;
                case GroupType.NORMAL:
                    ret.start.enterGroups.push(node.num);
                    ret.finish.exitGroups.push(node.num)
                    return ret;
            }
        }
        case NodeType.LOOKAROUND: {
            return _simpleNFA(fin => { return { type: EdgeType.LOOKAROUND, to: fin, nfa: from(node.child), laType: node.laType } });
        }
    }
}

function _simpleNFA(f: (fin: State) => Edge) {
    let start = newState();
    let finish = newState();
    start.edges.push(f(finish));
    return { start, finish };
}

function concatenate(nfas: NFA[]): NFA {
    if (nfas.length === 0) {
        return emptyNFA();
    }

    let start = nfas[0].start;
    let finish = nfas[0].finish;
    for (let i = 1; i < nfas.length; i++) {
        let n2 = nfas[i];

        // n2.start的东西全加到n1.finish上
        finish.edges = n2.start.edges;
        finish.enterGroups = [...finish.enterGroups, ...n2.start.enterGroups]; // 不可能重
        finish.exitGroups = [...finish.exitGroups, ...n2.start.exitGroups];

        finish = n2.finish;
    }
    return { start, finish };
}

function alternate(nfas: NFA[]): NFA {
    // assert length >= 1
    // >= 2 actually

    let start = newState();
    let finish = newState();

    for (const nfa of nfas) {
        start.edges.push({ type: EdgeType.EPSILON, to: nfa.start });
        nfa.finish.edges.push({ type: EdgeType.EPSILON, to: finish });
    }
    return { start, finish };
}

function iterate(nfa: NFA, qt: Quantifier) {
    let tmp: NFA[] = [];
    for (let i = 0; i < qt.floor; i++) {
        tmp.push(cloneNFA(nfa));
    }
    let pre = concatenate(tmp);

    // (qt.lazy ? _lazy_asterisk : _asterisk)
    // (qt.lazy ? _lazy_optional : _optional)

    if (qt.ceil === -1) {
        return concatenate([pre, (qt.lazy ? _lazy_asterisk : _asterisk)(nfa)]); // 只有这个是原nfa真身
    } else if (qt.ceil === qt.floor) {
        return pre;
    } else {
        let sur = (qt.lazy ? _lazy_optional : _optional)(nfa); // 只有这个是原nfa真身
        for (let i = 1; i < qt.ceil - qt.floor; i++) {
            let cloned = cloneNFA(nfa);
            sur = (qt.lazy ? _lazy_optional : _optional)(concatenate([cloned, sur]));
        }
        return concatenate([pre, sur]);
    }
}

function emptyNFA(): NFA {
    let start = newState();
    let finish = start;
    return { start, finish };
}

function _asterisk(nfa: NFA): NFA {
    let start = newState();
    let finish = newState();

    start.edges.push({ type: EdgeType.EPSILON, to: nfa.start });
    start.edges.push({ type: EdgeType.EPSILON, to: finish });

    nfa.finish.edges.push({ type: EdgeType.EPSILON, to: nfa.start });
    nfa.finish.edges.push({ type: EdgeType.EPSILON, to: finish });
    nfa.finish.iter_body_end = true;

    return { start, finish };
}

function _lazy_asterisk(nfa: NFA): NFA {
    let start = newState();
    let finish = newState();

    start.edges.push({ type: EdgeType.EPSILON, to: finish });
    start.edges.push({ type: EdgeType.EPSILON, to: nfa.start });

    nfa.finish.edges.push({ type: EdgeType.EPSILON, to: finish });
    nfa.finish.edges.push({ type: EdgeType.EPSILON, to: nfa.start });
    nfa.finish.iter_body_end = true;

    return { start, finish };
}

function _optional(nfa: NFA): NFA {
    let start = newState();
    let finish = newState();

    start.edges.push({ type: EdgeType.EPSILON, to: nfa.start });
    start.edges.push({ type: EdgeType.EPSILON, to: finish });
    nfa.finish.edges.push({ type: EdgeType.EPSILON, to: finish });

    return { start, finish };
}

function _lazy_optional(nfa: NFA): NFA {
    let start = newState();
    let finish = newState();

    start.edges.push({ type: EdgeType.EPSILON, to: finish });
    start.edges.push({ type: EdgeType.EPSILON, to: nfa.start });

    nfa.finish.edges.push({ type: EdgeType.EPSILON, to: finish });

    return { start, finish };
}


export function printNFA(nfa: NFA): void {
    console.log("printNFA");
    let new_id = 0;
    let ids: Map<State, number> = new Map();
    let queue: State[] = [];

    ids.set(nfa.start, new_id++);
    queue.push(nfa.start);
    while (queue.length !== 0) {
        let str = "";
        let s = queue.shift()!;
        for (const edge of s.edges) {
            if (!ids.get(edge.to)) {
                ids.set(edge.to, new_id++);
                queue.push(edge.to);
            }
            str += printEdge(edge, ids);
        }
        console.log(`${ids.get(s)}: ${str}`);
    }
}

function printEdge(edge: Edge, ids: Map<State, number>): string {
    switch (edge.type) {
        case EdgeType.CHAR:
            return edge.chr + "->" + ids.get(edge.to) + " ";
        case EdgeType.EPSILON:
            return "ε->" + ids.get(edge.to) + " ";
        case EdgeType.CHARCLASS:
            return "[cc]->" + ids.get(edge.to) + " ";
        case EdgeType.BACKREF:
            return "\\i->" + ids.get(edge.to) + " ";
        case EdgeType.SHORTHAND:
        case EdgeType.BOUNDARY:
        case EdgeType.LOOKAROUND:
            return "";
    }
}
