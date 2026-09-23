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
// ⚠️ 知识库现在是**生成物**：条目写在 `data/persona.json` 的 about 里，
//    由 `tools/build-persona.py` 编进 script.js（`kb:begin`/`kb:end` 之间）——
//    改条目改数据源，别手改 script.js 那段。这个测试读的仍是 script.js 里**真正的** KNOWLEDGE。
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
  // ⚠️ 下面这 5 句原来是「快捷按钮」上的字；按钮 2026-09-23 已全部移除，
  //    但这几句话本身仍是访客可能手打的问法 ⇒ **留作普通用例，别跟着按钮一起删**
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

// ---- 对话区的预设问题按钮**已经没有了**（V2.7 续七十六，用户 2026-09-23 定）----
// ⚠️ 2026-09-22 这段是「从 index.html 现读按钮」，2026-09-23 用户要求
//    「页面不放置任何按钮，只保留一个对话框」⇒ 按钮连同样式与绑定一起删了。
//    现在改成一份**固定的访客问句清单**。为什么还要它：知识库是「关键词包含匹配」，
//    关键词写错**不报错、只悄悄落兜底语**（2026-09-21 就这么漏过一整轮）⇒
//    得有一组「访客真的会这么打字」的问句盯着它，而不是等上线后才发现。
var htmlPath = path.join(__dirname, '..', 'index.html');
var html = fs.readFileSync(htmlPath, 'utf8');
var BTNS = (html.match(/<button class="quick-btn">/g) || []).length;

// 这 5 句原来是按钮上的字，按钮删了、话留着 —— 访客还可能这么打字
var QUICK = [
  '陶喆、薛之谦、Bieber他最爱谁？',
  '打鼓和书法哪个更难？',
  '脑机接口能让我用意念打字吗？',
  '他平时怎么放松？',
  '你有不知道的事吗？'
];

// ⚠️ 已知缺口（**等用户给内容**）：这几句现在就答不上，是**故意留在这儿的标志位** ——
//    哪天补了对应条目，把它们挪到 QUICK 里去（否则这一节会红，提醒你改）。
var KNOWN_GAP = [
  '怎么联系他？',
  'Jarvis + EEG 是什么？',
  '这个主页是谁做的？'
];

var quickFallback = [];
QUICK.forEach(function (q) {
  if (matchAnswer(q) === FALLBACK) quickFallback.push(q);
});
var gapAnswered = [];
KNOWN_GAP.forEach(function (q) {
  if (matchAnswer(q) !== FALLBACK) gapAnswered.push(q);
});

console.log('\n对话区预设问题按钮：%d 个（2026-09-23 起应为 0 —— 用户要求不放按钮）', BTNS);
if (BTNS) {
  console.log('  ⚠️ index.html 里又出现了预设问题按钮。若是有意加回，把这一节和注释一起改掉。');
}
console.log('访客问句（原来按钮上那 5 句）：%d 句', QUICK.length);
quickFallback.forEach(function (q) {
  console.log('  ⚠️ 落到兜底语：%s', q);
});
if (quickFallback.length) {
  console.log('  ⇒ 这 %d 句只会得到「我不知道」；要修得给数据源 data/persona.json 的 about 补条目'
    + '（改完跑 tools/build-persona.py），内容需用户确认。', quickFallback.length);
} else {
  console.log('  ✓ 每一句都能答上');
}
console.log('已知缺口（故意留着当标志位，答不上才是对的）：%d 句', KNOWN_GAP.length);
gapAnswered.forEach(function (q) {
  console.log('  ⚠️ 已经能答上了：%s ⇒ 请把它挪进 QUICK（缺口补上了）', q);
});
KNOWN_GAP.forEach(function (q) {
  if (matchAnswer(q) !== FALLBACK) fail++;
});

console.log('\n知识库 %d 条 / 用例 %d / 失败 %d / 原按钮问句未答上 %d / 已补上的缺口 %d',
  KNOWLEDGE.length, CASES.length + QUICK.length + KNOWN_GAP.length, fail,
  quickFallback.length, gapAnswered.length);
process.exit(fail ? 1 : 0);
