// T05：L3 雲端閘道（Worker 原始碼）的限流／錯誤處理，以及用戶端在雲端失敗時退回本機（L1）回答。
// Worker 以假的 env（記憶體 KV、假模型）在 Node 執行，沒有連到 Cloudflare；實際部署未驗收。
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../ai/cloud-gateway/worker.js';
import { createPrincessAI } from '../../ai/princess-ai.js';

function kv() { const m = new Map(); return { get: async k => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } }; }
const post = (body, headers = {}) => new Request('https://gw.example/v1/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9', ...headers }, body: JSON.stringify(body) });
const INSTALL = 'a1b2c3d4e5f6a7b8c9d0e1f2';

test('Worker：正常回答只回 reply，並清除 HTML', async () => {
  const env = { RATE: kv(), AI: { run: async () => ({ response: '<b>嗨</b>，我是小公主！' }) } };
  const r = await worker.fetch(post({ text: '你好', install: INSTALL }), env);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { reply: '嗨，我是小公主！' });
});

test('Worker：超過每分鐘次數回 429 與 Retry-After', async () => {
  const env = { RATE: kv(), LIMIT_PER_MINUTE: '3', AI: { run: async () => ({ response: '好' }) } };
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await worker.fetch(post({ text: '你好', install: INSTALL }), env)).status);
  assert.deepEqual(codes, [200, 200, 200, 429, 429]);
  const r = await worker.fetch(post({ text: '你好', install: INSTALL }), env);
  assert.equal(r.headers.get('Retry-After'), '10');
});

test('Worker：拒絕錯誤格式、過長內容與錯誤路徑；模型錯誤回 502', async () => {
  const env = { RATE: kv(), AI: { run: async () => { throw new Error('boom'); } } };
  assert.equal((await worker.fetch(post({ text: '', install: INSTALL }), env)).status, 400);
  assert.equal((await worker.fetch(post({ text: 'x'.repeat(501), install: INSTALL }), env)).status, 400);
  assert.equal((await worker.fetch(post({ text: 'hi', install: 'not-hex' }), env)).status, 400);
  assert.equal((await worker.fetch(new Request('https://gw.example/admin', { method: 'GET' }), env)).status, 404);
  assert.equal((await worker.fetch(post({ text: 'hi', install: INSTALL }), env)).status, 502);
  assert.equal((await worker.fetch(post({ text: 'hi', install: INSTALL }), { RATE: kv() })).status, 503);
});

function aiWith(cloud) {
  return createPrincessAI({
    now: () => new Date(2026, 10, 27, 10, 0), random: () => 0,
    api: {
      calendar: async () => ({ events: [], rev: 0 }), state: async () => ({ residents: {}, total: 0 }),
      propose: async () => { throw new Error('no'); }, commit: async () => { throw new Error('no'); },
      mode: async () => ({ mode: 'personal', device: false, cloud: true }), cloud
    }
  });
}
test('用戶端：雲端 429／離線時退回本機回答，不假造雲端答案', async () => {
  for (const fail of [new Error('rate_limited'), new Error('offline')]) {
    const r = await aiWith(async () => { throw fail; }).handle('你最喜歡什麼顏色');
    assert.equal(r.source, 'L1');
    assert.match(r.reply, /聽不太懂/);
  }
});
test('用戶端：雲端回答被清除標籤、限制長度，而且行事曆仍走本機確認流程', async () => {
  const ai = aiWith(async () => '<img src=x onerror=alert(1)>我喜歡粉紅色' + '喔'.repeat(400));
  const r = await ai.handle('你最喜歡什麼顏色');
  assert.equal(r.source, 'L3');
  assert.ok(!r.reply.includes('<'));
  assert.ok(r.reply.length <= 300);
  let cloudCalled = false;
  const ai2 = aiWith(async () => { cloudCalled = true; return '已經幫你新增'; });
  const r2 = await ai2.handle('今天有什麼行程');
  assert.equal(r2.action, 'calendar_query');
  assert.equal(cloudCalled, false, 'calendar intents never go to the cloud');
});
