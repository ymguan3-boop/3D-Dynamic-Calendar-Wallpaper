// 小公主 AI Lite — 選用的 L3 雲端閘道（Cloudflare Worker）
// 本檔只是原始碼；是否部署、部署到哪個帳號由使用者自行決定（指令書：部署需另行授權）。
// 設計：
//   ・用戶端（桌布本機服務）只送 { text, install }：一句話與隨機安裝代號，不送行事曆、居民或任何本機資料
//   ・沒有任何金鑰：模型使用 Workers AI 綁定（env.AI），在 Cloudflare 帳號端計費／免費額度內執行
//   ・只回傳 { reply }：純文字，用戶端會再清除標籤、限制長度，且 L3 沒有任何行事曆或系統操作權
//   ・限流：每個安裝代號與每個 IP 各自計數（KV），超過回 429 + Retry-After
//   ・不記錄問句內容；console 只輸出狀態碼
const SYSTEM = '你是住在小星球上的小公主，個性溫柔、好奇、活潑。只用臺灣繁體中文回答一到兩句短句。' +
  '不要編造使用者的行程、天氣或新聞；不知道就說不知道。不要提供操作電腦、下載或執行程式的指示。';
const MAX_TEXT = 500, MAX_REPLY = 600;

function json(status, body, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra } });
}
async function limited(env, key, limit, windowSec) {
  if (!env.RATE) return false;                       // 沒有綁定 KV 時不限流（部署說明要求綁定）
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  const k = `${key}:${bucket}`;
  const n = Number(await env.RATE.get(k)) || 0;
  if (n >= limit) return true;
  await env.RATE.put(k, String(n + 1), { expirationTtl: windowSec * 2 });
  return false;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/v1/chat') return json(404, { error: 'not_found' });
    if ((request.headers.get('Content-Type') || '').split(';')[0] !== 'application/json') return json(415, { error: 'bad_type' });
    const len = Number(request.headers.get('Content-Length') || 0);
    if (len > 4096) return json(413, { error: 'too_large' });
    let body;
    try { body = await request.json(); } catch { return json(400, { error: 'bad_json' }); }
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const install = typeof body.install === 'string' && /^[a-f0-9]{16,64}$/.test(body.install) ? body.install : '';
    if (!text || text.length > MAX_TEXT || !install) return json(400, { error: 'bad_request' });

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const perMin = Number(env.LIMIT_PER_MINUTE || 6), perDay = Number(env.LIMIT_PER_DAY || 200);
    if (await limited(env, 'm:' + install, perMin, 60) || await limited(env, 'i:' + ip, perMin * 3, 60)) {
      console.log('429 minute');
      return json(429, { error: 'rate_limited' }, { 'Retry-After': '10' });
    }
    if (await limited(env, 'd:' + install, perDay, 86400)) { console.log('429 day'); return json(429, { error: 'rate_limited' }, { 'Retry-After': '3600' }); }

    if (!env.AI) return json(503, { error: 'model_not_bound' });
    try {
      const out = await env.AI.run(env.MODEL || '@cf/meta/llama-3.1-8b-instruct', {
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: text }], max_tokens: 200
      });
      const reply = String(out && out.response || '').replace(/<[^>]*>/g, '').trim().slice(0, MAX_REPLY);
      if (!reply) return json(502, { error: 'empty_reply' });
      console.log('200');
      return json(200, { reply });
    } catch (e) {
      console.log('502 model');
      return json(502, { error: 'model_error' });
    }
  }
};
