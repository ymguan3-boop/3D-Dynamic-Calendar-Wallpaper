// T04 資安測試：對「實際執行中」的本機服務（127.0.0.1:47826）發送偽造請求。
// 執行：node --test tests/security/gateway.test.mjs   （桌布沒有執行時整組略過，不算通過）
// 測試會新增一個標題以「T04測試」開頭的行程並在最後刪除；全部經過正式的 propose → commit 流程。
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const HOST = '127.0.0.1', PORT = 47826, ORIGIN = `http://${HOST}:${PORT}`;
function req(method, path, { headers = {}, body, host = `${HOST}:${PORT}` } = {}) {
  return new Promise((ok, bad) => {
    const data = body === undefined ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const h = { Host: host, ...headers };
    if (data) { h['Content-Type'] ??= 'application/json'; h['Content-Length'] = data.length; }
    const r = http.request({ host: HOST, port: PORT, method, path, headers: h, setHost: false }, res => {
      const chunks = []; res.on('data', c => chunks.push(c));
      res.on('end', () => { const text = Buffer.concat(chunks).toString('utf8'); let json = null; try { json = JSON.parse(text); } catch {} ok({ status: res.statusCode, headers: res.headers, text, json }); });
    });
    r.on('error', bad); if (data) r.write(data); r.end();
  });
}
let token = null, alive = false;
try {
  const page = await req('GET', '/princess-chat.html');
  token = page.text.match(/const SESSION = '([0-9a-f]{48})'/)?.[1] || null;
  alive = !!token;
} catch { alive = false; }
const S = extra => ({ 'X-Planet-Session': token, ...extra });
const rid = () => 't04' + Math.random().toString(36).slice(2, 12);
const opts = { skip: alive ? false : '本機服務沒有執行' };
const calendar = async () => (await req('GET', '/ai/calendar', { headers: S() })).json;

test('DNS rebinding：Host 不是 127.0.0.1:47826 一律拒絕', opts, async () => {
  for (const host of ['evil.example:47826', 'localhost:47826', '127.0.0.1', '127.0.0.1:80', 'attacker.127.0.0.1.nip.io:47826']) {
    for (const p of ['/index.html', '/data', '/ai/calendar', '/princess-chat.html']) {
      const r = await req('GET', p, { host, headers: S() });
      assert.equal(r.status, 403, `${host} ${p}`);
      assert.ok(!r.text.includes(token), 'token must not leak');
    }
  }
});

test('跨來源：其他 Origin 或 cross-site 的 API 請求被拒絕，回應不帶 CORS', opts, async () => {
  for (const origin of ['https://evil.example', 'http://localhost:47826', 'null', 'http://127.0.0.1:5199']) {
    const r = await req('GET', '/ai/calendar', { headers: S({ Origin: origin }) });
    assert.equal(r.status, 403, origin);
  }
  for (const site of ['cross-site', 'same-site']) {
    assert.equal((await req('GET', '/ai/status', { headers: S({ 'Sec-Fetch-Site': site }) })).status, 403, site);
    assert.equal((await req('POST', '/data', { headers: S({ 'Sec-Fetch-Site': site }), body: {} })).status, 403, site);
  }
  // 從外部頁面「導覽」到我們的頁面可以（使用者自己點的），但 fetch/XHR 讀不到內容：沒有 Access-Control-Allow-Origin
  const nav = await req('GET', '/control.html', { headers: { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate' } });
  assert.equal(nav.status, 200);
  const cors = await req('GET', '/control.html', { headers: { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'cors', Origin: 'https://evil.example' } });
  assert.equal(cors.status, 403);
  for (const p of ['/index.html', '/control.html', '/princess-chat.html', '/ai/status', '/ai/calendar', '/data']) {
    const r = await req('GET', p, { headers: S() });
    assert.equal(r.headers['access-control-allow-origin'], undefined, p);
  }
  // 唯一例外：/ping 讓 file:// 啟動頁確認服務在執行，內容只有 ok
  const ping = await req('GET', '/ping', { headers: { Origin: 'null' } });
  assert.equal(ping.text, 'ok');
});

test('工作階段金鑰：缺少或錯誤時，資料與 AI 介面都拒絕', opts, async () => {
  const wrong = token.replace(/.$/, c => (c === '0' ? '1' : '0'));
  for (const [m, p] of [['GET', '/data'], ['POST', '/data'], ['GET', '/ai/calendar'], ['GET', '/ai/status'], ['POST', '/ai/calendar/propose'],
                        ['POST', '/ai/calendar/commit'], ['POST', '/ai/mode'], ['POST', '/ai/settings'], ['POST', '/ai/cloud'], ['GET', '/manager-state']]) {
    for (const h of [{}, { 'X-Planet-Session': wrong }, { 'X-Planet-Session': '' }]) {
      const r = await req(m, p, { headers: { ...h, 'X-Planet-Manager': '1', 'Sec-Fetch-Site': 'same-origin' }, body: m === 'POST' ? {} : undefined });
      assert.equal(r.status, 403, `${m} ${p} ${JSON.stringify(h)}`);
    }
  }
  // 字幕來源只給桌布（需要桌布的桌面輸入金鑰）
  assert.equal((await req('GET', '/ai/feed', { headers: S() })).status, 403);
});

test('安全標頭：HTML 有 CSP 與 frame 防護', opts, async () => {
  for (const p of ['/index.html', '/control.html', '/princess-chat.html']) {
    const r = await req('GET', p);
    assert.match(r.headers['content-security-policy'] || '', /connect-src 'self'/, p);
    assert.match(r.headers['content-security-policy'] || '', /frame-ancestors 'none'/, p);
    assert.equal(r.headers['x-frame-options'], 'DENY', p);
    assert.equal(r.headers['x-content-type-options'], 'nosniff', p);
  }
});

test('不提供其他檔案：腳本、資料檔、設定檔、路徑穿越都是 404', opts, async () => {
  for (const p of ['/lpw.ps1', '/data.dat', '/data.json', '/ai-settings.json', '/ai-log.txt', '/PlanetAi.cs', '/ai/lib/../lpw.ps1',
                   '/ai/lib/..%2f..%2flpw.ps1', '/ai/models/x.ps1', '/ai/lib/princess-ai.ps1', '/ai/licenses/Apache-2.0.txt', '/../lpw.ps1']) {
    const r = await req('GET', p, { headers: S() });
    assert.ok(r.status === 404 || r.status === 403, `${p} -> ${r.status}`);
  }
  assert.equal((await req('PUT', '/data', { headers: S(), body: {} })).status, 403);
  assert.equal((await req('DELETE', '/ai/calendar', { headers: S() })).status, 403);
});

test('輸入驗證：注入、控制字元、錯誤日期、錯誤動作、過大內容都拒絕', opts, async () => {
  const bad = [
    [{ requestId: rid(), op: 'add', event: { title: '<script>alert(1)</script>', date: '2026-12-01', time: '' } }, 'bad_title'],
    [{ requestId: rid(), op: 'add', event: { title: '開會\u0007', date: '2026-12-01', time: '' } }, 'bad_title'],
    [{ requestId: rid(), op: 'add', event: { title: '', date: '2026-12-01', time: '' } }, 'bad_title'],
    [{ requestId: rid(), op: 'add', event: { title: 'x'.repeat(41), date: '2026-12-01', time: '' } }, 'bad_title'],
    [{ requestId: rid(), op: 'add', event: { title: '開會', date: '2026-02-30', time: '' } }, 'bad_date'],
    [{ requestId: rid(), op: 'add', event: { title: '開會', date: '2026-12-01', time: '25:00' } }, 'bad_time'],
    [{ requestId: rid(), op: 'exec', event: { title: 'calc.exe' } }, 'bad_op'],
    [{ requestId: '../../x', op: 'add', event: { title: '開會', date: '2026-12-01' } }, 'bad_request_id'],
    [{ requestId: rid(), op: 'delete', event: { id: 'no-such-event' } }, 'event_not_found'],
    [{ requestId: rid(), op: 'update', event: { id: '"><img>', title: 'a', date: '2026-12-01' } }, 'bad_id'],
  ];
  for (const [body, error] of bad) {
    const r = await req('POST', '/ai/calendar/propose', { headers: S(), body });
    assert.ok(r.status === 400 || r.status === 404, JSON.stringify(body));
    assert.equal(r.json?.error, error, JSON.stringify(body));
  }
  assert.equal((await req('POST', '/ai/calendar/propose', { headers: S(), body: '{not json' })).json?.error, 'bad_json');
  // 超過 16 KB：服務回 400 並立刻關閉連線，用戶端可能先收到 400，也可能因為還在送資料而收到連線重設；兩者都代表被拒絕
  const before = (await calendar()).rev;
  let bigStatus;
  try { bigStatus = (await req('POST', '/ai/calendar/propose', { headers: S(), body: { requestId: rid(), op: 'add', event: { title: '開會', date: '2026-12-01' }, pad: 'x'.repeat(20000) } })).status; }
  catch (e) { bigStatus = e.code; }
  assert.ok(bigStatus === 400 || bigStatus === 'ECONNRESET' || bigStatus === 'EPIPE', String(bigStatus));
  assert.equal((await calendar()).rev, before);
  // 公務模式不能被前端切換到未授權的模式
  assert.equal((await req('POST', '/ai/mode', { headers: S(), body: { mode: 'personal', consent: true } })).status, 403);
  assert.equal((await req('POST', '/ai/mode', { headers: S(), body: { mode: 'device' } })).status, 403);
  assert.equal((await req('POST', '/ai/cloud', { headers: S(), body: { text: 'hi' } })).status, 403);
});

test('確認權杖：未確認不寫入、錯誤權杖拒絕、重送不重複寫入、版本衝突拒絕', opts, async () => {
  const before = await calendar();
  const title = 'T04測試' + Date.now().toString(36).slice(-4);
  const id1 = rid();
  const p1 = await req('POST', '/ai/calendar/propose', { headers: S(), body: { requestId: id1, op: 'add', event: { title, date: '2026-12-31', time: '09:00' } } });
  assert.equal(p1.status, 200);
  await new Promise(f => setTimeout(f, 1200));
  assert.equal((await calendar()).events.filter(e => e.title === title).length, 0, 'proposal alone must not write');

  assert.equal((await req('POST', '/ai/calendar/commit', { headers: S(), body: { requestId: id1, confirmToken: 'f'.repeat(48) } })).status, 403);
  assert.equal((await req('POST', '/ai/calendar/commit', { headers: S(), body: { requestId: rid(), confirmToken: p1.json.confirmToken } })).status, 403);
  const c1 = await req('POST', '/ai/calendar/commit', { headers: S(), body: { requestId: id1, confirmToken: p1.json.confirmToken } });
  assert.equal(c1.status, 200, c1.text);
  let after; for (let i = 0; i < 20; i++) { await new Promise(f => setTimeout(f, 250)); after = await calendar(); if (after.rev !== before.rev) break; }
  assert.equal(after.events.filter(e => e.title === title).length, 1, 'exactly one write');
  // 重送同一個 requestId：回報 duplicate，不再寫入
  const replay = await req('POST', '/ai/calendar/commit', { headers: S(), body: { requestId: id1, confirmToken: p1.json.confirmToken } });
  assert.equal(replay.json?.duplicate, true);
  await new Promise(f => setTimeout(f, 1200));
  assert.equal((await calendar()).events.filter(e => e.title === title).length, 1, 'replay must not write twice');

  // 版本衝突：先拿到兩張權杖，第一張寫入後 rev 改變，第二張就被拒絕
  const ev = (await calendar()).events.find(e => e.title === title);
  const idA = rid(), idB = rid();
  const pa = await req('POST', '/ai/calendar/propose', { headers: S(), body: { requestId: idA, op: 'update', event: { id: ev.id, title, date: '2026-12-31', time: '10:00' } } });
  const pb = await req('POST', '/ai/calendar/propose', { headers: S(), body: { requestId: idB, op: 'update', event: { id: ev.id, title, date: '2026-12-31', time: '11:00' } } });
  const revA = (await calendar()).rev;
  // 缺少 requestId 的送出被拒絕
  assert.equal((await req('POST', '/ai/calendar/commit', { headers: S(), body: { confirmToken: pa.json.confirmToken } })).status, 400);
  assert.equal((await req('POST', '/ai/calendar/commit', { headers: S(), body: { requestId: idA, confirmToken: pa.json.confirmToken } })).status, 200);
  for (let i = 0; i < 20; i++) { await new Promise(f => setTimeout(f, 250)); if ((await calendar()).rev !== revA) break; }
  const conflict = await req('POST', '/ai/calendar/commit', { headers: S(), body: { requestId: idB, confirmToken: pb.json.confirmToken } });
  assert.equal(conflict.status, 409, conflict.text);
  assert.equal((await calendar()).events.find(e => e.id === ev.id).time, '10:00', 'stale proposal was not applied');

  // 清除測試行程（同樣經過 propose → commit）
  const idD = rid();
  const pd = await req('POST', '/ai/calendar/propose', { headers: S(), body: { requestId: idD, op: 'delete', event: { id: ev.id } } });
  assert.equal((await req('POST', '/ai/calendar/commit', { headers: S(), body: { requestId: idD, confirmToken: pd.json.confirmToken } })).status, 200);
  for (let i = 0; i < 20; i++) { await new Promise(f => setTimeout(f, 250)); if (!(await calendar()).events.some(e => e.id === ev.id)) break; }
  assert.ok(!(await calendar()).events.some(e => e.id === ev.id), 'test event removed');
});
