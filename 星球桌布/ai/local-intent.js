// 小公主 AI Lite — L1 本機核心：文字正規化、日期時間解析、意圖分類。
// 純 JavaScript、無外部相依、不連網；瀏覽器與 Node（測試）共用。
// 所有日期以呼叫端傳入的 now（本機 Windows 時區的 Date）為準。

/* ---------------- 正規化 ---------------- */
const FULL = /[！-～]/g;
export function normalize(text) {
  let s = String(text ?? '').replace(FULL, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/　/g, ' ');
  // Vosk 會在詞與詞之間加空白；中文字之間的空白去掉，英數之間保留一個
  s = s.replace(/([㐀-鿿])\s+(?=[㐀-鿿])/g, '$1').replace(/\s+/g, ' ').trim();
  return s.replace(/[，、]/g, '，').replace(/[。！？!?]+$/g, '').toLowerCase();
}

/* ---------------- 中文數字 ---------------- */
const DIGIT = { 零: 0, 〇: 0, 一: 1, 壹: 1, 二: 2, 貳: 2, 兩: 2, 两: 2, 三: 3, 參: 3, 四: 4, 肆: 4, 五: 5, 伍: 5, 六: 6, 陸: 6, 七: 7, 柒: 7, 八: 8, 捌: 8, 九: 9, 玖: 9 };
const NUM = '[0-9零〇一二兩两三四五六七八九十]+';
export function cnNumber(str) {
  if (str == null || str === '') return null;
  if (/^\d+$/.test(str)) return Number(str);
  let total = 0, cur = 0, seen = false;
  for (const ch of str) {
    if (ch in DIGIT) { cur = DIGIT[ch]; seen = true; }
    else if (ch === '十') { total += (cur || 1) * 10; cur = 0; seen = true; }
    else if (ch === '百') { total += (cur || 1) * 100; cur = 0; seen = true; }
    else return null;
  }
  return seen ? total + cur : null;
}
// 民國年 / 年份字串（如「一一五」逐位讀）
function yearNumber(str) {
  if (/^\d+$/.test(str)) return Number(str);
  if ([...str].every(c => c in DIGIT)) return Number([...str].map(c => DIGIT[c]).join(''));
  return cnNumber(str);
}

/* ---------------- 日期工具 ---------------- */
const pad = n => String(n).padStart(2, '0');
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const at = (y, m, d) => new Date(y, m - 1, d);
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export function validDate(y, m, d) {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1900 && y <= 2200)) return false;
  const t = at(y, m, d);
  return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d;
}
const WEEKDAY = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0, 七: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 0 };
export const WEEK_NAME = ['日', '一', '二', '三', '四', '五', '六'];
// 以週一為一週的開始
const mondayOf = d => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
const weekdayIn = (monday, wd) => addDays(monday, (wd + 6) % 7);

/* ---------------- 日期解析 ----------------
   回傳 { date:'YYYY-MM-DD' } 或 { range:[start,end] } 或 { error:'invalid_date'|'ambiguous_weekday'|... }，
   另附 match（原文中被辨識的片段）。找不到日期時回傳 null。 */
const WK = '(?:週|周|星期|禮拜|礼拜)';
const WD = '([一二三四五六日天七1-7])';
export function parseDate(text, now = new Date()) {
  const s = normalize(text);
  const today = startOfDay(now);
  let m;
  // 西元或民國年月日：2026年11月30日、民國115年11月30日、115年11月30日、2026/11/30、115/11/30、2026-11-30
  if ((m = s.match(new RegExp(`(?:民國|民国)?(\\d{2,4}|[〇零一二三四五六七八九]{2,4})年(${NUM})月(${NUM})(?:日|號|号)?`)))) {
    let y = yearNumber(m[1]); const mo = cnNumber(m[2]), d = cnNumber(m[3]);
    if (/民國|民国/.test(m[0]) || y < 1000) y += 1911;
    return validDate(y, mo, d) ? { date: ymd(at(y, mo, d)), match: m[0] } : { error: 'invalid_date', match: m[0] };
  }
  if ((m = s.match(/(?:民國|民国)?(\d{2,4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/))) {
    let y = Number(m[1]); const mo = Number(m[2]), d = Number(m[3]);
    if (/民國|民国/.test(m[0]) || y < 1000) y += 1911;
    return validDate(y, mo, d) ? { date: ymd(at(y, mo, d)), match: m[0] } : { error: 'invalid_date', match: m[0] };
  }
  // 月日（沒寫年）：取最接近的未來日期；已過的日期視為明年
  if ((m = s.match(new RegExp(`(下個月|下个月|这个月|這個月|本月)?(${NUM})月(${NUM})(?:日|號|号)`))) || (m = s.match(/(下個月|下个月)?(\d{1,2})\/(\d{1,2})(?![\d\/])/))) {
    const mo = cnNumber(m[2]), d = cnNumber(m[3]);
    let y = today.getFullYear();
    if (!validDate(y, mo, d) && !validDate(y + 1, mo, d)) return { error: 'invalid_date', match: m[0] };
    if (!validDate(y, mo, d) || at(y, mo, d) < today) y += 1;
    if (!validDate(y, mo, d)) return { error: 'invalid_date', match: m[0] };
    return { date: ymd(at(y, mo, d)), match: m[0], assumedYear: y !== today.getFullYear() };
  }
  // 下個月 N 號 / N 號
  if ((m = s.match(new RegExp(`(下個月|下个月|這個月|这个月|本月)?(${NUM})(?:日|號|号)(?!\\d)`)))) {
    const d = cnNumber(m[2]);
    let y = today.getFullYear(), mo = today.getMonth() + 1;
    if (m[1] && /下/.test(m[1])) { mo += 1; if (mo > 12) { mo = 1; y += 1; } }
    else if (!m[1] && validDate(y, mo, d) && at(y, mo, d) < today) { mo += 1; if (mo > 12) { mo = 1; y += 1; } }
    return validDate(y, mo, d) ? { date: ymd(at(y, mo, d)), match: m[0] } : { error: 'invalid_date', match: m[0] };
  }
  // 只有月份（查詢用）：12月、十二月 → 那個月的範圍；已過的月份視為明年
  if ((m = s.match(new RegExp(`(?<![0-9零〇一二兩两三四五六七八九十])(${NUM})月(?![0-9零〇一二兩两三四五六七八九十]|底|初)`)))) {
    const mo = cnNumber(m[1]);
    if (mo >= 1 && mo <= 12) {
      const y = today.getFullYear() + (mo < today.getMonth() + 1 ? 1 : 0);
      return { range: [ymd(at(y, mo, 1)), ymd(new Date(y, mo, 0))], match: m[0] };
    }
  }
  // 月底、月初
  if ((m = s.match(/(下個月|下个月)?(月底|月初)/))) {
    let y = today.getFullYear(), mo = today.getMonth() + 1;
    if (m[1]) { mo += 1; if (mo > 12) { mo = 1; y += 1; } }
    const d = m[2] === '月底' ? new Date(y, mo, 0).getDate() : 1;
    return { date: ymd(at(y, mo, d)), match: m[0] };
  }
  // N 天後
  if ((m = s.match(new RegExp(`(${NUM})(?:天|日)(?:後|后|之後|之后|以後|以后)`)))) {
    const n = cnNumber(m[1]);
    if (n != null && n <= 366) return { date: ymd(addDays(today, n)), match: m[0] };
  }
  // 相對日
  const REL = [['大後天|大后天', 3], ['後天|后天', 2], ['明天|明日|明早|明晚|明天晚上', 1], ['今天|今日|今晚|今早|今天晚上|今兒', 0], ['昨天|昨日', -1], ['前天', -2]];
  for (const [re, n] of REL) if ((m = s.match(new RegExp(re)))) return { date: ymd(addDays(today, n)), match: m[0] };
  // 週幾：下下週X、下週X、這週X、上週X、週X
  if ((m = s.match(new RegExp(`(下下|下|这|這|本|上)?(?:個|个)?${WK}${WD}`)))) {
    const wd = WEEKDAY[m[2]], pre = m[1] || '';
    let monday = mondayOf(today);
    if (pre === '下下') monday = addDays(monday, 14);
    else if (pre === '下') monday = addDays(monday, 7);
    else if (pre === '上') monday = addDays(monday, -7);
    let d = weekdayIn(monday, wd);
    if (!pre) {
      if (wd === today.getDay()) return { error: 'ambiguous_weekday', match: m[0], options: [ymd(today), ymd(addDays(today, 7))] };
      if (d < today) d = addDays(d, 7);       // 沒說「這週／下週」時取接下來的那一天
    }
    return { date: ymd(d), match: m[0] };
  }
  // 範圍（查詢用）
  if ((m = s.match(new RegExp(`(下下|下|这|這|本|上)(?:個|个)?${WK}(?![一二三四五六日天七1-7])`)))) {
    let monday = mondayOf(today);
    if (m[1] === '下下') monday = addDays(monday, 14);
    else if (m[1] === '下') monday = addDays(monday, 7);
    else if (m[1] === '上') monday = addDays(monday, -7);
    return { range: [ymd(monday), ymd(addDays(monday, 6))], match: m[0] };
  }
  if ((m = s.match(/(這個月|这个月|本月|下個月|下个月|上個月|上个月)/))) {
    let y = today.getFullYear(), mo = today.getMonth() + (/下/.test(m[1]) ? 1 : /上/.test(m[1]) ? -1 : 0);
    const first = new Date(y, mo, 1), last = new Date(y, mo + 1, 0);
    return { range: [ymd(first), ymd(last)], match: m[0] };
  }
  if ((m = s.match(/(接下來|接下来|最近|之後|之后|未來|未来)(?:幾天|几天|一週|一周|七天)?/))) {
    return { range: [ymd(today), ymd(addDays(today, 7))], match: m[0] };
  }
  return null;
}

/* ---------------- 時間解析 ----------------
   回傳 { time:'HH:MM', assumed:'pm'|null } 或 { error:'ambiguous_time'|'invalid_time' } 或 null */
const PERIODS = [
  ['凌晨|半夜', 'night'], ['早上|早晨|清晨|上午|早|明早|今早', 'am'], ['中午|午間', 'noon'],
  ['下午|午後|午后', 'pm'], ['傍晚', 'evening'], ['晚上|晚間|晚间|夜裡|夜里|夜晚|今晚|明晚|晚', 'evening']
];
export function parseTime(text) {
  const s = normalize(text);
  let period = null, m;
  for (const [re, p] of PERIODS) if (new RegExp(re).test(s)) { period = p; break; }
  let h = null, min = 0, matched = null;
  if ((m = s.match(/(\d{1,2}):(\d{2})/))) { h = Number(m[1]); min = Number(m[2]); matched = m[0]; }
  else if ((m = s.match(new RegExp(`(${NUM})(?:點|点|時|时)(?:(半)|(一刻)|(三刻)|(${NUM})(?:分)?)?`)))) {
    h = cnNumber(m[1]); matched = m[0];
    if (m[2]) min = 30; else if (m[3]) min = 15; else if (m[4]) min = 45; else if (m[5]) min = cnNumber(m[5]);
  } else if (period === 'noon' && /中午/.test(s)) { return { time: '12:00', assumed: null, match: '中午' }; }
  if (h == null) return null;
  if (min == null || min > 59 || h > 24) return { error: 'invalid_time', match: matched };
  let assumed = null;
  if (h === 24) h = 0;
  if (period === 'evening' && h === 12) return { error: 'ambiguous_time', match: matched };   // 晚上 12 點：今天結束還是隔天凌晨？
  if (period === 'pm' || period === 'evening') { if (h < 12) h += 12; }
  else if (period === 'noon') { if (h < 11) h += 12; }
  else if (period === 'night') { if (h === 12) h = 0; }
  else if (period === 'am') { if (h === 12) h = 0; }
  else if (h >= 1 && h <= 6 && !/(\d{1,2}):(\d{2})/.test(s)) { h += 12; assumed = 'pm'; }   // 沒說上下午：1～6 點視為下午
  if (h > 23) return { error: 'invalid_time', match: matched };
  return { time: `${pad(h)}:${pad(min)}`, assumed, match: matched };
}
export function describeTime(hm) {
  if (!hm) return '整天';
  const [h, m] = hm.split(':').map(Number);
  const p = h < 5 ? '凌晨' : h < 12 ? '上午' : h === 12 ? '中午' : h < 18 ? '下午' : '晚上';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${p} ${h12}:${pad(m)}`;
}
export function describeDate(dateStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return `${y} 年 ${mo} 月 ${d} 日（${WEEK_NAME[at(y, mo, d).getDay()]}）`;
}

/* ---------------- 意圖分類 ---------------- */
const RX = {
  confirmYes: /^(好|好的|好啊|好喔|好呀|對|對的|是|是的|確定|確認|沒錯|没错|可以|嗯|恩|要|ok|okay|yes|行|就這樣|就这样|麻煩了|拜託|拜托)(啊|喔|呀|的|呦|吧)?$/,
  confirmNo: /^(不要|不用|不對|不对|不是|取消|算了|錯了|错了|不行|no|先不要|等等|不了)(啊|喔|呀|吧)?$/,
  delete: /(刪除|删除|刪掉|删掉|移除|拿掉|去掉|不用.*了|取消(?!靜音|静音|勿擾|勿扰))/,
  update: /(改到|改成|改為|改为|延到|延後|延后|提前到|提早到|挪到|換到|换到|調到|调到|調整|调整|更改|修改|改期|改時間|改时间)/,
  add: /(新增|加入|加個|加一個|加上|安排|排(?:個|一個)?|記下|记下|記錄|记录|記一下|记一下|幫我記|帮我记|提醒我|預約|预约|約了|约了|登記|登记|建立|建一個|寫下|写下)/,
  query: /(有什麼|有什么|有哪些|什麼行程|什么行程|行程(呢|嗎|吗)?$|查(?:一下|詢|询|看|查)|看看|有沒有|有没有|空嗎|空吗|有空|忙嗎|忙吗|安排了什麼|安排了什么|要做什麼|要做什么|幾點開始|几点开始|行事曆|行事历|行程表)/,
  // 明確的新增動詞（「有什麼安排」裡的「安排」不算）
  addVerb: /(新增|加入|加個|加一個|加上|記下|记下|記錄|记录|記一下|记一下|幫我記|帮我记|提醒我|預約|预约|登記|登记|建立|建一個|寫下|写下|幫我安排|帮我安排|安排一個|安排个)/,
  eventNoun: /(開會|开会|會議|会议|看醫生|看医生|回診|聚餐|吃飯|吃饭|上課|上课|面試|面试|出差|報告|报告|約會|约会|生日|旅行|旅遊|旅游|運動|运动|健身|考試|考试|看牙|剪頭髮|剪头发|拜訪|拜访|簡報|简报|研習|研习|訓練|训练|會勘|会勘|查核|稽核|審查|审查|截止|繳費|缴费|交件|值班|聚會|聚会|讀書會|读书会|演講|演讲|活動|活动)/,
  timeNow: /(現在|现在)?(幾點|几点|時間|时间)(了|呢)?$|現在幾點|现在几点|現在時間|现在时间/,
  dateToday: /(今天|今日)(幾號|几号|星期幾|星期几|禮拜幾|礼拜几|日期|是幾月幾號|是几月几号)|幾月幾號|几月几号|今天是哪天/,
  residents: /(居民|狐狸|綿羊|绵羊|羊|兔子|小蛇|蛇|小鳥|小鸟|鳥|鸟|蝴蝶|動物|动物|幾隻|几只|大家)/,
  planet: /(星球|火山|玫瑰|路燈|路灯|流星|樹苗|树苗|猴麵包樹|猴面包树|宇宙|星星)/,
  self: /(你是誰|妳是誰|你是谁|妳是谁|自我介紹|自我介绍|你叫什麼|妳叫什麼|你叫什么|你的名字|妳的名字|介紹一下你|介绍一下你)/,
  greet: /^(你好|妳好|您好|哈囉|哈啰|嗨|嘿|早安|午安|晚安|安安|hello|hi|hey|小公主)(呀|啊|喔|呦)?$|^(你好|妳好|哈囉|嗨|早安|午安|晚安)/,
  thanks: /(謝謝|谢谢|感謝|感谢|多謝|多谢|thank)/,
  bye: /(再見|再见|掰掰|拜拜|bye|晚安囉|先這樣|先这样)/,
  help: /(你會什麼|妳會什麼|你会什么|會做什麼|会做什么|會些什麼|能做什麼|能做什么|可以做什麼|可以做什么|怎麼用|怎么用|幫助|帮助|說明|说明|功能|教我)/,
  unmute: /(取消靜音|取消静音|解除靜音|解除静音|可以說話|可以说话|恢復聲音|恢复声音|打開聲音|打开声音)/,
  mute: /(靜音|静音|不要說話|不要说话|安靜|安静|閉嘴|闭嘴|小聲一點|小声一点|關掉聲音|关掉声音)/,
  dndOff: /(取消勿擾|取消勿扰|關閉勿擾|关闭勿扰|解除勿擾|解除勿扰)/,
  dndOn: /(勿擾|勿扰|不要打擾|不要打扰|別吵|别吵|專心|专心)/,
  feeling: /(你好嗎|妳好嗎|你好吗|心情|開心嗎|开心吗|累不累|無聊|无聊|難過|难过|好累|好煩|好烦|壓力|压力)/,
  joke: /(笑話|笑话|講個故事|讲个故事|說個故事|说个故事|好玩的)/,
  praise: /(好可愛|好可爱|好漂亮|好棒|真棒|好厲害|好厉害|喜歡你|喜欢你|愛你|爱你)/,
  weather: /(天氣|天气|下雨|氣溫|气温|颱風|台风|新聞|新闻|股票|匯率|汇率)/
};
// 去掉日期、時間與指令字，剩下的當作行程標題
const FILLER = /(請|请|幫我|帮我|麻煩|麻烦|小公主|可以|一下|我|要|想|去|有個|有个|一個|一个|行程|事情|提醒|記得|记得|新增|加入|加個|加一個|加上|安排|記下|记下|記錄|记录|記一下|记一下|幫忙|帮忙|預約|预约|登記|登记|建立|寫下|写下|的時候|的时候|那天|當天|当天|的|在|是|喔|啊|吧|呢|嗎|吗|，|,)/g;
export function extractTitle(s, parts) {
  let t = s;
  for (const p of parts) if (p) t = t.replace(p, ' ');
  t = t.replace(/(上午|下午|中午|晚上|早上|凌晨|傍晚|整天)/g, ' ').replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
  t = t.replace(/^(要|去|來|来|和|跟)\s*/, '').trim();
  return t.slice(0, 40);
}

/* classify(text, { now, pending }) → { intent, date?, range?, time?, title?, issues:[], text } */
export function classify(rawText, ctx = {}) {
  const now = ctx.now || new Date();
  const s = normalize(rawText);
  const out = { text: s, intent: 'unknown', issues: [] };
  if (!s) { out.intent = 'empty'; return out; }
  if (ctx.pending) {
    if (RX.confirmYes.test(s)) { out.intent = 'confirm_yes'; return out; }
    if (RX.confirmNo.test(s)) { out.intent = 'confirm_no'; return out; }
  }
  const d = parseDate(s, now), t = parseTime(s);
  if (d?.error) out.issues.push(d.error);
  if (t?.error) out.issues.push(t.error);
  if (d?.date) out.date = d.date;
  if (d?.range) out.range = d.range;
  if (d?.options) out.options = d.options;
  if (t?.time) { out.time = t.time; if (t.assumed) out.timeAssumed = t.assumed; }
  if (d?.assumedYear) out.yearAssumed = true;
  const datePart = d?.match, timePart = t?.match;

  if (RX.unmute.test(s)) { out.intent = 'unmute'; return out; }
  if (RX.dndOff.test(s)) { out.intent = 'dnd_off'; return out; }
  if (RX.mute.test(s)) { out.intent = 'mute'; return out; }
  if (RX.dndOn.test(s)) { out.intent = 'dnd_on'; return out; }
  if (RX.update.test(s)) {
    out.intent = 'calendar_update';
    // 「把 X 改到 Y」：改到後面的日期時間是新值，前面是要找的行程
    const um = s.match(RX.update);
    const before = s.slice(0, um.index), after = s.slice(um.index + um[0].length);
    const nd = parseDate(after || '', now), nt = parseTime(after || '');
    out.newDate = nd?.date || null; out.newTime = nt?.time || null;
    if (nd?.error) out.issues.push(nd.error);
    const od = parseDate(before || '', now);
    out.date = od?.date || null;
    out.title = extractTitle(before.replace(/^(把|將|将)/, ''), [od?.match, parseTime(before || '')?.match]);
    return out;
  }
  if (RX.delete.test(s)) {
    out.intent = 'calendar_delete';
    out.title = extractTitle(s.replace(RX.delete, ' ').replace(/^(把|將|将)/, ''), [datePart, timePart]);
    return out;
  }
  const hasWhen = !!(out.date || out.time || d?.error || t?.error);
  const explicitAdd = RX.addVerb.test(s);
  if (!explicitAdd && RX.weather.test(s)) { out.intent = 'outside_info'; return out; }
  const isQuery = RX.query.test(s) && !explicitAdd;
  if (isQuery || (out.range && !explicitAdd)) { out.intent = 'calendar_query'; return out; }
  const question = /(嗎|吗|呢|如何|怎麼樣|怎么样|是不是|有沒有)$/.test(s);
  const otherTopic = RX.planet.test(s) || RX.residents.test(s) || RX.timeNow.test(s) || RX.dateToday.test(s);
  const loose = hasWhen && !question && !otherTopic && extractTitle(s, [datePart, timePart]).length >= 2;
  const whenOnly = out.date && out.time && !question && !extractTitle(s, [datePart, timePart]);   // 只說了日期時間：要新增，再補問標題
  if (explicitAdd || RX.add.test(s) || (hasWhen && RX.eventNoun.test(s) && !question) || loose || whenOnly) {
    out.intent = 'calendar_add';
    out.title = extractTitle(s, [datePart, timePart]);
    return out;
  }
  if (RX.timeNow.test(s)) { out.intent = 'time_now'; return out; }
  if (RX.dateToday.test(s)) { out.intent = 'date_today'; return out; }
  if (RX.self.test(s)) { out.intent = 'self_intro'; return out; }
  if (RX.help.test(s)) { out.intent = 'help'; return out; }
  if (RX.thanks.test(s)) { out.intent = 'thanks'; return out; }
  if (RX.bye.test(s)) { out.intent = 'bye'; return out; }
  if (RX.feeling.test(s)) { out.intent = 'feeling'; return out; }
  if (RX.joke.test(s)) { out.intent = 'story'; return out; }
  if (RX.praise.test(s)) { out.intent = 'praise'; return out; }
  if (RX.weather.test(s)) { out.intent = 'outside_info'; return out; }
  if (RX.residents.test(s)) { out.intent = 'residents'; return out; }
  if (RX.planet.test(s)) { out.intent = 'planet'; return out; }
  if (RX.greet.test(s)) { out.intent = 'greet'; return out; }
  if (out.date && !RX.add.test(s)) { out.intent = 'calendar_query'; return out; }
  return out;
}
