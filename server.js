#!/usr/bin/env node
/**
 * MYPAGE · 数字分身的云端大脑（一个文件，干两件事）
 *
 *   ① 托管静态页面            GET /  /style.css  /script.js  /images/…
 *   ② 转发聊天请求            POST /api/chat  →  DeepSeek 官方 API
 *
 * ── 为什么要有这一层（而不是让页面直接调 DeepSeek）────────────────────
 *   页面是**纯静态公开**的。任何写进 script.js 的 API key，任何人按 F12
 *   或看一眼网络请求就抄走了，然后拿你的额度当自己的用。
 *   ⇒ key 只能放在服务端（这里，从环境变量读），浏览器永远看不到它。
 *
 *   顺手还在服务端**锁死了人设**：即使有人绕过你的页面、直接打这个地址，
 *   他能得到的也只有「王释贤的数字分身」—— 不能拿它当通用 ChatGPT 刷。
 *
 * ── 用法 ────────────────────────────────────────────────────────────
 *   DEEPSEEK_API_KEY=sk-xxx node server.js              # 默认 8080 端口
 *   PORT=9000 DEEPSEEK_API_KEY=sk-xxx node server.js
 *
 *   本地先跑通（不用真 key，指到一个假上游即可）：
 *   DEEPSEEK_BASE=http://127.0.0.1:8005 DEEPSEEK_API_KEY=test node server.js
 *
 * ── 环境变量一览 ─────────────────────────────────────────────────────
 *   DEEPSEEK_API_KEY   必填。到 platform.deepseek.com → API keys 创建
 *   DEEPSEEK_BASE      默认 https://api.deepseek.com（换它就能指到别家兼容端点）
 *   CHAT_MODEL         默认 deepseek-flash
 *   PORT               默认 8080
 *   MAX_OUTPUT_TOKENS  默认 400（限制输出长度 = 限制有人刷你的额度）
 *   MAX_HISTORY_MSGS   默认 12（只带最近几条历史，防止越聊越贵）
 *   MAX_INPUT_CHARS    默认 600（单条提问长度上限）
 *   RATE_PER_MIN       默认 8（每个 IP 每分钟最多问几次）
 *   ALLOW_ORIGIN       默认 *（跨域放行；同源部署时其实用不到）
 *
 * ⚠️ 人设文案（下面的 PERSONA）必须与 script.js 里 CHAT_BACKEND.system 保持一致 ——
 *    两处不一致的话，「本机 ollama 版分身」和「云端版分身」说话方式会不一样。
 *    改一处就顺手改另一处；tools/test-chat-proxy.js 会检查它们是否一致。
 */

'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');

/* ─────────────────────────────────────────────────────────────────────
   从同目录的 `.env` 读配置（零依赖，十几行）。

   ⚠️ **为什么需要它**：线上发布沙箱**没有配置环境变量的入口**，key 只能随项目一起上传，
      所以线上就直接读这个文件。
   ⚠️ **而 `.env` 绝不能进 git** —— 这个仓库是公开的，提交等于把 key 公开。
      `.gitignore` 里已经忽略它；搬运这个项目时先 `git check-ignore .env` 确认一下。
   ⚠️ **已有的环境变量优先**，所以本机 `DEEPSEEK_API_KEY=xx node server.js` 不会被文件盖掉。
   写法故意很土：只认 `KEY=值` 一行一条，不做引号与转义（够用，也不容易出错）。
   ───────────────────────────────────────────────────────────────────── */
(function loadDotEnv() {
  var txt;
  try { txt = fs.readFileSync(path.join(__dirname, '.env'), 'utf8'); } catch (e) { return; }
  txt.split(/\r?\n/).forEach(function (line) {
    line = line.trim();
    if (!line || line.charAt(0) === '#') return;
    var i = line.indexOf('=');
    if (i < 1) return;
    var k = line.slice(0, i).trim();
    var v = line.slice(i + 1).trim();
    if (process.env[k] === undefined) process.env[k] = v;
  });
})();

var PORT = Number(process.env.PORT || 8080);
var API_KEY = process.env.DEEPSEEK_API_KEY || '';
var BASE = (process.env.DEEPSEEK_BASE || 'https://api.deepseek.com').replace(/\/+$/, '');
var UPSTREAM = BASE + '/chat/completions';
var MODEL = process.env.CHAT_MODEL || 'deepseek-flash';
var MAX_OUT = Number(process.env.MAX_OUTPUT_TOKENS || 400);
var MAX_MSGS = Number(process.env.MAX_HISTORY_MSGS || 12);
var MAX_INPUT_CHARS = Number(process.env.MAX_INPUT_CHARS || 600);
var RATE_PER_MIN = Number(process.env.RATE_PER_MIN || 8);
var ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';
var ROOT = __dirname;

/* ─────────────────────────────────────────────────────────────────────
   数字分身的人设 —— 与 script.js 的 CHAT_BACKEND.system 保持同步
   ⚠️ 只写页面上已经公开的事，不添任何新事实。
   ───────────────────────────────────────────────────────────────────── */
var PERSONA = [
  '你是王释贤的数字分身，在他的个人主页上替他招呼访客。你是 AI，不是他本人——被问到就直说。',
  '称他为「释贤」，自称「我」。语气轻松、简短、口语化，像聊天，别用书面腔，也别用 emoji。',
  '',
  '你可以说的事（**只限于这些**）：',
  '· 他大一在读，人在深圳',
  '· 方向是脑机接口（BCI），也在跟 AI 的前沿',
  '· MBTI 是 ENFJ',
  '· 本学期在上：微积分、线性代数、计算机编程',
  '· 在做的项目：MYPAGE（这个主页本身）、Jarvis + EEG（AI for Science）',
  '· 爱好：架子鼓、书法、音乐、摄影、篮球、旅游；平时在深圳探店',
  '· 常听：陶喆、薛之谦、Justin Bieber',
  '',
  '必须遵守：',
  '· **三个人称别搞混**：你是分身（不是他本人）、访客是来看页面的人（也不是他）、',
  '  你和访客口中的「他 / 释贤」才是本人 —— 别把访客当成他，也别说「等你告诉我」这类话',
  /* V2.7 续六十八：记忆上了之后补这条。⚠️ 必须与 script.js 的 CHAT_BACKEND.system **逐行一致**
     （`tools/test-chat-proxy.js` 第 7 节会比对），改一处就得改两处。 */
  '· 上面可能带你之前和这位访客聊过的几轮（存在他自己的浏览器里）；有就顺着接，没有就当作第一次见面，别假装记得没发生的事',
  '· 不知道就直说不知道，**绝不要编造**关于他的任何事——他没告诉过我的，我不替他说',
  '· 不报私人信息（住址、电话、具体年龄这类）；联系方式让他自己给',
  '· 回答尽量短，两三句就够',
  '· **不要用 markdown**（这个聊天窗不渲染它，星号和井号会原样显示出来）',
].join('\n');

/* ── 静态文件 ─────────────────────────────────────────────────────── */

var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8'
};

// ⚠️ 这些路径**不给公网访客看**（源码 / 开发文档 / 工具 / 机密文件）
var PRIVATE = /^\/(?:\.git|tools|data|backups)\//i;
var PRIVATE_FILES = /^\/(?:PROJECT|README|WECLONE|DEPLOY|DESIGN-SYSTEM|server|package(-\w+)?)\.(md|js|json)$/i;

/* ⚠️⚠️ 机密文件必须单独挡死。
   `.env` 里存着 DEEPSEEK_API_KEY，而静态托管默认是把目录里的文件**原样发出去**的 ——
   不挡的话，**任何人访问 `/.env` 就拿到了你的 key**。
   这类洞有个共同点：本地完全看不出来（你本来就知道自己的 key），**上线当天就会被扫到**。
   规则取「**点开头的都给 404**」，一次把 `.env` / `.gitignore` / `.env.local` 这类全盖住。 */
var SECRET_FILES = /^\/\./;

function serveStatic(req, res) {
  var urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  if (PRIVATE.test(urlPath) || PRIVATE_FILES.test(urlPath) || SECRET_FILES.test(urlPath)) {
    return send(res, 404, 'text/plain; charset=utf-8', 'Not found');
  }

  // 目录穿越防护：解析后必须仍在 ROOT 里
  var file = path.join(ROOT, path.normalize(urlPath).replace(/^([/\\])+/, ''));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    return send(res, 403, 'text/plain; charset=utf-8', 'Forbidden');
  }

  fs.stat(file, function (err, st) {
    if (err || !st.isFile()) return send(res, 404, 'text/plain; charset=utf-8', 'Not found');
    var type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
}

/* ── 限速（按 IP，内存计数）────────────────────────────────────────── */

var hits = new Map();   // ip -> [时间戳…]

function rateLimited(ip) {
  var now = Date.now();
  var arr = (hits.get(ip) || []).filter(function (t) { return now - t < 60000; });
  if (arr.length >= RATE_PER_MIN) { hits.set(ip, arr); return true; }
  arr.push(now);
  hits.set(ip, arr);
  return false;
}

// 定期清掉过期条目，别让它无限长大
setInterval(function () {
  var now = Date.now();
  hits.forEach(function (arr, ip) {
    var keep = arr.filter(function (t) { return now - t < 60000; });
    if (keep.length) hits.set(ip, keep); else hits.delete(ip);
  });
}, 300000).unref();

/* ── /api/chat ────────────────────────────────────────────────────── */

function readBody(req, limit) {
  return new Promise(function (resolve, reject) {
    var chunks = [], size = 0;
    req.on('data', function (c) {
      size += c.length;
      if (size > limit) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', function () { resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', reject);
  });
}

function send(res, code, type, body) {
  res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': ALLOW_ORIGIN });
  res.end(body);
}

function fail(res, code, msg) {
  // 返回非 200 ⇒ 页面自动落回本地知识库（这是设计好的降级），不会有白屏或空回答
  send(res, code, 'application/json; charset=utf-8', JSON.stringify({ error: { message: msg } }));
}

async function handleChat(req, res) {
  var ip = (req.socket.remoteAddress || '?');

  if (rateLimited(ip)) {
    return fail(res, 429, '问得有点快，歇一分钟再来。');
  }

  var raw;
  try { raw = await readBody(req, 32768); }
  catch (e) { return fail(res, 413, '请求体过大'); }

  var payload;
  try { payload = JSON.parse(raw || '{}'); }
  catch (e) { return fail(res, 400, '请求不是合法 JSON'); }

  if (!API_KEY) return fail(res, 503, '服务端没有配置 DEEPSEEK_API_KEY');

  /* ⚠️ 关键的一步：**只取客户端的 user / assistant 轮次，system 一律丢掉**。
     人设由服务端注入 —— 否则任何人抓到这个地址，都能塞一个「你是通用助手」的
     system 进来，把我的模型当免费 ChatGPT 用。 */
  var history = (Array.isArray(payload.messages) ? payload.messages : [])
    .filter(function (m) {
      return m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string';
    })
    .slice(-MAX_MSGS)
    .map(function (m) {
      return { role: m.role, content: m.content.slice(0, MAX_INPUT_CHARS) };
    });

  if (!history.length || history[history.length - 1].role !== 'user') {
    return fail(res, 400, '最后一条必须是用户的提问');
  }

  var body = JSON.stringify({
    model: MODEL,
    messages: [{ role: 'system', content: PERSONA }].concat(history),
    stream: false,
    max_tokens: MAX_OUT,        // 限长 = 限制有人拿它写长文烧额度
    temperature: 0.8
  });

  var ctrl = new AbortController();
  var timer = setTimeout(function () { ctrl.abort(); }, 30000);

  try {
    var r = await fetch(UPSTREAM, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + API_KEY },
      body: body,
      signal: ctrl.signal
    });
    var text = await r.text();
    clearTimeout(timer);

    if (!r.ok) {
      console.error('[chat] 上游 ' + r.status + '：' + text.slice(0, 300));
      return fail(res, 502, '上游返回 ' + r.status);
    }
    // 上游就是 OpenAI 兼容格式，原样透传（页面只读 choices[0].message.content）
    send(res, 200, 'application/json; charset=utf-8', text);
  } catch (e) {
    clearTimeout(timer);
    console.error('[chat] 转发失败：' + (e && e.message));
    fail(res, 504, '上游超时或不可达');
  }
}

/* ── 入口 ─────────────────────────────────────────────────────────── */

var server = http.createServer(function (req, res) {
  var urlPath = (req.url || '/').split('?')[0];

  if (urlPath === '/healthz') {
    return send(res, 200, 'application/json; charset=utf-8', JSON.stringify({
      ok: true, model: MODEL, keyConfigured: !!API_KEY, ratePerMin: RATE_PER_MIN
    }));
  }

  if (urlPath === '/api/chat') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': ALLOW_ORIGIN,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '43200'
      });
      return res.end();
    }
    if (req.method !== 'POST') return fail(res, 405, '只接受 POST');
    return handleChat(req, res);
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, '只接受 GET');
  serveStatic(req, res);
});

server.listen(PORT, function () {
  console.log('数字分身云端大脑已启动');
  console.log('  端口        : ' + PORT);
  console.log('  模型        : ' + MODEL + '  （上游 ' + UPSTREAM + '）');
  console.log('  API key     : ' + (API_KEY ? '已配置' : '⚠️ 未配置 —— /api/chat 会返回 503'));
  console.log('  限速        : 每 IP 每分钟 ' + RATE_PER_MIN + ' 次');
  console.log('  输出上限    : ' + MAX_OUT + ' tokens');
  if (API_KEY && BASE === 'https://api.deepseek.com') {
    console.log('\n本机自测：打开 http://localhost:' + PORT + '/');
  }
});
