// 小公主 AI Lite — 對話路由。
// 行事曆相關一律走本機（L1）：解析 → 向本機服務取得確認權杖 → 使用者確認 → 本機服務寫入。
// 非行事曆聊天依模式：公務模式只用 L1 情境模板；裝置端／個人模式在可用時才交給 L2／L3，且不給任何系統操作權。
// 回覆契約：{ reply, emotion, gesture, action, event?, events?, confirm?, choices?, source }
import { classify, normalize, describeDate, describeTime, ymd, WEEK_NAME } from './local-intent.js';

export const ACTIONS = ['none', 'calendar_query', 'calendar_add', 'calendar_update', 'calendar_delete'];
export const EMOTIONS = ['idle', 'blink', 'happy', 'talk', 'shy', 'star', 'sad', 'wow'];
const pick = (a, r = Math.random) => a[Math.floor(r() * a.length)];
const SPECIES = { fox: '狐狸', sheep: '綿羊', rabbit: '兔子', snake: '小蛇', bird: '小鳥', butterfly: '蝴蝶' };

function newRequestId() {
  const b = new Uint8Array(12);
  (globalThis.crypto || require('crypto').webcrypto).getRandomValues(b);
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}
function eventLine(e) { return `${describeDate(e.date)} ${describeTime(e.time)}「${e.title}」`; }
function shortLine(e) {
  const [, m, d] = e.date.split('-').map(Number);
  return `${m}/${d}${e.time ? ' ' + describeTime(e.time) : ''}「${e.title}」`;
}
// 標題相似度：字元重疊比例
function similar(a, b) {
  if (!a || !b) return 0;
  if (a.includes(b) || b.includes(a)) return 1;
  const A = new Set(a), B = new Set(b);
  let n = 0; for (const c of A) if (B.has(c)) n++;
  return n / Math.max(1, Math.min(A.size, B.size));
}

/* createPrincessAI({ api, now, random, toTraditional })
   api.calendar()                   → { events, rev }          （本機服務提供的目前月曆）
   api.propose({ requestId, op, event }) → { confirmToken, expires } 或 throw
   api.commit({ requestId, confirmToken }) → { ok:true } 或 throw
   api.state()                      → { residents:{type:count}, total }
   api.mode()                       → { mode:'official'|'device'|'personal', device:bool, cloud:bool }
   api.device?(text)                → 裝置端模型（L2）回答字串；不可用時不提供
   api.cloud?(text)                 → 雲端閘道（L3）回答字串；不可用時不提供 */
export function createPrincessAI({ api, now = () => new Date(), random = Math.random, toTraditional = s => s } = {}) {
  let pending = null;      // 等待確認：{ kind:'confirm', op, event, requestId, token, summary }
  let ask = null;          // 等待補充：{ kind:'title'|'date'|'weekday'|'choose'|'time', draft, choices }
  let muted = false, dnd = false;
  const greetLog = [];     // 主動問候的時間（冷卻用）

  const R = (reply, emotion = 'talk', extra = {}) => ({ reply, emotion, gesture: extra.gesture || '', action: extra.action || 'none', source: extra.source || 'L1', ...extra });
  const clear = () => { pending = null; ask = null; };

  /* ---------- 情境模板（L1） ---------- */
  function greeting() {
    const h = now().getHours();
    const part = h < 5 ? '夜深了' : h < 11 ? '早安' : h < 14 ? '午安' : h < 18 ? '午安' : '晚安';
    return pick([`${part}！我是住在小星球上的小公主，今天想做什麼呢？`, `${part}呀～星球上的大家都很好喔，要不要看看今天的行程？`, `${part}！有什麼我可以幫忙的嗎？`], random);
  }
  async function residentsReply() {
    let st;
    try { st = await api.state(); } catch { return R('我現在看不到星球上的大家，稍後再問我一次好嗎？', 'sad'); }
    const parts = Object.entries(st.residents || {}).filter(([, n]) => n > 0).map(([t, n]) => `${SPECIES[t] || t} ${n} 隻`);
    if (!parts.length) return R('星球上現在只有我和玫瑰，好安靜喔。可以在管理視窗新增居民來陪我！', 'sad');
    return R(`星球上現在有 ${st.total} 位居民：${parts.join('、')}。牠們今天都很有精神喔！`, 'happy', { gesture: 'wave' });
  }
  function planetReply() {
    return R(pick(['我的星球上有一朵住在玻璃罩裡的玫瑰、兩座會冒煙的小火山，還有一盞會自己亮起來的路燈。', '晚上常常有流星飛過喔！流星雨來的時候我會握拳替大家加油。', '綿羊很愛吃猴麵包樹苗，我得幫忙看著玫瑰，不能讓牠吃掉。'], random), 'star', { gesture: 'stars' });
  }
  const HELP = '我可以幫你：查行程（例如「明天有什麼行程」）、新增行程（例如「下週一下午兩點開會」），也可以修改或刪除行程，每次都會先請你確認。也可以問我現在幾點、星球上有哪些居民。';

  /* ---------- 行事曆 ---------- */
  async function calendar() {
    const c = await api.calendar();
    return { events: Array.isArray(c?.events) ? c.events : [], rev: c?.rev ?? 0 };
  }
  async function queryReply(p) {
    let cal;
    try { cal = await calendar(); } catch { return R('我現在讀不到行事曆，請確認桌布正在執行。', 'sad'); }
    let from, to, label;
    if (p.range) { [from, to] = p.range; label = `${from.slice(5).replace('-', '/')}～${to.slice(5).replace('-', '/')}`; }
    else if (p.date) { from = to = p.date; label = describeDate(p.date); }
    else { const t = ymd(now()); from = t; to = '9999-12-31'; label = '接下來'; }
    const list = cal.events.filter(e => e.date >= from && e.date <= to).sort((a, b) => (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99')));
    if (!list.length) return R(`${label}沒有行程喔，可以好好休息～`, 'happy', { action: 'calendar_query', events: [] });
    const shown = list.slice(0, 5).map(shortLine).join('、');
    const more = list.length > 5 ? `，還有另外 ${list.length - 5} 個` : '';
    return R(`${label}有 ${list.length} 個行程：${shown}${more}。`, 'talk', { action: 'calendar_query', events: list });
  }
  async function proposeOp(op, event, extraNote = '') {
    const requestId = newRequestId();
    let res;
    try { res = await api.propose({ requestId, op, event }); }
    catch (e) { clear(); return R(`這個行程我沒辦法送出：${e.message || '本機服務沒有回應'}。`, 'sad'); }
    pending = { kind: 'confirm', op, event, requestId, token: res.confirmToken };
    ask = null;
    const verb = op === 'add' ? '記下' : op === 'update' ? '改成' : '刪除';
    const summary = op === 'delete' ? `刪除 ${eventLine(event)}` : `${verb} ${eventLine(event)}`;
    return R(`${extraNote}要${summary}嗎？請說「好」或按「確認」。`, 'talk', { action: 'calendar_' + op, event, confirm: { requestId, summary } });
  }
  async function addFlow(draft) {
    if (draft.issues?.includes('invalid_date')) { clear(); return R('這個日期不存在喔，可以再說一次是哪一天嗎？', 'wow'); }
    if (draft.issues?.includes('ambiguous_time')) { ask = { kind: 'time', draft }; return R('晚上 12 點是指今天晚上結束時，還是隔天凌晨呢？可以說「23 點 59 分」或「凌晨 12 點」。', 'wow'); }
    if (draft.issues?.includes('ambiguous_weekday')) {
      ask = { kind: 'weekday', draft };
      const [a, b] = draft.options;
      return R(`是今天 ${a.slice(5).replace('-', '/')}，還是下週 ${b.slice(5).replace('-', '/')} 呢？`, 'wow', { choices: [{ label: `今天 ${a.slice(5).replace('-', '/')}`, say: '今天' }, { label: `下週 ${b.slice(5).replace('-', '/')}`, say: '下週' }] });
    }
    if (!draft.date) { ask = { kind: 'date', draft }; return R('要記在哪一天呢？', 'talk'); }
    if (!draft.title) { ask = { kind: 'title', draft }; return R(`${describeDate(draft.date)}${draft.time ? ' ' + describeTime(draft.time) : ''}要記下什麼事情呢？`, 'talk'); }
    const event = { title: toTraditional(draft.title).slice(0, 40), date: draft.date, time: draft.time || '' };
    let cal; try { cal = await calendar(); } catch { cal = { events: [] }; }
    const dup = cal.events.some(e => e.date === event.date && (e.time || '') === event.time && e.title === event.title);
    const notes = [];
    if (dup) notes.push('已經有一個一模一樣的行程了，');
    if (draft.timeAssumed === 'pm') notes.push('我先當作是下午，');
    if (draft.yearAssumed) notes.push('今年的這天已經過了，我記在明年，');
    return proposeOp('add', event, notes.join(''));
  }
  async function findTargets(p) {
    const cal = await calendar();
    const today = ymd(now());
    let list = cal.events.filter(e => (p.date ? e.date === p.date : e.date >= today));
    const t = p.title ? toTraditional(p.title) : '';
    if (t) list = list.filter(e => similar(e.title, t) >= .5);
    return list.sort((a, b) => (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99')));
  }
  async function changeFlow(p, op) {
    let list;
    try { list = await findTargets(p); } catch { return R('我現在讀不到行事曆，請確認桌布正在執行。', 'sad'); }
    if (!list.length) { clear(); return R('我找不到符合的行程耶，可以說得更清楚一點嗎？例如「刪除明天的聚餐」。', 'sad'); }
    if (list.length > 1) {
      ask = { kind: 'choose', op, p, choices: list.slice(0, 6) };
      return R(`有 ${list.length} 個符合的行程：${list.slice(0, 6).map((e, i) => `${i + 1}. ${shortLine(e)}`).join('　')}。是第幾個呢？`, 'talk', { choices: list.slice(0, 6).map((e, i) => ({ label: `${i + 1}. ${shortLine(e)}`, say: `第${i + 1}個` })) });
    }
    return changeTarget(list[0], p, op);
  }
  async function changeTarget(target, p, op) {
    if (op === 'delete') return proposeOp('delete', { id: target.id, title: target.title, date: target.date, time: target.time || '' });
    const event = { id: target.id, title: target.title, date: p.newDate || target.date, time: p.newTime ?? target.time ?? '' };
    if (!p.newDate && !p.newTime) { ask = { kind: 'newtime', target, p }; return R(`要把「${target.title}」改到什麼時候呢？`, 'talk'); }
    return proposeOp('update', event);
  }
  async function commitPending() {
    const p = pending; pending = null;
    try {
      await api.commit({ requestId: p.requestId, confirmToken: p.token });
    } catch (e) { return R(`沒有成功：${e.message || '本機服務沒有回應'}。行程沒有被修改。`, 'sad'); }
    const done = p.op === 'add' ? '記好了' : p.op === 'update' ? '改好了' : '刪掉了';
    return R(`${done}！${eventLine(p.event)}。`, 'happy', { gesture: p.op === 'add' ? 'thumb' : '', action: 'calendar_' + p.op, event: p.event, committed: true });
  }

  /* ---------- 補充問答 ---------- */
  async function continueAsk(text, p) {
    const a = ask;
    if (a.kind === 'title') { ask = null; return addFlow({ ...a.draft, title: normalize(text).slice(0, 40) }); }
    if (a.kind === 'date') { if (p.date) { ask = null; return addFlow({ ...a.draft, date: p.date, time: a.draft.time || p.time, issues: [] }); } return R('還是聽不出是哪一天，可以說「下週一」或「12 月 3 號」。', 'wow'); }
    if (a.kind === 'time') { if (p.time) { ask = null; return addFlow({ ...a.draft, time: p.time, issues: a.draft.issues.filter(i => i !== 'ambiguous_time') }); } return R('可以再說一次幾點嗎？', 'wow'); }
    if (a.kind === 'weekday') {
      const s = normalize(text); let date = null;
      if (/今天|這週|这周|本週|第一|1/.test(s)) date = a.draft.options[0];
      else if (/下週|下周|下禮拜|下星期|第二|2/.test(s)) date = a.draft.options[1];
      if (!date) return R('請說「今天」或「下週」。', 'wow');
      ask = null; return addFlow({ ...a.draft, date, issues: a.draft.issues.filter(i => i !== 'ambiguous_weekday') });
    }
    if (a.kind === 'choose') {
      const s = normalize(text); const m = s.match(/(\d+)|第([一二三四五六])/);
      const n = m ? (m[1] ? Number(m[1]) : '一二三四五六'.indexOf(m[2]) + 1) : 0;
      if (!(n >= 1 && n <= a.choices.length)) return R(`請說第幾個（1 到 ${a.choices.length}）。`, 'wow');
      ask = null; return changeTarget(a.choices[n - 1], a.p, a.op);
    }
    if (a.kind === 'newtime') {
      if (!p.date && !p.time) return R('還是聽不出新的時間，可以說「後天下午三點」。', 'wow');
      ask = null; return changeTarget(a.target, { ...a.p, newDate: p.date, newTime: p.time }, 'update');
    }
    ask = null; return null;
  }

  /* ---------- L2 / L3（只負責聊天文字，沒有任何操作權） ---------- */
  function sanitize(text) {
    return String(text || '').replace(/<[^>]*>/g, '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, 300);
  }
  async function generative(text) {
    let m; try { m = await api.mode(); } catch { m = { mode: 'official' }; }
    if (m.mode === 'device' && m.device && api.device) {
      try { const r = sanitize(await api.device(text)); if (r) return R(r, 'talk', { source: 'L2' }); } catch { /* 失敗回到 L1 */ }
    }
    if (m.mode === 'personal' && m.cloud && api.cloud) {
      try { const r = sanitize(await api.cloud(text)); if (r) return R(r, 'talk', { source: 'L3' }); } catch { /* 失敗回到 L1 */ }
    }
    return null;
  }

  /* ---------- 主入口 ---------- */
  async function handle(rawText) {
    const text = String(rawText || '').slice(0, 200);
    const p = classify(text, { now: now(), pending: !!pending });
    if (p.intent === 'empty') return R('我在聽喔，想跟我說什麼呢？', 'happy');
    if (pending) {
      if (p.intent === 'confirm_yes') return commitPending();
      if (p.intent === 'confirm_no') { const op = pending.op; clear(); return R(op === 'add' ? '好，那就先不記。' : '好，保持原樣不修改。', 'happy'); }
      pending = null;     // 換了話題：放棄這次確認，不寫入
    }
    if (ask) {
      // 補問中又說了一句完整的新指令（有標題的新增、修改、刪除）：放棄舊的補問，改處理新指令
      const fresh = ask.kind !== 'title' && ((p.intent === 'calendar_add' && p.title) || p.intent === 'calendar_update' || p.intent === 'calendar_delete');
      if (fresh) ask = null;
      else { const r = await continueAsk(text, p); if (r) return r; }
    }
    switch (p.intent) {
      case 'calendar_add': return addFlow(p);
      case 'calendar_query': return queryReply(p);
      case 'calendar_update': return changeFlow(p, 'update');
      case 'calendar_delete': return changeFlow(p, 'delete');
      case 'confirm_yes': case 'confirm_no': return R('現在沒有需要確認的事情喔。', 'talk');
      case 'greet': return R(greeting(), 'happy', { gesture: 'wave' });
      case 'self_intro': return R('我是住在這顆小星球上的小公主！平常會幫玫瑰澆水、和居民們打招呼，也可以幫你記行程喔。', 'happy', { gesture: 'wave' });
      case 'residents': return residentsReply();
      case 'planet': return planetReply();
      case 'time_now': { const d = now(); return R(`現在是${describeTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)}。`, 'talk'); }
      case 'date_today': return R(`今天是 ${describeDate(ymd(now()))}。`, 'talk');
      case 'help': return R(HELP, 'happy');
      case 'thanks': return R(pick(['不客氣！能幫上忙我很開心～', '嘿嘿，不用謝啦！'], random), 'shy');
      case 'bye': return R(pick(['掰掰～我會在星球上等你！', '好，晚點見喔！'], random), 'happy', { gesture: 'wave' });
      case 'mute': muted = true; return R('好，我先不出聲，改用文字陪你。', 'shy', { muted: true });
      case 'unmute': muted = false; return R('我又可以說話囉！', 'happy', { muted: false });
      case 'dnd_on': dnd = true; return R('好，我不會主動打擾你，有事再叫我。', 'shy', { dnd: true });
      case 'dnd_off': dnd = false; return R('勿擾已經關掉了，我會偶爾跟你打招呼喔。', 'happy', { dnd: false });
      case 'feeling': return R(pick(['我今天很好！看到你來就更開心了。辛苦了，要不要喝口水休息一下？', '累了就休息一下吧，星球上的玫瑰也在陪你喔。'], random), 'shy');
      case 'story': return R(pick(['昨晚有一顆流星掉到火山旁邊，狐狸跑去看，結果只撿到一顆亮亮的小石頭，牠開心了一整天！', '有一隻小鳥每天早上都會停在我的頭上唱歌，我都不敢亂動，怕牠飛走～'], random), 'star', { gesture: 'stars' });
      case 'praise': return R(pick(['被你這樣說，我會害羞啦……', '嘿嘿，謝謝你！'], random), 'shy');
      case 'outside_info': return R('我住在離線的小星球上，看不到天氣、新聞這些外面的資訊，抱歉喔。不過我可以幫你看行程！', 'sad');
    }
    const g = await generative(text);
    if (g) return g;
    return R(`我還聽不太懂這句話……${pick(['可以問我行程，或是星球上有哪些居民喔。', '要不要試試「明天有什麼行程」？'], random)}`, 'wow');
  }

  /* 主動問候：預設冷卻 15 分鐘、每小時最多 2 次；勿擾時不問候 */
  function proactiveGreeting(cooldownMin = 15, perHour = 2) {
    if (dnd) return null;
    const t = now().getTime();
    while (greetLog.length && t - greetLog[0] > 3600e3) greetLog.shift();
    if (greetLog.length >= perHour) return null;
    if (greetLog.length && t - greetLog[greetLog.length - 1] < cooldownMin * 60e3) return null;
    greetLog.push(t);
    return R(greeting(), 'happy', { gesture: 'wave', proactive: true });
  }

  return {
    handle, proactiveGreeting,
    confirm: () => pending ? commitPending() : Promise.resolve(R('現在沒有需要確認的事情喔。')),
    cancel: () => { const had = !!pending; clear(); return R(had ? '好，已經取消，行程沒有變動。' : '好的。', 'happy'); },
    get pending() { return pending ? { ...pending, token: undefined } : null; },
    get muted() { return muted; }, set muted(v) { muted = !!v; },
    get dnd() { return dnd; }, set dnd(v) { dnd = !!v; }
  };
}
