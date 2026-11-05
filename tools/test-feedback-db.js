#!/usr/bin/env node
// 本地回归测试：经过真实 HTTP 路由，用模拟的 CloudBase 响应检验入库协议。
'use strict';

const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const { test } = require('node:test');

const cloudUrl = 'https://feedback-test.api.tcloudbasegateway.com/v1/database/instances/(default)/databases/(default)/collections/feedback/documents';
const rows = new Map();
const nativeFetch = global.fetch;
let cloudFailure = false;
const newId = () => randomBytes(16).toString('hex');

process.env.PORT = '0';
process.env.DEEPSEEK_API_KEY = '';
process.env.CLOUDBASE_ENV_ID = 'feedback-test';
process.env.CLOUDBASE_APIKEY = 'fake-server-key';
global.fetch = async (url, options) => {
  assert.equal(url, cloudUrl);
  assert.equal(options.method, 'POST');
  assert.equal(options.headers.Authorization, 'Bearer fake-server-key');
  assert.equal(options.redirect, 'error');
  const { data } = JSON.parse(options.body);
  assert.equal(data.length, 1);
  const [row] = data;
  if (cloudFailure) return Response.json({ message: 'provider detail' }, { status: 500 });
  if (rows.has(row._id)) {
    return Response.json({ code: 'DATABASE_DUPLICATE_WRITE' }, { status: 409 });
  }
  rows.set(row._id, row);
  return Response.json({ insertedIds: [row._id] }, { status: 201 });
};

test('反馈 HTTP 路由', async (t) => {
  const server = require('../server.js');
  t.after(() => {
    server.closeAllConnections();
    server.close();
    global.fetch = nativeFetch;
  });
  await once(server, 'listening');
  const url = 'http://127.0.0.1:' + server.address().port + '/api/feedback';
  const data = {
    id: newId(),
    name: ' 试用昵称 ',
    relation: '老师',
    device: '手机',
    message: ' 正常的验收反馈 ',
    version: 'forged',
    extra: 'discarded'
  };

  const submit = (body, extraHeaders = {}) => nativeFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body)
  });

  await t.test('写入后才返回成功，筛掉多余字段并使用服务端版本和时间', async () => {
    const res = await submit(data);
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { ok: true });
    const row = rows.get(data.id);
    assert.deepEqual(row, {
      _id: data.id,
      name: '试用昵称',
      relation: '老师',
      device: '手机',
      message: '正常的验收反馈',
      version: 'Final',
      created_at: row.created_at
    });
    assert.ok(Number.isFinite(Date.parse(row.created_at)));
  });

  await t.test('重试相同 ID 时只保存一条', async () => {
    const res = await submit(data);
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { ok: true });
    assert.equal(rows.size, 1);
  });

  await t.test('禁止公开读取、跨站提交和错误的内容类型', async () => {
    assert.equal((await nativeFetch(url)).status, 405);
    assert.equal((await submit(data, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await submit(data, { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal(rows.size, 1);
  });

  await t.test('拒绝无效字段与过大的请求', async () => {
    assert.equal((await submit({ ...data, relation: '未提供' })).status, 400);
    assert.equal((await submit({ ...data, message: '   ' })).status, 400);
    assert.equal((await submit({ ...data, message: '字'.repeat(3000) })).status, 413);
    assert.equal(rows.size, 1);
  });

  await t.test('CloudBase 写入失败时不报成功，也不透出上游详情', async () => {
    cloudFailure = true;
    const res = await submit({ ...data, id: newId() });
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.equal(body.error.message, '反馈暂时无法保存，请稍后重试');
    assert.equal(rows.size, 1);
  });

  await t.test('反馈请求有独立的限速额度', async () => {
    cloudFailure = false;
    for (let i = 0; i < 17; i++) {
      assert.equal((await submit(data)).status, 201);
    }
    assert.equal((await submit(data)).status, 429);
    const chat = await nativeFetch(new URL('/api/chat', url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: '你好' }] })
    });
    assert.equal(chat.status, 503);
  });
});
