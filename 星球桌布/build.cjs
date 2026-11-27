// 產生安裝包：node build.cjs
// 輸出兩個資料夾與 zip（download/）：
//   dist/星球桌布-安裝包/        一般版：原本的動態桌布（含本機安全閘道與資料加密），沒有對話功能
//   dist/小公主AI-Lite-安裝包/   AI Lite：一般版 + 小公主對話視窗（文字／語音），全部離線
// index.html 內嵌 three.js、模型載入器、小公主程式與 Blender 模型（不需網路）。
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { execFileSync } = require('child_process');
const root = __dirname;
const LIMIT = 100000000;   // 指令書：完整 AI Lite ZIP ≤ 100,000,000 bytes

const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');
const assets = path.join(root, 'assets');
const pngData = name => 'data:image/png;base64,' + fs.readFileSync(path.join(assets, name)).toString('base64');
const iconStyles = read('assets/icons.css').replace(/url\("([\w-]+\.png)"\)/g, (_, name) => `url("${pngData(name)}")`);
const managerImage = pngData('manager.png');
const embedIcons = html => html
  .replace('<link rel="stylesheet" href="assets/icons.css">', () => `<style>\n${iconStyles}\n</style>`)
  .replaceAll('assets/manager.png', managerImage);
const safe = (name, code) => { if (/<\/script|<!--/i.test(code)) throw new Error(`${name} contains sequences unsafe for inline embedding`); return code; };
const exportScript = safe('calendar export', read('calendar-export.js'));
const embedPage = html => embedIcons(html).replace('<script src="calendar-export.js"></script>', () => `<script>\n${exportScript}\n</script>`);

// AI Lite 的再散布元件（版本鎖定；SHA-256 於建置時重新計算並寫入清單）
const AI_FILES = [
  { file: 'ai/lib/princess-ai.js', from: 'ai/princess-ai.js' },
  { file: 'ai/lib/local-intent.js', from: 'ai/local-intent.js' },
  { file: 'ai/lib/vosk.js', from: 'ai/lib/vosk.js' },
  { file: 'ai/lib/opencc-cn2t.js', from: 'ai/lib/opencc-cn2t.js' },
  { file: 'ai/models/vosk-model-small-cn-0.22.tar.gz', from: 'ai/models/vosk-model-small-cn-0.22.tar.gz',
    missing: '找不到語音模型，請先執行 node tools/fetch-ai-model.cjs' },
];
const SBOM = [
  { name: 'three.js', version: 'r160', license: 'MIT', files: ['index.html（內嵌）'], url: 'https://github.com/mrdoob/three.js' },
  { name: 'vosk-browser', version: '0.0.8', license: 'Apache-2.0', files: ['ai/lib/vosk.js'], url: 'https://github.com/ccoreilly/vosk-browser',
    note: '內含 Vosk / Kaldi（Apache-2.0）與 OpenFST（Apache-2.0）的 WebAssembly 版本，以及 uuid（MIT）', ai: true },
  { name: 'vosk-model-small-cn-0.22', version: '0.22', license: 'Apache-2.0', files: ['ai/models/vosk-model-small-cn-0.22.tar.gz'],
    url: 'https://alphacephei.com/vosk/models', note: '官方 zip（SHA-256 3af8b0e7…14ba）重新打包為 tar.gz，內容未修改', ai: true },
  { name: 'opencc-js', version: '1.4.2', license: 'MIT AND Apache-2.0', files: ['ai/lib/opencc-cn2t.js'], url: 'https://github.com/nk2028/opencc-js',
    note: '程式 MIT；字典來自 OpenCC（Apache-2.0）。用於把辨識結果轉成臺灣繁體', ai: true },
];

function writePs1(src, dest) {
  // Windows PowerShell 5.1 需要 BOM 才能正確讀取 UTF-8 腳本
  const txt = fs.readFileSync(src, 'utf8').replace(/^﻿/, '').replace(/\r?\n/g, '\r\n');
  fs.writeFileSync(dest, '﻿' + txt);
}

function build(name, withAi) {
  const out = path.join(root, 'dist', name);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const parts = {
    '/*THREE_SRC*/': safe('three', read('vendor/three.module.min.js')),
    '/*BGU_SRC*/': safe('BufferGeometryUtils', read('vendor/BufferGeometryUtils.js')),
    '/*GLTF_SRC*/': safe('GLTFLoader', read('vendor/GLTFLoader.js')),
    '/*RIG_SRC*/': safe('princess-rig', read('princess-rig.js')),
    '/*GLB_B64*/': fs.readFileSync(path.join(root, 'models', 'princess.glb')).toString('base64'),
    '/*EXPRESSION_B64*/': fs.readFileSync(path.join(assets, 'expressions.png')).toString('base64'),
  };
  let html = read('index.html');
  for (const [k, v] of Object.entries(parts)) {
    if (!html.includes(k)) throw new Error('placeholder missing in index.html: ' + k);
    html = html.replace(k, () => v);
  }
  fs.writeFileSync(path.join(out, 'index.html'), embedPage(html));
  for (const f of ['control.html', 'open-control.html']) fs.writeFileSync(path.join(out, f), embedPage(read(f)));

  const icons = path.join(out, 'icons');
  fs.mkdirSync(icons);
  for (const n of ['manager.ico', 'start.ico', 'stop.ico', 'remove.ico']) fs.copyFileSync(path.join(assets, n), path.join(icons, n));

  const inst = path.join(root, 'installer');
  for (const f of ['lpw.ps1', 'install.ps1', 'uninstall.ps1', 'rollback.ps1']) writePs1(path.join(inst, f), path.join(out, f));
  fs.copyFileSync(path.join(inst, 'PlanetAi.cs'), path.join(out, 'PlanetAi.cs'));
  fs.writeFileSync(path.join(out, '安裝星球桌布.cmd'), fs.readFileSync(path.join(inst, 'install.cmd'), 'utf8').replace(/\r?\n/g, '\r\n'));

  const sums = [];
  if (withAi) {
    fs.writeFileSync(path.join(out, 'princess-chat.html'), embedPage(read('princess-chat.html')));
    for (const a of AI_FILES) {
      const src = path.join(root, a.from);
      if (!fs.existsSync(src)) throw new Error(a.missing || 'missing ' + a.from);
      const dest = path.join(out, a.file);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      sums.push(`${sha(fs.readFileSync(dest))} *${a.file.replace(/\//g, '\\')}`);
    }
    const lic = path.join(out, 'ai', 'licenses');
    fs.mkdirSync(lic, { recursive: true });
    for (const f of fs.readdirSync(path.join(root, 'ai', 'licenses'))) fs.copyFileSync(path.join(root, 'ai', 'licenses', f), path.join(lic, f));
    fs.writeFileSync(path.join(out, 'SHA256SUMS-ai.txt'), sums.join('\r\n') + '\r\n');
  }
  fs.copyFileSync(path.join(root, 'vendor', 'LICENSE-three.js.txt'), path.join(out, 'LICENSE-three.js.txt'));
  const comps = SBOM.filter(c => withAi || !c.ai);
  fs.writeFileSync(path.join(out, 'SBOM.json'), JSON.stringify({
    bomFormat: 'CycloneDX', specVersion: '1.5', version: 1,
    metadata: { component: { type: 'application', name: withAi ? '小公主 AI Lite（星球桌布）' : '星球桌布', author: '官毅明' } },
    components: comps.map(c => ({ type: c.name.startsWith('vosk-model') ? 'data' : 'library', name: c.name, version: c.version,
      licenses: [{ expression: c.license }], externalReferences: [{ type: 'website', url: c.url }], description: c.note || '',
      properties: c.files.map(f => ({ name: 'file', value: f })) }))
  }, null, 2));
  fs.writeFileSync(path.join(out, '讀我.txt'), '﻿' + readme(withAi).join('\r\n'));
  return out;
}

function readme(withAi) {
  return [
    withAi ? '小公主 AI Lite（星球桌布）　創作人 官毅明' : '小公主的星球（星球桌布）動態桌布　創作人 官毅明',
    '',
    '安裝：雙擊「安裝星球桌布.cmd」。',
    '  ・桌布會放在桌面圖示後方，自動配合螢幕解析度，開機時自動啟動。',
    '  ・桌面會多一個「星球居民及行事曆管理」：新增居民、管理行事曆，',
    '    並可選擇桌布顯示在主螢幕、副螢幕或同時顯示。',
    ...(withAi ? [
      '  ・按 Ctrl+Alt+P（可在管理視窗修改）或開始功能表「和小公主說話」開啟對話視窗，',
      '    可以打字或按住麥克風說話。查詢、新增、修改、刪除行程都會先請你確認才寫入。',
      '  ・語音辨識（Vosk）與語音合成（Windows 本機臺灣中文聲線）預設都在本機執行。Groq AI 需設定個人金鑰並啟用，可另選 Edge 線上自然女聲。',
    ] : []),
    '',
    '停止 / 解除安裝 / 還原上一版：開始功能表 →「星球桌布」，或執行安裝資料夾裡的 rollback.ps1。',
    '需求：Windows 10 / 11 與 Microsoft Edge（Windows 內建）。完全不需要網路。',
    '',
    '這個程式會做的事（給資訊人員參考）：',
    '  ・安裝到 %LOCALAPPDATA%\\PlanetWallpaper，並在本機編譯一個小啟動程式 PlanetWallpaper.exe',
    '  ・以隱藏視窗執行 PowerShell 腳本 lpw.ps1，用 Edge 顯示網頁並把視窗放到桌面圖示後方',
    '  ・在 127.0.0.1:47826（只有本機可連）提供網頁；檢查 Host、Origin、工作階段金鑰，拒絕其他網站的請求',
    '  ・居民與行事曆以 Windows DPAPI（目前使用者）加密存在安裝資料夾的 data.dat',
    '  ・紀錄檔 wallpaper-log.txt / ai-log.txt 只有時間與狀態代碼，不含對話或行程內容，保留 14 天',
    ...(withAi ? ['  ・點擊小公主、使用語音快捷鍵或按住麥克風時錄音，錄音只在記憶體中辨識，不存檔、不上傳；不會在背景錄音',
                  '  ・組織可用登錄 HKLM\\SOFTWARE\\Policies\\PlanetWallpaper 鎖定公務模式（詳見 SECURITY.md）'] : []),
    '  ・在「啟動」資料夾建立捷徑以便開機自動執行',
    '  公司電腦的防毒軟體可能把這些行為判定為可疑，請先徵得資訊單位同意再安裝。',
    ''
  ];
}

function zip(dir, file) {
  fs.rmSync(file, { force: true });
  // .NET ZipFile（Windows PowerShell 5.1 內建），檔名以 UTF-8 儲存
  const ps = `Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory($env:ZIP_SRC, $env:ZIP_OUT, [IO.Compression.CompressionLevel]::Optimal, $true)`;
  execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { env: { ...process.env, ZIP_SRC: dir, ZIP_OUT: file }, stdio: 'inherit' });
  return fs.statSync(file).size;
}
function dirSize(d) { let n = 0; for (const f of fs.readdirSync(d, { withFileTypes: true })) n += f.isDirectory() ? dirSize(path.join(d, f.name)) : fs.statSync(path.join(d, f.name)).size; return n; }

const download = path.join(root, 'download');
fs.mkdirSync(download, { recursive: true });
const results = [];
for (const [name, withAi] of [['星球桌布-安裝包', false], ['小公主AI-Lite-安裝包', true]]) {
  const dir = build(name, withAi);
  const zfile = path.join(download, name + '.zip');
  const bytes = zip(dir, zfile);
  results.push({ name: name + '.zip', bytes, unpacked: dirSize(dir), sha256: sha(fs.readFileSync(zfile)) });
  if (withAi && bytes > LIMIT) throw new Error(`AI Lite ZIP is ${bytes} bytes, over the ${LIMIT} byte limit`);
}
fs.writeFileSync(path.join(download, 'SHA256SUMS.txt'), results.map(r => `${r.sha256} *${r.name}`).join('\r\n') + '\r\n');
fs.writeFileSync(path.join(download, 'SIZES.txt'), results.map(r => `${r.name}\tZIP ${r.bytes} bytes\t解壓後 ${r.unpacked} bytes`).join('\r\n') + '\r\n');
console.table(results);
