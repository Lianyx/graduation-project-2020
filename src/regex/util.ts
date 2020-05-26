export class UngrammaticalError extends Error {
    constructor(...params: any) {
        super(...params)
    }
}

export class InternalError extends Error {
    constructor(...params: any) {
        super(...params)
    }
}

export function emptyArray(x: any[]) {
    while (x.length !== 0) {
        x.pop();
    }
}

// export class WarningError extends Error {
//     constructor(...params: any) {
//         super(...params)
//     }
// }

// export class StylisticError extends Error {
//     constructor(...params: any) {
//         super(...params)
//     }
// }

export let warnings: string[] = [];
export let suggestions: string[] = [];

export let sample = { _: "regex" };

export let puncts: string[] = [];

export function isPunct(chr: string): boolean {
    if (chr.length > 1) {
        return false;
    }
    let charCode = chr.charCodeAt(0);
    return 33 <= charCode && charCode <= 47
        || 58 <= charCode && charCode <= 64
        || 91 <= charCode && charCode <= 96
        || 123 <= charCode && charCode <= 126;
}

export function exhaustiveCheck(param: never) { }
// type A = { type: "a" };
// type B = { type: "b" };
// type AB = A | B;

// function func(a: AB) {
//     switch (a.type) {
//       case "a":
//         "haha";
//         break;
//       case "b":
//         "jh";
//         break;
//       default:
//         exhaustiveCheck(a);
//     }
//   }


export function htmlPreProcess(text: string): string {
    return text = text
        .replace(/&/gm, '&amp;')
        .replace(/</gm, '&lt;');
}


export let matchProcessLines: MatchProcessLine[] = []

export enum MatchProcessDataType {
    CONTENT, DIRECTIVE
}
export type MatchProcessData = (
    | { type: MatchProcessDataType.CONTENT, content: string }
    | { type: MatchProcessDataType.DIRECTIVE, directive: string }
)
export type MatchProcessLine =  MatchProcessData[]

export function newMatchProcessContent(content: string): MatchProcessData {
    return { type: MatchProcessDataType.CONTENT, content }
}

export function newMatchProcessDirective(directive: string): MatchProcessData {
    return { type: MatchProcessDataType.DIRECTIVE, directive }
}
