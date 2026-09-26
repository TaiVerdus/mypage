#!/usr/bin/env node
/**
 * 反馈「公开 / 私密」可见性的**真机验收**（2026-09-26）
 *
 * 课件第 28 页说得清楚：不能只看页面提示，要**从数据库侧证明**权限真的在管。
 * 这个脚本用**公开配置 + 和浏览器同款 SDK**（不信页面提示），证明四件事：
 *
 *   ① 匿名插入一条**私密**反馈 → 公开视图里**看不到**它（私密内容没有任何读取路径）
 *   ② 匿名插入一条**公开**反馈 → **立刻**出现在公开视图里（用户 2026-09-26 定的「即时显示」）
 *   ③ 匿名读**基础表**         → 空数组（RLS 没有读策略 ⇒ 谁都读不到私密内容）
 *   ④ 把那条公开反馈标成 `status='pending'`（撤下）→ 它从视图里**消失**（想撤随时撤）
 *
 * 用法：
 *   NODE_PATH=<隔离的 node 工作区>/node_modules node tools/test-feedback-visibility.js              # ①②③
 *   （在云服务面板把那条公开反馈的 status 改成 pending 之后）
 *   NODE_PATH=<隔离的 node 工作区>/node_modules node tools/test-feedback-visibility.js --check-only  # ④③
 *
 * ⚠️ 它会真往表里写两条测试记录（带唯一标记），可在面板里删掉，也可以留着当证据。
 * ⚠️ 即时显示意味着**公开区可被任意写入**（没有人工审核）—— 撤下靠把 status 改成 pending。
 */
var fs = require('fs');
var path = require('path');

var src = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
var ENDPOINT = src.match(/endpoint:\s*'([^']+)'/)[1];
var KEY = src.match(/publishableKey:\s*'([^']+)'/)[1];
var sdk = require('@tencent-ai/workbuddy-cloud-sdk');
var cloud = sdk.createWorkBuddyCloud({ endpoint: ENDPOINT, publishableKey: KEY });

var checkOnly = process.argv.indexOf('--check-only') !== -1;
var MARK_PRV = '私密验收-' + Math.random().toString(36).slice(2, 6).toUpperCase();
var MARK_PUB = '公开验收-' + Math.random().toString(36).slice(2, 6).toUpperCase();
var MARK_PUB_LAST = '';   // --check-only 时用最近一条公开验收记录的标记（从视图里反查）
var pass = 0, fail = 0;

function ok(cond, label, detail) {
  if (cond) { pass++; console.log('  OK   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (detail ? '  → ' + detail : '')); }
}
function has(rows, mark) {
  return (rows || []).some(function (r) { return (r.message || '').indexOf(mark) === 0; });
}
function pubMarks(rows) {
  return (rows || []).filter(function (r) { return (r.message || '').indexOf('公开验收-') === 0; });
}

(async function () {
  console.log('后台：' + ENDPOINT);
  if (!checkOnly) {
    console.log('标记：私密=' + MARK_PRV + '  公开=' + MARK_PUB);

    console.log('\n=== 准备：匿名插入两条 ===');
    var a = await cloud.database.from('feedback').insert({
      name: '验收脚本', message: MARK_PRV + ' 这条是私密的，除了本人谁都不该看到。', visibility: 'private', version: 'V3.1'
    });
    ok(!a.error, '私密那条插入成功', a.error && (a.error.code + ' ' + a.error.message));
    var b = await cloud.database.from('feedback').insert({
      name: '验收脚本', message: MARK_PUB + ' 这条选择公开，应当立刻出现在墙上。', visibility: 'public', version: 'V3.1'
    });
    ok(!b.error, '公开那条插入成功（status 默认 approved ⇒ 即时显示）', b.error && (b.error.code + ' ' + b.error.message));
    console.log('  ⓘ 之后去面板把「' + MARK_PUB + '」那行的 status 改成 pending，再加 --check-only 验证「撤下」。');
  }

  console.log('\n=== 公开视图 ===');
  var v = await cloud.database.from('feedback_public').select('id,name,message,created_at').limit(50);
  if (v.error) {
    ok(false, '读公开视图', v.error.code + ' ' + v.error.message);
  } else {
    var rows = v.data || [];
    console.log('  ⓘ 视图现有 ' + rows.length + ' 条');
    ok(!has(rows, '私密验收-'), '① 私密内容不出现在公开视图里');
    if (checkOnly) {
      ok(pubMarks(rows).length === 0, '④ 已撤下的公开反馈不再出现（视图里 0 条公开验收记录）',
        '还有 ' + pubMarks(rows).length + ' 条：' + JSON.stringify(pubMarks(rows).map(function (r) { return r.message.slice(0, 20); })));
    } else {
      ok(has(rows, MARK_PUB), '② 公开那条已**立刻**出现在墙上（即时显示）',
        '视图里没找到 ' + MARK_PUB);
    }
  }

  console.log('\n=== 匿名直接读基础表：应为空（RLS 挡住） ===');
  var t = await cloud.database.from('feedback').select('id,message,visibility').limit(50);
  if (t.error) {
    ok(true, '读基础表被拒（' + (t.error.code || '') + '）');
  } else {
    ok(Array.isArray(t.data) && t.data.length === 0,
      '③ 基础表读回来是空数组（有授权但被 RLS 拦住）', JSON.stringify(t.data).slice(0, 120));
  }

  console.log('\n通过 ' + pass + ' / 失败 ' + fail);
  if (!fail) console.log('\n⇒ 私密读不到、公开即时上墙、基础表被 RLS 锁着 —— 三条都成立。');
  process.exit(fail ? 1 : 0);
})().catch(function (e) {
  console.log('跑挂了：' + (e && e.message ? e.message : e));
  process.exit(1);
});
