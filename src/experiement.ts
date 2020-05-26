import { processRegex } from "./regex/regex"
import { construct, printNFA } from "./regex/nfa"
import { match, matchAll } from "./regex/match"
import { generate } from "./regex/generate"

const { performance } = require('perf_hooks')

let lastIndex: number | undefined
function twiceSameEmpty(regex: RegExp): boolean {
    if (lastIndex === undefined) {
        lastIndex = regex.lastIndex
        return false
    }
    let ret = lastIndex === regex.lastIndex
    lastIndex = regex.lastIndex
    return ret
}

function officialMatchAll(regex: RegExp, str: string): (string | undefined)[][] {
    lastIndex = undefined

    var ret: (string | undefined)[][] = []
    var regexpExecArray: RegExpExecArray | null
    while ((regexpExecArray = regex.exec(str)) !== null) {
        if (twiceSameEmpty(regex)) {
            if (regex.lastIndex === str.length) {
                break
            } else {
                regex.lastIndex = regex.lastIndex + 1
                continue
            }
        }
        var matchedStrings: (string | undefined)[] = regexpExecArray
        ret.push(matchedStrings)
    }
    return ret
}

function testMatch(regex_string: string, flags: string, test_string: string) {
    let t0: number
    let t1: number

    t0 = performance.now();
    var matchResult = officialMatchAll(new RegExp(regex_string, flags), test_string)
    t1 = performance.now();
    console.log(`official matchAll took ${t1 - t0} milliseconds.`);

    t0 = performance.now();
    var rgx = processRegex(regex_string, true)
    var boo = matchAll(rgx, test_string, flags)
    t1 = performance.now();
    console.log(`home-made matchAll took ${t1 - t0} milliseconds.`);

    if (boo === undefined) {
        return false
    }
    if (boo.length !== matchResult.length) {
        return false
    }
    for (let i = 0; i < matchResult.length; i++) {
        if (boo[i].length !== matchResult[i].length) {
            return false
        }
        for (let j = 0; j < matchResult[i].length; j++) {
            if (boo[i][j] !== matchResult[i][j]) {
                return false
            }
        }
    }
    return true
}

function testGeneratedStrings(regex_string: string): boolean {
    const t0 = performance.now();
    var rgx = processRegex(regex_string, true)
    var strs = generate(rgx)
    const t1 = performance.now();

    console.log("regexp length: " + regex_string.length)
    console.log("count strings: " + strs.length)

    console.log(`generation took ${t1 - t0} milliseconds.`);

    var str = strs.reduce((a, b) => a + "\n" + b)
    var ret = testMatch(regex_string, "gm", str)
    console.log("match the same substrings: " + ret)
    return ret
}


const fs = require('fs');
// fs.readdir('./', (err: any, files: any) => {
//   files.forEach((file: any) => {
//     console.log(file);
//   });
// });

fs.readFile('./resource/sample.txt', 'utf8', function (err: any, data: any) {
    if (err) {
        return console.log(err);
    }
    // console.log(data);

    // let x = match(processRegex(data, true), '"""', "gm")
    // let b = 1

    let regexes = (data as string).split("\n")
    for (const regex of regexes) {
        if (!testGeneratedStrings(regex)) {
            console.log("\n\n\n" + regex + "\n\n\n")
        }
    }

});

// console.log(testMatch("d(?:(b))+d", "g", "cdaadbsbz dbd"))
let _ = 1
