# -*- coding: utf-8 -*-
"""「每日推荐」生成器（V2.7 续三十一）。

数据源：data/daily-picks.json
生成物：index.html 里 <!-- daily:begin --> 与 <!-- daily:end --> 之间那一段

用法：
    python tools/build-daily.py            只按当前数据重生成页面
    python tools/build-daily.py --advance  从歌单里**随机抽**今天的一批，记进 history 再重生成
    python tools/build-daily.py --advance --count 3   一天随机抽三首
    python tools/build-daily.py --check    只检查页面与数据是否一致，不一致退出码 1

⚠️ 生成物不手改：改内容要改 data/daily-picks.json，然后重跑本脚本。
⚠️ 版权口径：只存事实（歌名 / 歌手 / 专辑 / 年份）。不放音频、不放歌词、不复刻封面。
⚠️ 「歌单」是长期不消耗的来源（用户 2026-09-22 定）：每天从 pool 里**随机**抽 3 首写进
   history，pool 本身**不会减少** —— 所以「每天更新」能一直成立，不会第五天就见底。
"""
import io
import json
import os
import random
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


def secs_of(dur):
    """把 'm:ss' 变成秒；格式不对或缺失返回 None（**不猜**）"""
    m = re.match(r"^(\d+):(\d\d)$", (dur or "").strip())
    return int(m.group(1)) * 60 + int(m.group(2)) if m else None


def item_html(it, idx):
    """一行小票条目：序号 / 歌名 — 歌手 / 时长。

    ⚠️ 这一版按用户 2026-09-22 的要求改成小票风格（V2.7 续四十五）：
       他要的是「**每日推荐那一栏**按小票风格来」，不是另做一张「常听的」。
       ⚠️ 时长缺失怎么办（用户 2026-09-24 定）：**显示这条歌在总歌单里的编号（no）** ——
       歌单扩容到 276 首后多数条目没有时长，与其满屏 `--:--`，不如用真实存在的编号顶上；
       连编号都没有才写 `--`（此时整张票也不输出 TOTAL 行，见 build()）。"""
    secs = secs_of(it.get("duration"))
    artist = ('<span class="r-artist"> — %s</span>' % esc(it.get("artist", ""))) if it.get("artist") else ""
    if secs is not None:
        amt = esc(it.get("duration", ""))
    else:
        amt = str(it.get("no")) if it.get("no") else "--"
    return ('            <li><span class="r-no">%02d</span>'
            '<span class="r-name">%s%s</span>'
            '<span class="r-amt">%s</span></li>'
            % (idx, esc(it.get("title", "")), artist, esc(amt)))



def build(data):
    hist = data.get("history") or []
    parts = []
    parts.append('      <div class="daily reveal">')

    # ---------- 今日推荐：一张小票（V2.7 续四十五，用户要的就是这个）----------
    # ⚠️ 用户 2026-09-22 澄清：「读取小票里的歌单做备选池，每天选 3 首加进每日推荐，
    #    每日推荐那一栏按截图的（小票）风格来」⇒ 小票不是独立区块，就是这一栏本身。
    if hist:
        today = hist[0]
        items = today.get("items") or []
        iso = today.get("date", "")
        secs = [secs_of(it.get("duration")) for it in items]
        total_ok = all(s is not None for s in secs) and items
        total = sum(s for s in secs if s is not None)
        # ⚠️ 用户 2026-09-24 定：只要有一条没有时长，这一栏就整体走「**歌单编号**」显示
        #    （不能一半时长一半编号，那列会看不懂）⇒ 表头也跟着从 AMT 改成 NO.
        use_no = not total_ok
        parts.append('        <article class="receipt">')
        parts.append('          <p class="receipt-kicker">DAILY PICKS</p>')
        parts.append('          <h3 class="receipt-title">今日推荐</h3>')
        parts.append('          <div class="receipt-top">')
        parts.append('            <p class="receipt-date">AS OF %s</p>' % esc(iso))
        # 右上角那格：用户 2026-09-22 要求从小票模板的二维码位置换成**他的头像**
        # （先前放的是他自己的单字印「释」）。就用联系卡那张 images/avatar.jpg ——
        # **同一张，不另存一份**（文件只 10 KB，直接复用）。
        # width/height 写 84（显示 42px 的 2 倍）避免高分屏发虚；
        # alt 留空 + 外层 aria-hidden：紧下方就是他的名字，这一格是装饰。
        parts.append('            <span class="receipt-mark" aria-hidden="true">'
                     '<img src="images/avatar.jpg" alt="" width="84" height="84"></span>')
        parts.append('          </div>')
        parts.append('          <p class="receipt-store">00 WANG SHIXIAN · MYPAGE</p>')
        parts.append('          <div class="receipt-head" aria-hidden="true">')
        parts.append('            <span>QTY</span><span>ITEM</span><span>%s</span>'
                     % ('NO.' if use_no else 'AMT'))
        parts.append('          </div>')
        parts.append('          <ol class="receipt-list" role="list">')
        for i, it in enumerate(items, 1):
            parts.append(item_html(it, i))
        parts.append('          </ol>')
        parts.append('          <div class="receipt-sum">')
        parts.append('            <p><span>COUNT:</span><span>%d</span></p>' % len(items))
        if total_ok:
            parts.append('            <p><span>TOTAL:</span><span>%d:%02d</span></p>'
                         % (total // 60, total % 60))
        parts.append('          </div>')
        parts.append('          <div class="receipt-foot">')
        parts.append('            <p>PICKED: %s · 选自备选池</p>' % esc(iso))
        parts.append('            <p>EDITED BY: 释贤</p>')
        parts.append('          </div>')
        parts.append('          <!-- 条码纯装饰（CSS 画的，扫不出东西）⇒ 对读屏隐藏 -->')
        parts.append('          <div class="receipt-barcode" aria-hidden="true"></div>')
        parts.append('          <p class="receipt-thanks">THANK YOU FOR LISTENING</p>')
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

    # ---------- 常听的：**不在这里渲染了**（V2.7 续四十四）----------
    # ⚠️ 2026-09-22 起，「常听的」改由 tools/build-receipt.py 渲染成一张**小票**
    #    （用户给了一张 QQ音乐 的歌单小票截图做模板）。所以：
    #      · data/daily-picks.json 的 classics 现在归 build-receipt.py 用，
    #        字段是平铺的 {title, artist, duration}（不再是这里的「按歌手分组」形状）
    #      · 原来那段 <details class="daily-classics"> 的渲染已删除，
    #        它配套的样式也早在 2026-09-21 就移除了 ⇒ 留着只会输出没样式的裸标签
    #    本函数现在只管 pool / history（每日推荐那部分）。
    #    两个生成器各管一段、互不写入：daily 管 <!-- daily:begin..end -->，
    #    receipt 管 <!-- receipt:begin..end -->。

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
    count = 3                                  # 用户 2026-09-22 定：一天**随机**抽 3 首（原来是 1）
    if "--count" in args:
        count = int(args[args.index("--count") + 1])

    data = json.load(io.open(DATA, encoding="utf-8"))
    page = io.open(PAGE, encoding="utf-8").read()

    moved = []
    if advance and not check_only:
        pool = data.get("pool") or []
        if not pool:
            print("歌单是空的 —— 今天跳过（页面保持原样，history 里最后一条继续显示）")
            return 0
        # ⚠️ 取歌方式（用户 2026-09-22 明确）：**每天从歌单里随机抽 3 首**。
        #    原来是「按顺序取前 3 条、取走就删」——那样第 5 天歌单就见底了 ✗。
        #    现在改成 random.sample（一次抽 3 首、**同一批里不重样**），
        #    并且**歌单不消耗**（下面不再有 data["pool"] = ... 那一步）——
        #    「每天随机选三首更新」才能长期成立。
        #    注意：抽签是「有放回」的 —— 隔几天可能撞上同一首歌，这正是随机该有的样子。
        take = random.sample(pool, min(count, len(pool)))
        # 一次性把今天的这一批放进去 —— ⚠️ **保持 take 的顺序**。
        #    原来是「逐条 prepend、再把同一天的合并起来」，一份 3 首的批次会被**倒过来** ✗
        #    （一首歌的时候看不出来；2026-09-22 改成一天 3 首才露出来）。
        #    今天已经推过就**接着往后加**：不覆盖、也不重排已有的。
        today_iso = date.today().isoformat()
        hist = data.get("history") or []
        if hist and hist[0].get("date") == today_iso:
            hist[0]["items"] = (hist[0].get("items") or []) + list(take)
        else:
            hist = [{"date": today_iso, "items": list(take)}] + list(hist)
        data["history"] = hist
        moved = list(take)
        # ⚠️ 这里**故意没有** data["pool"] = pool[len(take):]（歌单不消耗，见上）

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
