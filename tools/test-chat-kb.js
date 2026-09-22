// 数字分身知识库的回归测试（V2.7 续四十三）
//
// 用法：  node tools/test-chat-kb.js [script.js 的路径]       默认 ../script.js
// 退出码：0 = 全过；1 = 有用例失败
//
// ⚠️ 为什么要有它：知识库是「关键词包含匹配」（q.indexOf(kw)），
//    关键词写错了**不会报错、不会崩**，只会悄悄落到兜底语 ——
//    2026-09-21 就是这么漏了一整轮：整站中文化扫的是「界面文字」，
//    而关键词不是界面文字 ⇒ 中文提问全匹配不上、三个快捷按钮全废，
//    页面上却看不出任何异常（按钮点下去有回复，只是回复是兜底语）。
//
// ⚠️ 两个刻意的做法：
//   1. 把 script.js 里**真正的** KNOWLEDGE / FALLBACK / matchAnswer 抽出来执行，
//      **不重写一份** —— 重写等于验自己写的东西，验不出线上的问题。
//   2. 用例里**必须有几条「应当落到兜底」的** —— 否则「什么都答得上」这种
//      假通过会被当成好消息。
//
// ⚠️ 已知偶发：这个环境（Windows）上偶尔会在 node 启动/读文件时抛出
//    `SyntaxError: invalid character '（'` 这类**莫名其妙的编码错**，
//    同一个文件连跑 5 次都过、之后就复现不出来 —— 疑为文件锁/反病毒误动作
//    （项目里另一次也遇到过：`git rm` 之后工具脚本一度从工作区消失）。
//    ⇒ **别去修一个不存在的 bug**：重跑一次即可；连续多次报同一行才值得查。

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

var kb = slice('var KNOWLEDGE', 'var messagesEl');   // 知识库 + 兜底语
var fn = slice('function matchAnswer', 'function ask('); // 匹配函数本体
eval(kb + '\n' + fn);

var CASES = [
  // 自己打字（中文）
  // ⚠️ 下面这 5 句原来是「快捷按钮」，按钮已改成别的问法（2026-09-22），
  //    但这几句话本身仍是用户可能手打的问法 ⇒ **留作普通用例，别跟着按钮一起删**
  //    （删掉等于悄悄丢掉一块覆盖）。
  ['你叫什么？', false],
  ['你今年多大？', false],
  ['你在学什么？', false],
  ['你是个什么样的人？', false],
  ['你平时玩什么？', false],
  ['他叫什么名字', false],
  ['你多大啊', false],
  ['你几岁了', false],
  ['平时喜欢什么', false],
  ['他听什么音乐', false],
  ['为什么选脑机接口', false],
  // 英文提问（原来的能力不能丢）
  ['what are you studying', false],
  ['how old are you', false],
  ['who are you', false],
  ['favourite singer', false],
  // 应当老实说不知道的
  ['你吃过饭了吗', true],
  ['他女朋友是谁', true]
];

var fail = 0;
CASES.forEach(function (c) {
  var answer = matchAnswer(c[0]);
  var gotFallback = (answer === FALLBACK);
  var ok = (gotFallback === c[1]);
  if (!ok) fail++;
  console.log('  %s %s\n      → %s', ok ? 'OK  ' : 'FAIL', c[0], answer.slice(0, 46));
});

// ---- 页面上的快捷按钮：**从 index.html 现读**，不再抄一份 ----
// ⚠️ 2026-09-22 加这一段：原来的用例把 5 个快捷问题**抄死在测试里**，
//    用户当天把按钮换成 6 个新问题后，测试仍在验那 5 个已不存在的按钮 ⇒
//    **页面上的按钮全废了它也照样全绿**。这正是本文件开头警告的那种「假通过」。
//    现读现验，按钮改了测试就跟着改，不可能再错位。
var htmlPath = path.join(__dirname, '..', 'index.html');
var html = fs.readFileSync(htmlPath, 'utf8');
var QUICK = (html.match(/<button class="quick-btn">([^<]+)<\/button>/g) || [])
  .map(function (s) { return s.replace(/.*>([^<]+)<\/button>/, '$1'); });

var quickFallback = [];
QUICK.forEach(function (q) {
  if (matchAnswer(q) === FALLBACK) quickFallback.push(q);
});

console.log('\n页面的快捷按钮 %d 个 —— 从 index.html 现读', QUICK.length);
if (!QUICK.length) {
  console.log('  ⚠️ 没读到任何快捷按钮（选择器变了？）');
}
quickFallback.forEach(function (q) {
  console.log('  ⚠️ 落到兜底语：%s', q);
});
if (quickFallback.length) {
  console.log('  ⇒ 这 %d 个按钮点了只会得到「我不知道」。快捷按钮是数字分身最显眼的入口，'
    + '落到兜底语等于入口是坏的；要修得给知识库补对应关键词的条目（内容需用户确认）。', quickFallback.length);
} else if (QUICK.length) {
  console.log('  ✓ 每个按钮都能答上');
}

console.log('\n知识库 %d 条 / 用例 %d / 失败 %d / 快捷按钮未答上 %d',
  KNOWLEDGE.length, CASES.length, fail, quickFallback.length);
process.exit(fail ? 1 : 0);
