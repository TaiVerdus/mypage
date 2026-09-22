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
var LOCAL_URL_DEFAULT = CHAT_BACKEND.localUrl;      // 9.6 会临时清掉，reset() 负责还原
function reset() {
  CHAT_BACKEND.url = URL_OK;
  CHAT_BACKEND.localUrl = LOCAL_URL_DEFAULT;
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
  console.log('=== 1. 没配地址：完全不碰网络 ===');
  reset();
  CHAT_BACKEND.url = '';
  ok(backendUsable() === false, 'url 留空 ⇒ backendUsable() = false（直接走知识库）');
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
  // 9.1 没有 location（＝node / 非浏览器）⇒ 不接管
  reset();
  CHAT_BACKEND.url = '';
  delete global.location;
  ok(resolvedBackend() === null, '没有 location ⇒ 不接管（走知识库）');

  // 9.2 file:// 打开（双击 index.html）⇒ 自动接本机 ollama
  global.location = { protocol: 'file:', hostname: '', search: '' };
  ok(isLocalPage() === true, 'file:// ⇒ isLocalPage() = true');
  var b = resolvedBackend();
  ok(b !== null && b.url === CHAT_BACKEND.localUrl && b.model === CHAT_BACKEND.localModel,
    'file:// ⇒ 接到本机 ollama（用 localModel，不是 model）', JSON.stringify(b));
  ok(backendUsable() === true, '此时后端可用（会先试 ollama）');

  // 9.3 ★ 公网域名 ⇒ 绝不接管（这条是安全底线：不能去连访客自己的机器）
  global.location = { protocol: 'https:', hostname: 'taiv-v2.pages.dev', search: '' };
  ok(isLocalPage() === false, 'https 域名 ⇒ isLocalPage() = false');
  ok(resolvedBackend() === null, '★ 公网页面不接本机、也不报错，直接走知识库');

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

  // 9.6 ?chat=off 的做法＝把 localUrl 也清掉 ⇒ 强制回知识库
  reset();
  var keepLocal = CHAT_BACKEND.localUrl;
  CHAT_BACKEND.localUrl = '';
  CHAT_BACKEND.url = '';
  ok(resolvedBackend() === null, '?chat=off（清掉 localUrl）⇒ 连本机也不接，强制走知识库');
  CHAT_BACKEND.localUrl = keepLocal;
  delete global.location;

  console.log('\n=== 10. ?chat= / ?model= 参数（不动文件就能换后端与模型）===');
  // 期望值从 script.js 里现读，不写死 —— 以后改默认模型不用来改测试
  var defaultModel = (/localModel:\s*'([^']+)'/.exec(src) || [, '(读不到)'])[1];

  global.location = { protocol: 'file:', hostname: '', search: '?model=deepseek-r1:7b' };
  eval(cfg);
  ok(CHAT_BACKEND.localModel === 'deepseek-r1:7b', '?model= ⇒ localModel 被覆盖（本机 ollama 换模型）',
    '实际：' + CHAT_BACKEND.localModel);
  ok(CHAT_BACKEND.model === 'deepseek-r1:7b', '?model= ⇒ model 一起覆盖（本机与公网语义一致）');

  global.location = { protocol: 'file:', hostname: '', search: '' };
  eval(cfg);
  ok(CHAT_BACKEND.localModel === defaultModel, '不带 ?model= ⇒ 保持默认（' + defaultModel + '）',
    '实际：' + CHAT_BACKEND.localModel);

  global.location = { protocol: 'file:', hostname: '', search: '?chat=off' };
  eval(cfg);
  ok(CHAT_BACKEND.url === '' && CHAT_BACKEND.localUrl === '',
    '?chat=off ⇒ 两条路都关掉（强制走知识库，用来演示降级）',
    'url=' + CHAT_BACKEND.url + ' localUrl=' + CHAT_BACKEND.localUrl);

  global.location = {
    protocol: 'file:', hostname: '',
    search: '?chat=http://127.0.0.1:8005/v1/chat/completions&model=deepseek-r1:7b'
  };
  eval(cfg);
  ok(CHAT_BACKEND.url === 'http://127.0.0.1:8005/v1/chat/completions' && CHAT_BACKEND.localModel === 'deepseek-r1:7b',
    '?chat= 与 ?model= 能并用', 'url=' + CHAT_BACKEND.url + ' model=' + CHAT_BACKEND.localModel);
  ok(CHAT_BACKEND.localUrl === '', '?chat= 出现 ⇒ 本机自动接管仍被关掉（新参数没破坏这条规矩）');
  delete global.location;

  console.log('\n知识库那侧不受影响；用例 %d / 失败 %d', pass + fail, fail);
  process.exit(fail ? 1 : 0);
})();
