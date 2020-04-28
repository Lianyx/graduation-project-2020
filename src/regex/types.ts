export interface IntPair {
    begin: number;
    end: number;
}

export enum GroupType {
    NORMAL, ATOM, NON_CAPTURE, NAME
}

export enum LookaroundType {
    AHEAD, BEHIND, N_AHEAD, N_BEHIND
}

export interface Quantifier {
    floor: number;
    ceil: number;
    possessive?: boolean;
    lazy?: boolean;
}

export interface Backref {
    num: number;
    name: string;
}
