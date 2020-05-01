import { init } from "./ui/init";

import { tokenize } from "./regex/token";
import { parse } from "./regex/parse";
import { generate } from "./regex/generate";
import { processRegex } from "./regex/regex";
import { construct, printNFA } from "./regex/nfa";
import { match } from "./regex/match";
import { puncts, warnings } from "./regex/util";

$(document).ready(() => init());

// let re = processRegex("(?=abc(?!123))\\w*", true);
// let nfa = construct(re);

// let _puncts = puncts;
// let _warnings = warnings;

// _warnings.forEach(x => console.log(x));

// // let strs = generate(re);
// // strs.forEach(x => console.log(x));
// // console.log();

// // printNFA(nfa);
// let boo = match(nfa, "abc123");
// console.log(boo);


// Regexp?Buddy is (aweful|acceptable|awesome)
// RegexBuddy is awesome

// ([^,\\r\\n]*,){11}P
// (?>[^,\\r\\n]*,){11}P
// 1,2,3,4,5,6,7,8,9,10,11,12,13

// \\(?[2-9]\\d{2}\\)?(-|.)\\d{3}(-|.)\\d{4}

// ((b)|a){2,3}b\\2
// aabb，或者aabbb
// backtrack的时候恢复所有之前存留的信息
// aabb第一次match到aabb的时候，是按aab b来的
// 第二次match到aabb的时候，是按aa b来的，这时是否会match最后一个\\2呢？按理应该不会才对
// 这个为什么是对的 ...

// TODO a* 为什么生成的那么奇怪呃