# -*- coding: utf-8 -*-
"""球体画廊的缩略图生成器（V2.7 续三十五）。

为什么要它：球体上的卡片实际只显示 150×200 CSS px，
直接喂 1280×1693 / 748 KB 的原图是纯浪费 —— 球体一屏要铺 24 张。

做法：**按 3:4 居中裁切**（球体卡片的比例），再缩到 --w × --h。
居中裁切和 CSS 的 `object-fit: cover` 是一致的 ⇒ 视觉上没有任何变化，只是文件小很多。

⚠️ 会自动处理 EXIF 方向（手机竖拍的照片多数靠 EXIF 标记方向，
   不处理的话缩略图会躺倒），并**丢弃 EXIF 元数据**（含 GPS 定位 —— 别把拍摄地发到网上）。

用法：
    python tools/make-thumbs.py images/1.jpg images/2.jpg ...      # 指定文件
    python tools/make-thumbs.py <目录>                             # 目录里所有图片
    python tools/make-thumbs.py <源...> --out images/sphere --w 360 --h 480 --q 82

输出文件名 = 源文件名（.jpg），落在 --out 目录里。
"""
import argparse
import io
import os
import sys

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit("!! 这个脚本需要 Pillow。托管版 Python 没装，用 Anaconda 那个：\n"
             '   & "C:/Users/wshix/anaconda3/python.exe" tools/make-thumbs.py ...')

EXTS = (".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff")
SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def cover(im, tw, th):
    """等比放大到能盖住目标框，再居中裁切 —— 等价于 CSS 的 object-fit: cover"""
    r = max(tw / im.width, th / im.height)
    w2, h2 = max(tw, int(round(im.width * r))), max(th, int(round(im.height * r)))
    im2 = im.resize((w2, h2), Image.LANCZOS)
    left = (w2 - tw) // 2
    top = (h2 - th) // 2
    return im2.crop((left, top, left + tw, top + th))


def trim_bottom(im, pct):
    """裁掉底部若干百分比 —— 用来去掉手机相机的「Live Moment / 相机参数」水印。
    ⚠️ 只裁底边，不动其它三边：手机水印一律贴在底部中间。"""
    if pct <= 0:
        return im
    keep = max(1, int(round(im.height * (1 - pct))))
    return im.crop((0, 0, im.width, keep))


def collect(paths):
    out = []
    for p in paths:
        if os.path.isdir(p):
            for f in sorted(os.listdir(p)):
                if f.lower().endswith(EXTS):
                    out.append(os.path.join(p, f))
        elif os.path.isfile(p):
            out.append(p)
        else:
            print("  ⚠️  跳过（找不到）：%s" % p)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src", nargs="+", help="源图片或目录")
    ap.add_argument("--out", default=os.path.join("images", "sphere"))
    ap.add_argument("--w", type=int, default=360)
    ap.add_argument("--h", type=int, default=480)
    ap.add_argument("--q", type=int, default=82)
    ap.add_argument("--trim-bottom", type=float, default=0.0,
                    help="裁掉底部百分之几（0.12 = 12%%），用于去掉手机相机水印")
    a = ap.parse_args()

    out_dir = a.out if os.path.isabs(a.out) else os.path.join(SITE, a.out)
    if not os.path.isdir(out_dir):
        os.makedirs(out_dir)

    files = collect(a.src)
    if not files:
        sys.exit("!! 没有找到可处理的图片")

    total_in = total_out = 0
    print("目标 %d×%d（3:4 居中裁切）· 质量 %d · 输出到 %s" % (a.w, a.h, a.q, a.out))
    if a.trim_bottom:
        print("⚠️  每张先裁掉底部 %.1f%%（去手机相机水印）" % (a.trim_bottom * 100))
    print("-" * 68)
    for p in files:
        in_kb = os.path.getsize(p) / 1024
        im = Image.open(p)
        im = ImageOps.exif_transpose(im)        # ⚠️ 先按 EXIF 摆正，否则竖拍会躺倒
        im = trim_bottom(im, a.trim_bottom)     # 再裁掉底部的水印条
        if im.mode not in ("RGB", "L"):
            im = im.convert("RGB")
        th = cover(im, a.w, a.h)
        name = os.path.splitext(os.path.basename(p))[0] + ".jpg"
        dst = os.path.join(out_dir, name)
        th.save(dst, "JPEG", quality=a.q, optimize=True, progressive=True)  # 不带 EXIF
        out_kb = os.path.getsize(dst) / 1024
        total_in += in_kb
        total_out += out_kb
        print("  %-22s %7.1f KB  ->  %-24s %6.1f KB" % (
            os.path.basename(p), in_kb, a.out.replace("\\", "/") + "/" + name, out_kb))
    print("-" * 68)
    print("合计 %.1f KB -> %.1f KB（省 %.0f%%）" % (
        total_in, total_out, (1 - total_out / total_in) * 100 if total_in else 0))
    print("⚠️ 缩略图不带 EXIF（含 GPS）—— 别把拍摄地发到网上")


if __name__ == "__main__":
    main()
