// 對話路由測試：確認流程、未確認寫入 0 次、補問、重複、多筆選擇、L2/L3 降級
// 本機服務以記憶體中的測試替身取代，計算實際寫入次數。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPrincessAI } from '../../ai/princess-ai.js';
import { classify } from '../../ai/local-intent.js';
import { SENTENCES } from './sentences.mjs';

const NOW = () => new Date(2026, 10, 27, 10, 0, 0);
function fakeService(events = []) {
  const cal = { events: events.map(e => ({ ...e })), rev: 0 };
  const tokens = new Map();
  const stats = { writes: 0, proposals: 0 };
  return {
    stats, cal,
    calendar: async () => ({ events: cal.events.map(e => ({ ...e })), rev: cal.rev }),
    state: async () => ({ residents: { fox: 2, sheep: 2, bird: 1 }, total: 5 }),
    mode: async () => ({ mode: 'official', device: false, cloud: false }),
    propose: async ({ requestId, op, event }) => { stats.proposals++; const t = 'tok' + stats.proposals; tokens.set(t, { requestId, op, event }); return { confirmToken: t }; },
    commit: async ({ requestId, confirmToken }) => {
      const p = tokens.get(confirmToken);
      if (!p || p.requestId !== requestId) throw new Error('確認權杖無效');
      tokens.delete(confirmToken);
      stats.writes++;
      if (p.op === 'add') cal.events.push({ id: 'e' + stats.writes, ...p.event });
      if (p.op === 'update') cal.events = cal.events.map(e => e.id === p.event.id ? { ...e, ...p.event } : e);
      if (p.op === 'delete') cal.events = cal.events.filter(e => e.id !== p.event.id);
      cal.rev++;
      return { ok: true };
    }
  };
}
const ai = svc => createPrincessAI({ api: svc, now: NOW, random: () => 0 });

test('新增：先提案，確認後才寫入', async () => {
  const s = fakeService(), a = ai(s);
  const r1 = await a.handle('下週一下午兩點開會');
  assert.equal(r1.action, 'calendar_add');
  assert.match(r1.reply, /2026 年 11 月 30 日（一） 下午 2:00「開會」/);
  assert.equal(s.stats.writes, 0, '提案時不可寫入');
  const r2 = await a.handle('好');
  assert.equal(r2.committed, true);
  assert.equal(s.stats.writes, 1);
  assert.deepEqual(s.cal.events.map(e => [e.date, e.time, e.title]), [['2026-11-30', '14:00', '開會']]);
});
test('拒絕或換話題都不寫入', async () => {
  const s = fakeService(), a = ai(s);
  await a.handle('明天早上九點看醫生'); await a.handle('不要');
  await a.handle('後天晚上七點聚餐'); await a.handle('星球上有哪些居民');
  await a.handle('好');                       // 已換過話題，「好」不能再觸發寫入
  assert.equal(s.stats.writes, 0);
});
test('缺標題、缺日期、模糊週幾都會先問', async () => {
  const s = fakeService(), a = ai(s);
  let r = await a.handle('下週一下午兩點');
  assert.match(r.reply, /要記下什麼事情/);
  r = await a.handle('牙醫回診');
  assert.match(r.reply, /牙醫回診/); assert.equal(s.stats.writes, 0);
  await a.handle('不要');
  r = await a.handle('提醒我開會');
  assert.match(r.reply, /哪一天/);
  r = await a.handle('週五下午三點開會');
  assert.match(r.reply, /今天.*還是下週/);
  r = await a.handle('下週');
  assert.match(r.reply, /12 月 4 日/);
  assert.equal(s.stats.writes, 0);
});
test('重複行程會提醒，仍需確認', async () => {
  const s = fakeService([{ id: 'a', date: '2026-11-30', time: '14:00', title: '開會' }]), a = ai(s);
  const r = await a.handle('下週一下午兩點開會');
  assert.match(r.reply, /一模一樣/); assert.equal(s.stats.writes, 0);
});
test('刪除：多筆符合時先問第幾個，確認後只刪那一筆', async () => {
  const s = fakeService([
    { id: 'a', date: '2026-11-28', time: '12:00', title: '聚餐' },
    { id: 'b', date: '2026-11-28', time: '19:00', title: '家庭聚餐' },
    { id: 'c', date: '2026-11-29', time: '', title: '報告' }]), a = ai(s);
  let r = await a.handle('取消明天的聚餐');
  assert.match(r.reply, /第幾個/);
  r = await a.handle('第二個');
  assert.match(r.reply, /刪除.*家庭聚餐/);
  assert.equal(s.stats.writes, 0);
  await a.handle('確定');
  assert.deepEqual(s.cal.events.map(e => e.id), ['a', 'c']);
});
test('修改：改到新的日期與時間', async () => {
  const s = fakeService([{ id: 'a', date: '2026-11-28', time: '10:00', title: '會議' }]), a = ai(s);
  const r = await a.handle('把明天的會議改到後天下午三點');
  assert.match(r.reply, /改成 2026 年 11 月 29 日（日） 下午 3:00「會議」/);
  await a.handle('好');
  assert.deepEqual(s.cal.events[0], { id: 'a', date: '2026-11-29', time: '15:00', title: '會議' });
});
test('確認權杖只能用一次（重放被拒）', async () => {
  const s = fakeService(), a = ai(s);
  await a.handle('明天下午四點繳費');
  await a.handle('好');
  const r = await a.confirm();                 // 再確認一次：沒有待確認的提案
  assert.match(r.reply, /沒有需要確認/);
  assert.equal(s.stats.writes, 1);
});
test('找不到的行程不會亂刪', async () => {
  const s = fakeService([{ id: 'a', date: '2026-11-28', time: '10:00', title: '會議' }]), a = ai(s);
  const r = await a.handle('刪除下週三的面試');
  assert.match(r.reply, /找不到/); assert.equal(s.stats.writes, 0);
});
test('查詢只依真實行程回答，不捏造', async () => {
  const s = fakeService([{ id: 'a', date: '2026-11-27', time: '15:00', title: '簡報' }]), a = ai(s);
  let r = await a.handle('今天有什麼行程');
  assert.match(r.reply, /1 個行程：11\/27 下午 3:00「簡報」/);
  r = await a.handle('明天有什麼行程');
  assert.match(r.reply, /沒有行程/);
});
test('公務模式：非行事曆聊天只用 L1，不呼叫裝置端或雲端', async () => {
  const s = fakeService(); let called = 0;
  s.device = async () => { called++; return '裝置端'; }; s.cloud = async () => { called++; return '雲端'; };
  const a = ai(s);
  const r = await a.handle('跟我聊聊量子力學');
  assert.equal(r.source, 'L1'); assert.equal(called, 0);
});
test('個人模式：雲端失敗（429／斷網）回到 L1', async () => {
  const s = fakeService();
  s.mode = async () => ({ mode: 'personal', device: false, cloud: true });
  s.cloud = async () => { throw new Error('429'); };
  const r = await ai(s).handle('跟我聊聊量子力學');
  assert.equal(r.source, 'L1');
});
test('L2 回覆會清除 HTML 且沒有操作權', async () => {
  const s = fakeService();
  s.mode = async () => ({ mode: 'device', device: true, cloud: false });
  s.device = async () => '<img src=x onerror=alert(1)>你好，我是裝置端模型';
  const r = await ai(s).handle('說個冷知識');
  assert.equal(r.source, 'L2'); assert.equal(r.action, 'none'); assert.doesNotMatch(r.reply, /</);
});
test('主動問候：冷卻 15 分鐘、每小時最多 2 次、勿擾不問候', async () => {
  let t = new Date(2026, 10, 27, 9, 0).getTime();
  const a = createPrincessAI({ api: fakeService(), now: () => new Date(t), random: () => 0 });
  assert.ok(a.proactiveGreeting());
  t += 10 * 60e3; assert.equal(a.proactiveGreeting(), null);
  t += 6 * 60e3; assert.ok(a.proactiveGreeting());
  t += 20 * 60e3; assert.equal(a.proactiveGreeting(), null, '一小時內第三次');
  t += 60 * 60e3; a.dnd = true; assert.equal(a.proactiveGreeting(), null);
});
test('30 句語音測試語句的文字意圖正確率（目標 ≥90%）', () => {
  let ok = 0; const bad = [];
  for (const [text, intent] of SENTENCES) {
    const got = classify(text, { now: NOW() }).intent;
    if (got === intent) ok++; else bad.push(`「${text}」期望 ${intent} 實得 ${got}`);
  }
  if (bad.length) console.log('意圖錯誤：\n  ' + bad.join('\n  '));
  console.log(`文字意圖正確率 ${ok}/${SENTENCES.length}`);
  assert.ok(SENTENCES.length >= 30);
  assert.ok(ok / SENTENCES.length >= .9);
});
