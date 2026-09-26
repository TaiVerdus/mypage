/* ============================================================================
   提问记录（chat_questions）的回归工具
   ----------------------------------------------------------------------------
   为什么这样写：**不另写一份等价代码自测** —— 而是把 script.js 里那段
   `window.__mypageLogQuestion` 原文抽出来、在 node 里跑，测的就是页面真身。
   （这个项目的教训：用自己拼的请求测数据库，测不出「页面实际发的东西」的问题。）

   跑法：node tools/test-question-log.js
   ⚠️ 它会真的往云数据库写一条（标记带 TESTQLOG），跑完请清理：
        DELETE FROM chat_questions WHERE question LIKE 'TESTQLOG%'
   ============================================================================ */
'use strict';

var fs = require('fs');
var path = require('path');

var SITE = path.join(__dirname, '..');
var src = fs.readFileSync(path.join(SITE, 'script.js'), 'utf8');

var MARK = 'TESTQLOG-' + Math.random().toString(36).slice(2, 6).toUpperCase();

function fail(msg) { console.log('FAIL ' + msg); process.exit(1); }

/* ---------- 1. 结构性前提：两个钩子都在 ---------- */
if (src.indexOf('window.MYPAGE_CLOUD_CONFIG = CLOUD_CONFIG;') < 0) {
  fail('script.js 里找不到「配置交出去」那一行 —— 提问记录会拿不到配置（静默不动）');
}
var at = src.indexOf('window.__mypageLogQuestion = function');
if (at < 0) fail('script.js 里找不到 window.__mypageLogQuestion 的定义');

/* ---------- 2. 抽出真实的函数体 ---------- */
var body = src.slice(at);
// 用花括号配对找到函数的结尾（而不是假定「一直到文件末尾」）
var depth = 0, end = -1, started = false;
for (var i = 0; i < body.length; i++) {
  var c = body[i];
  if (c === '{') { depth++; started = true; }
  else if (c === '}') { depth--; if (started && depth === 0) { end = i; break; } }
}
if (end < 0) fail('函数体括号不配对');
var fnSrc = body.slice(0, end + 1);
console.log('抽出页面真身代码：' + fnSrc.split('\n').length + ' 行');

/* ---------- 3. 在 node 里装上它（window 桩 + node 自带 fetch）---------- */
var calls = [];
global.window = {
  MYPAGE_CLOUD_CONFIG: {
    endpoint: 'https://mypage-38202.app.workbuddy.host',
    publishableKey: 'wbpk_aEH7ucbFjEJiB6me355TAg_x2LJk4zHHaBkp9wK8WdEIXhPbjsZusAn'
  }
};
var realFetch = global.fetch;
global.fetch = function (url, init) {
  calls.push({ url: url, init: init });
  return realFetch(url, init);
};

eval(fnSrc);   // 定义 window.__mypageLogQuestion

/* ---------- 4. 边界：空提问不该发请求 ---------- */
window.__mypageLogQuestion('   ');
if (calls.length !== 0) fail('空提问也发了请求（应该在函数里就被挡掉）');
console.log('空提问不发请求 ✓');

/* ---------- 5. 正常路径：真写一条 ---------- */
window.__mypageLogQuestion('  ' + MARK + ' 这条是 tools/test-question-log.js 写的  ');

setTimeout(function () {
  if (!calls.length) fail('没有发出任何请求');
  var c = calls[calls.length - 1];
  var h = c.init.headers || {};
  var payload = JSON.parse(c.init.body);

  var problems = [];
  if (c.url !== window.MYPAGE_CLOUD_CONFIG.endpoint + '/.cloud/database/rest/chat_questions') {
    problems.push('URL 不对：' + c.url);
  }
  if (h['x-wb-webapp-access-key'] !== window.MYPAGE_CLOUD_CONFIG.publishableKey) {
    problems.push('缺 x-wb-webapp-access-key（平台认的是这个头，不是 apikey）');
  }
  if (c.init.method !== 'POST') problems.push('方法不是 POST');
  if (payload.question !== MARK + ' 这条是 tools/test-question-log.js 写的') {
    problems.push('问题文字没被 trim：' + JSON.stringify(payload.question));
  }
  if (Object.keys(payload).length !== 1) problems.push('只该发 question 一个字段：' + Object.keys(payload).join(','));

  if (problems.length) fail(problems.join(' / '));
  console.log('请求形状正确 ✓（URL / POST / 头 / 只带 question / 已 trim）');
  console.log('');
  console.log('请到数据库侧核对是否落库，然后清理：');
  console.log('  DELETE FROM chat_questions WHERE question LIKE \'TESTQLOG%\';');
  console.log('本次标记：' + MARK);
}, 2500);
