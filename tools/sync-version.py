#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sync-version.py —— 把「共 N 次提交」这类**易过时的数字**从 git 里读出来写回文档

【为什么要有它】
页面上的提交数今天已经手工改过 4 次（12 → 14 → 15 → 17 → 18 → 19）。
每提交一次它就过时一次——**靠人记迟早要错，那就让脚本去数**。

【它同步哪些地方】
  1. index.html  —— 项目条目里的「共 N 次提交」
  2. index.html  —— 上面那段注释里的「v2 分支 M 条 + main 分支 K 条」
  3. README.md   —— 「仓库与分支」表的 v2 行条数
  4. README.md   —— 「共 N 次提交」＝ v2 的 M 条 ＋ main 的 K 条
  5. PROJECT.md  ——「仓库分布与分支」表的 v2 行条数

【口径】N = v2 分支条数 + main 分支条数
  main（V1 线）在**另一个文件夹**里，脚本会顺路去读；读不到就用兜底常量——
  V1 已经冻结，条数不会再变。

【一个绕不开的自引用问题】**写进去的数字，必须把「正在准备的这一次提交」算进去。**
  因为数字描述的是「提交之后」的状态：不 +1 的话，提交完立刻就差 1。
  所以写入时默认 +1（工作区干净时会提醒你确认）；`--check` 按 git 真实条数比对，
  用于**提交之后**核对。

用法：
    python tools/sync-version.py           # 写入（把待提交的这一次也算上）
    python tools/sync-version.py --check   # 提交后核对；不一致就退出码 1
"""

import io
import os
import re
import subprocess
import sys

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARENT = os.path.dirname(SITE)
V1_FOLDER = os.path.join(PARENT, "MYPAGE")   # V1 线所在的文件夹（仓库外的同级目录）
V1_FALLBACK = 2                              # 读不到就用它——V1 已冻结

V2_BRANCH = "v2"
MAIN_BRANCH = "main"


def git(*args):
    try:
        r = subprocess.run(["git"] + list(args), cwd=SITE,
                           capture_output=True, timeout=30)
        if r.returncode != 0:
            return None
        return r.stdout.decode("utf-8", "replace").strip()
    except Exception:
        return None


def count_in_repo(repo, branch):
    try:
        r = subprocess.run(["git", "-C", repo, "rev-list", "--count", branch],
                           capture_output=True, timeout=30)
        if r.returncode != 0:
            return None
        return int(r.stdout.decode().strip())
    except Exception:
        return None


def counts():
    """v2 条数从本仓库读；main（V1 线）在隔壁文件夹，读不到就用兜底常量"""
    v2 = count_in_repo(SITE, V2_BRANCH)
    if v2 is None:
        v2 = git("rev-list", "--count", V2_BRANCH)
        v2 = int(v2) if v2 else 0
    main = count_in_repo(V1_FOLDER, MAIN_BRANCH)
    main_src = "读自 %s 文件夹" % os.path.basename(V1_FOLDER)
    if main is None:
        main, main_src = V1_FALLBACK, "兜底常量（读不到 V1 文件夹）"
    return v2, main, main_src


def counts_with_pending(check_only):
    """写入时把「正在准备的这一次提交」也算上——见文件头那个自引用问题。
    数字描述的是「提交之后」的状态，不 +1 的话提交完立刻就差 1。"""
    v2, main, src = counts()
    if check_only:
        return v2, main, src
    if git("status", "--porcelain") == "":
        print("  ⚠️  工作区是干净的，没有待提交内容。默认仍按 +1 算；")
        print("     如果你并不是准备提交，请改用 --check 核对。")
        print("")
    return v2 + 1, main, src


# 「截至 <日期>」那个日期取哪个值，两种模式不一样（2026-09-22 修）。
# ⚠️ 原来这条规则替换时用的是 m.group(2)（**文件里原来的日期**），
#    于是提交数一直涨、日期钉死在 2026-09-17 ⇒ 那行成了假话
#    （「截至 2026-09-17 共 62 次」——9-17 那天根本不是 62 次）。
_MODE = {"check": False}
_DATE_CACHE = {}


def today_iso():
    import datetime
    return datetime.date.today().isoformat()


def stamp_date():
    """写入时用**今天**（= 这一次待提交的提交日期）；--check 时用**最后一次提交的日期**。

    两种模式取值不同是刻意的：
      · 写入发生在提交**之前** ⇒ 今天才是这次提交的日期
      · 核对发生在提交**之后** ⇒ 那时 HEAD 的日期就是它
    两边都用 today() 的话，第二天再核对就会假报「不一致」；
    两边都用 HEAD 的话，写入时会把上一次提交的日期写进去。
    """
    if not _MODE["check"]:
        return today_iso()
    if "d" not in _DATE_CACHE:
        _DATE_CACHE["d"] = git("log", "-1", "--format=%cs") or "unknown"
    return _DATE_CACHE["d"]


# (文件名, 说明, 正则, 替换用的组)
RULES = [
    # ⚠️ 这一条的正则跟的是**页面上那句中文**（V2.7 续三十整站中文化时同步改的）。
    #    原来是 `· NN commits as of`，中文换成 `· 截至 <日期> 共 NN 次提交` ——
    #    正则不改的话，这句就再也匹配不上，提交数会停在旧值上变假。
    ("index.html", "项目条目的提交数",
     r"(· 截至 )(\d{4}-\d{2}-\d{2})( 共 )(\d+)( 次提交)",
     lambda m, v2, mn: (m.group(1) + stamp_date() + m.group(3)
                        + str(v2 + mn) + m.group(5))),

    ("index.html", "注释里的分支条数",
     r"(v2 分支 )(\d+)( 条 \+ main 分支 )(\d+)( 条)",
     lambda m, v2, mn: m.group(1) + str(v2) + m.group(3) + str(mn) + m.group(5)),

    ("README.md", "分支表 v2 行",
     r"^(\| `v2` \|[^\n|]*\| )(\d+)( \|\s*)$",
     lambda m, v2, mn: m.group(1) + str(v2) + m.group(3)),

    ("README.md", "「共 N 次提交」说明",
     r"(「共 )(\d+)( 次提交」＝ `v2` 的 )(\d+)( 条 ＋ `main` 的 )(\d+)( 条)",
     lambda m, v2, mn: (m.group(1) + str(v2 + mn) + m.group(3)
                        + str(v2) + m.group(5) + str(mn) + m.group(7))),

    ("PROJECT.md", "「仓库分布与分支」表的 v2 行",
     r"^(\| `github\.com/TaiVerdus/mypage` \| \*\*`v2`\*\*.*\| )(\d+)( \|\s*)$",
     lambda m, v2, mn: m.group(1) + str(v2) + m.group(3)),
]


def main():
    check_only = "--check" in sys.argv
    _MODE["check"] = check_only          # ⚠️ 必须在套用 RULES 之前设好：日期取哪个值取决于它
    v2c, mc, src = counts_with_pending(check_only)
    total = v2c + mc

    print("口径：v2 分支 %d 条%s + main 分支 %d 条 = 共 %d 次提交"
          % (v2c, "" if check_only else "（含正在准备的这一次）", mc, total))
    print("      main 条数来源：%s" % src)
    print("")

    changed = 0
    missing = 0
    for fname, label, pattern, repl in RULES:
        path = os.path.join(SITE, fname)
        if not os.path.exists(path):
            print("  !! 找不到文件 %s" % fname)
            missing += 1
            continue
        text = io.open(path, encoding="utf-8").read()
        new_text, n = re.subn(pattern, lambda m: repl(m, v2c, mc), text,
                              flags=re.M)
        if n == 0:
            print("  ?? %-32s 没匹配到 —— 是不是被改写过？" % label)
            missing += 1
            continue
        if new_text == text:
            print("  =  %-32s 已是最新" % label)
        else:
            changed += 1
            print("  ✎  %-32s 已更新（%d 处）" % (label, n))
            if not check_only:
                io.open(path, "w", encoding="utf-8", newline="\n").write(new_text)

    print("")
    if check_only:
        bad = changed + missing
        print("检查结果：%d 处需要更新 / %d 处没匹配上" % (changed, missing))
        return 1 if bad else 0
    print("完成：更新 %d 处，未匹配 %d 处" % (changed, missing))
    return 0


if __name__ == "__main__":
    sys.exit(main())
