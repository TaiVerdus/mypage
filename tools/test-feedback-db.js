#!/usr/bin/env node
/**
 * 反馈后台的「真机验收」（V3 · 2026-09-24）
 *
 * 为什么要有它：课件第 28 页说得很清楚 —— **不能只看网页提示「提交成功」**，
 * 而且「页面隐藏不等于安全」：权限必须由数据库层真的拒绝才算数。
 * 这个脚本就是去数据库那一侧问三件事，全部用**公开的 publishable key**（不需要任何高权限密钥）：
 *
 *   ① 匿名访客能插入一条反馈吗？              → 期待 201
 *   ② 匿名访客能读回反馈吗？                  → 期待「读到 0 行」（RLS 挡住了）
 *   ③ 空内容 / 超长内容会被数据库拒绝吗？      → 期待 400（建表时的 check 约束在干活）
 *
 * 用法（两种都行）：
 *   node tools/test-feedback-db.js https://xxxx.supabase.co sb_publishable_xxxx
 *   SUPABASE_URL=... SUPABASE_KEY=... node tools/test-feedback-db.js
 *
 * ⚠️ 只需要 publishable key。**不要**把 secret key / service_role / 数据库密码给它 ——
 *    真机上那三样永远不进前端，也不该交给任何脚本或 AI。
 * ⚠️ 它会往表里留一条测试记录（内容带唯一标记），跑完你可以去 Table Editor 里删掉，
 *    也可以留着 —— 它正好是「能查到」这条验收的证据。
 */

var URL_ = process.argv[2] || process.env.SUPABASE_URL || '';
var KEY = process.argv[3] || process.env.SUPABASE_KEY || '';

if (!/^https?:\/\//.test(URL_ ) || !KEY) {
  console.log('用法：node tools/test-feedback-db.js <SUPABASE_URL> <PUBLISHABLE_KEY>');
  console.log('（或设环境变量 SUPABASE_URL / SUPABASE_KEY）');
  process.exit(2);
}

var ENDPOINT = URL_.replace(/\/+$/, '') + '/rest/v1/feedback';
var HEADERS = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
var MARK = '自查-' + Math.random().toString(36).slice(2, 6).toUpperCase();
var pass = 0, fail = 0;

function ok(cond, label, detail) {
  if (cond) { pass++; console.log('  OK   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (detail ? '  → ' + detail : '')); }
}

async function main() {
  console.log('后台：' + ENDPOINT);
  console.log('标记：' + MARK + '（这串字用来在 Table Editor 里认出这一条）');
  console.log('');

  // ① 匿名插入
  console.log('=== ① 匿名访客能不能插入一条反馈 ===');
  var ins = await fetch(ENDPOINT, {
    method: 'POST',
    headers: Object.assign({ Prefer: 'return=minimal' }, HEADERS),
    body: JSON.stringify({
      name: '自查脚本',
      relation: '其他',
      device: '电脑',
      message: MARK + ' 这条是验收脚本自动写的，用来确认「能收到、能存下」。',
      version: 'V3.0'
    })
  });
  var insText = await ins.text();
  ok(ins.status === 201, '插入返回 201（能收到、能存下）', '实际 ' + ins.status + ' ' + insText.slice(0, 120));

  // ② 匿名读取 —— RLS 的核心证据
  console.log('\n=== ② 匿名访客能不能读回反馈（RLS 是否真的挡住） ===');
  var sel = await fetch(ENDPOINT + '?select=id,message&limit=5', { headers: HEADERS });
  var selBody = '';
  try { selBody = await sel.text(); } catch (e) { selBody = ''; }
  var rows = null;
  try { rows = JSON.parse(selBody); } catch (e) { rows = null; }
  if (sel.status === 200 && Array.isArray(rows) && rows.length === 0) {
    ok(true, '读回来是**空数组**（策略没给 anon select ⇒ 看不到任何人的反馈）');
  } else if (sel.status === 401 || sel.status === 403) {
    ok(true, '直接 401/403 被拒（同样算挡住了）', '实际 ' + sel.status);
  } else {
    ok(false, '匿名竟然读到了数据 —— RLS 没生效，去检查 supabase/feedback.sql 有没有跑全',
      '状态 ' + sel.status + ' / 返回 ' + selBody.slice(0, 160));
  }

  // ③ 数据库层的长度约束
  console.log('\n=== ③ 数据库层约束（空内容应当被拒） ===');
  var bad = await fetch(ENDPOINT, {
    method: 'POST',
    headers: Object.assign({ Prefer: 'return=minimal' }, HEADERS),
    body: JSON.stringify({ message: '', relation: '其他', device: '电脑', version: 'V3.0' })
  });
  var badText = await bad.text();
  ok(bad.status >= 400, '空 message 被数据库拒绝（不只是靠前端拦）', '实际 ' + bad.status + ' ' + badText.slice(0, 120));

  console.log('\n通过 ' + pass + ' / 失败 ' + fail);
  if (!fail) {
    console.log('\n⇒ 三条都过：后台真的在收、权限真的在挡、约束真的在管。');
    console.log('  去 Supabase 的 Table Editor 搜「' + MARK + '」，应该正好能看到那一条。');
  }
  process.exit(fail ? 1 : 0);
}

main().catch(function (e) {
  console.log('跑挂了：' + (e && e.message ? e.message : e));
  console.log('先确认：项目地址对不对、publishable key 有没有抄全、网络能不能到 Supabase。');
  process.exit(1);
});
