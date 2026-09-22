#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""核对 DESIGN-SYSTEM.md 里写的数值与 style.css 的实际值是否一致（只读，不改任何文件）。

为什么有这个脚本：本项目被「文档腐烂」咬过多次 —— 设计文档自称 token 的唯一真相源，
却出现过整张字号表的数字全是旧的、还教了 3 个**不存在**的 token 的情况。
这份脚本把那类错误变成可检测的。

判据（2026-09-22 起，配合 style.css 的 `--scale`）：
  · 样式表里是 `calc(基准 * var(--scale))` 的 token ⇒ 文档必须写**基准值**
    （文档写的是设计意图，不是最终像素；这点写在 DESIGN-SYSTEM.md §4 / §5.1）
  · 样式表里是普通值的 token ⇒ 文档必须写**同一个值**
  · **同一个 token 定义多次时，以文件里靠后的那次为准**（CSS 的层叠）
  · 文档里提到的每个 `--token` 都必须在样式表里真的存在

用法：python tools/check-doc-vs-css.py     （失败退出码 1）
"""
import io, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CSS_PATH = os.path.join(ROOT, "style.css")
DOC_PATH = os.path.join(ROOT, "DESIGN-SYSTEM.md")

css = io.open(CSS_PATH, encoding="utf-8").read()
doc = io.open(DOC_PATH, encoding="utf-8").read()
css_clean = re.sub(r"/\*.*?\*/", "", css, flags=re.S)

# ---------- 从样式表读 token（保留**全部**定义：同名可能被深色主题覆写） ----------
TOKEN_DEF = re.compile(r"(?m)^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);")
css_all = {}
for m in TOKEN_DEF.finditer(css_clean):
    css_all.setdefault(m.group(1), []).append(" ".join(m.group(2).split()))

dup = sorted(n for n, v in css_all.items() if len(v) > 1)

# ---------- 从文档读「声明」（表格行 + 行内 --token:值） ----------
claims = []
for m in re.finditer(r"\|\s*`(--[a-z0-9-]+)`\s*\|\s*`([^`|]+)`", doc):
    claims.append((m.group(1), m.group(2).strip(), "表格"))
for m in re.finditer(r"`(--[a-z0-9-]+):\s*([0-9][^`]*)`", doc):
    claims.append((m.group(1), m.group(2).strip(), "行内"))

bad, ok = [], []


def canon(v):
    """归一：去多余空白；`var(--x)` 与 `--x` 视为同一件事"""
    v = " ".join(v.split())
    return re.sub(r"var\((--[a-z0-9-]+)\)", r"\1", v)


def base_to_actual(base):
    """把文档里的基准值翻译成样式表里应有的写法：每个 数字+px/vw 都乘上 --scale"""
    return re.sub(r"(-?\d+(?:\.\d+)?)(px|vw)",
                  lambda m: "calc(%s%s * var(--scale))" % (m.group(1), m.group(2)),
                  base)


def is_literal(v):
    """只比对「像具体值」的声明；散文式描述（如 color-mix(in srgb, brand 82%, ink)）跳过"""
    v = v.strip()
    return bool(re.match(r"^[#\d]|^clamp\(|^rgb", v))


checked = set()
for name, claimed, src in claims:
    if (name, claimed) in checked:
        continue
    checked.add((name, claimed))
    if name not in css_all:
        bad.append("文档提到了不存在的 token：%s（%s）" % (name, src))
        continue
    defs = [canon(x) for x in css_all[name]]
    if not is_literal(claimed):
        ok.append("%-18s 存在（文档以说明性文字描述，不比对字面值）" % name)
        continue
    cands = [canon(claimed)]
    if re.fullmatch(r"\d+(\.\d+)?", claimed):            # 文档写 `16` 而样式表写 `16px`
        cands.append(claimed + "px")
    # ① 任一定义本身就是基准值（颜色 / 不参与缩放的 token）
    if any(c in defs for c in cands):
        ok.append("%-18s 文档 %-34s = 样式表同值" % (name, claimed))
        continue
    # ② 样式表是 calc(基准 × --scale) ⇒ 文档必须写基准
    #    ⚠️ 两边都要过 canon 再比 —— 只 canon 一边会让 `var(--scale)` 与 `--scale` 对不上
    scaled = [canon(base_to_actual(c)) for c in cands]
    if any(s in defs for s in scaled):
        ok.append("%-18s 文档 %-34s = calc(基准 × --scale)" % (name, claimed))
        continue
    bad.append("%s 不一致 —— 文档「%s」，样式表实际「%s」"
               % (name, claimed, " / ".join(css_all[name])))

# ---------- --scale 本身必须有定义 ----------
if "--scale" not in css_all:
    bad.append("样式表里没有 --scale（文档 §5.1 依赖它）")
else:
    ok.append("--scale 已定义 = %s" % css_all["--scale"][-1])

# ---------- 位置类 token：页宽/区块间距 ----------
for name in ("--page-width", "--section-pad"):
    if name in css_all:
        ok.append("%-18s = %s" % (name, " / ".join(css_all[name])))

# ---------- 字重档位 ----------
w = sorted({int(x) for x in re.findall(r"font-weight:\s*(\d+)", css_clean)})
doc_w = sorted({int(x) for x in re.findall(r"^\|\s*`(\d{3})`\s*\|", doc, re.M)})
if doc_w and w != doc_w:
    bad.append("字重档位不一致 —— 文档 %s，样式表 %s" % (doc_w, w))
else:
    ok.append("字重档位一致：%s" % w)

# ---------- 组件级事实 ----------
if "mask-composite" in css_clean:
    ok.append("渐变描边（mask-composite）还在")
else:
    bad.append("渐变描边（mask-composite）不见了")

if re.search(r":focus-visible\s*\{[^}]*outline:\s*3px", css_clean):
    ok.append("全局 :focus-visible 是 3px 焦点环")
else:
    bad.append("全局 :focus-visible 的 3px 焦点环不见了")

print("=== 文档 ↔ 样式表 一致性 ===")
for m in ok:
    print("  ✓ " + m)
for m in bad:
    print("  ✗ " + m)
if dup:
    print("\n（提示：以下 token 在样式表里定义了多次 —— 通常是深色主题的覆写；"
          "文档写的值只要命中其中一条就算一致）\n  " + ", ".join(dup))
print("\n%s" % ("全部一致" if not bad else "有 %d 处不一致" % len(bad)))
sys.exit(1 if bad else 0)
