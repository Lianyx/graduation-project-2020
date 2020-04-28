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

export function htmlPreProcess(text: string): string {
    return text = text
        .replace(/&/gm, '&amp;')
        .replace(/</gm, '&lt;');
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