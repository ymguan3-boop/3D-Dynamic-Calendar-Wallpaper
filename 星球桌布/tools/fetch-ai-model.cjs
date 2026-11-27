// 取得離線語音模型：node tools/fetch-ai-model.cjs [已下載的 zip 路徑]
// 只在「建置安裝包的電腦」上執行一次；使用者安裝時不會下載任何東西。
// 1. 下載 Vosk 官方 vosk-model-small-cn-0.22.zip（Apache-2.0），驗證 SHA-256
// 2. 解壓後重新打包成 vosk-browser 需要的 tar.gz（檔案排序、時間歸零，每次產生的位元組都相同）
const fs = require('fs'), path = require('path'), crypto = require('crypto'), zlib = require('zlib'), https = require('https');
const { execFileSync } = require('child_process');

const NAME = 'vosk-model-small-cn-0.22';
const URL = `https://alphacephei.com/vosk/models/${NAME}.zip`;
const ZIP_SHA256 = '3af8b0e7e0f835ae9d414ce5df580237a3cfb08d586c9fbbb0f7ff29ad5b14ba';
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'ai', 'models');
const work = path.join(root, 'dist', 'model-work');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

function download(url, file) {
  return new Promise((ok, bad) => {
    https.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return download(res.headers.location, file).then(ok, bad);
      if (res.statusCode !== 200) return bad(new Error('HTTP ' + res.statusCode));
      const out = fs.createWriteStream(file); res.pipe(out); out.on('finish', () => out.close(ok)); out.on('error', bad);
    }).on('error', bad);
  });
}
// 最小的 ustar 打包器：只放一般檔案與資料夾，mode 0644/0755，uid/gid 0，mtime 0
function tarEntries(baseDir, prefix) {
  const list = [];
  (function walk(rel) {
    const abs = path.join(baseDir, rel);
    const names = fs.readdirSync(abs).sort();
    for (const n of names) {
      const r = rel ? rel + '/' + n : n, st = fs.statSync(path.join(baseDir, r));
      if (st.isDirectory()) { list.push({ name: prefix + r + '/', dir: true }); walk(r); }
      else list.push({ name: prefix + r, data: fs.readFileSync(path.join(baseDir, r)) });
    }
  })('');
  return [{ name: prefix, dir: true }, ...list];
}
function header(e) {
  const h = Buffer.alloc(512);
  if (Buffer.byteLength(e.name) > 100) throw new Error('path too long for ustar: ' + e.name);
  h.write(e.name, 0, 'utf8');
  const oct = (v, len) => v.toString(8).padStart(len - 1, '0') + '\0';
  h.write(oct(e.dir ? 0o755 : 0o644, 8), 100); h.write(oct(0, 8), 108); h.write(oct(0, 8), 116);
  h.write(oct(e.dir ? 0 : e.data.length, 12), 124); h.write(oct(0, 12), 136);
  h.write('        ', 148); h.write(e.dir ? '5' : '0', 156); h.write('ustar\0', 257); h.write('00', 263);
  let sum = 0; for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  return h;
}
function makeTar(entries) {
  const parts = [];
  for (const e of entries) {
    parts.push(header(e));
    if (!e.dir) { parts.push(e.data); const pad = (512 - e.data.length % 512) % 512; if (pad) parts.push(Buffer.alloc(pad)); }
  }
  parts.push(Buffer.alloc(1024));
  return Buffer.concat(parts);
}

(async () => {
  fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
  let zip = process.argv[2];
  if (!zip) { zip = path.join(work, NAME + '.zip'); console.log('downloading', URL); await download(URL, zip); }
  const got = sha(fs.readFileSync(zip));
  if (got !== ZIP_SHA256) throw new Error(`SHA-256 mismatch for ${zip}: ${got}`);
  // Windows 10/11 內建的 tar（bsdtar）可以解 zip
  const TAR = process.platform === 'win32' ? path.join(process.env.SystemRoot, 'System32', 'tar.exe') : 'unzip';
  execFileSync(TAR, process.platform === 'win32' ? ['-xf', zip, '-C', work] : ['-q', zip, '-d', work]);
  const tgz = zlib.gzipSync(makeTar(tarEntries(path.join(work, NAME), NAME + '/')), { level: 9 });
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, NAME + '.tar.gz');
  fs.writeFileSync(file, tgz);
  fs.rmSync(work, { recursive: true, force: true });
  console.log(file, tgz.length, 'bytes', 'sha256', sha(tgz));
})().catch(e => { console.error(e.message); process.exit(1); });
