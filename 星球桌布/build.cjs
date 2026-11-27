// 產生 Lively Wallpaper 桌布包：node build.cjs
// 輸出 dist/（index.html 內嵌 three.js、LivelyInfo.json、LivelyProperties.json），
// 不含任何執行檔或腳本。之後把 dist/ 裡的三個檔案壓成 zip 即可匯入 Lively。
const fs = require('fs'), path = require('path');
const root = __dirname;
const out = path.join(root, 'dist');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const three = fs.readFileSync(path.join(root, 'vendor', 'three.module.min.js'), 'utf8');
if (/<\/script|<!--/i.test(three)) throw new Error('three.js contains sequences unsafe for inline embedding');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
if (!html.includes('/*THREE_SRC*/')) throw new Error('placeholder missing in index.html');
fs.writeFileSync(path.join(out, 'index.html'), html.replace('/*THREE_SRC*/', () => three));
for (const f of ['LivelyInfo.json', 'LivelyProperties.json']) fs.copyFileSync(path.join(root, f), path.join(out, f));
console.log('built', out, fs.readdirSync(out));
