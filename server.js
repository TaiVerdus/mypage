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
 *   THINKING           默认 disabled（关掉思考模式 —— 理由见下面 handleChat 里的注释）
 *   THINKING_EFFORT    仅 THINKING=enabled 时有意义：low / high / max
 *   BALANCE_MIN        默认 1（余额低于这个数就暂时不接活，单位同账户币种）
 *   BALANCE_TTL_MS     默认 900000（15 分钟查一次余额；查不到**不拦**）
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
var THINKING = (process.env.THINKING || 'disabled').toLowerCase();
var EFFORT = process.env.THINKING_EFFORT || '';
var BALANCE_MIN = Number(process.env.BALANCE_MIN || 1);
var BALANCE_TTL = Number(process.env.BALANCE_TTL_MS || 900000);
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

/* MIME 表只列白名单内的类型 —— 表里没有的类型本来就出不了下面那道闸 */
var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

/* ── 静态文件的「白名单」防护（V2.7 续七十二）──────────────────────────
   ⚠️ 旧版是**黑名单**：枚举要挡的文件名（PROJECT.md / server.js / package.json …）。
      实测有洞 —— 以后**新加**的 .md / .json 文档不在名单里，就会被原样公开
      （本次实测：新造一个 .md 直接 200、全文可读）。文档和源码只会越加越多，
      每加一个就漏一个，这条路堵不完。
   ⚠️ 白名单反过来：公网只放行「页面真正用得到」的类型（html / css / js / 图片 / svg），
      名单外一律 404 —— 以后再加新文档、新配置，**默认就是不给看的**，不会因为
      「忘了进名单」而泄露。四道闸：
      ① 私有目录（工具 / 数据 / 备份 / git）—— 连里面的白名单类型也不给
      ② 点开头的路径 —— `.env`（存 key）/ `.gitignore` 等，一次全盖住；
         这类洞本地看不出来（你本来就知道自己的 key），上线当天就会被扫到
      ③ 扩展名不在册 —— .md / .json / .txt 等文档默认 404
      ④ 例外名单 —— server.js 虽是 .js（类型在白名单里），但它是服务端源码，必须显式挡死 */
var PRIVATE = /^\/(?:\.git|tools|data|backups)\//i;
var SECRET_FILES = /^\/\./;
var PUBLIC_EXT = /\.(?:html|css|js|jpg|jpeg|png|webp|svg|ico|woff2)$/i;
var PRIVATE_FILES = /^\/server\.js$/i;

function serveStatic(req, res) {
  /* ⚠️ decodeURIComponent 对畸形序列（比如 /%zz）会**抛异常** —— 抛到外层就是整个进程挂掉，
     等于一条 GET 就能把服务打死。必须就地接住，回 400。 */
  var urlPath;
  try { urlPath = decodeURIComponent((req.url || '/').split('?')[0]); }
  catch (e) { return send(res, 400, 'text/plain; charset=utf-8', 'Bad request'); }
  if (urlPath === '/') urlPath = '/index.html';

  /* 白名单四道闸（说明见上面那块注释）：私有目录 / 点开头 / 例外文件 / 扩展名不在册 */
  if (PRIVATE.test(urlPath) || SECRET_FILES.test(urlPath) ||
      PRIVATE_FILES.test(urlPath) || !PUBLIC_EXT.test(urlPath)) {
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

/* ── 余额护栏（V2.7 续六十九，用户 2026-09-23 定）──────────────────────
   为什么要有它：页面对公网开放之后，**key 不能设额度上限**（DeepSeek 没有这个能力），
   能兜住的只有两件事 —— 按 IP 限速（上面）与**余额本身**。所以再加一道：
   余额低于阈值时干脆不接活，让页面自动落回本地知识库，而不是等到上游报错。

   ⚠️ **查不到余额时不拦（fail-open）**，这是刻意的：
      网络抖一下、或这个接口临时抽风，不该让分身停摆。真没余额时上游也会报错 ⇒
      页面照样自动落回知识库，最坏情况只是「晚一点才降级」。
   ───────────────────────────────────────────────────────────────────── */

var balance = { value: null, currency: '', available: true, ok: false, checkedAt: 0 };

function refreshBalance(force) {
  if (!API_KEY) return Promise.resolve(balance);
  if (!force && Date.now() - balance.checkedAt < BALANCE_TTL) return Promise.resolve(balance);

  var ctrl = new AbortController();
  var timer = setTimeout(function () { ctrl.abort(); }, 8000);

  return fetch(BASE + '/user/balance', {
    headers: { 'Authorization': 'Bearer ' + API_KEY },
    signal: ctrl.signal
  }).then(function (r) {
    clearTimeout(timer);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(function (d) {
    var list = Array.isArray(d.balance_infos) ? d.balance_infos : [];
    var pick = list.filter(function (x) { return x && x.currency === 'CNY'; })[0] || list[0] || null;
    balance.checkedAt = Date.now();
    balance.ok = true;
    balance.available = d.is_available !== false;
    balance.value = pick ? Number(pick.total_balance) : null;
    balance.currency = pick ? String(pick.currency) : '';
    return balance;
  }).catch(function (e) {
    clearTimeout(timer);
    balance.checkedAt = Date.now();     // 记一下时间，别每条请求都重试
    balance.ok = false;
    console.warn('[balance] 查询失败（不拦）：' + (e && e.message));
    return balance;
  });
}

// 余额够不够（false 才拦；查不到或没配阈值 ⇒ 放行）
function balanceBlocked() {
  return balance.ok && balance.value !== null && balance.value < BALANCE_MIN;
}

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

  /* 余额护栏：不够就**先**拒掉（页面会自动落回知识库并标「离线版回答」）。
     ⚠️ 放在限速之后、打上游之前 —— 别为一次注定失败的请求花掉限速额度，
        也别为它花钱。 */
  await refreshBalance(false);
  if (balanceBlocked()) {
    return fail(res, 503, '分身暂时下线：账户余额低于 ' + BALANCE_MIN + ' ' + (balance.currency || '') +
      '（页面会自动用本地知识库顶一会儿）');
  }

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

  var payload = {
    model: MODEL,
    messages: [{ role: 'system', content: PERSONA }].concat(history),
    stream: false,
    max_tokens: MAX_OUT,        // 限长 = 限制有人拿它写长文烧额度
    temperature: 0.8,
    /* ⚠️ **关掉 thinking**（官方文档：默认开启、档位 high）。三条理由都是实测/文档来的：
       ① 思考过程**占的是同一份 max_tokens 预算** —— 实测少了人设时会正好撞上 400、
          把回答截断（有实例）
       ② 输出 token 实测 **75 → 48**（约省 35%，输出是按 token 计费的）
       ③ ⚠️ **thinking 模式下 `temperature` 是被官方忽略的** —— 而分身这种闲聊恰恰需要
          一点温度差（同一句话别每次答得一模一样）。关掉之后上面那行 0.8 才真正生效。
       想改回：环境变量 `THINKING=enabled`（可再配 `THINKING_EFFORT=low` 走降档）。 */
    thinking: { type: THINKING === 'enabled' ? 'enabled' : 'disabled' }
  };
  if (THINKING === 'enabled' && EFFORT) payload.reasoning_effort = EFFORT;   // low / high / max
  var body = JSON.stringify(payload);

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
      ok: true, model: MODEL, keyConfigured: !!API_KEY, ratePerMin: RATE_PER_MIN,
      thinking: THINKING,
      // 余额护栏的现状（只读、不含 key）：ok=false 表示**没查到**（不拦）
      balance: {
        ok: balance.ok,
        value: balance.value,
        currency: balance.currency,
        min: BALANCE_MIN,
        blocked: balanceBlocked(),
        checkedAt: balance.checkedAt ? new Date(balance.checkedAt).toISOString() : null
      }
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
  console.log('  思考模式    : ' + THINKING + (THINKING === 'enabled' && EFFORT ? '（effort=' + EFFORT + '）' : ''));
  console.log('  余额护栏    : 低于 ' + BALANCE_MIN + ' 就不接活（查不到不拦）');
  // 启动时先查一次余额（不阻塞、失败也不影响启动）
  refreshBalance(true).then(function (b) {
    console.log('  账户余额    : ' + (b.ok
      ? (b.value === null ? '查到了但没读到数额' : b.value + ' ' + b.currency + (balanceBlocked() ? '  ⚠️ 低于阈值，当前不接活' : ''))
      : '没查到（不拦，按超时/网络问题处理）'));
  });
  if (API_KEY && BASE === 'https://api.deepseek.com') {
    console.log('\n本机自测：打开 http://localhost:' + PORT + '/');
  }
});
