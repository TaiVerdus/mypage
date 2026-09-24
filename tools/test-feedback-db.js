#!/usr/bin/env node
/**
 * 反馈后台的「真机验收」（V3 · 2026-09-24 改走 WorkBuddy 云服务）
 *
 * 为什么要有它：课件第 28 页说得很清楚 —— **不能只看网页提示「提交成功」**；
 * 第 18 页又说「页面隐藏不等于安全」，权限必须由**数据库层真的拒绝**才算数。
 * 这个脚本就用**公开配置**（endpoint + publishableKey，都从 script.js 里现读）去问三件事：
 *
 *   ① 匿名访客能插入一条反馈吗？          → 期待成功
 *   ② 匿名访客能读回反馈吗？              → 期待被拒（GRANT 只给了 INSERT + RLS 没有读策略）
 *   ③ 空内容会被数据库拒绝吗？            → 期待失败（建表时的 CHECK 约束在干活）
 *
 * 用法（先装官方 SDK，再跑）：
 *   npm install --prefix <隔离的 node 工作区> @tencent-ai/workbuddy-cloud-sdk@dev
 *   NODE_PATH=<隔离的 node 工作区>/node_modules node tools/test-feedback-db.js
 *
 * ⚠️ 用的是浏览器同款 SDK（不是手写 fetch）—— 手写 /.cloud/** 请求是错的。
 * ⚠️ 只需要公开配置；高权限凭据（数据库密码 / 平台密钥）不进这个脚本、也不进任何前端文件。
 * ⚠️ 它会真往表里写一条测试记录（带唯一标记），可在数据库管理界面删掉，也可以留着当证据。
 */

var fs = require('fs');
var path = require('path');

// ---- 配置从 script.js 现读，保证「验的就是线上用的那份」----
var scriptPath = path.join(__dirname, '..', 'script.js');
var src = fs.readFileSync(scriptPath, 'utf8');
var mEndpoint = src.match(/endpoint:\s*'([^']+)'/);
var mKey = src.match(/publishableKey:\s*'([^']+)'/);
if (!mEndpoint || !mKey) {
  console.log('✗ 没能从 script.js 里读到 CLOUD_CONFIG（改了写法？）');
  process.exit(2);
}
var ENDPOINT = mEndpoint[1];
var KEY = mKey[1];

var sdk;
try {
  sdk = require('@tencent-ai/workbuddy-cloud-sdk');
} catch (e) {
  console.log('✗ 没找到官方 SDK。先装再跑：');
  console.log('   npm install --prefix <隔离的 node 工作区> @tencent-ai/workbuddy-cloud-sdk@dev');
  console.log('   NODE_PATH=<隔离的 node 工作区>/node_modules node tools/test-feedback-db.js');
  process.exit(2);
}

var cloud = sdk.createWorkBuddyCloud({ endpoint: ENDPOINT, publishableKey: KEY });
var MARK = '自查-' + Math.random().toString(36).slice(2, 6).toUpperCase();
var pass = 0, fail = 0;

function ok(cond, label, detail) {
  if (cond) { pass++; console.log('  OK   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (detail ? '  → ' + detail : '')); }
}

(async function () {
  console.log('后台：' + ENDPOINT);
  console.log('标记：' + MARK + '（用它在数据库里认出这条测试记录）');
  console.log('');

  console.log('=== ① 匿名访客能不能插入一条反馈 ===');
  var ins = await cloud.database.from('feedback').insert({
    name: '自查脚本',
    relation: '其他',
    device: '电脑',
    message: MARK + ' 这条是验收脚本自动写的，用来确认「能收到、能存下」。',
    version: 'V3.0'
  });
  ok(!ins.error, '插入成功（能收到、能存下）',
    ins.error ? (ins.error.code + ' ' + ins.error.message) : '');

  console.log('\n=== ② 匿名访客能不能读回反馈（权限是否真的挡住） ===');
  var sel = await cloud.database.from('feedback').select('id, message').limit(5);
  var rows = sel.data;
  if (sel.error) {
    ok(true, '读取被拒（' + (sel.error.code || '') + ' ' + (sel.error.message || '').slice(0, 60) + '）');
  } else {
    ok(Array.isArray(rows) && rows.length === 0,
      '读回来是空数组（没有读策略 ⇒ 看不到任何人的反馈）',
      JSON.stringify(rows).slice(0, 120));
  }

  console.log('\n=== ③ 数据库层约束（空内容应当被拒） ===');
  var bad = await cloud.database.from('feedback').insert({
    message: '', relation: '其他', device: '电脑', version: 'V3.0'
  });
  ok(!!bad.error, '空 message 被数据库拒绝（不只是靠前端拦）',
    bad.error ? (bad.error.code + ' ' + bad.error.message) : '竟然成功了');

  console.log('\n通过 ' + pass + ' / 失败 ' + fail);
  if (!fail) {
    console.log('\n⇒ 三条都过：后台真的在收、权限真的在挡、约束真的在管。');
    console.log('  去云服务的数据管理界面搜「' + MARK + '」，应该正好能看到那一条。');
  }
  process.exit(fail ? 1 : 0);
})().catch(function (e) {
  console.log('跑挂了：' + (e && e.message ? e.message : e));
  console.log('先确认：endpoint / publishableKey 对不对、网络能不能到后台。');
  process.exit(1);
});
