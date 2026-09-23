// 数字分身「双大脑」的回归测试（V2.7 续六十一，2026-09-23）
//
// 用法：  node tools/test-chat-backend.js [script.js 的路径]      默认 ../script.js
// 退出码：0 = 全过；1 = 有用例失败
//
// ⚠️ 为什么要有它：这一层是「网络出问题时自动落回知识库」的**全部逻辑**，而本环境
//    **没有浏览器**（看不到渲染结果），靠手点验证不了。所以把 script.js 里真正的
//    `backendUsable` / `askBackend` / `remember` 抽出来执行（**不重写一份** ——
//    重写等于验自己写的东西），再用假的 fetch 把每条失败路径都走一遍。
//
// ⚠️ 最要紧的一条是**断路器**：它要是失效，后端一挂，访客每条消息都要干等满
//    `timeoutMs`（默认 8 秒）才落回知识库 —— 那比直接答知识库还糟。
//    所以这里专门验「连续失败才跳闸」和「冷却到点自动恢复」。

var fs = require('fs');
var path = require('path');

var file = process.argv[2] || path.join(__dirname, '..', 'script.js');
var src = fs.readFileSync(file, 'utf8');

function slice(from, to) {
  var a = src.indexOf(from);
  var b = src.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error('找不到片段（script.js 结构变了？）：' + from.slice(0, 30));
  return src.slice(a, b);
}

var cfg = slice('var CHAT_BACKEND', 'var KNOWLEDGE');            // 配置 + 三个状态变量
// ⚠️ 切片起点必须是 `isLocalPage`，**不能**从 `backendUsable` 开始：
//    本机 ollama 那条路加进来之后，`backendUsable` 依赖它前面定义的
//    `isLocalPage` / `resolvedBackend` —— 从它开始切就会把那两个漏掉，
//    跑起来是 `ReferenceError: resolvedBackend is not defined`（这个坑已经踩过一次）。
var fns = slice('function isLocalPage', 'function ask(');   // 选后端 / 可用性 / 记账 / 落回标记 / 请求

// 桩：addOfflineNote 会碰 document 与 messagesEl
var stubs =
  'var document = { createElement: function () { return { className: "", textContent: "" }; } };\n' +
  'var messagesEl = { appendChild: function () {}, scrollTop: 0, scrollHeight: 0 };\n';

eval(stubs + cfg + '\n' + fns);

/* ---- 流式（SSE）用的假响应（2026-09-23 续七十三）----
   ⚠️ 第 1 块**故意以半行结尾**（下一块接着写完那行）—— 真上游的 TCP 分片就是这样，
      不测这条等于没测流式解析；另外还混了**心跳注释行**与**一行坏 JSON**，
      它们都该被跳过、且**不许打断整条流**。 */
function sseChunks() {
  return [
    'data: {"choices":[{"delta":{"content":"好呀，',
    '"}}]}\n\n' + ': 心跳注释行，不该被当成内容\n\n' +
      'data: {"choices":[{"delta":{"content":"我是分身。"}}]}\n\n',
    'data: {这行是坏的\n\n' +
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'
  ];
}
// 最后一块带 finish_reason: length ⇒ 页面应据此报「被截断」
function sseChunksLen() {
  return [
    'data: {"choices":[{"delta":{"content":"长话被截"}}]}\n\n',
    'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n'
  ];
}
function sseResponse(chunks) {
  var i = 0;
  return {
    ok: true,
    headers: { get: function (k) { return /content-type/i.test(k) ? 'text/event-stream; charset=utf-8' : null; } },
    body: {
      getReader: function () {
        return {
          read: function () {
            if (i >= chunks.length) return Promise.resolve({ done: true });
            return Promise.resolve({ done: false, value: new TextEncoder().encode(chunks[i++]) });
          }
        };
      }
    },
    json: function () { return Promise.reject(new Error('要的是流式，不该来读 JSON')); }
  };
}

// ---- 假 fetch：按 fetchMode 返回不同结果，并记下最后一次请求 ----
var fetchMode = 'ok';
var lastInit = null;
var lastUrl = null;
var calls = 0;

global.fetch = function (url, init) {
  calls++;
  lastInit = init;
  lastUrl = url;
  if (fetchMode === 'hang') {                       // 永不返回，等被 abort
    return new Promise(function (resolve, reject) {
      if (init.signal) init.signal.addEventListener('abort', function () { reject(new Error('aborted')); });
    });
  }
  if (fetchMode === 'http500') {
    return Promise.resolve({ ok: false, status: 500, json: function () { return Promise.resolve({}); } });
  }
  if (fetchMode === 'notjson') {
    return Promise.resolve({ ok: true, json: function () { return Promise.reject(new Error('not json')); } });
  }
  if (fetchMode === 'empty') {
    return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ choices: [{ message: { content: '   ' } }] }); } });
  }
  if (fetchMode === 'firstFails') {          // 第一个后端失败、后面的成功（验「依次降级」）
    if (calls === 1) {
      return Promise.resolve({ ok: false, status: 403, json: function () { return Promise.resolve({}); } });
    }
    return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ choices: [{ message: { content: '来自云端' } }] }); } });
  }
  if (fetchMode === 'stream') { return Promise.resolve(sseResponse(sseChunks())); }
  if (fetchMode === 'streamLen') { return Promise.resolve(sseResponse(sseChunksLen())); }
  if (fetchMode === 'ignoresStream') {      // 端点不认 stream ⇒ 回整包 JSON（页面按 content-type 分流）
    return Promise.resolve({
      ok: true,
      headers: { get: function () { return 'application/json'; } },
      json: function () { return Promise.resolve({ choices: [{ message: { content: '整包也能答' } }] }); }
    });
  }
  return Promise.resolve({
    ok: true,
    json: function () {
      return Promise.resolve({ choices: [{ message: { content: '嗨，我是分身。' } }] });
    }
  });
};
global.window = { fetch: global.fetch, AbortController: global.AbortController };

// ---- 断言小工具 ----
var pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  OK   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '\n       → ' + extra : '')); }
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
var URL_OK = 'https://example.test/v1/chat/completions';
var LOCAL_URL_DEFAULT = CHAT_BACKEND.localUrl;      // 9.6 / 10 会临时清掉，reset() 负责还原
var CLOUD_URL_DEFAULT = CHAT_BACKEND.cloudUrl;
function reset() {
  CHAT_BACKEND.url = URL_OK;
  CHAT_BACKEND.localUrl = LOCAL_URL_DEFAULT;
  CHAT_BACKEND.cloudUrl = CLOUD_URL_DEFAULT;
  CHAT_BACKEND.model = 'gpt-3.5-turbo';
  CHAT_BACKEND.system = '';
  CHAT_BACKEND.timeoutMs = 8000;
  CHAT_BACKEND.historyTurns = 6;
  CHAT_BACKEND.breakerMax = 2;
  CHAT_BACKEND.breakerCoolMs = 120000;
  backendDownUntil = 0;
  backendFails = 0;
  chatHistory = [];
  calls = 0;
}

(async function () {
  console.log('=== 1. 三条路都没配：完全不碰网络 ===');
  reset();
  CHAT_BACKEND.url = '';
  CHAT_BACKEND.cloudUrl = '';      // 现在多了云端那条路 ⇒ 要三条全空才等于「没后端」
  ok(backendUsable() === false, '本机 / 云端 / 显式全空 ⇒ backendUsable() = false（直接走知识库）');
  ok(document !== undefined, '（桩已就位）');

  console.log('\n=== 2. 正常响应 ===');
  reset();
  var a = await askBackend('你叫什么');
  ok(a === '嗨，我是分身。', '返回正文', '拿到：' + a);
  ok(calls === 1, '确实发了 1 次请求');
  var body = JSON.parse(lastInit.body);
  ok(body.model === 'gpt-3.5-turbo', '请求体带 model');
  ok(body.stream === false, 'stream 显式 false（WeClone 的接口按非流式用）');
  ok(body.messages.length === 1 && body.messages[0].role === 'user' && body.messages[0].content === '你叫什么',
    '只有一条 user 消息（system 留空时不发）', JSON.stringify(body.messages));
  ok(lastInit.method === 'POST' && lastInit.headers['Content-Type'] === 'application/json', 'POST + JSON 头');

  console.log('\n=== 3. system 与历史 ===');
  reset();
  CHAT_BACKEND.system = '你是王释贤的数字分身。';
  await askBackend('x');
  var b2 = JSON.parse(lastInit.body);
  ok(b2.messages.length === 2 && b2.messages[0].role === 'system', '配了 system ⇒ 排在最前');
  reset();
  chatHistory = [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }];
  await askBackend('c');
  var b3 = JSON.parse(lastInit.body);
  ok(b3.messages.length === 3 && b3.messages[2].content === 'c', '带上历史（历史在前、新问题在最后）');

  console.log('\n=== 4. 每条失败路径都必须落回知识库（返回 null） ===');
  for (const m of ['http500', 'notjson', 'empty']) {
    reset();
    fetchMode = m;
    var r = await askBackend('q');
    ok(r === null, m + ' ⇒ null（由调用方落回知识库）', '拿到：' + r);
  }

  console.log('\n=== 5. 超时：不能把访客吊着 ===');
  reset();
  fetchMode = 'hang';
  CHAT_BACKEND.timeoutMs = 40;
  var t0 = Date.now();
  var r2 = await askBackend('q');
  var dt = Date.now() - t0;
  ok(r2 === null, '请求挂住 ⇒ null');
  ok(dt < 1500, '在 timeoutMs 到点就放弃（实测 ' + dt + 'ms，设的 40ms）', '花了 ' + dt + 'ms');
  ok(lastInit.signal !== undefined, '确实挂了 AbortController 的 signal');

  console.log('\n=== 6. 断路器：连续失败才跳闸 ===');
  reset();
  fetchMode = 'http500';
  await askBackend('q1');
  ok(backendFails === 1, '第 1 次失败 ⇒ 计数 1');
  ok(backendUsable() === true, '只失败 1 次 ⇒ 还没跳闸（还得再试）');
  fetchMode = 'ok';
  await askBackend('q2');
  ok(backendFails === 0, '中途成功一次 ⇒ 计数清零');
  fetchMode = 'http500';
  await askBackend('q3');
  ok(backendUsable() === true, '失败不连续 ⇒ 不跳闸（否则网络抖一下就永久降级）');

  reset();
  fetchMode = 'http500';
  await askBackend('q1');
  await askBackend('q2');
  ok(backendUsable() === false, '连续失败 2 次 ⇒ 跳闸（此后不碰网络、直接答知识库）');
  var before = calls;
  if (backendUsable()) { await askBackend('q3'); }
  ok(calls === before, '跳闸期间不再发请求（访客不会被吊 8 秒）');

  console.log('\n=== 7. 冷却到点自动恢复 ===');
  reset();
  CHAT_BACKEND.breakerCoolMs = 30;
  fetchMode = 'http500';
  await askBackend('q1');
  await askBackend('q2');
  ok(backendUsable() === false, '先跳闸');
  await sleep(60);
  ok(backendUsable() === true, '冷却结束后自动恢复（不需要刷新页面）');

  console.log('\n=== 8. 历史只记分身答过的，并截断 ===');
  reset();
  CHAT_BACKEND.historyTurns = 3;                 // 上限 = 3 轮 = 6 条
  for (var i = 1; i <= 5; i++) remember('q' + i, 'a' + i);
  ok(chatHistory.length === 6, '截断到 historyTurns × 2 = 6 条', '实际 ' + chatHistory.length);
  ok(chatHistory[5].content === 'a5' && chatHistory[0].content === 'q3', '保留的是最近的几轮');

  console.log('\n=== 9. 本机 ollama 自动接管（★ 公网页面绝不能触发）===');
  // 9.1 没有 location（＝node / 非浏览器）⇒ 判断不出是不是本机 ⇒ 不接本机
  reset();
  CHAT_BACKEND.url = '';
  delete global.location;
  ok(isLocalPage() === false, '没有 location ⇒ isLocalPage() = false');
  var bNoLoc = resolvedBackend();
  ok(bNoLoc === null || !/127\.0\.0\.1|localhost|\[::1\]/.test(bNoLoc.url),
    '没有 location ⇒ 不会去接本机 ollama', JSON.stringify(bNoLoc));

  // 9.2 file:// 打开（双击 index.html）⇒ 自动接本机 ollama
  global.location = { protocol: 'file:', hostname: '', search: '' };
  ok(isLocalPage() === true, 'file:// ⇒ isLocalPage() = true');
  var b = resolvedBackend();
  ok(b !== null && b.url === CHAT_BACKEND.localUrl && b.model === CHAT_BACKEND.localModel,
    'file:// ⇒ 接到本机 ollama（用 localModel，不是 model）', JSON.stringify(b));
  ok(backendUsable() === true, '此时后端可用（会先试 ollama）');

  // 9.3 ★ 公网域名 ⇒ 走云端代理，但**绝不接本机**（这条是安全底线）
  reset();
  CHAT_BACKEND.url = '';                 // 没显式配置
  global.location = { protocol: 'https:', hostname: 'taiv-v2.pages.dev', search: '' };
  ok(isLocalPage() === false, 'https 域名 ⇒ isLocalPage() = false');
  var bCloud = resolvedBackend();
  ok(bCloud !== null && bCloud.url === CHAT_BACKEND.cloudUrl,
    '公网 ⇒ 用云端代理（部署后的同源 /api/chat）', JSON.stringify(bCloud));
  ok(bCloud === null || !/127\.0\.0\.1|localhost|\[::1\]/.test(bCloud.url),
    '★★ 公网解析出的地址里**没有任何本机地址**（不会去连访客自己的电脑）',
    JSON.stringify(bCloud));

  // 9.3b 云端也没配（＝还没部署代理）⇒ 公网老实走知识库
  CHAT_BACKEND.cloudUrl = '';
  ok(resolvedBackend() === null, '公网 + 没配云端 ⇒ null（走知识库，页面照常能用）');
  CHAT_BACKEND.cloudUrl = CLOUD_URL_DEFAULT;

  // 9.3c 本机打开时：本机 ollama **优先于**云端（本机开发用本地模型，免费又快）
  reset();
  CHAT_BACKEND.url = '';
  global.location = { protocol: 'http:', hostname: 'localhost', search: '' };
  var bLocal = resolvedBackend();
  ok(bLocal !== null && bLocal.url === CHAT_BACKEND.localUrl,
    '本机打开 ⇒ 先用本机 ollama，而不是云端', JSON.stringify(bLocal));

  // 9.4 本地起 http server 调试时也接管
  global.location = { protocol: 'http:', hostname: 'localhost', search: '' };
  ok(isLocalPage() === true, 'http://localhost ⇒ 接管');
  global.location = { protocol: 'http:', hostname: '127.0.0.1', search: '' };
  ok(isLocalPage() === true, 'http://127.0.0.1 ⇒ 接管');

  // 9.5 显式配了 url ⇒ 以它为准，本机不抢
  reset();
  global.location = { protocol: 'file:', hostname: '', search: '' };
  var b2 = resolvedBackend();
  ok(b2 !== null && b2.url === URL_OK, '★ 显式配了 url ⇒ 以它为准（本机 ollama 不抢）');
  fetchMode = 'ok';
  await askBackend('q');
  ok(lastUrl === URL_OK, '请求真的发到显式那个地址', '实际：' + lastUrl);

  // 9.6 ?chat=off 的做法＝把三条路全清掉 ⇒ 强制回知识库
  reset();
  CHAT_BACKEND.localUrl = '';
  CHAT_BACKEND.cloudUrl = '';
  CHAT_BACKEND.url = '';
  ok(resolvedBackend() === null, '?chat=off（本机 / 云端 / 显式全清）⇒ 强制走知识库');
  delete global.location;

  console.log('\n=== 10. ?chat= / ?model= 参数（不动文件就能换后端与模型）===');
  // 期望值从 script.js 里现读，不写死 —— 以后改默认模型不用来改测试
  var defaultModel = (/localModel:\s*'([^']+)'/.exec(src) || [, '(读不到)'])[1];

  // ⚠️ 在**独立作用域**里跑配置段（`new Function`），**不要用直接 eval**：
  //    直接 eval 会重新声明 `CHAT_BACKEND`，让「eval 出来的函数」和「测试里引用的变量」
  //    变成**两组绑定** —— 后面几节就会拿着两个不同的 CHAT_BACKEND 在比对，结论全是假的。
  //    （这个坑当场踩了：第 11 节因此整节全红。）
  function parseCfg(search) {
    return new Function('location', cfg + '\n; return CHAT_BACKEND;')(
      { protocol: 'file:', hostname: '', search: search }
    );
  }

  var c1 = parseCfg('?model=deepseek-r1:7b');
  ok(c1.localModel === 'deepseek-r1:7b', '?model= ⇒ localModel 被覆盖（本机 ollama 换模型）',
    '实际：' + c1.localModel);
  ok(c1.model === 'deepseek-r1:7b', '?model= ⇒ model 一起覆盖（本机与公网语义一致）');

  var c2 = parseCfg('');
  ok(c2.localModel === defaultModel, '不带 ?model= ⇒ 保持默认（' + defaultModel + '）',
    '实际：' + c2.localModel);

  var c3 = parseCfg('?chat=off');
  ok(c3.url === '' && c3.localUrl === '' && c3.cloudUrl === '',
    '?chat=off ⇒ 三条路全关（本机 / 云端 / 显式），强制走知识库',
    'url=' + c3.url + ' localUrl=' + c3.localUrl + ' cloudUrl=' + c3.cloudUrl);

  var c4 = parseCfg('?chat=http://127.0.0.1:8005/v1/chat/completions&model=deepseek-r1:7b');
  ok(c4.url === 'http://127.0.0.1:8005/v1/chat/completions' && c4.localModel === 'deepseek-r1:7b',
    '?chat= 与 ?model= 能并用', 'url=' + c4.url + ' model=' + c4.localModel);
  ok(c4.localUrl === '' && c4.cloudUrl === '',
    '?chat= 出现 ⇒ 本机与云端都关掉（显式指定了就别自作主张回落）');

  console.log('\n=== 11. ★ 依次降级：前一个后端不通，就自动试下一个 ===');
  // 这条是修一个**真踩过的坑**：以前是「选中一个、失败就直接落回知识库」，
  // 于是**双击 index.html** 打开时（file:// 下 ollama 必然 403）——
  // 明明能用的云端**永远轮不到**，用户看到的就是「没接入」。

  // 11.1 file:// 打开时，候选里有没有云端？云端用的是不是绝对地址？
  reset();
  CHAT_BACKEND.url = '';
  global.location = { protocol: 'file:', hostname: '', search: '' };
  var cands = backendCandidates();
  ok(cands.length === 2, 'file:// 打开 ⇒ 两个候选（本机 ollama + 云端）', JSON.stringify(cands));
  ok(cands[1].url === CHAT_BACKEND.localCloudBase + CHAT_BACKEND.cloudUrl,
    '★ file:// 下云端用**绝对地址**（相对路径在 file:// 下没意义）', '实际：' + cands[1].url);

  // 11.2 第一个（ollama）403 ⇒ 必须自动落到云端
  reset();
  CHAT_BACKEND.url = '';
  global.location = { protocol: 'file:', hostname: '', search: '' };
  fetchMode = 'firstFails';
  var ans3 = await askBackend('x');
  ok(ans3 === '来自云端', '★ ollama 403 ⇒ 自动落到云端（而不是掉进知识库）', '实际：' + ans3);
  ok(calls === 2, '确实依次试了两个后端', '实际调了 ' + calls + ' 次');
  ok(backendFails === 0, '★ 有后端成功 ⇒ 不算失败（断路器不该乱跳）');

  // 11.3 两个都不通 ⇒ 才算「失败一次」（不是两次）
  reset();
  CHAT_BACKEND.url = '';
  global.location = { protocol: 'https:', hostname: 'x.test', search: '' };
  fetchMode = 'http500';
  var ans4 = await askBackend('y');
  ok(ans4 === null, '公网 + 云端也挂 ⇒ null（落回知识库）');
  ok(backendFails === 1, '★ 全部候选都不通 ⇒ 只计 1 次失败（不是按候选数算）',
    '实际 ' + backendFails);

  // 11.4 公网时不该出现本机候选
  reset();
  CHAT_BACKEND.url = '';
  global.location = { protocol: 'https:', hostname: 'x.test', search: '' };
  var pub = backendCandidates();
  ok(pub.every(function (c) { return !/127\.0\.0\.1|localhost|\[::1\]/.test(c.url); }),
    '★★ 公网的候选列表里**没有任何本机地址**', JSON.stringify(pub));

  fetchMode = 'ok';
  delete global.location;

  console.log('\n=== 12. ★ 流式（2026-09-23 续七十三）===');

  // 12.1 收到 SSE ⇒ onDelta 逐段喂；半行 / 心跳 / 坏行都绕过，最终文本 = 各段拼起来
  reset();
  fetchMode = 'stream';
  var deltas = [], doneInfo = null;
  var ansS = await askBackend('你是谁', {
    onDelta: function (piece, soFar) { deltas.push(piece); },
    onDone: function (info) { doneInfo = info; }
  });
  ok(ansS === '好呀，我是分身。', '★ 流式文本正确（半行拼回 / 心跳跳过 / 坏行跳过）', '实际：' + ansS);
  ok(deltas.join('') === ansS, 'onDelta 的增量拼起来 = 最终文本', JSON.stringify(deltas));
  ok(deltas.length >= 2, '确实是**逐段**喂进来的（不是一次性）', '段数 ' + deltas.length);
  ok(lastInit.body.indexOf('"stream":true') >= 0, '★ 要流式时请求体里 stream = true', lastInit.body);
  ok(doneInfo && doneInfo.truncated === false, 'onDone 报 truncated = false（正常收尾）', JSON.stringify(doneInfo));

  // 12.2 finish_reason = length ⇒ onDone 报「被截断」（页面据此如实提醒访客）
  reset();
  fetchMode = 'streamLen';
  var doneInfo2 = null;
  var ansS2 = await askBackend('q', { onDone: function (i) { doneInfo2 = i; } });
  ok(ansS2 === '长话被截', '截断不影响已经收到的字（不吞已显示的内容）', '实际：' + ansS2);
  ok(doneInfo2 && doneInfo2.truncated === true, '★ onDone 报 truncated = true', JSON.stringify(doneInfo2));

  // 12.3 端点不认 stream（回整包 JSON）⇒ 照样能答（`?chat=` 指向任意端点时容错）
  reset();
  fetchMode = 'ignoresStream';
  var ansS3 = await askBackend('q', { onDelta: function () {} });
  ok(ansS3 === '整包也能答', '★ 不认 stream 的端点照常工作（按 content-type 分流）', '实际：' + ansS3);

  // 12.4 不传 opts ⇒ 仍然是非流式（老行为逐字不变 —— 上面那些老用例靠的就是这条）
  reset();
  fetchMode = 'ok';
  await askBackend('q');
  ok(lastInit.body.indexOf('"stream":false') >= 0, '★ 不给 onDelta ⇒ stream = false（与以前一致）', lastInit.body);

  fetchMode = 'ok';

  console.log('\n知识库那侧不受影响；用例 %d / 失败 %d', pass + fail, fail);
  process.exit(fail ? 1 : 0);
})();
