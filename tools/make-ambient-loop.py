#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
make-ambient-loop.py —— 用纯数学合成一段可无缝循环的环境音垫（主页 BGM）

【为什么是「合成」而不是「找一首歌」或「AI 生成」】
  · 找一首歌：版权不明，主页上不能用（V2 课件 Part 7：Free ≠ Copyright Free）
  · 用 AI 音乐服务：需要第三方账号 / API key，且版权归属要看平台条款，
    页面上还必须署名「AI 生成」——跟本站「未使用需要署名或付费的第三方素材」的口径冲突
  · 自己录音（打鼓）：最好，但需要用户提供素材
  · **本脚本**：零采样、纯数学生成 → 版权干净；只用 Python 标准库 → 谁都能重跑

【它是什么】一层安静的**氛围垫**（slow ambient pad）：四个和弦缓慢循环，
  没有鼓点、没有旋律、没有明显节拍。适合当背景，不适合当「一首歌」。
  和弦进行 Am7 → Fmaj7 → Cmaj7 → G7：最后那个 G7 天然想回到 Am7，所以循环接得上。

【无缝循环怎么做到的】渲染时所有声音的尾巴都「绕回开头」（对缓冲区长度取模），
  延迟/混响同样多跑一段再把尾巴折回开头。所以循环点没有咔哒声，也没有突然的静音。

用法：
    python tools/make-ambient-loop.py
    python tools/make-ambient-loop.py <输出 wav 路径>
"""

import array
import io
import math
import os
import struct
import sys
import time
import wave

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_OUT = os.path.join(SITE, "audio", "ambient-loop.wav")

SR = 16000          # 采样率。氛围垫能量集中在低频，Nyquist 8kHz 足够，
                    # 而且 16kHz 让文件体积只有 44.1kHz 的 1/3
DURATION = 24.0     # 秒。太短会听出重复，太长文件就大——24 秒是个平衡点
N = int(round(SR * DURATION))

# 和弦进行（Hz）。Am7 → Fmaj7 → Cmaj7 → G7
CHORDS = [
    [110.00, 164.81, 261.63, 392.00],   # Am7
    [ 87.31, 130.81, 220.00, 329.63],   # Fmaj7
    [130.81, 196.00, 329.63, 493.88],   # Cmaj7
    [ 98.00, 146.83, 246.94, 349.23],   # G7
]
CHORD_LEN = DURATION / len(CHORDS)      # 每个和弦 6 秒
ATTACK, RELEASE = 2.6, 3.4              # 起音慢、收音长 → 弦垫感，不会「一下一下」

# (频率倍数, 振幅, 失谐比例)
# 两路略微失谐的基频叠一起 = 合唱般的厚度；泛音递减 = 柔和的音色
VOICES = [
    (1.0, 1.00, 0.0000),
    (1.0, 0.62, 0.0016),
    (2.0, 0.26, 0.0008),
    (3.0, 0.10, 0.0000),
]

DELAY_S, DELAY_FB, DELAY_MIX = 0.31, 0.36, 0.30   # 简单反馈延迟，给一点空间感
PEAK = 0.86                                        # 归一化目标峰值，留足余量


def smoothstep(a):
    return a * a * (3.0 - 2.0 * a)


def envelope(t, span):
    """只用缓入 + 长衰减两段，够用且自然"""
    if t < ATTACK:
        return smoothstep(t / ATTACK)
    rel = span - t
    if rel < RELEASE:
        r = max(rel, 0.0) / RELEASE
        return r * r
    return 1.0


def render_voices():
    """把 16 个音 × 4 路叠加进缓冲区。所有尾巴对 N 取模 → 绕回开头"""
    buf = [0.0] * N
    nyq = SR / 2.0
    span = CHORD_LEN + RELEASE          # 尾巴跨过下一个和弦，形成交叠
    last = N - 1

    for ci, chord in enumerate(CHORDS):
        n0 = int(round(ci * CHORD_LEN * SR))
        n1 = int(round((ci * CHORD_LEN + span) * SR))
        for f0 in chord:
            for mult, amp, det in VOICES:
                f = f0 * mult * (1.0 + det)
                if f >= nyq - 150:       # 越过 Nyquist 的泛音直接跳过，避免混叠出怪声
                    continue
                w = 2.0 * math.pi * f / SR
                ph = 0.0
                for n in range(n0, n1):
                    e = envelope((n - n0) / SR, span)
                    if e > 0.0:
                        v = math.sin(ph) * amp * e
                        if n > last:
                            buf[n - N] += v      # 尾巴绕回开头
                        else:
                            buf[n] += v
                    ph += w
    return buf


def add_delay(buf):
    """反馈延迟。多跑 2.5 个延迟长度，把尾巴折回开头，循环点才不会有断口"""
    d = max(2, int(round(DELAY_S * SR)))
    extra = int(round(2.5 * d))
    line = [0.0] * d
    acc = [0.0] * N
    for n in range(N + extra):
        src = buf[n] if n < N else 0.0
        dl = line[n % d]
        line[n % d] = src + dl * DELAY_FB
        acc[n % N] += src + dl * DELAY_MIX
    return acc


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUT
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    t0 = time.time()
    buf = render_voices()
    print("  音源渲染完成 %.1fs" % (time.time() - t0))

    buf = add_delay(buf)
    print("  延迟/空间处理完成 %.1fs" % (time.time() - t0))

    # 只做归一化，**不加饱和**。
    # 第一版用了 tanh 软限幅，结果 RMS/峰值 = 0.59（波峰因数只有 4.6 dB）——
    # 16 个音叠加后峰值被压平，等于把整个垫子重饱和了，听感会发毛发硬。
    # 正弦垫本来就不该削顶：直接按峰值归一化，动态原样保留。
    peak = max(abs(x) for x in buf) or 1.0
    gain = PEAK / peak
    buf = [x * gain for x in buf]

    data = array.array("h", (int(max(-1.0, min(1.0, x)) * 32767) for x in buf))

    with wave.open(out_path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())

    rms = math.sqrt(sum(x * x for x in buf) / len(buf))
    size = os.path.getsize(out_path)
    print("  已生成: %s" % out_path)
    print("  时长 %.1fs / 采样率 %dHz / 单声道 16bit" % (DURATION, SR))
    print("  峰值 %.3f / RMS %.4f / 体积 %.1f KB"
          % (max(abs(x) for x in buf), rms, size / 1024.0))


if __name__ == "__main__":
    main()
