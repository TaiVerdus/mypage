// 探测一个 OpenAI 兼容端点「页面到底能不能用得上它」（V2.7 续六十一，2026-09-23）
//
// 用法：  node tools/probe-openai-endpoint.js [url] [--model 模型名]
//   默认  url   = http://127.0.0.1:8005/v1/chat/completions
//   默认  model = gpt-3.5-turbo（WeClone / vLLM 不校验模型名，随便填就行）
// 退出码：0 = 可用；1 = 有检查没过
//
// ⚠️ **ollama 必须用 `--model` 指定真名字**（填 `ollama list` 里那个），
//    它不像 vLLM 那样忽略模型名 —— 写错会得到一个 404 `model 'xxx' not found`，
//    很容易被误判成「服务没起」（这个坑自己踩过一次）。
//
// ⚠️ 为什么要有它：`tools/test-chat-backend.js` 验的是**页面逻辑**（用假 fetch 走遍降级路径），
//    而这个是拿**真的 HTTP 服务**验三件事 —— 部署之后最容易在这三件事上翻车：
//      ① 响应**形状**对不对（choices[0].message.content）
//      ② **CORS** 放不放行 —— 页面可能是 `file://` 打开的（origin 为 `null`），
//         服务端不回 `Access-Control-Allow-Origin` 就永远连不上，页面上表现为
//         「一直显示离线版回答」，而你从 curl 看它明明是好的
//      ③ **耗时** —— 如果比 `CHAT_BACKEND.timeoutMs`（默认 8000ms）还慢，
//         页面会先超时、落回知识库，你会以为「模型没生效」
//
// ⚠️ 它**不**用浏览器的同源策略，所以 CORS 这一项是靠**看响应头**判断的，
//    不能完全等同于浏览器的行为（但漏头 = 一定失败，是确定性的）。

var argv = process.argv.slice(2);
var modelFlag = argv.indexOf('--model');
var MODEL = modelFlag >= 0 ? argv[modelFlag + 1] : 'gpt-3.5-turbo';
if (modelFlag >= 0) argv.splice(modelFlag, 2);       // 别把 --model 的值当成 url
var url = argv[0] || 'http://127.0.0.1:8005/v1/chat/completions';

var pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  OK   ' + name + (extra ? '   ' + extra : '')); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '\n       → ' + extra : '')); }
}

(async function () {
  console.log('探测端点：' + url + '\n');

  // ---- ① 预检：浏览器跨域之前会先问这一下 ----
  console.log('=== ① 预检 OPTIONS（跨域的第一道门）===');
  var pre = null;
  try {
    pre = await fetch(url, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'null',                                  // 模拟 file:// 打开页面
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,authorization'
      }
    });
  } catch (e) {
    console.log('       （预检没通：' + e.message + '）');
  }
  if (pre) {
    var acao = pre.headers.get('access-control-allow-origin');
    ok(pre.status < 400, '预检状态码可接受', 'HTTP ' + pre.status);
    ok(!!acao, '回了 Access-Control-Allow-Origin', acao ? ('= ' + acao) : '（缺！file:// 打开的页面会连不上）');
  } else {
    // 有些服务不支持 OPTIONS，但真请求带 ACAO 也能过 —— 所以这里只提醒，不算硬失败
    console.log('  !!   预检没响应（不一定是问题，看下面真请求的头）');
  }

  // ---- ② 真请求 + 形状 ----
  console.log('\n=== ② 真请求（模拟页面发的那个体）===');
  // ⚠️ 必须带 Origin：服务端的 CORS 中间件**只有在请求带 Origin 时才回 ACAO**，
  //    不带的话会看到「真响应没有 ACAO」这种**假失败**（这个坑自己踩过一次）。
  //    这里用 `null`，即**最严格的场景**：页面是 `file://` 打开的。
  var t0 = Date.now();
  var res, data = null, err = null;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer none',
        'Origin': 'null'
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: '你好，你是谁？' }],
        stream: false
      })
    });
    data = await res.json();
  } catch (e) {
    err = e;
  }
  var ms = Date.now() - t0;

  if (err) {
    fail++;
    console.log('  FAIL 请求本身失败了\n       → ' + err.message);
    console.log('\n  常见原因：服务没起 / 端口不对 / 地址少了 /v1/chat/completions');
    console.log('\n用例 %d / 失败 %d', pass + fail, fail);
    process.exit(1);
  }

  ok(res.ok, 'HTTP 状态正常', 'HTTP ' + res.status);

  // ⚠️ 特意把 ollama 那个「模型名找不到」单独点出来 —— 它长得像「服务没起」，最容易误诊
  var errMsg = JSON.stringify(data || {}).toLowerCase();
  if (res.status === 404 && errMsg.indexOf('not found') !== -1) {
    console.log('       ⇒ 服务是活的，是**模型名不对**。ollama 要用 `ollama list` 里那个名字：');
    console.log('          node tools/probe-openai-endpoint.js ' + url + ' --model qwen2.5:7b');
  }

  var realAcao = res.headers.get('access-control-allow-origin');
  ok(!!realAcao, '真响应也带头 Access-Control-Allow-Origin', realAcao ? ('= ' + realAcao) : '（缺！浏览器会拦掉）');

  var text = data && data.choices && data.choices[0] && data.choices[0].message
    && data.choices[0].message.content;
  ok(!!(text && String(text).trim()), '响应形状对（choices[0].message.content 非空）',
    text ? ('拿到 ' + String(text).length + ' 字') : ('实际返回：' + JSON.stringify(data).slice(0, 160)));

  // ---- ③ 换个来源再试：页面用 http://localhost 打开时 ----
  // 为什么值得单独测：ollama 的**默认**白名单放行 localhost，但**不放行 `null`**（file:// 页面）。
  // 所以「同一台机器、同一个服务」换个打开方式结果可能完全相反 —— 这条能直接告诉你该怎么打开页面。
  console.log('\n=== ③ 页面改用 http://localhost 打开时（另一种常见来源）===');
  var res2 = null, err2 = null;
  try {
    res2 = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer none',
        'Origin': 'http://localhost'
      },
      body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: 'hi' }], stream: false })
    });
  } catch (e) {
    err2 = e;
  }
  if (err2 || !res2) {
    fail++;
    console.log('  FAIL 这个来源的请求没发出去' + (err2 ? '（' + err2.message + '）' : ''));
  } else {
    var acao2 = res2.headers.get('access-control-allow-origin');
    ok(!!acao2, 'http://localhost 来源被放行', acao2 ? ('ACAO = ' + acao2) : '（缺！这个来源也会被浏览器拦掉）');
  }

  // ---- ④ 耗时 ----
  console.log('\n=== ④ 耗时（要跟 CHAT_BACKEND.timeoutMs 比）===');
  ok(ms < 8000, '单次回答在 8 秒以内（＝页面默认超时值）', '实测 ' + ms + ' ms');
  if (ms >= 8000) {
    console.log('       ⇒ 页面会先超时、落回知识库。要么把 timeoutMs 调大，要么换更小的模型/量化。');
  }

  console.log('\n用例 %d / 失败 %d%s', pass + fail, fail,
    fail ? '' : '\n\n这个端点页面可以用得上：'
      + '\n  · 本机 ollama ⇒ **不用填任何东西**，页面在本机打开时会自动接上（见 script.js 的 localUrl）'
      + '\n  · 别的服务     ⇒ 把地址填进 script.js 的 CHAT_BACKEND.url（连同 model 一起）');
  process.exit(fail ? 1 : 0);
})();
