#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build-ai-log.py —— 把《AI 使用日志》转成站点子页 ai-log.html

【为什么要有这个脚本】
  站点是纯静态、不引框架也不引 CDN，所以：
    × 不能用前端的 Markdown 渲染器（要引库）
    × 不能直接链 .md 文件（浏览器会显示成一坨没有排版的纯文本）
    × 不能手抄一份 HTML（两份内容必然漂移）
  → 源文件保持 Markdown，用这个脚本生成静态 HTML。站点本身依然「双击就能打开」，
    这个脚本只是作者侧的生成工具，不是构建步骤。

【用法】在 MYPAGE-V2.0 目录下：
    python tools/build-ai-log.py
    python tools/build-ai-log.py <源 md 路径> <输出 html 路径>

【不依赖任何第三方库】只实现日志实际用到的 Markdown 子集：
  标题 / 段落 / 引用 / 无序列表 / 有序列表 / 任务清单 / 表格 / 分隔线
  + 行内：代码 `x` / 粗体 **x** / 链接 [x](y)

【一条硬规则】第六节「回填表」**不发布**——它是作者自己的工作清单，不是交出去的内容。
"""

import html
import io
import os
import re
import sys

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_MD = os.path.join(os.path.dirname(SITE), "过程证据", "AI使用日志.md")
DEFAULT_OUT = os.path.join(SITE, "ai-log.html")

# 按 ## 标题前缀排除的章节（不发布）
EXCLUDE_H2 = ("六、",)

VERSION = "V2.7"  # 与 index.html 页脚保持一致

CJK = re.compile(r"[\u2010-\u203f\u2026\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]")
BLOCK_START = re.compile(r"^(#{1,6}\s|[-*]\s|\d+\.\s|>|\|)")
HR = re.compile(r"^-{3,}$")
TABLE_SEP = re.compile(r"^\|[\s:|-]+\|$")

# 判断「换行接回去要不要补空格」时，先把 Markdown 标记剥掉再看首尾字符
STRIP_LEAD = "*`[ "
STRIP_TAIL = "*` "


# ---------------------------------------------------------------- 行内格式

def esc(t):
    return html.escape(t, quote=False)


def inline(t):
    """先整体转义，再插入标签（顺序不能反，否则插入的标签会被转义掉）"""
    t = esc(t)
    t = re.sub(r"`([^`]+)`", r"<code>\1</code>", t)
    t = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", r'<a href="\2">\1</a>', t)
    return t


def join_lines(lines):
    """把被换行折开的同一段文字接回去。
    中文之间直接相连（不加空格，否则「、」后面会多出一个空格），其余情况补一个空格。
    判断首尾字符前先剥掉 Markdown 标记——`` `PROJECT.md` `` 这种，真正相邻的是「、」和字母。"""
    out = lines[0]
    for nxt in lines[1:]:
        a = out.rstrip(STRIP_TAIL)
        b = nxt.lstrip(STRIP_LEAD)
        if a and b and CJK.match(a[-1]) and CJK.match(b[0]):
            out += nxt
        else:
            out += " " + nxt
    return out


def split_row(s):
    s = s.strip()
    if s.startswith("|"):
        s = s[1:]
    if s.endswith("|"):
        s = s[:-1]
    return [c.strip() for c in s.split("|")]


# ---------------------------------------------------------------- 块级解析

def parse_blocks(lines):
    blocks, i, n = [], 0, len(lines)
    while i < n:
        s = lines[i].strip()
        if not s:
            i += 1
            continue

        if HR.match(s):
            blocks.append(("hr", None))
            i += 1
            continue

        m = re.match(r"^(#{1,6})\s+(.*)$", s)
        if m:
            blocks.append(("h", (len(m.group(1)), m.group(2).strip())))
            i += 1
            continue

        # 表格：本行以 | 开头，下一行是 |---|---| 分隔行
        if s.startswith("|") and i + 1 < n and TABLE_SEP.match(lines[i + 1].strip()):
            head = split_row(s)
            i += 2
            rows = []
            while i < n and lines[i].strip().startswith("|"):
                rows.append(split_row(lines[i].strip()))
                i += 1
            blocks.append(("table", (head, rows)))
            continue

        if s.startswith(">"):
            buf = []
            while i < n and lines[i].strip().startswith(">"):
                buf.append(re.sub(r"^\s*>\s?", "", lines[i]))
                i += 1
            blocks.append(("quote", parse_blocks(buf)))
            continue

        m = re.match(r"^([-*]|\d+\.)\s+(.*)$", s)
        if m:
            ordered = m.group(1)[0].isdigit()
            items = []
            while i < n:
                cur, cs = lines[i], lines[i].strip()
                mm = re.match(r"^([-*]|\d+\.)\s+(.*)$", cs)
                if mm and mm.group(1)[0].isdigit() == ordered:
                    items.append(mm.group(2))
                    i += 1
                elif items and cs and (cur.startswith("  ") or cur.startswith("\t")):
                    items[-1] += "\n" + cs      # 续行
                    i += 1
                else:
                    break
            blocks.append(("ol" if ordered else "ul", items))
            continue

        para = [s]
        i += 1
        while i < n:
            ns = lines[i].strip()
            if not ns or BLOCK_START.match(ns) or HR.match(ns):
                break
            para.append(ns)
            i += 1
        blocks.append(("p", para))
    return blocks


def render(blocks, toc):
    out = []
    for kind, data in blocks:
        if kind == "hr":
            out.append('<hr class="log-hr">')

        elif kind == "h":
            lvl, text = data
            if lvl == 1:
                continue                        # 文档标题由页面模板负责
            tid = "sec-%d" % (len(toc) + 1)
            toc.append((lvl, tid, text))
            tag = "h2" if lvl == 2 else "h3"
            out.append('<%s id="%s">%s</%s>' % (tag, tid, inline(text), tag))

        elif kind == "p":
            out.append("<p>%s</p>" % inline(join_lines(data)))

        elif kind in ("ul", "ol"):
            lis = []
            for it in data:
                body = join_lines(it.split("\n"))
                tm = re.match(r"^\[([ xX])\]\s*(.*)$", body)
                if tm:
                    box = "☑" if tm.group(1).lower() == "x" else "☐"
                    lis.append('<li class="log-task"><span class="log-box" '
                               'aria-hidden="true">%s</span>%s</li>'
                               % (box, inline(tm.group(2))))
                else:
                    lis.append("<li>%s</li>" % inline(body))
            out.append("<%s>%s</%s>" % (kind, "".join(lis), kind))

        elif kind == "table":
            head, rows = data
            th = "".join("<th>%s</th>" % inline(c) for c in head)
            trs = "".join(
                "<tr>%s</tr>" % "".join("<td>%s</td>" % inline(c) for c in r)
                for r in rows)
            out.append('<div class="log-table-wrap"><table class="log-table">'
                       "<thead><tr>%s</tr></thead><tbody>%s</tbody></table></div>"
                       % (th, trs))

        elif kind == "quote":
            out.append('<blockquote class="log-quote">%s</blockquote>'
                       % render(data, toc))
    return "\n".join(out)


# ---------------------------------------------------------------- 主流程

def strip_excluded(lines):
    """整节剔除 EXCLUDE_H2 里列出的章节"""
    out, skip = [], False
    for ln in lines:
        s = ln.strip()
        if s.startswith("## "):
            title = s[3:].strip()
            skip = any(title.startswith(p) for p in EXCLUDE_H2)
        if not skip:
            out.append(ln)
    return out


def for_public(text):
    """发布版里把指向「第六节」的指引改掉——那一节不发布，留着会指空"""
    text = re.sub(r"第六节[·、的]?\s*回填表", "回填表", text)
    text = re.sub(r"\*\*第六节\*\*", "回填表", text)
    text = re.sub(r"第六节", "回填表", text)      # 兜底：不留下任何指向缺失章节的引用
    return text


def meta_of(lines):
    """统计页头要用的两个数字——**只数第二节「交互日志」里的行**，
    否则第五节（Git 提交历史）和第六节（回填表）的表格会被算进来。
    动态算，不写死，日志增删条目时数字自动跟着变。"""
    n = todo = 0
    inside = False
    for ln in lines:
        s = ln.strip()
        if s.startswith("## "):
            inside = s[3:].strip().startswith("二、")
            continue
        if inside and re.match(r"^\|\s*\d+\s*\|", s):
            n += 1
            if "🟡" in s:
                todo += 1
    return n, todo


PAGE = u"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI 使用日志 · 王释贤</title>
  <meta name="description" content="王释贤个人主页的 AI 使用日志：逐条记录每一次 AI 协作、我的判断与修正，以及发现的真实缺陷。带可复现的 git 时间戳。">
  <meta name="theme-color" content="#0F766E">

  <meta property="og:type" content="article">
  <meta property="og:title" content="AI 使用日志 · 王释贤">
  <meta property="og:description" content="逐条记录每一次 AI 协作、我的判断与修正，以及 AI 生成代码里被查出的真实缺陷。">
  <meta name="twitter:card" content="summary_large_image">

  <link rel="icon" type="image/svg+xml" href="favicon.svg">
  <link rel="stylesheet" href="style.css">
</head>
<body>

  <!-- 子页导航：只留「回到主页」，不复刻首页那五个锚点 -->
  <nav class="nav">
    <div class="nav-inner">
      <a class="nav-logo" href="index.html">WANG SHIXIAN</a>
      <div class="nav-links">
        <a class="nav-link" href="index.html">← 返回主页</a>
      </div>
    </div>
  </nav>

  <main class="log-main">

    <header class="log-head">
      <span class="eyebrow">PROCESS EVIDENCE</span>
      <h1 class="log-title">AI 使用日志</h1>
      <p class="log-lead">
        这个主页是在 AI 辅助下做出来的。这份日志把过程如实记下来——
        <strong>包括翻车、返工，和还没补完的地方</strong>。
        它是 Vibe Coding 课程要求的过程证据，也是我用来说清「哪些是 AI 做的、哪些是我判断的」的那份材料。
      </p>

      <ul class="log-meta">
        <li><span class="log-meta-k">交互条目</span><span class="log-meta-v">%(rows)s 条，其中 <b>%(todo)s 条待补</b></span></li>
        <li><span class="log-meta-k">时间跨度</span><span class="log-meta-v">2026-09-04 → 09-17</span></li>
        <li><span class="log-meta-k">时间戳来源</span><span class="log-meta-v">git 提交时间，一条命令可复现</span></li>
      </ul>

      <p class="log-note">
        <strong>说明：</strong>这是一份<strong>进行中</strong>的记录，标着 <code>🟡</code> 的几条还需要我本人补写判断。
        另外，源文档中「回填表」一节是我自己的待办清单，属工作草稿，<strong>不随本页发布</strong>；
        正文里若出现「见回填表」的指引，指的就是那一节。
      </p>
    </header>

    <nav class="log-toc" aria-label="目录">
      <p class="log-toc-title">目录</p>
      <ol>
%(toc)s
      </ol>
    </nav>

    <article class="log-body">
%(body)s
    </article>

    <p class="log-back"><a class="btn btn--ghost" href="index.html">← 返回主页</a></p>

  </main>

  <footer id="footer">
    <p>© 2026 王释贤 · MYPAGE %(version)s</p>
    <p class="copyright">AI 使用日志为课程过程证据，如实记录协作与返工，包括未完成项</p>
  </footer>

</body>
</html>
"""


def main():
    md_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_MD
    out_path = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_OUT

    with io.open(md_path, encoding="utf-8") as f:
        raw = f.read()

    lines = raw.splitlines()

    # 统计要在「剔除前」做，否则第六节的表格会污染计数
    rows, todo = meta_of(lines)

    lines = strip_excluded(lines)
    text = for_public("\n".join(lines))

    toc_entries = []
    body = render(parse_blocks(text.splitlines()), toc_entries)

    toc_html = "\n".join(
        '<li class="log-toc-l%d"><a href="#%s">%s</a></li>' % (lvl, tid, esc(t))
        for lvl, tid, t in toc_entries if lvl == 2)

    page = PAGE % {
        "rows": rows, "todo": todo, "toc": toc_html,
        "body": body, "version": VERSION,
    }

    # 注释里只写相对路径——绝对路径会暴露本机目录结构，而这一行是要发布到网上的
    rel = os.path.relpath(md_path, os.path.dirname(SITE)).replace("\\", "/")
    banner = ("<!-- 本文件由 tools/build-ai-log.py 自动生成，请勿手改。\n"
              "     要改内容 → 改 %s 后重新运行脚本 -->\n" % rel)

    with io.open(out_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(banner + page)

    print("已生成: %s" % out_path)
    print("  源文件: %s" % md_path)
    print("  交互条目: %d（待补 %d） / 目录: %d 条"
          % (rows, todo, sum(1 for l, _, _ in toc_entries if l == 2)))


if __name__ == "__main__":
    main()
