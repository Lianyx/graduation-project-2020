import { processRegex, Regex } from "../regex/regex";
import { generateTree } from "./tree";
import { construct } from "../regex/nfa";
import { match } from "../regex/match";
import { generate } from "../regex/generate";
import $ = require("jquery");
import { InternalError, UngrammaticalError, warnings, suggestions, sample } from "../regex/util";

let $regex_string_field = $('#regex-string-field');
let $regex_literal_field = $('#regex-literal-field');
let $regex_string_mode_select = $('#regex-string-mode-select');
let $regex_literal_mode_select = $('#regex-literal-mode-select');
let $compile_info_div = $('#compile-info-div');

let $generate_button = $('#generate-button');
let $base_string_field = $('#base-string');
let $backdrop = $('.backdrop');
let $highlights = $('.highlights');
let $textarea = $('.my-textarea');

let $proceed_button = $('#proceed-button');
let $debug_area = $('.debug-area');
let $debug_field = $('#debug-field')


let regex: Regex = processRegex("", true);
let applyHighlights: (text: string) => string = (text) => text;
let lineNo = 1;

/*
拿到regex，并判断是否是literal还是string

# regex改变，或者radio改变
这两个textfield应该是同步的（这个只在regex改变时做就可以了）
都要compile，给出错误信息，最终成tree
都要改变textarea里的規則
并且刷新一下textarea

mode改变，只改变textarea那两个
*/

export function init() {
    // textarea
    $textarea.val("");
    bindEvents();

    // radio button
    $('#regex-string-div').hide();
    $('input[type=radio][name="regex-type"]').on('change', function () {
        switch ($(this).val()) {
            case 'literal':
                console.log("change to literal");
                $('#regex-literal-div').show();
                $('#regex-string-div').hide();
                handleRegexChange();
                break;
            case 'string':
                console.log("change to string");
                $('#regex-literal-div').hide();
                $('#regex-string-div').show();
                handleRegexChange();
                break;
        }
    });

    // handle the two regex fields and the two mode fields
    // 用input好像不行？change应该就不需要了吧，和tree不同步就算了。还有一个问题，只要移动了key就会变化…
    $regex_string_field.on('keyup paste', function () {
        let regex_str = $(this).val() as string;
        console.log(`regex-string-field value: ${regex_str}`);
        $regex_literal_field.val(regex_str);

        handleRegexChange();
    });

    $regex_literal_field.on('keyup paste', function () {
        let regex_str = $(this).val() as string;
        console.log(`regex-literal-field value: ${regex_str}`);
        $regex_string_field.val(regex_str);

        handleRegexChange();
    });


    // TODO 是否要用两种不同的颜色，不然连在一起的情况？
    $generate_button.on({
        click: function (event) {
            let x = $base_string_field.val() as string;
            if (x.length >= 3) {
                sample._ = x;
            } else {
                sample._ = "regex";
            }

            let strs = generate(regex);
            $textarea.val(strs.reduce((a, c) => a + "\n" + c));
            $textarea.val($textarea.val() + "\n" + `共生成字符串样例${strs.length}个`);

            applyHighlights = function (text: string) {
                text = text
                    .replace(/\n$/g, '\n\n')
                    .replace(new RegExp(regex.str, getModifiers()), '<mark>$&</mark>')
                    .replace(/&/gm, '&amp;')
                    .replace(/<(?!\/?mark>)/gm, '&lt;');

                return text;
            }

            handleInput();
        }
    })

    $proceed_button.on({
        click: function (event) {
            let debug_str = $debug_field.val() as string;
            console.log("debug string: " + debug_str);

            let nfa = construct(regex);

            $debug_area.html("");
            lineNo = 1;
            let boo = match(nfa, debug_str, 0, (s) => {
                printToDebugAreaWithLineNo(s);
            });

            // <span style="font: bold 12px/30px Georgia, serif;">12</span>
            // <span style="color: #007bff">this time it is about color</span>

            $debug_area.html($debug_area.html() + "<br>");
            if (boo === -1) {
                $debug_area.html($debug_area.html() + `<span style="color: #007bff">find no match from index 0</span>`);
            } else if (boo === -2) {
                $debug_area.html($debug_area.html() + "..." + "<br>" + `<span style="color: #007bff">Program halts. Possibly catastrophic backtracking occurs.</span>`);
            } else {
                $debug_area.html($debug_area.html() + `<span style="color: #007bff">find match string from index 0 to ${boo}: ${debug_str.substring(0, boo + 1)}</span>`);
            }
        }
    });
}

// for the two regex fields
function isLiteral(): boolean {
    switch ($('input[type=radio][name="regex-type"]:checked').val()) { // 这个和上面的change还不太一样呃
        case 'literal':
            return true;
        case 'string':
            return false;
        default:
            throw new InternalError("impossible");
    }
}

function handleRegexChange(): void {
    let regex_str = $regex_string_field.val() as string;

    $compile_info_div.html("");

    try {
        regex = processRegex(regex_str, isLiteral());
    } catch (e) {
        if (e instanceof UngrammaticalError || e instanceof InternalError) {
            $compile_info_div.html(e.message);
            return;
        } else {
            throw e;
        }
    }

    // warnings and suggestions
    warnings.forEach(s => {
        $compile_info_div.html($compile_info_div.html() + '<br>' + s);
    })

    // textarea
    applyHighlights = (text) => {
        text = text
            .replace(/\n$/g, '\n\n')
            .replace(new RegExp(regex.str, getModifiers()), '<mark>$&</mark>')
            .replace(/&/gm, '&amp;')
            .replace(/<(?!\/?mark>)/gm, '&lt;'); // 明知有bug…

        return text;
    }
    handleInput();

    // tree
    let $li = generateTree(regex);
    let $ul = $('#myUL');
    $ul.find(':first-child').replaceWith($li);

    let togglers = $('.mycaret');
    togglers.on('click', function () {
        $(this).parent().children(".nested").toggleClass("active");
        $(this).toggleClass("mycaret-down");
        if ($(this).hasClass("mycaret-down")) {
            $(this).text($(this).parent().attr("data-ellipsis") as string);
        } else {
            $(this).text($(this).parent().attr("data-full") as string);
        }
    })
}

function getModifiers(): string {
    if (isLiteral()) {
        return $regex_literal_mode_select.val() as string;
    } else {
        return $regex_string_mode_select.val() as string;
    }
}

// for textarea
function bindEvents() {
    $textarea.on({
        input: handleInput,
        scroll: handleScroll
    });
}

function handleInput() {
    var text = $textarea.val() as string;
    var highlightedText = applyHighlights(text);
    $highlights.html(highlightedText);
}

function handleScroll() {
    var scrollTop = $textarea.scrollTop();
    $backdrop.scrollTop(scrollTop!);

    var scrollLeft = $textarea.scrollLeft();
    $backdrop.scrollLeft(scrollLeft!);
}

function printToDebugAreaWithLineNo(s: string) {
    let current = $debug_area.html();
    if (current === "") {
        $debug_area.html(`<span style="font: bold 12px Georgia, serif;">${lineNo++}</span>` + "\t" + s);
    } else {
        $debug_area.html(current + "<br>" + `<span style="font: bold 12px Georgia, serif;">${lineNo++}</span>` + "\t" + s);
    }
}