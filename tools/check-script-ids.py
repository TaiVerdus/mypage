#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""script.js ↔ index.html 的 id 交叉检查（V2.7 续七十六，2026-09-23）

为什么要有它：删一个元素时最容易漏掉的是**它的 JavaScript 引用**。
`node --check` 只查语法，查不出「引用了一个已经不存在的 id」—— 那要等页面真打开才炸。
（本轮真踩了：删掉预设问题按钮时，`var quickEl` 删了、绑定块没删 ⇒
页面一加载就 `ReferenceError: quickEl is not defined`，后面所有交互都初始化不了。）

它做的检查：
  ① **前向（硬失败）**：script.js 里 `getElementById('x')` 的每个 x，必须在 index.html 里有 `id="x"`
  ② 反向（只提示）：index.html 里的 id 有哪些**没有**被 JS 用过 —— 多半是给 CSS / 锚点用的，正常

用法：python tools/check-script-ids.py     # 退出码 1 = 有缺失的 id
"""
import io
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JS = ROOT / 'script.js'
HTML = ROOT / 'index.html'


def load(p):
    with io.open(p, 'r', encoding='utf-8') as f:
        return f.read()


def main():
    js, html = load(JS), load(HTML)
    used = sorted(set(re.findall(r"getElementById\(\s*'([^']+)'\s*\)", js)))
    defined = set(re.findall(r'id="([^"]+)"', html))

    missing = [i for i in used if i not in defined]
    print('script.js 查了 %d 个 id / index.html 定义了 %d 个 id' % (len(used), len(defined)))
    if missing:
        print('\n✗ 这些 id 在 HTML 里不存在（页面上必然报错 / 功能静默失效）：')
        for i in missing:
            print('   %s' % i)
        print('\n  ⇒ 要么把元素加回来，要么把 JS 里那处引用一起删掉'
              '（⚠️ 声明与使用必须同生共死）。')
        return 1

    unused = sorted(i for i in defined if i not in used)
    print('✓ 每个 getElementById 都能在 HTML 里找到对应元素')
    if unused:
        print('  （提示）%d 个 id 没被 JS 用到，多半是给 CSS / 锚点用的：%s'
              % (len(unused), '、'.join(unused[:12]) + ('…' if len(unused) > 12 else '')))
    return 0


if __name__ == '__main__':
    sys.exit(main())
