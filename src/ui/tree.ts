import { NodeType, Node } from "../regex/parse";
import { Regex, strBetween, strAt } from "../regex/regex";
import { ItemType } from "../regex/charclass";
import { Token } from "../regex/token";
import { GroupType, LookaroundType } from "../regex/types";
import { exhaustiveCheck, htmlPreProcess } from "../regex/util";

let r: Regex;

export function generateTree(regex: Regex): JQuery<HTMLElement> {
    // let treeHTML = $('#myUL'); // init管这个
    r = regex;
    return from(regex.root);
}

/*
from返回JQuery<HTMLElement>
每个都是<li>，只有alter, concat, iter才会在子类里用到<ul>

处理mycaret的翻转？
用户点了那个<li>以后，怎么拿到相关数据？用JQuery.data()
每个有两个

return的JQuery有可能是数组
isCollapse

full和ellipse都是可以自己决定的
*/

// TODO 这个三点好像不好
// TODO 用data不知道为什么不行，set的时候全都改成attr了

function from(node: Node, isRoot = false): JQuery<HTMLElement> {
    let full: string = strBetween(r, node.loc);

    switch (node.type) {
        case NodeType.ALTER: {
            let ret = $(`<li><span class="mycaret">${htmlPreProcess(full)}</span></li>`);
            ret.attr({ "data-full": full, "data-ellipsis": "…" });

            let $ul = $(`<ul class="nested"></ul>`);
            ret.append($ul);

            let isFirst = true;
            let $li: JQuery<HTMLElement>;
            for (const nd of node.children) {
                $ul.append($li = from(nd));
                if (isFirst) {
                    isFirst = false;
                } else {
                    decorateText($li, s => "|" + s);
                }
            }
            return ret;
        }
        case NodeType.CONCAT: {
            let i = 0;
            let children: JQuery<HTMLElement>[] = [];
            while (i < node.children.length) {
                let child = node.children[i];
                let tmp: string = "";
                switch (child.type) {
                    case NodeType.SHORTHAND:
                        let c = child.chr;
                        tmp = strBetween(r, child.loc);
                        i++;
                        while (i < node.children.length
                            && (child = node.children[i]).type === NodeType.SHORTHAND
                            && (child as { chr: string }).chr === c) { // 这里vscode又不能自己判断
                            // shorthand比char多这么个要求
                            tmp += strBetween(r, child.loc);
                            i++;
                        }
                        children.push($(`<li>${htmlPreProcess(tmp)}</li>`));
                        break;
                    case NodeType.CHAR: {
                        tmp = strBetween(r, child.loc);
                        i++;
                        while (i < node.children.length
                            && (child = node.children[i]).type === NodeType.CHAR) {
                            tmp += strBetween(r, child.loc);
                            i++;
                        }
                        children.push($(`<li>${htmlPreProcess(tmp)}</li>`));
                        break;
                    }
                    default:
                        children.push(from(child));
                        i++;
                        break;
                }
            }

            if (children.length === 1) {
                return children[0];
            }

            let ret = $(`<li><span class="mycaret">${htmlPreProcess(full)}</span></li>`);
            ret.attr({ "data-full": full, "data-ellipsis": "…" });

            let $ul = $(`<ul class="nested"></ul>`);
            ret.append($ul);
            for (const nd of children) {
                $ul.append(nd);
            }
            return ret;
        }
        case NodeType.REPEAT: {// 对于Iter, Group，Lookaround，只有本身是可展开的才会
            let $li = from(node.child);
            let qt_str = strAt(r, node.loc.end - 1);
            decorateText($li, x => x + qt_str);
            return $li;
        }
        case NodeType.GROUP:
        case NodeType.LOOKAROUND: {
            let $li = from(node.child);
            let lp_str = strAt(r, node.loc.begin);
            decorateText($li, x => lp_str + x + ")");
            return $li;
        }
        case NodeType.CHAR:
        case NodeType.BOUNDARY:
        case NodeType.CHARCLASS:
        case NodeType.SHORTHAND:
        case NodeType.EMPTY:
        case NodeType.BACKREF:
            return $(`<li>${htmlPreProcess(full)}</li>`);
        // default:
        // exhaustiveCheck(node);
    }
}

function decorateText($li: JQuery<HTMLElement>, to: (x: string) => string) {
    if ($li.children("span").length) {
        let $span = $li.children("span").first();
        $span.text(to($span.text()));
        $li.attr({ "data-full": to($li.attr("data-full") as string) });
        $li.attr({ "data-ellipsis": to($li.attr("data-ellipsis") as string) });
    } else {
        $li.text(to($li.text()));
    }
}
