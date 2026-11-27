// T02：把合成語音轉成 16 kHz 單聲道，並加入固定亂數種子的背景噪音（模擬辦公室風扇／空調的寬頻噪音）
// node tests/voice/add-noise.cjs [SNR dB，預設 15]
// 輸出 tests/voice/16k/clean-*.wav 與 tests/voice/16k/noisy-*.wav
const fs = require('fs'), path = require('path');
const SNR = Number(process.argv[2] || 15), SET = process.argv[3] || '';
const src = path.join(__dirname, 'out' + SET), dst = path.join(__dirname, '16k' + SET);
fs.mkdirSync(dst, { recursive: true });

function readWav(buf) {
  let p = 12, fmt = null, data = null;
  while (p + 8 <= buf.length) {
    const id = buf.toString('ascii', p, p + 4), size = buf.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { channels: buf.readUInt16LE(p + 10), rate: buf.readUInt32LE(p + 12), bits: buf.readUInt16LE(p + 22) };
    if (id === 'data') data = buf.subarray(p + 8, p + 8 + size);
    p += 8 + size + (size & 1);
  }
  if (!fmt || !data || fmt.bits !== 16) throw new Error('unsupported wav');
  const n = data.length / 2 / fmt.channels, out = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let c = 0; c < fmt.channels; c++) s += data.readInt16LE((i * fmt.channels + c) * 2); out[i] = s / fmt.channels / 32768; }
  return { rate: fmt.rate, samples: out };
}
function resample(x, from, to) {
  if (from === to) return x;
  // 先做簡單低通（移動平均）再線性內插，足以把 24/22.05 kHz 降到 16 kHz
  const k = Math.max(1, Math.round(from / to)), lp = new Float32Array(x.length);
  let acc = 0; for (let i = 0; i < x.length; i++) { acc += x[i]; if (i >= k) acc -= x[i - k]; lp[i] = acc / Math.min(i + 1, k); }
  const n = Math.floor(x.length * to / from), y = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i * from / to, j = Math.floor(t), f = t - j; y[i] = (lp[j] || 0) * (1 - f) + (lp[j + 1] || 0) * f; }
  return y;
}
function writeWav(file, x, rate) {
  const b = Buffer.alloc(44 + x.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(file, b);
}
let seed = 20261127;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const files = fs.readdirSync(src).filter(f => f.endsWith('.wav')).sort();
for (const f of files) {
  const w = readWav(fs.readFileSync(path.join(src, f)));
  const x = resample(w.samples, w.rate, 16000);
  writeWav(path.join(dst, 'clean-' + f), x, 16000);
  // 噪音能量依語音（非靜音部分）的平均能量決定
  let e = 0, m = 0; for (const v of x) if (Math.abs(v) > 0.01) { e += v * v; m++; }
  const sig = e / Math.max(1, m), sigma = Math.sqrt(sig / Math.pow(10, SNR / 10));
  let brown = 0; const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) { brown = brown * 0.97 + gauss() * 0.24; y[i] = x[i] + sigma * (0.6 * gauss() + 0.8 * brown); }
  writeWav(path.join(dst, 'noisy-' + f), y, 16000);
}
console.log(files.length, 'clips', 'SNR', SNR, 'dB', '->', dst);
