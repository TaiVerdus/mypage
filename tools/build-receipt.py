# -*- coding: utf-8 -*-
"""把 classics 渲染成一张「小票」写进 index.html（V2.7 续四十四）。

用法：
    python tools/build-receipt.py           生成/更新
    python tools/build-receipt.py --check   只核对（不一致退出码 1）

⚠️ 这一段是**生成物**，别手改 index.html 里 receipt:begin / receipt:end 之间的内容 ——
   要改内容改 data/daily-picks.json 的 classics，再跑这个脚本。

⚠️ TOTAL 是**现算**的，不抄任何外部数字。建立时发现用户截图里写 TOTAL 64:22，
   而 15 条相加是 64:30 ⇒ 差 8 秒。以「算出来的」为准，出入已告诉用户。
   （教训同数字分身那条：**能算的不要抄**。）

⚠️ PLAYLIST ID 用的是**清单内容的短哈希** ⇒ 清单没变它就不变、改一个字就变，
   不是随机编号、也不是编出来的数字。

⚠️ 截图里右上角是 QQ音乐 的二维码、底部还有它的 logo ⇒ **都不搬**
   （别人的码和别人的商标）。二维码那一格换成他自己的单字印「释」，
   和联系卡头像同一个字。
"""
import hashlib
import io
import json
import os
import re
import sys

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(SITE, 'data', 'daily-picks.json')
PAGE = os.path.join(SITE, 'index.html')

BEGIN = '<!-- receipt:begin 由 tools/build-receipt.py 生成，请勿手改 -->'
END = '<!-- receipt:end -->'


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def load():
    d = json.load(io.open(DATA, encoding='utf-8'))
    items = d.get('classics') or []
    if not items:
        sys.exit('!! classics 是空的 —— 先往 data/daily-picks.json 里填数据')
    for i, t in enumerate(items, 1):
        if not t.get('title') or not t.get('duration'):
            sys.exit('!! 第 %d 条缺 title 或 duration' % i)
        if not re.match(r'^\d+:\d\d$', t['duration']):
            sys.exit('!! 第 %d 条的 duration 格式不对（要 m:ss）：%r' % (i, t['duration']))
    return d, items


def total_of(items):
    secs = sum(int(t['duration'].split(':')[0]) * 60 + int(t['duration'].split(':')[1])
               for t in items)
    return '%d:%02d' % (secs // 60, secs % 60), secs


def build(d, items):
    total, secs = total_of(items)
    raw = '|'.join('%s\x1f%s\x1f%s' % (t['title'], t.get('artist', ''), t['duration'])
                   for t in items)
    pid = hashlib.sha1(raw.encode('utf-8')).hexdigest()[:4].upper()
    date = d.get('classics_updated', '')

    rows = []
    for i, t in enumerate(items, 1):
        artist = ('<span class="r-artist"> — %s</span>' % esc(t['artist'])) if t.get('artist') else ''
        rows.append('          <li><span class="r-no">%02d</span>'
                    '<span class="r-name">%s%s</span>'
                    '<span class="r-amt">%s</span></li>'
                    % (i, esc(t['title']), artist, esc(t['duration'])))

    body = '\n'.join(rows)

    out = []
    out.append(BEGIN)
    out.append('      <!-- ⚠️ 生成物：改内容请改 data/daily-picks.json 的 classics，再跑')
    out.append('           python tools/build-receipt.py —— 别直接改下面这些行。')
    out.append('           数据来源：用户 2026-09-22 在 QQ音乐 生成的歌单小票（他自己的清单），')
    out.append('           由 AI 逐条转录 —— ⚠️ 转录可能有误，等他核对。')
    out.append('           右上角原本是 QQ音乐 的二维码、底部是它的 logo ⇒ 都没搬（别人的东西），')
    out.append('           二维码那格换成他自己的单字印。TOTAL 是现算的，不抄截图那个数。 -->')
    out.append('      <article class="receipt reveal">')
    out.append('        <p class="receipt-kicker">PLAYLIST</p>')
    out.append('        <h3 class="receipt-title">常听的</h3>')
    out.append('        <div class="receipt-top">')
    out.append('          <p class="receipt-date">AS OF %s</p>' % date)
    out.append('          <span class="receipt-mark" aria-hidden="true">释</span>')
    out.append('        </div>')
    out.append('        <p class="receipt-store">00 WANG SHIXIAN · MYPAGE</p>')
    out.append('        <div class="receipt-head" aria-hidden="true">')
    out.append('          <span>QTY</span><span>ITEM</span><span>AMT</span>')
    out.append('        </div>')
    out.append('        <!-- ⚠️ role="list" 不能少：CSS 里给有序列表写了 list-style: none，')
    out.append('             而 Safari/VoiceOver 会因此丢掉列表语义。')
    out.append('             ⚠️ 注释里**别写标签样式的文字**（比如把 ol 用尖括号包起来写）——')
    out.append('                结构检查器会把注释里的它当成真开标签，报一串「未闭合」。')
    out.append('                这条踩过：V2.7 续四十四首版就是这么把标签检查弄红的。 -->')
    out.append('        <ol class="receipt-list" role="list">')
    out.append(body)
    out.append('        </ol>')
    out.append('        <div class="receipt-sum">')
    out.append('          <p><span>COUNT:</span><span>%d</span></p>' % len(items))
    out.append('          <p><span>TOTAL:</span><span>%s</span></p>' % total)
    out.append('        </div>')
    out.append('        <div class="receipt-foot">')
    out.append('          <p>PLAYLIST ID: MYPAGE-%s-%s</p>' % (date.replace('-', ''), pid))
    out.append('          <p>EDITED TIME: %s</p>' % date)
    out.append('          <p>EDITED BY: 释贤</p>')
    out.append('        </div>')
    out.append('        <!-- 条码纯装饰（CSS 画的，扫不出东西）⇒ 对读屏隐藏 -->')
    out.append('        <div class="receipt-barcode" aria-hidden="true"></div>')
    out.append('        <p class="receipt-thanks">THANK YOU FOR LISTENING</p>')
    out.append('      </article>')
    out.append(END)
    return '\n'.join(out)


def main():
    check = '--check' in sys.argv
    d, items = load()
    new = build(d, items)

    page = io.open(PAGE, encoding='utf-8').read()
    a = page.find(BEGIN)
    b = page.find(END)
    if a < 0 or b < 0:
        sys.exit('!! index.html 里找不到 receipt:begin / receipt:end 标记')

    old = page[a:b + len(END)]
    if check:
        if old == new:
            print('小票与数据一致 ✓')
            return
        print('!! 小票与数据不一致 —— 跑 python tools/build-receipt.py 重新生成')
        sys.exit(1)

    io.open(PAGE, 'w', encoding='utf-8', newline='').write(
        page[:a] + new + page[b + len(END):])
    total, secs = total_of(items)
    print('小票已生成：%d 首 / 合计 %s（%d 秒）' % (len(items), total, secs))


if __name__ == '__main__':
    main()
