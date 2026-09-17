#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
make-ambient-loop.py —— 用纯数学合成一段可无缝循环的环境音（主页 BGM）

【为什么是「合成」而不是「找一首歌」或「AI 生成」】
  · 找一首歌：版权不明，主页上不能用（V2 课件 Part 7：Free ≠ Copyright Free）
  · 用 AI 音乐服务：需要第三方账号 / API key，版权归属看平台条款，页面上还必须署名
  · 自己录音（打鼓）：最好，但需要用户提供素材
  · **本脚本**：零采样、纯数学生成 → 版权干净；只用 Python 标准库 → 谁都能重跑

【编制】五层，按音量从大到小：
  1. 垫 pad      —— 四音和弦，缓慢起伏。底层和声
  2. 低音 bass   —— 每和弦根音，低八度，另带一个中音区八度让笔记本小喇叭也听得见
  3. 木琴 mallet —— 稀疏的琶音，快起音 + 指数衰减。**这一层让它成为「音乐」而不是「嗡」**
  4. 微光 shimmer—— 高音区零星几声铃，很轻。细节与空间
  5. 空气 air    —— 极轻的滤波噪声，缓慢起伏。不是乐器，但少了它整段会发干
  和弦进行 Am7 → Fmaj7 → Cmaj7 → G7：最后的 G7 天然想回到 Am7，所以循环接得上。

【无缝循环怎么做到的】
  · 每一层的声音尾巴都对缓冲区长度取模、绕回开头
  · 缓慢起伏用的 LFO 频率取整周期（24 秒里正好 2 个周期），循环点上相位也对得上
  · 噪声层用**环形滑动平均**滤波，没有滤波器状态残留 → 首尾天然连贯
  实测「首尾样本落差 ÷ 相邻样本平均落差 ≈ 1」，听不出接缝

用法：
    python tools/make-ambient-loop.py
    python tools/make-ambient-loop.py <输出 wav 路径>
"""

import array
import math
import os
import random
import sys
import time
import wave

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_OUT = os.path.join(SITE, "audio", "ambient-loop.wav")

SR = 16000          # 采样率。氛围音乐能量集中在低中频，Nyquist 8kHz 够用，
                    # 而且 16kHz 让文件只有 44.1kHz 的 1/3
DURATION = 24.0     # 秒。太短听得出重复，太长文件就大——24 秒是个平衡点
N = int(round(SR * DURATION))
LAST = N - 1
TWO_PI = 2.0 * math.pi

# 和弦进行（Hz）：Am7 → Fmaj7 → Cmaj7 → G7
CHORDS = [
    [110.00, 164.81, 261.63, 392.00],   # Am7
    [ 87.31, 130.81, 220.00, 329.63],   # Fmaj7
    [130.81, 196.00, 329.63, 493.88],   # Cmaj7
    [ 98.00, 146.83, 246.94, 349.23],   # G7
]
CHORD_LEN = DURATION / len(CHORDS)      # 每个和弦 6 秒

# ---- 各层参数 ----
PAD_ATTACK, PAD_RELEASE = 2.6, 3.4
PAD_GAIN = 0.62
PAD_VOICES = [                          # (频率倍数, 振幅, 失谐比例)
    (1.0, 1.00, 0.0000),
    (1.0, 0.62, 0.0016),                # 轻微失谐的两路 → 合唱般的厚度
    (2.0, 0.26, 0.0008),
    (3.0, 0.10, 0.0000),
]

# (sub, mid) 两路：sub 给大音箱厚度，mid 让手机/笔记本的小喇叭也听得见
BASS = [(55.00, 110.00), (43.65, 87.31), (65.41, 130.81), (49.00, 98.00)]
BASS_SUB_AMP, BASS_MID_AMP = 0.55, 0.30
BASS_ATTACK, BASS_RELEASE = 1.8, 2.6

# 木琴/八音盒音色：(频率倍数, 振幅, 衰减倍率)——衰减倍率越大，高次泛音掉得越快
MALLET_PARTIALS = [(1.0, 1.00, 1.0), (2.0, 0.34, 1.7), (3.01, 0.16, 2.4), (4.98, 0.08, 3.2)]
MALLET_GAIN = 0.30
MALLET_DECAY = 1.9

# 铃声音色：非谐分音（2.76 / 5.4 是钟的特征比例）
SHIMMER_PARTIALS = [(1.0, 1.00, 1.0), (2.76, 0.46, 1.6), (5.40, 0.20, 2.2)]
SHIMMER_GAIN = 0.16
SHIMMER_DECAY = 3.4

AIR_GAIN = 0.055        # 噪声层：不能多，多了就是「电流声」
AIR_WINDOW = 25         # 环形滑动平均窗长（≈ 640Hz 截止）
AIR_LFO_CYCLES = 2      # 24 秒里正好 2 个周期——必须取整，否则循环点会断
AIR_SEED = 20260917     # 固定随机种子 → 每次生成结果一致（可复现）

# 琶音谱：每和弦一组 (起始秒, 频率, 振幅)。刻意做成不均匀节奏，避免机械感
MALLET_NOTES = [
    [(0.0, 329.63, 1.00), (1.7, 440.00, 0.85), (3.4, 523.25, 0.75), (4.6, 392.00, 0.60)],
    [(0.3, 349.23, 0.95), (2.1, 440.00, 0.80), (3.9, 659.26, 0.62), (5.1, 261.63, 0.55)],
    [(0.0, 392.00, 0.90), (1.4, 523.25, 0.78), (2.8, 659.26, 0.70), (4.2, 493.88, 0.72),
     (5.4, 329.63, 0.50)],
    [(0.6, 293.66, 0.92), (2.2, 392.00, 0.82), (3.6, 493.88, 0.70), (5.0, 349.23, 0.60)],
]

# 微光：整段只响两声，多了就不「微」了
SHIMMER_NOTES = [(0, 2.6, 1318.51, 1.00), (2, 1.0, 1046.50, 0.85)]

# ---- 混音平衡：按目标 RMS 自动配平，不靠手调常数 ----
# 第一版是手写的各层增益，结果垫层 RMS 0.956、木琴只有 0.138（差 17dB），
# 乐器全被埋掉 —— 等于"加了伴奏"但听不见。改成显式给每层定目标 RMS，
# 由脚本算出增益。这样混音是「设计出来的」，而且可测量、可复现。
MIX_TARGET = [
    ("垫 pad",      0.50),   # 底层和声，最厚
    ("低音 bass",   0.36),
    ("木琴 mallet", 0.30),   # 旋律层，必须听得清
    ("微光 shimmer", 0.11),
    ("空气 air",    0.022),  # 只做空间感，不能听到"嘶"
]


def add_at(buf, n, v):
    """加样本，越界就绕回开头 —— 无缝循环的关键就是这一句"""
    if n > LAST:
        buf[n - N] += v
    else:
        buf[n] += v


def smoothstep(a):
    return a * a * (3.0 - 2.0 * a)


def held_env(t, span, attack, release):
    """持续音（垫 / 低音）用的包络：缓入 + 长衰减"""
    e = smoothstep(t / attack) if t < attack else 1.0
    if span - t < release:
        r = max(span - t, 0.0) / release
        e *= r * r
    return e


# ---------------------------------------------------------------- 1. 垫

def pad():
    buf = [0.0] * N
    span = CHORD_LEN + PAD_RELEASE
    nyq = SR / 2.0
    for ci, chord in enumerate(CHORDS):
        n0 = int(round(ci * CHORD_LEN * SR))
        n1 = int(round((ci * CHORD_LEN + span) * SR))
        for f0 in chord:
            for mult, amp, det in PAD_VOICES:
                f = f0 * mult * (1.0 + det)
                if f >= nyq - 150:
                    continue
                w = TWO_PI * f / SR
                ph = 0.0
                for n in range(n0, n1):
                    e = held_env((n - n0) / SR, span, PAD_ATTACK, PAD_RELEASE)
                    if e > 0.0:
                        add_at(buf, n, math.sin(ph) * amp * e * PAD_GAIN)
                    ph += w
    return buf


# ---------------------------------------------------------------- 2. 低音

def bass():
    buf = [0.0] * N
    span = CHORD_LEN + BASS_RELEASE
    for ci, (sub, mid) in enumerate(BASS):
        n0 = int(round(ci * CHORD_LEN * SR))
        n1 = int(round((ci * CHORD_LEN + span) * SR))
        for f, amp in ((sub, BASS_SUB_AMP), (mid, BASS_MID_AMP)):
            w = TWO_PI * f / SR
            ph = 0.0
            for n in range(n0, n1):
                e = held_env((n - n0) / SR, span, BASS_ATTACK, BASS_RELEASE)
                if e > 0.0:
                    add_at(buf, n, math.sin(ph) * amp * e)
                ph += w
    return buf


# ---------------------------------------------------------------- 3. 木琴 / 4. 微光

def struck(buf, t0, freq, amp, partials, decay, gain, attack):
    """敲击类音色：极快起音 + 指数衰减，高次泛音衰减更快"""
    nyq = SR / 2.0
    tail = min(decay * 4.5, 9.0)
    n0 = int(round(t0 * SR))
    n1 = int(round((t0 + tail) * SR))
    for mult, pamp, dratio in partials:
        f = freq * mult
        if f >= nyq - 150:
            continue
        w = TWO_PI * f / SR
        d = decay / dratio
        ph = 0.0
        for n in range(n0, n1):
            t = (n - n0) / SR
            e = min(1.0, t / attack) * math.exp(-t / d)
            if e < 0.0008:
                ph += w
                continue
            add_at(buf, n, math.sin(ph) * pamp * amp * e * gain)
            ph += w


def mallet():
    buf = [0.0] * N
    for ci, events in enumerate(MALLET_NOTES):
        base = ci * CHORD_LEN
        for off, f, amp in events:
            struck(buf, base + off, f, amp, MALLET_PARTIALS, MALLET_DECAY,
                   MALLET_GAIN, 0.006)
    return buf


def shimmer():
    buf = [0.0] * N
    for ci, off, f, amp in SHIMMER_NOTES:
        struck(buf, ci * CHORD_LEN + off, f, amp, SHIMMER_PARTIALS,
               SHIMMER_DECAY, SHIMMER_GAIN, 0.010)
    return buf


# ---------------------------------------------------------------- 5. 空气

def air():
    rnd = random.Random(AIR_SEED)
    noise = [rnd.uniform(-1.0, 1.0) for _ in range(N)]
    out = [0.0] * N
    # 环形滑动平均：没有滤波器状态，所以首尾天然接得上
    s = 0.0
    for k in range(AIR_WINDOW):
        s += noise[k % N]
    for i in range(N):
        out[i] = s / AIR_WINDOW
        s += noise[(i + AIR_WINDOW) % N] - noise[i % N]
    # 缓慢起伏：频率取整周期，循环点上相位也对得上
    w = TWO_PI * AIR_LFO_CYCLES / DURATION
    for i in range(N):
        out[i] *= (0.45 + 0.55 * math.sin(w * i / SR)) * AIR_GAIN
    return out


# ---------------------------------------------------------------- 混音

def rms(b):
    return math.sqrt(sum(x * x for x in b) / len(b))


def delay(buf):
    """反馈延迟。多跑 2.5 个延迟长度，把尾巴折回开头，循环点才不会有断口"""
    d = max(2, int(round(0.31 * SR)))
    extra = int(round(2.5 * d))
    line = [0.0] * d
    acc = [0.0] * N
    for n in range(N + extra):
        src = buf[n] if n < N else 0.0
        dl = line[n % d]
        line[n % d] = src + dl * 0.36
        acc[n % N] += src + dl * 0.30
    return acc


def normalize(buf, target=0.86):
    """只做峰值归一化，**不加饱和**。
    第一版用过 tanh 软限幅，结果 RMS/峰值 = 0.59（波峰因数只剩 4.6dB）——
    多个音叠加后峰值被压平，等于把整段重饱和，听感会发毛发硬。
    正弦类内容本来就不该削顶：归一化是无损的，饱和不是。"""
    peak = max(abs(x) for x in buf) or 1.0
    g = target / peak
    return [x * g for x in buf]


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUT
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    t0 = time.time()
    raw = [pad(), bass(), mallet(), shimmer(), air()]
    print("  五层渲染完成 %.1fs" % (time.time() - t0))

    # 按目标 RMS 配平各层 —— 混音平衡要能测量，不能靠猜
    print("  各层配平（目标 -> 实际）：")
    layers = []
    for (name, target), b in zip(MIX_TARGET, raw):
        before = rms(b) or 1.0
        b = [x * (target / before) for x in b]
        print("    %-14s %.4f -> %.4f" % (name, before, rms(b)))
        layers.append(b)

    buf = [0.0] * N
    for b in layers:
        for i in range(N):
            buf[i] += b[i]
    print("  混音 RMS %.4f" % rms(buf))

    acc = delay(normalize(buf, 0.70))
    acc = normalize(acc, 0.86)
    print("  处理后 RMS %.4f / 峰值 %.3f" % (rms(acc), max(abs(x) for x in acc)))

    data = array.array("h", (int(max(-1.0, min(1.0, x)) * 32767) for x in acc))
    with wave.open(out_path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())

    print("  已生成: %s" % out_path)
    print("  时长 %.1fs / %dHz / 单声道 16bit / %.1f KB"
          % (DURATION, SR, os.path.getsize(out_path) / 1024.0))


if __name__ == "__main__":
    main()
