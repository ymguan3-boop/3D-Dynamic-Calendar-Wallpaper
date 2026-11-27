// T03 行事曆解析測試：基準時間固定為 2026-11-27（星期五）上午 10:00（本機時區）
// 執行：node --test tests/ai/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../../ai/local-intent.js';

const NOW = new Date(2026, 10, 27, 10, 0, 0);
// [輸入, 期望]：intent 必比；有寫的欄位才比
const CASES = [
  // ---- 新增：相對日期 ----
  ['下週一下午兩點開會', { intent: 'calendar_add', date: '2026-11-30', time: '14:00', title: '開會' }],
  ['明天早上九點看醫生', { intent: 'calendar_add', date: '2026-11-28', time: '09:00', title: '看醫生' }],
  ['後天晚上七點聚餐', { intent: 'calendar_add', date: '2026-11-29', time: '19:00', title: '聚餐' }],
  ['大後天上午十點半面試', { intent: 'calendar_add', date: '2026-11-30', time: '10:30', title: '面試' }],
  ['今天下午三點十五分簡報', { intent: 'calendar_add', date: '2026-11-27', time: '15:15', title: '簡報' }],
  ['三天後下午兩點開會', { intent: 'calendar_add', date: '2026-11-30', time: '14:00', title: '開會' }],
  ['10天後上午九點考試', { intent: 'calendar_add', date: '2026-12-07', time: '09:00', title: '考試' }],
  ['明天下午 5:30 運動', { intent: 'calendar_add', date: '2026-11-28', time: '17:30', title: '運動' }],
  ['明天凌晨一點值班', { intent: 'calendar_add', date: '2026-11-28', time: '01:00', title: '值班' }],
  ['明晚八點看電影', { intent: 'calendar_add', date: '2026-11-28', time: '20:00', title: '看電影' }],
  ['今晚十點讀書會', { intent: 'calendar_add', date: '2026-11-27', time: '22:00', title: '讀書會' }],
  ['明天三點開會', { intent: 'calendar_add', date: '2026-11-28', time: '15:00', timeAssumed: 'pm' }],
  ['明天九點開會', { intent: 'calendar_add', date: '2026-11-28', time: '09:00' }],
  ['明天兩點半面試', { intent: 'calendar_add', date: '2026-11-28', time: '14:30', timeAssumed: 'pm' }],
  ['提醒我明天下午四點繳費', { intent: 'calendar_add', date: '2026-11-28', time: '16:00', title: '繳費' }],
  ['幫我新增下週五上午十點的簡報', { intent: 'calendar_add', date: '2026-12-04', time: '10:00', title: '簡報' }],
  ['下週一下午兩點跟王科長開會', { intent: 'calendar_add', date: '2026-11-30', time: '14:00', title: '王科長開會' }],
  ['下週一開會', { intent: 'calendar_add', date: '2026-11-30', time: undefined, title: '開會' }],
  // ---- 新增：週幾 ----
  ['這週六下午運動', { intent: 'calendar_add', date: '2026-11-28', title: '運動' }],
  ['週日上午十點讀書會', { intent: 'calendar_add', date: '2026-11-29', time: '10:00', title: '讀書會' }],
  ['下下週三上午十點訓練', { intent: 'calendar_add', date: '2026-12-09', time: '10:00', title: '訓練' }],
  ['星期二晚上七點健身', { intent: 'calendar_add', date: '2026-12-01', time: '19:00', title: '健身' }],
  ['禮拜四中午十二點聚餐', { intent: 'calendar_add', date: '2026-12-03', time: '12:00', title: '聚餐' }],
  ['下週三中午吃飯', { intent: 'calendar_add', date: '2026-12-02', time: '12:00', title: '吃飯' }],
  ['下週三晚上聚餐', { intent: 'calendar_add', date: '2026-12-02', title: '聚餐' }],
  ['週五下午三點開會', { intent: 'calendar_add', issues: ['ambiguous_weekday'] }],
  // ---- 新增：絕對日期、跨月、跨年、民國年 ----
  ['12月3號下午2點開會', { intent: 'calendar_add', date: '2026-12-03', time: '14:00', title: '開會' }],
  ['十二月二十五日晚上八點聚會', { intent: 'calendar_add', date: '2026-12-25', time: '20:00', title: '聚會' }],
  ['2027年1月5日上午9點出差', { intent: 'calendar_add', date: '2027-01-05', time: '09:00', title: '出差' }],
  ['民國115年12月10日下午4點查核', { intent: 'calendar_add', date: '2026-12-10', time: '16:00', title: '查核' }],
  ['115年12月11日上午十點會勘', { intent: 'calendar_add', date: '2026-12-11', time: '10:00', title: '會勘' }],
  ['2026/12/15 14:30 報告', { intent: 'calendar_add', date: '2026-12-15', time: '14:30', title: '報告' }],
  ['115/12/16 上午9點 研習', { intent: 'calendar_add', date: '2026-12-16', time: '09:00', title: '研習' }],
  ['11月20日開會', { intent: 'calendar_add', date: '2027-11-20', title: '開會' }],
  ['1/8 下午三點 回診', { intent: 'calendar_add', date: '2027-01-08', time: '15:00', title: '回診' }],
  ['30號下午兩點繳費', { intent: 'calendar_add', date: '2026-11-30', time: '14:00', title: '繳費' }],
  ['5號上午十點交件', { intent: 'calendar_add', date: '2026-12-05', time: '10:00', title: '交件' }],
  ['下個月3號開會', { intent: 'calendar_add', date: '2026-12-03', title: '開會' }],
  ['下個月15號下午兩點研習', { intent: 'calendar_add', date: '2026-12-15', time: '14:00', title: '研習' }],
  ['月底交件', { intent: 'calendar_add', date: '2026-11-30', title: '交件' }],
  ['下個月月底報告', { intent: 'calendar_add', date: '2026-12-31', title: '報告' }],
  // ---- 閏日與無效日期 ----
  ['2028年2月29日上午十點生日', { intent: 'calendar_add', date: '2028-02-29', time: '10:00', title: '生日' }],
  ['2027年2月29日開會', { intent: 'calendar_add', issues: ['invalid_date'] }],
  ['2月30日開會', { intent: 'calendar_add', issues: ['invalid_date'] }],
  ['2月29日上午十點開會', { intent: 'calendar_add', issues: ['invalid_date'] }],
  ['12月24日晚上12點聚會', { intent: 'calendar_add', issues: ['ambiguous_time'] }],
  // ---- 語音辨識輸出（簡體、詞間空白） ----
  ['下 周 一 下午 两点 开会', { intent: 'calendar_add', date: '2026-11-30', time: '14:00', title: '开会' }],
  ['明天 下午 三 点 半 面试', { intent: 'calendar_add', date: '2026-11-28', time: '15:30', title: '面试' }],
  // ---- 查詢 ----
  ['今天有什麼行程', { intent: 'calendar_query', date: '2026-11-27' }],
  ['明天有什麼行程', { intent: 'calendar_query', date: '2026-11-28' }],
  ['下週的行程', { intent: 'calendar_query', range: ['2026-11-30', '2026-12-06'] }],
  ['這週有哪些行程', { intent: 'calendar_query', range: ['2026-11-23', '2026-11-29'] }],
  ['這個月的行程', { intent: 'calendar_query', range: ['2026-11-01', '2026-11-30'] }],
  ['下個月有什麼安排', { intent: 'calendar_query', range: ['2026-12-01', '2026-12-31'] }],
  ['12月有什麼行程', { intent: 'calendar_query', range: ['2026-12-01', '2026-12-31'] }],
  ['接下來有什麼事', { intent: 'calendar_query', range: ['2026-11-27', '2026-12-04'] }],
  ['下週一有空嗎', { intent: 'calendar_query', date: '2026-11-30' }],
  // ---- 修改、刪除 ----
  ['把明天的會議改到後天下午三點', { intent: 'calendar_update', date: '2026-11-28', title: '會議', newDate: '2026-11-29', newTime: '15:00' }],
  ['把開會改到下週二上午十點', { intent: 'calendar_update', title: '開會', newDate: '2026-12-01', newTime: '10:00' }],
  ['取消明天的聚餐', { intent: 'calendar_delete', date: '2026-11-28', title: '聚餐' }],
  ['刪除下週一的開會', { intent: 'calendar_delete', date: '2026-11-30', title: '開會' }],
  ['把看醫生刪掉', { intent: 'calendar_delete', title: '看醫生' }],
  // ---- 不是行程的句子不可被當成新增 ----
  ['今天天氣如何', { intent: 'outside_info' }],
  ['明天會下雨嗎', { intent: 'outside_info' }],
  ['今天幾號', { intent: 'date_today' }],
  ['今天星期幾', { intent: 'date_today' }],
  ['現在幾點', { intent: 'time_now' }],
];

let pass = 0;
const failures = [];
for (const [input, want] of CASES) {
  const got = classify(input, { now: NOW });
  const bad = [];
  for (const [k, v] of Object.entries(want)) {
    if (k === 'issues') { for (const i of v) if (!got.issues.includes(i)) bad.push(`issues 缺 ${i}`); continue; }
    if (JSON.stringify(got[k]) !== JSON.stringify(v)) bad.push(`${k}: 期望 ${JSON.stringify(v)} 實得 ${JSON.stringify(got[k])}`);
  }
  if (bad.length) failures.push(`「${input}」 ${bad.join('；')}`); else pass++;
}
const rate = pass / CASES.length;
test(`T03 行事曆解析：${pass}/${CASES.length} 正確（${(rate * 100).toFixed(1)}%），目標 ≥95%`, () => {
  if (failures.length) console.log('未通過：\n  ' + failures.join('\n  '));
  assert.ok(CASES.length >= 50, '至少 50 例');
  assert.ok(rate >= .95, `正確率 ${(rate * 100).toFixed(1)}% 低於 95%`);
});
