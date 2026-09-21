# -*- coding: utf-8 -*-
"""「每日推荐」生成器（V2.7 续三十一）。

数据源：data/daily-picks.json
生成物：index.html 里 <!-- daily:begin --> 与 <!-- daily:end --> 之间那一段

用法：
    python tools/build-daily.py            只按当前数据重生成页面
    python tools/build-daily.py --advance  从备选池取今天的一批，挪进 history 再重生成
    python tools/build-daily.py --advance --count 3   一天取三首
    python tools/build-daily.py --check    只检查页面与数据是否一致，不一致退出码 1

⚠️ 生成物不手改：改内容要改 data/daily-picks.json，然后重跑本脚本。
⚠️ 版权口径：只存事实（歌名 / 歌手 / 专辑 / 年份）。不放音频、不放歌词、不复刻封面。
"""
import io
import json
import os
import re
import sys
from datetime import date

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(SITE, "data", "daily-picks.json")
PAGE = os.path.join(SITE, "index.html")

BEGIN = "<!-- daily:begin 由 tools/build-daily.py 生成，请勿手改 -->"
END = "<!-- daily:end -->"


def esc(t):
    return (str(t).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def zh_date(iso, long_form=True):
    """2026-09-21 -> 2026 年 9 月 21 日（长）/ 9月21日（短）"""
    y, m, d = (int(x) for x in iso.split("-"))
    if long_form:
        return "%d 年 %d 月 %d 日" % (y, m, d)
    return "%d月%d日" % (m, d)


def item_html(it, first=False):
    """一首歌：第一首用 h3（页面大纲里它是标题级），其余用 p"""
    tag = "h3" if first else "p"
    meta_bits = [it.get("artist", ""), it.get("album", ""), str(it.get("year", ""))]
    meta = " · ".join(b for b in meta_bits if b)
    out = []
    out.append('          <li class="daily-item">')
    out.append('            <%s class="daily-title">%s</%s>' % (tag, esc(it.get("title", "")), tag))
    out.append('            <p class="daily-meta">%s</p>' % esc(meta))
    note = (it.get("note") or "").strip()
    if note:
        out.append('            <p class="daily-note">%s</p>' % esc(note))
    out.append('          </li>')
    return "\n".join(out)


def build(data):
    hist = data.get("history") or []
    parts = []
    parts.append('      <div class="daily reveal">')

    # ---------- 今日推荐 ----------
    if hist:
        today = hist[0]
        items = today.get("items") or []
        parts.append('        <article class="daily-today">')
        parts.append('          <p class="daily-today-k">今日推荐 · '
                     '<time datetime="%s">%s</time></p>'
                     % (esc(today.get("date", "")), zh_date(today.get("date", "1970-01-01"))))
        parts.append('          <ol class="daily-items">')
        for i, it in enumerate(items):
            parts.append(item_html(it, first=(i == 0)))
        parts.append('          </ol>')
        parts.append('        </article>')
    else:
        # 备选池还没开张 —— 如实说，别放假内容
        parts.append('        <article class="daily-today daily-today--empty">')
        parts.append('          <p class="daily-today-k">今日推荐</p>')
        parts.append('          <p class="daily-empty">备选池一开张，这里每天换一首。</p>')
        parts.append('        </article>')

    # ---------- 最近几天（不含今天那条） ----------
    recent = hist[1:7]
    if recent:
        parts.append('        <div class="daily-recent">')
        parts.append('          <p class="daily-recent-k">最近几天</p>')
        parts.append('          <ul class="daily-recent-list">')
        for row in recent:
            iso = row.get("date", "")
            names = "、".join(it.get("title", "") for it in (row.get("items") or []))
            artist = ""
            its = row.get("items") or []
            if len(its) == 1:
                artist = its[0].get("artist", "")
            label = ("%s — %s" % (names, artist)) if (names and artist) else names
            y = iso.split("-")[0] if iso else ""
            now_y = str(date.today().year)
            shown = zh_date(iso) if (y and y != now_y) else zh_date(iso, long_form=False)
            parts.append('            <li><time datetime="%s">%s</time>'
                         '<span class="daily-recent-main">%s</span></li>'
                         % (esc(iso), esc(shown), esc(label)))
        parts.append('          </ul>')
        parts.append('        </div>')

    # ---------- 常听的（折叠） ----------
    # ⚠️ 用户 2026-09-21 要求把「常听的 15 首」从页面删掉，所以 data 里 classics 现在是空数组，
    #    这一段不会输出任何东西。配套的样式（.daily-classics / .classics-* / .track-* / .playlist-*）
    #    也一并从 style.css 移除了 —— **要恢复「常听的」，样式和数据都得从 git 取**
    #    （数据见提交 d721dc9，样式见它前一个提交），只填 classics 而不恢复样式会得到一堆没样式的裸标签。
    classics = data.get("classics") or []
    if classics:
        total = sum(len(g.get("tracks") or []) for g in classics)
        parts.append('        <details class="daily-classics">')
        parts.append('          <summary>常听的 %d 首</summary>' % total)
        parts.append('          <div class="classics-groups">')
        for g in classics:
            parts.append('            <section class="classics-group">')
            en = ('<span class="playlist-en">%s</span>' % esc(g["en"])) if g.get("en") else ""
            parts.append('              <h3 class="classics-name">%s%s</h3>' % (esc(g.get("name", "")), en))
            parts.append('              <p class="playlist-meta">%s</p>' % esc(g.get("meta", "")))
            parts.append('              <ol class="track-list">')
            for t in (g.get("tracks") or []):
                parts.append('                <li class="track">')
                parts.append('                  <span class="track-main">')
                parts.append('                    <span class="track-title">%s</span>' % esc(t.get("title", "")))
                parts.append('                    <span class="track-sub">%s · %s</span>'
                             % (esc(g.get("name", "")), esc(t.get("album", ""))))
                parts.append('                  </span>')
                parts.append('                  <span class="track-year">%s</span>' % esc(t.get("year", "")))
                parts.append('                </li>')
            parts.append('              </ol>')
            parts.append('            </section>')
        parts.append('          </div>')
        parts.append('        </details>')

    parts.append('      </div>')
    return "\n".join(parts)


def inject(page_text, body):
    if BEGIN not in page_text or END not in page_text:
        raise SystemExit("!! index.html 里找不到 daily 的起止标记，无法注入")
    head = page_text.split(BEGIN)[0]
    tail = page_text.split(END, 1)[1]
    return head + BEGIN + "\n" + body + "\n      " + END + tail


def main():
    args = sys.argv[1:]
    check_only = "--check" in args
    advance = "--advance" in args
    count = 1
    if "--count" in args:
        count = int(args[args.index("--count") + 1])

    data = json.load(io.open(DATA, encoding="utf-8"))
    page = io.open(PAGE, encoding="utf-8").read()

    moved = []
    if advance and not check_only:
        pool = data.get("pool") or []
        take = pool[:count]
        if not take:
            print("备选池是空的 —— 今天跳过（页面保持原样，history 里最后一条继续显示）")
            return 0
        for it in take:
            data["history"] = [{"date": date.today().isoformat(), "items": [it]}] + (data.get("history") or [])
            moved.append(it)
        # 同一天多条并成一条
        same = [h for h in data["history"] if h["date"] == date.today().isoformat()]
        if len(same) > 1:
            data["history"] = [{"date": same[0]["date"],
                                "items": [i for h in same for i in h["items"]]}] + \
                               [h for h in data["history"] if h["date"] != date.today().isoformat()]
        data["pool"] = pool[len(take):]

    body = build(data)
    new_page = inject(page, body)

    if check_only:
        ok = (new_page == page)
        print("页面与数据%s" % ("一致 ✓" if ok else "不一致 ✗（跑一次不带 --check 的即可）"))
        return 0 if ok else 1

    io.open(PAGE, "w", encoding="utf-8", newline="").write(new_page)
    if advance:
        io.open(DATA, "w", encoding="utf-8", newline="").write(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n")
        print("今天推荐：%s" % "、".join(i.get("title", "") for i in (moved or [])))
    print("已生成：%s" % PAGE)
    print("备选池剩 %d 条 / 历史 %d 天" % (len(data.get("pool") or []), len(data.get("history") or [])))
    return 0


if __name__ == "__main__":
    sys.exit(main())
