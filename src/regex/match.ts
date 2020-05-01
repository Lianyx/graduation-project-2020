import { NFA, State, Edge, EdgeType } from "./nfa";
import { isIn, isInShorthand, is_w } from "./charclass";
import { LookaroundType } from "./types";

let water_level = 1;
let threshold = 1000;

type Things = {
    str: string;
    i: number;
    atomic_backtrack_id: number | null;
    finish_state: State;
    no: number;

    fct: (str: string) => void;
    from: number;
}

// 似乎RegexBuddy会在optional的时候打出ok

type Context = {
    group_begin_index: Map<number | string, number>;
    group_end_index: Map<number | string, number>;
    iter_body_end_index: Map<State, number>;
    ptr: number;
}
function newMatchState(): Context {
    return {
        group_begin_index: new Map(),
        group_end_index: new Map(),
        iter_body_end_index: new Map(),
        ptr: 0
    };
}
function cloneContext(ctx: Context): Context {
    return {
        group_begin_index: new Map(ctx.group_begin_index),
        group_end_index: new Map(ctx.group_end_index),
        iter_body_end_index: new Map(ctx.iter_body_end_index),
        ptr: ctx.ptr
    };
}
function setContext(ctx: Context, state: State, current_i: number): void {
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

export function match(nfa: NFA, _str: string, _from: number = 0, _f = (s: string) => console.log(s)): number {
    if (_from >= _str.length) {
        return -1;
    }
    water_level = 1;
    return matchNFA(nfa, _str, _from, _f);
}

function matchNFA(nfa: NFA, _str: string, _from: number = 0, _f = (s: string) => console.log(s)): number {
    let things: Things = {
        str: _str,
        i: _from,
        finish_state: nfa.finish,
        atomic_backtrack_id: null,
        no: 1,
        fct: _f,
        from: _from
    };
    return _match(nfa.start, newMatchState(), things);
}

function _match(state: State, old_context: Context, _: Things): number {
    let current_i = _.i;
    if (state.iter_body_end && old_context.iter_body_end_index.get(state) === current_i) {
        return -1;
    }
    if (_.finish_state === state) {
        return current_i;
    }

    let current_context = cloneContext(old_context);
    setContext(current_context, state, current_i);

    for (const edge of state.edges) {
        let tmp = edgeMatch(edge, current_context, _);
        if (tmp === 1) {
            let ret: number;
            if ((ret = _match(edge.to, current_context, _)) !== -1) { // 可以等于-2或者>=0
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
        } else if (tmp === 2) {
            return -2;
        }
    }
    if (_.atomic_backtrack_id === null && state.exitAtomic.length !== 0) {
        // atomic backtracking starts
        _.atomic_backtrack_id = state.exitAtomic[state.exitAtomic.length - 1];
    }
    if (water_level > threshold) {
        return -2;
    }
    return -1;
}

// 可以控制i
function edgeMatch(edge: Edge, ctx: Context, _: Things): number {
    switch (edge.type) {
        case EdgeType.CHAR:
            if (_.i < _.str.length && edge.chr === _.str[_.i]) {
                _.i++;
                water_level++;
                _.fct(_.str.substring(_.from, _.i));
                return 1;
            }
            water_level++
            _.fct(_.str.substring(_.from, _.i) + "✘");
            return -1;
        case EdgeType.CHARCLASS:
            if (_.i < _.str.length && isIn(edge.cc, _.str[_.i])) {
                _.i++;
                water_level++;
                _.fct(_.str.substring(_.from, _.i));
                return 1;
            }
            water_level++;
            _.fct(_.str.substring(_.from, _.i) + "✘");
            return -1;
        case EdgeType.BACKREF: {
            let begin = ctx.group_begin_index.get(edge.pointTo);
            let end = ctx.group_end_index.get(edge.pointTo);
            if (begin && end) {
                let target = _.str.substring(begin, end);
                let j: number;
                for (j = 0; j < target.length; j++) {
                    if (_.i + j > _.str.length) {
                        water_level++;
                        _.fct(_.str.substring(_.from, _.i) + "✘");
                        return -1;
                    }
                    if (_.str[_.i + j] !== target[j]) {
                        water_level++;
                        _.fct(_.str.substring(_.from, _.i) + " ✘");
                        return -1;
                    }
                }
                _.i += j;
                water_level++;
                _.fct(_.str.substring(_.from, _.i));
                return 1;
            }
            water_level++;
            _.fct(_.str.substring(_.from, _.i) + "✘");
            return -1;
        }
        case EdgeType.SHORTHAND:
            if (_.i < _.str.length && isInShorthand(edge.chr, _.str[_.i])) {
                _.i++;
                water_level++;
                _.fct(_.str.substring(_.from, _.i));
                return 1;
            }
            water_level++;
            _.fct(_.str.substring(_.from, _.i) + "✘");
            return -1;
        case EdgeType.EPSILON:
            return 1;
        case EdgeType.BOUNDARY:
            switch (edge.chr) {
                case "^":
                    if (_.i === 0) {
                        water_level++;
                        _.fct(_.str.substring(_.from, _.i) + "✔^");
                        return 1;
                    }
                    water_level++;
                    _.fct(_.str.substring(_.from, _.i) + "✘^");
                    return -1;
                case "$":
                    if (_.i === _.str.length) {
                        water_level++;
                        _.fct(_.str.substring(_.from, _.i) + "✔$")
                        return 1;
                    }
                    water_level++;
                    _.fct(_.str.substring(_.from, _.i) + "✘$");
                    return -1;
                case "\b":
                    if (_.i === 0) {
                        if (_.str.length > 0 && is_w(_.str[0])) {
                            water_level++;
                            _.fct(_.str.substring(_.from, _.i) + "✔\\b")
                            return 1;
                        }
                        water_level++;
                        _.fct(_.str.substring(_.from, _.i) + "✘\\b");
                        return -1;
                    } else if (_.i === _.str.length) {
                        if (is_w(_.str[_.i - 1])) {
                            water_level++;
                            _.fct(_.str.substring(_.from, _.i) + "✔\\b");
                            return 1;
                        }
                        water_level++;
                        _.fct(_.str.substring(_.from, _.i) + "✘\\b");
                        return -1;
                    } else {
                        let c1 = _.str[_.i - 1];
                        let c2 = _.str[_.i];
                        if (is_w(c1) && !is_w(c2) || !is_w(c1) && is_w(c2)) {
                            water_level++;
                            _.fct(_.str.substring(_.from, _.i) + "✔\\b");
                            return 1;
                        }
                        water_level++;
                        _.fct(_.str.substring(_.from, _.i) + "✘\\b");
                        return -1;
                    }
            }
            water_level++;
            _.fct(_.str.substring(_.from, _.i) + "✘ unsupported");
            return 1;
        case EdgeType.LOOKAROUND:
            switch (edge.laType) {
                case LookaroundType.AHEAD: {
                    let boo = matchNFA(edge.nfa, _.str, _.i, (s) => {
                        water_level++;
                        _.fct(_.str.substring(_.from, _.i) + " ▶ =lookahead: " + s);
                    });
                    if (boo === -1) {
                        water_level++;
                        _.fct(_.str.substring(_.from, _.i) + "✘");
                        return -1;
                    } else if (boo === -2) {
                        return -2;
                    }
                    return 1;
                }
                case LookaroundType.N_AHEAD: {
                    let boo = matchNFA(edge.nfa, _.str, _.i, (s) => {
                        water_level++;
                        _.fct(_.str.substring(_.from, _.i) + " ▶ !lookahead: " + s);
                    });
                    if (boo >= 0) {
                        water_level++;
                        _.fct(_.str.substring(_.from, _.i) + "✘");
                        return -1;
                    } else if (boo === -2) {
                        return -2;
                    }
                    return 1;
                }
                case LookaroundType.BEHIND:
                    water_level++;
                    _.fct(_.str.substring(_.from, _.i) + "✘ unsupported");
                    return 1;
                case LookaroundType.N_BEHIND:
                    water_level++;
                    _.fct(_.str.substring(_.from, _.i) + "✘ unsupported");
                    return 1;
            }
            break;
    }
}
