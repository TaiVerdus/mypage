#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""本地联调桩：一个最小的 OpenAI 兼容端点（**只用标准库，零依赖**）。

用途有两个：

1. **在没有真模型的时候，验证页面「换大脑」那条链路能不能通** ——
   尤其是三个必踩的坑里最前面那个：**CORS**。页面可能是用 `file://` 直接打开的
   （这时 origin 是 `null`），服务端不放行跨域就永远连不上、只会一直显示「离线版回答」。
   这个桩把「放行跨域」这件事做对了，可以当参考。

2. **验证降级路径**：`--fail` / `--delay` 两个开关能人为把后端弄坏，
   用来在真实浏览器里看着「离线版回答」标记是不是按预期出现、断路器是不是跳闸。

用法：
    python tools/openai-stub.py                  # 正常回答
    python tools/openai-stub.py --delay 12       # 每次慢 12 秒（验超时降级）
    python tools/openai-stub.py --fail 500       # 永远 500（验降级 + 跳闸）
    python tools/openai-stub.py --port 8005      # 换端口（默认就是 8005）

然后临时把页面指向它（不改文件、不会被提交）：
    index.html?chat=http://127.0.0.1:8005/v1/chat/completions

⚠️ 这是**开发工具**，不是站点的一部分。真后台就绪后它就没用了，
   但建议留着 —— 改页面交互时可以拿它当稳定的假后端。
"""

import argparse
import json
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ARGS = None


class Handler(BaseHTTPRequestHandler):
    server_version = "openai-stub/0.1"
    protocol_version = "HTTP/1.1"

    # ---- CORS：这是这个桩存在的主要理由 ----
    def _cors(self):
        # ⚠️ `*` 是为了让 `file://` 打开的页面（origin 为 null）也连得上。
        #    真服务如果用凭据（cookie）就不能用 `*`，得回显具体 origin ——
        #    本站不用凭据，所以 `*` 足够。
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS, GET")
        self.send_header("Access-Control-Max-Age", "600")

    def _send(self, code, payload=None):
        body = b"" if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self._cors()
        if payload is not None:
            self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if body:
            self.wfile.write(body)

    def do_OPTIONS(self):
        # 预检请求：浏览器发真请求之前先问一句「你让不让我跨域」
        self._send(204)

    def do_GET(self):
        # 给个健康检查，方便在浏览器里直接看一眼「服务还活着吗」
        self._send(200, {"status": "ok", "role": "openai-stub",
                         "note": "把 /v1/chat/completions 加到 CHAT_BACKEND.url 上"})

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(n) if n else b"{}"

        if ARGS.delay:
            time.sleep(ARGS.delay)

        if ARGS.fail:
            self._send(ARGS.fail, {"error": {"message": "stub: 故意失败 %d" % ARGS.fail}})
            return

        try:
            req = json.loads(raw.decode("utf-8") or "{}")
        except Exception:
            self._send(400, {"error": {"message": "读不懂请求体"}})
            return

        msgs = req.get("messages") or []
        question = ""
        for m in reversed(msgs):
            if m.get("role") == "user":
                question = m.get("content") or ""
                break

        text = ("【联调桩】收到「%s」。我是本地假服务，不是微调分身 —— "
                "但这条链路（页面 → HTTP → OpenAI 兼容接口）是通的。" % question)

        self._send(200, {
            "id": "chatcmpl-stub",
            "object": "chat.completion",
            "model": req.get("model") or "gpt-3.5-turbo",
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": text},
                "finish_reason": "stop",
            }],
            "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
        })

    def log_message(self, fmt, *a):
        sys.stdout.write("  %s %s\n" % (self.command, self.path))
        sys.stdout.flush()


def main():
    global ARGS
    ap = argparse.ArgumentParser(description="最小 OpenAI 兼容端点（联调用）")
    ap.add_argument("--port", type=int, default=8005, help="监听端口（默认 8005，与 WeClone 一致）")
    ap.add_argument("--host", default="127.0.0.1", help="监听地址（默认只监听本机）")
    ap.add_argument("--delay", type=float, default=0, help="每次回答前先睡几秒（验超时降级）")
    ap.add_argument("--fail", type=int, default=0, help="永远返回这个 HTTP 状态码（验降级 + 跳闸）")
    ARGS = ap.parse_args()

    srv = ThreadingHTTPServer((ARGS.host, ARGS.port), Handler)
    base = "http://%s:%d" % (ARGS.host, ARGS.port)
    print("联调桩已启动：%s" % base)
    print("  把它接到页面上：index.html?chat=%s/v1/chat/completions" % base)
    if ARGS.delay:
        print("  ⚠️ 每次回答会慢 %.1f 秒（用来验证「超时落回知识库」）" % ARGS.delay)
    if ARGS.fail:
        print("  ⚠️ 永远返回 HTTP %d（用来验证「降级 + 断路器跳闸」）" % ARGS.fail)
    print("  Ctrl+C 停止")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止。")


if __name__ == "__main__":
    main()
