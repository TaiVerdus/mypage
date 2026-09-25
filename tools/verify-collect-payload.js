#!/usr/bin/env node
/** 按 script.js 里 collect() 修复后的原样字段，实测一条插入（验证 page_version→version 的修复） */
var fs = require('fs');
var path = require('path');
var src = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
var mE = src.match(/endpoint:\s*'([^']+)'/);
var mK = src.match(/publishableKey:\s*'([^']+)'/);
if (!mE || !mK) { console.log('✗ 没读到 CLOUD_CONFIG'); process.exit(2); }
var sdk = require('@tencent-ai/workbuddy-cloud-sdk');
var cloud = sdk.createWorkBuddyCloud({ endpoint: mE[1], publishableKey: mK[1] });

cloud.database.from('feedback').insert({
  name: '释贤自查',
  relation: '其他',
  device: '电脑',
  message: '线上-PC-A7K3 字段名修复验证（page_version → version）',
  version: 'V3.0'
}).then(function (r) {
  if (r.error) { console.log('FAIL:', r.error.code, r.error.message); process.exit(1); }
  console.log('OK：按页面修复后的原样字段插入成功 —— 修复生效');
  process.exit(0);
}).catch(function (e) { console.log('跑挂了：' + e.message); process.exit(1); });
