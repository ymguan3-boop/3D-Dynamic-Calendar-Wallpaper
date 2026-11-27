// 產生安裝包：node build.cjs
// 輸出 dist/星球桌布-安裝包/：index.html 內嵌 three.js、模型載入器、小公主程式與 Blender 模型（不需網路），
// 加上管理視窗、桌布程式與安裝／解除安裝腳本。之後把這個資料夾壓成 zip 放到 download/。
const fs = require('fs'), path = require('path');
const root = __dirname;
const out = path.join(root, 'dist', '星球桌布-安裝包');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const assets = path.join(root, 'assets');
const pngData = name => 'data:image/png;base64,' + fs.readFileSync(path.join(assets, name)).toString('base64');
const iconStyles = read('assets/icons.css').replace(/url\("([\w-]+\.png)"\)/g, (_, name) => `url("${pngData(name)}")`);
const managerImage = pngData('manager.png');
const embedIcons = html => html
  .replace('<link rel="stylesheet" href="assets/icons.css">', () => `<style>\n${iconStyles}\n</style>`)
  .replaceAll('assets/manager.png', managerImage);
const safe = (name, code) => { if (/<\/script|<!--/i.test(code)) throw new Error(`${name} contains sequences unsafe for inline embedding`); return code; };
const parts = {
  '/*THREE_SRC*/': safe('three', read('vendor/three.module.min.js')),
  '/*BGU_SRC*/': safe('BufferGeometryUtils', read('vendor/BufferGeometryUtils.js')),
  '/*GLTF_SRC*/': safe('GLTFLoader', read('vendor/GLTFLoader.js')),
  '/*RIG_SRC*/': safe('princess-rig', read('princess-rig.js')),
  '/*GLB_B64*/': fs.readFileSync(path.join(root, 'models', 'princess.glb')).toString('base64'),
};
let html = read('index.html');
for (const [k, v] of Object.entries(parts)) {
  if (!html.includes(k)) throw new Error('placeholder missing in index.html: ' + k);
  html = html.replace(k, () => v);
}
fs.writeFileSync(path.join(out, 'index.html'), embedIcons(html));
for (const f of ['control.html', 'open-control.html']) fs.writeFileSync(path.join(out, f), embedIcons(read(f)));

const icons = path.join(out, 'icons');
fs.mkdirSync(icons);
for (const name of ['manager.ico', 'start.ico', 'stop.ico', 'remove.ico']) {
  fs.copyFileSync(path.join(assets, name), path.join(icons, name));
}

const inst = path.join(root, 'installer');
for (const f of ['lpw.ps1', 'install.ps1', 'uninstall.ps1']) {
  // Windows PowerShell 5.1 需要 BOM 才能正確讀取 UTF-8 腳本
  const txt = fs.readFileSync(path.join(inst, f), 'utf8').replace(/^﻿/, '').replace(/\r?\n/g, '\r\n');
  fs.writeFileSync(path.join(out, f), '﻿' + txt);
}
fs.writeFileSync(path.join(out, '安裝星球桌布.cmd'), fs.readFileSync(path.join(inst, 'install.cmd'), 'utf8').replace(/\r?\n/g, '\r\n'));
fs.writeFileSync(path.join(out, '讀我.txt'), '﻿' + [
  '小公主的星球（星球桌布）動態桌布　創作人 官毅明',
  '',
  '安裝：雙擊「安裝星球桌布.cmd」。',
  '  ・桌布會放在桌面圖示後方，自動配合螢幕解析度，開機時自動啟動。',
  '  ・桌面會多一個「星球居民及行事曆管理」：新增居民、管理行事曆，',
  '    並可選擇桌布顯示在主螢幕、副螢幕或同時顯示。',
  '',
  '停止 / 解除安裝：開始功能表 →「星球桌布」。',
  '需求：Windows 10 / 11 與 Microsoft Edge（Windows 內建）。完全不需要網路。',
  '',
  '這個程式會做的事（給資訊人員參考）：',
  '  ・安裝到 %LOCALAPPDATA%\\PlanetWallpaper，並在本機編譯一個小啟動程式 PlanetWallpaper.exe',
  '  ・以隱藏視窗執行 PowerShell 腳本 lpw.ps1，用 Edge 顯示網頁並把視窗放到桌面圖示後方',
  '  ・在 127.0.0.1:47826（只有本機可連）提供網頁，並把資料存到安裝資料夾的 data.json',
  '  ・在「啟動」資料夾建立捷徑以便開機自動執行',
  '  公司電腦的防毒軟體可能把這些行為判定為可疑，請先徵得資訊單位同意再安裝。',
  ''
].join('\r\n'));
console.log('built', out, fs.readdirSync(out).map(f => `${f} ${fs.statSync(path.join(out, f)).size}`));
