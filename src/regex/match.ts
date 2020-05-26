import { NFA, State, Edge, EdgeType, construct } from "./nfa";
import { isIn, isInShorthand, is_w } from "./charclass";
import { LookaroundType, IntPair } from "./types";
import { Regex, strBetween, shorthandToStr } from "./regex";
import { MatchProcessData, MatchProcessLine, emptyArray, matchProcessLines, newMatchProcessContent, newMatchProcessDirective } from "./util";

let water_level = 1;
const threshold = 100000;
let rgx: Regex
let flags: string
// 实际上应该再加一个MatchContext来放上面这些

type NFAContext = {
    str: string;
    i: number;
    atomic_backtrack_id: number | null;
    finish_state: State;

    // fct: (str: string) => void;
    prefix: MatchProcessLine
    from: number;
}

export enum MatchResultType {
    MATCH, TIMEOUT, NON_MATCH
}

type MatchedMatchResult = {
    mrType: MatchResultType.MATCH
    strs: (string | undefined)[]
    loc: IntPair

    group_begin_index: Map<number | string, number>
    group_end_index: Map<number | string, number>
}

export type MatchResult = (
    | MatchedMatchResult
    | { mrType: MatchResultType.NON_MATCH }
    | { mrType: MatchResultType.TIMEOUT }
)

type MatchAllResult = undefined | (string | undefined)[][] // undefined代表timeout

type StateContext = {
    group_begin_index: Map<number | string, number>;
    group_end_index: Map<number | string, number>;
    iter_body_end_index: Map<State, number>;
    ptr: number;
}
function newStateContext(group_begin_index: Map<number | string, number> = new Map(), group_end_index: Map<number | string, number> = new Map()): StateContext {
    return {
        group_begin_index,
        group_end_index,
        iter_body_end_index: new Map(),
        ptr: 0
    };
}
function cloneStateContext(ctx: StateContext): StateContext {
    return {
        group_begin_index: new Map(ctx.group_begin_index),
        group_end_index: new Map(ctx.group_end_index),
        iter_body_end_index: new Map(ctx.iter_body_end_index),
        ptr: ctx.ptr
    };
}
function setStateContext(ctx: StateContext, state: State, current_i: number): void {
    if (state.iter_body_end) {
        ctx.iter_body_end_index.set(state, current_i);
    }
    for (const pointTo of state.enterGroups) {
        ctx.group_begin_index.set(pointTo, current_i);
    }
    for (const pointTo of state.exitGroups) {
        ctx.group_end_index.set(pointTo, current_i);
    }

    ctx.ptr = current_i;
}

let lastIndex: number | undefined
function twiceSameEmpty(index: number): boolean {
    if (lastIndex === undefined) {
        lastIndex = index
        return false
    }
    let ret = lastIndex === index
    lastIndex = index
    return ret
}

export function matchAll(regex: Regex, str: string, flags: string): MatchAllResult {
    let resultsArray: (string | undefined)[][] = []
    let from_index = 0;
    
    // console.log(str)
    lastIndex = undefined
    let boo: MatchResult = match(regex, str, flags, from_index);

    loop: while (true) {
        switch (boo.mrType) {
            case MatchResultType.MATCH:
                from_index = boo.loc.end
                if (twiceSameEmpty(from_index)) {
                    from_index ++
                } else {
                    resultsArray.push(boo.strs)
                }
                if (from_index > str.length) { // from_index == str length，还可能可以match一次empty
                    break loop;
                }
                boo = match(regex, str, flags, from_index)
                break;
            case MatchResultType.NON_MATCH:
                from_index++;
                if (from_index > str.length) {
                    break loop;
                }
                boo = match(regex, str, flags, from_index)
                break;
            case MatchResultType.TIMEOUT:
                return undefined
        }
    }
    return resultsArray
}

export function match(regex: Regex, _str: string, flags: string, _from: number = 0): MatchResult {
    rgx = regex
    flags = flags

    emptyArray(matchProcessLines)

    if (_from > _str.length) { // if from === length, could match empty string
        return { mrType: MatchResultType.NON_MATCH };
    }
    water_level = 1;

    if (!regex.nfa) {
        regex.nfa = construct(regex)
    }
    return matchNFA(regex.nfa, _str, _from);
}

function matchNFA(nfa: NFA, _str: string, _from: number, prefix: MatchProcessLine = [], group_begin_index: Map<number | string, number> = new Map(), group_end_index: Map<number | string, number> = new Map()): MatchResult {
    let nfaContext: NFAContext = {
        str: _str,
        i: _from,
        finish_state: nfa.finish,
        atomic_backtrack_id: null,
        prefix: prefix,
        from: _from
    };
    return matchState(nfa.start, newStateContext(group_begin_index, group_end_index), nfaContext);
}

function matchState(state: State, old_context: StateContext, _: NFAContext): MatchResult {
    let current_i = _.i;
    if (state.iter_body_end && old_context.iter_body_end_index.get(state) === current_i) {
        return { mrType: MatchResultType.NON_MATCH };
    }

    let current_context = cloneStateContext(old_context);
    setStateContext(current_context, state, current_i);

    if (_.finish_state === state) {
        return matchedResult(current_i, current_context, _);
    }

    for (const edge of state.edges) {
        let tmp = edgeMatch(edge, current_context, _);
        if (tmp === 1) {
            let ret: MatchResult;
            if ((ret = matchState(edge.to, current_context, _)).mrType !== MatchResultType.NON_MATCH) { // 可以等于-2或者>=0
                return ret;
            }
            _.i = current_i;

            if (_.atomic_backtrack_id) {
                if (state.enterAtomic.indexOf(_.atomic_backtrack_id) !== -1) {
                    // atomic backtracking ends
                    _.atomic_backtrack_id = null;
                    continue;
                }
                break;
            }
        } else if (tmp === -2) {
            return { mrType: MatchResultType.TIMEOUT }
        } // if tmp == -1, continue
    }
    if (_.atomic_backtrack_id === null && state.exitAtomic.length !== 0) {
        // atomic backtracking starts
        _.atomic_backtrack_id = state.exitAtomic[state.exitAtomic.length - 1];
    }
    if (water_level > threshold) {
        return { mrType: MatchResultType.TIMEOUT };
    }
    return { mrType: MatchResultType.NON_MATCH };
}

function matchedResult(lastIndex: number, stateContext: StateContext, nfaContext: NFAContext): MatchedMatchResult {
    let strs: (string | undefined)[] = []

    let max_num: number = 0
    for (const key of rgx.groups.keys()) {
        if (typeof (key) === "number") {
            max_num = max_num > key ? max_num : key
        }
    }

    let loc: IntPair = {
        begin: nfaContext.from,
        end: lastIndex
    }
    strs.push(nfaContext.str.substring(loc.begin, loc.end))

    for (let i = 1; i <= max_num; i++) {
        let begin_index: number | undefined = undefined
        let end_index: number | undefined = undefined
        if ((begin_index = stateContext.group_begin_index.get(i)) !== undefined
            && (end_index = stateContext.group_end_index.get(i)) !== undefined
            && begin_index <= end_index) {
            strs.push(nfaContext.str.substring(begin_index, end_index))
        } else {
            strs.push(undefined)
        }
    }
    return {
        mrType: MatchResultType.MATCH,
        loc,
        strs,
        group_begin_index: stateContext.group_begin_index,
        group_end_index: stateContext.group_end_index
    }
}

// 可以控制i
// -1 non-match
// -2 exceeding threshold
//  1 match
function edgeMatch(edge: Edge, ctx: StateContext, _: NFAContext): number {
    switch (edge.type) {
        case EdgeType.CHAR:
            if (_.i < _.str.length && edge.chr === _.str[_.i]) {
                _.i++;
                water_level++;
                // _.fct(_.str.substring(_.from, _.i));
                matchProcessLines.push([..._.prefix, newMatchProcessContent(_.str.substring(_.from, _.i))])
                return 1;
            }
            water_level++
            // _.fct(_.str.substring(_.from, _.i) + "✘");
            matchProcessLines.push([..._.prefix, newMatchProcessContent(_.str.substring(_.from, _.i)), newMatchProcessDirective("unmatched " + edge.chr)])
            return -1;
        case EdgeType.CHARCLASS:
            if (_.i < _.str.length && isIn(edge.cc, _.str[_.i])) {
                _.i++;
                water_level++;
                // _.fct(_.str.substring(_.from, _.i));
                matchProcessLines.push([..._.prefix, newMatchProcessContent(_.str.substring(_.from, _.i))])
                return 1;
            }
            water_level++;
            // _.fct(_.str.substring(_.from, _.i) + "✘");
            matchProcessLines.push([..._.prefix, newMatchProcessContent(_.str.substring(_.from, _.i)), newMatchProcessDirective("unmatched " + strBetween(rgx, edge.cc.loc))])
            return -1;
        case EdgeType.BACKREF: {
            let begin = ctx.group_begin_index.get(edge.pointTo);
            let end = ctx.group_end_index.get(edge.pointTo);
            if (begin !== undefined && end !== undefined) {
                let target = _.str.substring(begin, end);
                let j: number;
                for (j = 0; j < target.length; j++) {
                    if (_.i + j > _.str.length) {
                        water_level++;
                        // _.fct(_.str.substring(_.from, _.i) + "✘");
                        matchProcessLines.push([..._.prefix, newMatchProcessContent(_.str.substring(_.from, _.i)), newMatchProcessDirective("unmatched backref " + edge.pointTo)])
                        return -1;
                    }
                    if (_.str[_.i + j] !== target[j]) { // 合到上面
                        water_level++;
                        // _.fct(_.str.substring(_.from, _.i) + " ✘");
                        matchProcessLines.push([..._.prefix, newMatchProcessContent(_.str.substring(_.from, _.i)), newMatchProcessDirective("unmatched backref " + edge.pointTo)])
                        return -1;
                    }
                }
                _.i += j;
                water_level++;
                // _.fct(_.str.substring(_.from, _.i));
                matchProcessLines.push([..._.prefix, newMatchProcessContent(_.str.substring(_.from, _.i))])
                return 1;
            }
            water_level++;
            // _.fct(_.str.substring(_.from, _.i) + "✘");
            matchProcessLines.push([..._.prefix, newMatchProcessContent(_.str.substring(_.from, _.i)), newMatchProcessDirective("unmatched backref " + edge.pointTo)])
            return -1;
        }
        case EdgeType.SHORTHAND:
            if (_.i < _.str.length && isInShorthand(edge.chr, _.str[_.i])) {
                _.i++;
                water_level++;
                // _.fct(_.str.substring(_.from, _.i));
                matchProcessLines.push([..._.prefix, newMatchProcessContent(_.str.substring(_.from, _.i))])
                return 1;
            }
            water_level++;
            matchProcessLines.push([..._.prefix, newMatchProcessContent(_.str.substring(_.from, _.i)), newMatchProcessDirective("unmatched " + shorthandToStr(edge.chr))])
            // _.fct(_.str.substring(_.from, _.i) + "✘");
            return -1;
        case EdgeType.EPSILON:
            return 1;
        case EdgeType.BOUNDARY:
            switch (edge.chr) {
                case "^":
                    if (_.i === 0 || isMultipleLine && _.str[_.i - 1] === '\n') {
                        water_level++;
                        // _.fct(_.str.substring(_.from, _.i) + "✔^");
                        matchProcessLines.push([..._.prefix, newMatchProcessContent(_.str.substring(_.from, _.i)), newMatchProcessDirective("match ^")])
                        return 1;
                    }
                    water_level++;
                    // _.fct(_.str.substring(_.from, _.i) + "✘^");
                    matchProcessLines.push([..._.prefix, newMatchProcessContent(_.str.substring(_.from, _.i)), newMatchProcessDirective("unmatched ^")])
                    return -1;
                case "$":
                    if (_.i === _.str.length || isMultipleLine && _.str[_.i] === '\n') {
                        water_level++;
                        // _.fct(_.str.substring(_.from, _.i) + "✔$")
                        matchProcessLines.push([..._.prefix, newMatchProcessContent(_.str.substring(_.from, _.i)), newMatchProcessDirective("match $")])
                        return 1;
                    }
                    water_level++;
                    matchProcessLines.push([..._.prefix, newMatchProcessContent(_.str.substring(_.from, _.i)), newMatchProcessDirective("unmatched $")])
                    // _.fct(_.str.substring(_.from, _.i) + "✘$");
                    return -1;
                case "b":
                    if (_.i === 0) {
                        if (_.str.length > 0 && is_w(_.str[0])) {
                            water_level++;
                            // _.fct(_.str.substring(_.from, _.i) + "✔\\b")
                            matchProcessLines.push([..._.prefix, newMatchProcessContent(_.str.substring(_.from, _.i)), newMatchProcessDirective("match \\b")])
                            return 1;
                        }
                        water_level++;
                        // _.fct(_.str.substring(_.from, _.i) + "✘\\b");
                        matchProcessLines.push([..._.prefix, newMatchProcessContent(_.str.substring(_.from, _.i)), newMatchProcessDirective("unmatched \\b")])
                        return -1;
                    } else if (_.i === _.str.length) {
                        if (is_w(_.str[_.i - 1])) {
                            water_level++;
                            // _.fct(_.str.substring(_.from, _.i) + "✔\\b");
                            matchProcessLines.push([..._.prefix, newMatchProcessContent(_.str.substring(_.from, _.i)), newMatchProcessDirective("match \\b")])
                            return 1;
                        }
                        water_level++;
                        // _.fct(_.str.substring(_.from, _.i) + "✘\\b");
                        matchProcessLines.push([..._.prefix, newMatchProcessContent(_.str.substring(_.from, _.i)), newMatchProcessDirective("unmatched \\b")])
                        return -1;
                    } else {
                        let c1 = _.str[_.i - 1];
                        let c2 = _.str[_.i];
                        if (is_w(c1) && !is_w(c2) || !is_w(c1) && is_w(c2)) {
                            water_level++;
                            // _.fct(_.str.substring(_.from, _.i) + "✔\\b");
                            matchProcessLines.push([..._.prefix, newMatchProcessContent(_.str.substring(_.from, _.i)), newMatchProcessDirective("match \\b")])
                            return 1;
                        }
                        water_level++;
                        // _.fct(_.str.substring(_.from, _.i) + "✘\\b");
                        matchProcessLines.push([..._.prefix, newMatchProcessContent(_.str.substring(_.from, _.i)), newMatchProcessDirective("unmatched \\b")])
                        return -1;
                    }
            }
            water_level++;
            // _.fct(_.str.substring(_.from, _.i) + "✘ unsupported");
            matchProcessLines.push([..._.prefix, newMatchProcessContent(_.str.substring(_.from, _.i)), newMatchProcessDirective(" unsupported boundary")])
            return 1;
        case EdgeType.LOOKAROUND:
            switch (edge.laType) {
                case LookaroundType.AHEAD: {
                    let boo = matchNFA(edge.nfa, _.str, _.i, [..._.prefix, newMatchProcessContent(_.str.substring(_.from, _.i)), newMatchProcessDirective("▶ =lookahead")], ctx.group_begin_index, ctx.group_end_index)
                        // (s) => {
                        // water_level++;
                        // _.fct(_.str.substring(_.from, _.i) + " ▶ =lookahead: " + s);
                        // }); 
                    if (boo.mrType === MatchResultType.NON_MATCH) {
                        water_level++;
                        matchProcessLines.push([..._.prefix, newMatchProcessContent(_.str.substring(_.from, _.i)), newMatchProcessDirective(" unmatched lookahead")])
                        // _.fct(_.str.substring(_.from, _.i) + "✘");
                        return -1;
                    } else if (boo.mrType === MatchResultType.TIMEOUT) {
                        return -2;
                    }
                    ctx.group_begin_index = new Map([...ctx.group_begin_index, ...boo.group_begin_index])
                    ctx.group_end_index = new Map([...ctx.group_end_index, ...boo.group_end_index])
                    return 1;
                }
                case LookaroundType.N_AHEAD: {
                    let boo = matchNFA(edge.nfa, _.str, _.i, [..._.prefix, newMatchProcessContent(_.str.substring(_.from, _.i)), newMatchProcessDirective("▶ !lookahead")], ctx.group_begin_index, ctx.group_end_index)
                    // (s) => {
                    //     water_level++;
                    //     _.fct(_.str.substring(_.from, _.i) + " ▶ !lookahead: " + s);
                    // });
                    if (boo.mrType === MatchResultType.MATCH) { // boo >= 0
                        water_level++;
                        matchProcessLines.push([..._.prefix, newMatchProcessContent(_.str.substring(_.from, _.i)), newMatchProcessDirective(" unmatched lookahead")])
                        // _.fct(_.str.substring(_.from, _.i) + "✘");
                        return -1;
                    } else if (boo.mrType === MatchResultType.TIMEOUT) {
                        return -2;
                    }
                    // non-match的时候做不到group合并吧
                    // ctx.group_begin_index = new Map([...ctx.group_begin_index, ...boo.group_begin_index])
                    // ctx.group_end_index = new Map([...ctx.group_end_index, ...boo.group_end_index])
                    return 1;
                }
                case LookaroundType.BEHIND:
                    water_level++;
                    matchProcessLines.push([..._.prefix, newMatchProcessContent(_.str.substring(_.from, _.i)), newMatchProcessDirective("unsupported look behind")])
                    // _.fct(_.str.substring(_.from, _.i) + "✘ unsupported");
                    return 1;
                case LookaroundType.N_BEHIND:
                    water_level++;
                    matchProcessLines.push([..._.prefix, newMatchProcessContent(_.str.substring(_.from, _.i)), newMatchProcessDirective("unsupported look behind")])
                    // _.fct(_.str.substring(_.from, _.i) + "✘ unsupported");
                    return 1;
            }
            break;
    }
}
// 似乎RegexBuddy会在optional的时候打出ok

function isMultipleLine() {
    return flags.includes("w")
}
