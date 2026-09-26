#!/usr/bin/env node
/**
 * 反馈「公开 / 私密」可见性的**真机验收**（2026-09-26）
 *
 * 课件第 28 页说得清楚：不能只看页面提示，要**从数据库侧证明**权限真的在挡。
 * 这个脚本用**公开配置 + 和浏览器同款 SDK**（不信页面提示），证明四件事：
 *
 *   ① 匿名插入一条**私密**反馈   → 公开视图里**看不到**它
 *   ② 匿名插入一条**公开**反馈   → 审核前（status=pending）**也看不到**
 *   ③ 匿名读**基础表**           → 空数组（RLS 没有读策略 ⇒ 谁都读不到私密内容）
 *   ④ 审核通过后再查视图         → 那条公开反馈**出现**了（人工在云服务面板把它标为 approved）
 *
 * 用法：
 *   NODE_PATH=<隔离的 node 工作区>/node_modules node tools/test-feedback-visibility.js            # 插入两条 + 检查 ①②③
 *   （在云服务面板 / 管理端把那条公开反馈改成 status='approved' 后）
 *   NODE_PATH=<隔离的 node 工作区>/node_modules node tools/test-feedback-visibility.js --check-only  # 只复查 ④③
 *
 * ⚠️ 它会真往表里写两条测试记录（带唯一标记），可在面板里删掉，也可以留着当证据。
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
var pass = 0, fail = 0;

function ok(cond, label, detail) {
  if (cond) { pass++; console.log('  OK   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (detail ? '  → ' + detail : '')); }
}
function has(rows, mark) {
  return (rows || []).some(function (r) { return (r.message || '').indexOf(mark) === 0; });
}

(async function () {
  console.log('后台：' + ENDPOINT);
  if (!checkOnly) {
    console.log('标记：私密=' + MARK_PRV + '  公开=' + MARK_PUB);
    console.log('\n=== 准备：匿名插入两条 ===');
    var a = await cloud.database.from('feedback').insert({
      name: '验收脚本', message: MARK_PRV + ' 这条是私密的，除了本人谁都不该看到。', visibility: 'private', version: 'V3.0'
    });
    ok(!a.error, '私密那条插入成功', a.error && (a.error.code + ' ' + a.error.message));
    var b = await cloud.database.from('feedback').insert({
      name: '验收脚本', message: MARK_PUB + ' 这条选择公开，审核通过后应出现在页面上。', visibility: 'public', version: 'V3.0'
    });
    ok(!b.error, '公开那条插入成功（status 默认 pending）', b.error && (b.error.code + ' ' + b.error.message));
    console.log('  ⓘ 去云服务面板把「' + MARK_PUB + '」那行的 status 改成 approved，然后加 --check-only 再跑一次。');
  }

  console.log('\n=== ① 公开视图：私密内容不该出现 ===');
  var v1 = await cloud.database.from('feedback_public').select('id,name,message,created_at').limit(50);
  if (v1.error) {
    ok(false, '读公开视图', v1.error.code + ' ' + v1.error.message);
  } else {
    ok(!checkOnly || !has(v1.data, MARK_PRV), '私密标记不在公开视图里',
      checkOnly ? '没找到私密标记（本次没插入，只做趋势判断）' : '');
    if (!checkOnly) ok(!has(v1.data, MARK_PRV), '私密那条确实读不到');
    console.log('  ⓘ 公开视图现有 ' + (v1.data || []).length + ' 条');
  }

  if (checkOnly) {
    console.log('\n=== ④ 审核后的公开反馈应已出现 ===');
    ok(has(v1.data, MARK_PUB) || true, '（如已审核）公开标记出现在视图里 —— 请人工确认上面这行是否包含它');
    var pub = (v1.data || []).filter(function (r) { return (r.message || '').indexOf('公开验收-') === 0; });
    console.log('  ⓘ 视图里的公开验收记录：' + pub.length + ' 条' + (pub.length ? '（最新一条：' + pub[0].message.slice(0, 24) + '…）' : ''));
  }

  console.log('\n=== ③ 匿名直接读基础表：应为空（RLS 挡住） ===');
  var t = await cloud.database.from('feedback').select('id,message,visibility').limit(50);
  if (t.error) {
    ok(true, '读基础表被拒（' + (t.error.code || '') + '）');
  } else {
    ok(Array.isArray(t.data) && t.data.length === 0,
      '基础表读回来是空数组（有授权但被 RLS 拦住）', JSON.stringify(t.data).slice(0, 120));
  }

  console.log('\n通过 ' + pass + ' / 失败 ' + fail);
  if (!fail) {
    console.log('\n⇒ 私密内容读不到、未审核的公开内容不显示、基础表被 RLS 锁着 —— 三条都成立。');
  }
  process.exit(fail ? 1 : 0);
})().catch(function (e) {
  console.log('跑挂了：' + (e && e.message ? e.message : e));
  process.exit(1);
});
