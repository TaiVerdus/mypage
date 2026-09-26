#!/usr/bin/env node
/** 验证「反馈墙」用的查询链在真实 SDK 上跑得通（与 script.js 里 MYPAGE_FB.listPublic 完全一致） */
var fs = require('fs');
var path = require('path');
var src = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
var ENDPOINT = src.match(/endpoint:\s*'([^']+)'/)[1];
var KEY = src.match(/publishableKey:\s*'([^']+)'/)[1];
var sdk = require('@tencent-ai/workbuddy-cloud-sdk');
var cloud = sdk.createWorkBuddyCloud({ endpoint: ENDPOINT, publishableKey: KEY });

cloud.database.from('feedback_public')
  .select('name,message,created_at')
  .order('created_at', { ascending: false })
  .limit(24)
  .then(function (res) {
    if (res && res.error) {
      console.log('FAIL：' + res.error.code + ' ' + res.error.message);
      process.exit(1);
    }
    var rows = (res && res.data) || [];
    console.log('OK：公开视图查询链可用，返回 ' + rows.length + ' 条');
    rows.slice(0, 3).forEach(function (r) {
      console.log('   · ' + (r.name || '匿名') + ' | ' + String(r.created_at).slice(0, 10) + ' | ' + String(r.message).slice(0, 30));
    });
    // 顺便证明：视图里**只有** id/name/message/created_at（relation/device/version/status 一概不暴露）
    cloud.database.from('feedback_public').select('*').limit(1).then(function (r2) {
      var rows2 = (r2 && r2.data) || [];
      if (!rows2.length) { console.log('   （视图暂时没有行，字段集这次没法验）'); return; }
      var keys = Object.keys(rows2[0]).sort().join(',');
      console.log('   视图字段集：' + keys +
        (keys === 'created_at,id,message,name' ? '  ✓ 只暴露该暴露的（没有 relation / device / version / status）'
                                               : '  ⚠️ 与预期不同，请检查视图定义'));
    });
  })
  .catch(function (e) { console.log('跑挂了：' + e.message); process.exit(1); });
