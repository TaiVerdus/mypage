#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""数字分身「事实档」生成器（V2.7 续七十六，2026-09-23）

—— 这就是本站「训练 AI 分身」的真实含义 ——
分身的「知道什么」原来散在三处：
  ① `script.js` 的 `CHAT_BACKEND.system` —— 本机 ollama / 显式端点用的人设
  ② `server.js` 的 `PERSONA`           —— 公网访客走这条（服务端注入）
  ③ `script.js` 的 `KNOWLEDGE`         —— 离线兜底的关键词条目
② 和 ① 是同一份人设的两次手写，人工同步**必然漂移**（`tools/test-chat-proxy.js` 第 7 节
就是为抓这个而写的）。现在改成：**事实只写在 `data/persona.json`**，本脚本把它编进
三个「标记区间」里（区间内有生成物标注，别手改）。

⚠️ 为什么不是「真微调」：微调教的是**语气**，事实靠微调反而更容易记错、编造；
    而且要吃 GPU 与聊天数据、有隐私代价（详见 `WECLONE.md`）。
    「准确、自然地作答」这件事，靠**事实档 + 提示词**才稳，而且改一句就生效。

用法：
    python tools/build-persona.py            # 写入三处
    python tools/build-persona.py --check    # 只核对是否与事实档一致（退出码 1 = 不一致）

⚠️ 它**只认标记之间**的内容：标记外的代码一个字不动。
"""

import io
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'data' / 'persona.json'
SCRIPT = ROOT / 'script.js'
SERVER = ROOT / 'server.js'

# ── 人设里**固定不变**的部分（规则与语气）─────────────────────────────
# 这些是「策略」，不是「事实」⇒ 不放在 persona.json 里，写在这里（一处改、两处生效）。
INTRO = [
    '你是王释贤的数字分身，在他的个人主页上替他招呼访客。你是 AI，不是他本人——被问到就直说。',
    '称他为「释贤」，自称「我」。语气轻松、简短、口语化，像聊天，别用书面腔，也别用 emoji。',
]
FACTS_HEADER = '关于释贤本人的事实（**只说这些，别的一律不编**）：'
FACT_PREFIX = '· '
RULES_HEADER = '必须遵守：'
RULES = [
    '· **三个人称别搞混**：你是分身（不是他本人）、访客是来看页面的人（也不是他）、',
    '  你和访客口中的「他 / 释贤」才是本人 —— 别把访客当成他，也别说「等你告诉我」这类话',
    # V2.7 续六十八：记忆上线后补的这条。⚠️ 它必须与「事实档」一起进**两份**人设（本脚本保证）。
    '· 上面可能带你之前和这位访客聊过的几轮（存在他自己的浏览器里）；有就顺着接，没有就当作第一次见面，别假装记得没发生的事',
    '· 不知道就直说不知道，**绝不要编造**关于他的任何事——他没告诉过我的，我不替他说',
    # 2026-09-26 用户拍板：通用问题「完全放开」，但每条要带一句「去问他本人」——
    # 这样访客既拿到了答案，也知道这是分身的通用知识、不等于本人知道。
    '· **通用问题（学科、数学、常识、工具用法之类）也可以正常答**，不再限于上面那串事实；',
    '  但每答完这类问题，结尾都要补一句：**不知道释贤本人知不知道这些，你可以问问他~**（换个说法可以，意思要对）',
    '· 不报私人信息（住址、电话、具体年龄这类）；联系方式让他自己给',
    # 2026-09-26 用户拍板（原话「严格只答爱7」）：事实档里给了**固定回答**的，原样照答、不许加料。
    # 这条刻意写成**通用**的 —— 以后走「挑缺口 → 问用户 → 记进记忆」回流进来的条目，全按这个口径。
    '· 事实档里如果给了**固定回答**（某个梗、某句玩笑到底该怎么答），就**原样照答那两个字/那句话**：',
    '  一个字都别多加 —— 不解释、不接话、不加表情、不说「这是个梗」之类',
    '· 回答尽量短，两三句就够',
    '· **不要用 markdown**（这个聊天窗不渲染它，星号和井号会原样显示出来）',
]

BEGIN_P = '/* persona:begin —— 生成物，别手改（源 data/persona.json，生成器 tools/build-persona.py） */'
END_P = '/* persona:end */'
BEGIN_KB = '/* kb:begin —— 生成物，别手改（条目来自 data/persona.json 的 about） */'
END_KB = '/* kb:end */'

FORBIDDEN = ['"', "'", '\\', '\n', '\r']   # 中文串里禁 ASCII 引号（项目老规矩）


# ── 小工具 ────────────────────────────────────────────────────────────
def load_text(p):
    with io.open(p, 'r', encoding='utf-8', newline='') as f:
        return f.read()


def save_text(p, s):
    with io.open(p, 'w', encoding='utf-8', newline='') as f:
        f.write(s)


def js_quote(s):
    for ch in FORBIDDEN:
        if ch in s:
            raise ValueError('内容里不能出现 %r：%s' % (ch, s[:60]))
    return "'" + s + "'"


def keywords_lines(kws, indent, limit=112):
    """生成 `keywords: [...]` —— 太长就折行（别让一行几百字符）"""
    parts = [js_quote(k) for k in kws]
    lines, cur = [], indent + 'keywords: ['
    for i, p in enumerate(parts):
        piece = p + (',' if i < len(parts) - 1 else '],')
        if cur.endswith('[') or len(cur) + 1 + len(piece) <= limit:
            cur += piece
        else:
            lines.append(cur)
            cur = indent + '  ' + piece
    lines.append(cur)
    return lines


def persona_lines(facts):
    out = list(INTRO) + [''] + [FACTS_HEADER]
    out += [FACT_PREFIX + f for f in facts]
    out += [''] + [RULES_HEADER] + list(RULES)
    return out


def persona_block(indent, decl, tail, facts):
    out = [indent + BEGIN_P, indent + decl]
    for line in persona_lines(facts):
        out.append(indent + '  ' + js_quote(line) + ',')
    out.append(indent + "].join('\\n')" + tail)
    out.append(indent + END_P)
    return out


def kb_block(about):
    out = [BEGIN_KB, 'var KNOWLEDGE = [']
    for e in about:
        out.append('  /* %s */' % e['q'])
        out.append('  {')
        out += keywords_lines(e['keywords'], '    ')
        out.append('    answer: ' + js_quote(e['answer']))
        out.append('  },')
    out.append('];')
    out.append(END_KB)
    return out


def splice(text, begin, end, block, label):
    """把 begin/end 两行标记之间的内容（含标记）换成 block"""
    eol = '\r\n' if '\r\n' in text else '\n'
    lines = text.split(eol)
    bi = [i for i, l in enumerate(lines) if begin in l]
    ei = [i for i, l in enumerate(lines) if end in l]
    if len(bi) != 1 or len(ei) != 1:
        raise ValueError('%s：标记应各出现一次，实际 begin %d 处 / end %d 处' % (label, len(bi), len(ei)))
    if ei[0] <= bi[0]:
        raise ValueError('%s：end 标记在 begin 之前' % label)
    old = lines[bi[0]:ei[0] + 1]
    return eol.join(lines[:bi[0]] + block + lines[ei[0] + 1:]), old != block


def validate(d):
    if d.get('v') != 1:
        raise ValueError('persona.json 的 v 必须是 1')
    facts = d.get('facts')
    if not isinstance(facts, list) or not facts:
        raise ValueError('facts 必须是非空数组')
    for f in facts:
        if not isinstance(f, str) or not f.strip():
            raise ValueError('facts 里每一条都得是非空字符串：%r' % (f,))
        js_quote(f)      # 这里就把非法字符拦下来
    about = d.get('about')
    if not isinstance(about, list):
        raise ValueError('about 必须是数组')
    seen = {}
    for e in about:
        for k in ('q', 'keywords', 'answer'):
            if not e.get(k):
                raise ValueError('about 里每条都要有 %s：%r' % (k, e))
        if not isinstance(e['keywords'], list):
            raise ValueError('keywords 必须是数组：%s' % e['q'])
        if not e['answer'].strip():
            raise ValueError('answer 不能为空：%s' % e['q'])
        for kw in e['keywords']:
            js_quote(kw)
            seen.setdefault(kw.lower(), []).append(e['q'])
    # ⚠️ 只是提醒，不算错：知识库是「关键词包含匹配、先命中先用」
    dup = {k: v for k, v in seen.items() if len(v) > 1}
    if dup:
        print('⚠️ 有关键词同时出现在多条里（先命中先用）：')
        for k, v in sorted(dup.items()):
            print('   %s ← %s' % (k, ' / '.join(v)))
    n = sum(len(f) for f in facts)
    if n > 1200:
        print('⚠️ facts 共 %d 字，进提示词后每次请求都要带上（有缓存，但太长也不划算）' % n)


def main():
    check = '--check' in sys.argv
    try:
        data = json.loads(load_text(SRC))
        validate(data)
    except Exception as e:
        print('✗ 读 data/persona.json 失败：%s' % e)
        return 2

    facts, about = data['facts'], data['about']
    jobs = [
        (SCRIPT, 'persona:begin', 'persona:end', persona_block('  ', 'system: [', ',', facts),
         'script.js 的 system（本机 / 显式端点用）'),
        (SCRIPT, 'kb:begin', 'kb:end', kb_block(about),
         'script.js 的 KNOWLEDGE（离线兜底）'),
        (SERVER, 'persona:begin', 'persona:end', persona_block('', 'var PERSONA = [', ';', facts),
         'server.js 的 PERSONA（公网访客用）'),
    ]

    changed, drift = 0, 0
    for path, b, e, block, label in jobs:
        text = load_text(path)
        try:
            new_text, diff = splice(text, b, e, block, label)
        except ValueError as err:
            print('✗ %s' % err)
            return 2
        if diff:
            changed += 1
            if check:
                drift += 1
                print('  ✗  %s：与事实档不一致' % label)
            else:
                save_text(path, new_text)
                print('  ✎  %s：已更新' % label)
        else:
            print('  =  %s：已是最新' % label)

    if check:
        print('\n检查结果：%d 处需要更新（0 = 事实档与代码一致）' % drift)
        return 1 if drift else 0
    print('\n完成：更新 %d 处' % changed)
    return 0


if __name__ == '__main__':
    sys.exit(main())
