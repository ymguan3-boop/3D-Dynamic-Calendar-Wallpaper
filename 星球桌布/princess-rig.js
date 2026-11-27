// 小公主：載入 Blender 匯出的模型後，加上表情貼圖、布料與紗的質感、姿勢動畫。
// createPrincess(THREE, gltfScene) → { root, J, express(name, sec), update(dt, t, state) }
//   state = { pose: '' | 'wave' | 'pet' | 'reach' | 'water' | 'stars', birdOnHead: bool }

export const EXPRESSIONS = ['idle', 'blink', 'happy', 'talk', 'shy', 'star', 'sad', 'wow'];

/* ---------------- 布料、蕾絲、紗的程式貼圖 ---------------- */
function canvas(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; }
function fabricTextures(THREE) {
  const tex = (c, rep) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); t.anisotropy = 4; return t; };
  // 緞面細織紋（凹凸用）
  const satin = canvas(128, 128, (g, w, h) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) { g.fillStyle = y % 4 ? '#8a8a8a' : '#767676'; g.fillRect(0, y, w, 1); }
    for (let x = 0; x < w; x += 8) { g.fillStyle = 'rgba(0,0,0,.05)'; g.fillRect(x, 0, 1, h); }
  });
  // 棉布平織紋：經緯交錯
  const weave = canvas(64, 64, (g, w, h) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
    const s = 8;
    for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) {
      const up = ((x + y) / s) % 2 === 0;
      const gr = up ? g.createLinearGradient(x, y, x + s, y) : g.createLinearGradient(x, y, x, y + s);
      gr.addColorStop(0, '#5a5a5a'); gr.addColorStop(.5, '#b8b8b8'); gr.addColorStop(1, '#5a5a5a');
      g.fillStyle = gr; g.fillRect(x + .5, y + .5, s - 1, s - 1);
    }
  });
  // 紗：六角網眼（白=紗線，黑=透空）
  const net = canvas(96, 96, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#d8d8d8'; g.lineWidth = 1.4;
    const R = 8, dx = R * Math.sqrt(3), dy = R * 1.5;
    for (let row = -1; row * dy < h + R; row++) for (let col = -1; col * dx < w + dx; col++) {
      const cx = col * dx + (row % 2 ? dx / 2 : 0), cy = row * dy;
      g.beginPath();
      for (let k = 0; k <= 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; g[k ? 'lineTo' : 'moveTo'](cx + R * Math.cos(a), cy + R * Math.sin(a)); }
      g.stroke();
    }
  });
  // 蕾絲：扇貝花邊與小洞
  const lace = canvas(128, 64, (g, w, h) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#000';
    for (let x = 0; x < w; x += 16) {
      g.beginPath(); g.arc(x + 8, 22, 4, 0, 7); g.fill();
      g.beginPath(); g.arc(x + 8, 44, 2.5, 0, 7); g.fill();
      g.beginPath(); g.arc(x, 64, 8, Math.PI, 0); g.fill();
    }
  });
  return {
    satin: tex(satin, [10, 6]), weave: tex(weave, [18, 10]), weaveFine: tex(weave, [8, 4]),
    net: tex(net, [44, 16]), netSleeve: tex(net, [16, 6]), lace: tex(lace, [24, 1])
  };
}

// 依 Blender 材質名稱換成有布料質感的材質
function upgradeMaterials(THREE, root) {
  const T = fabricTextures(THREE);
  const cache = new Map();
  const make = (m, meshName) => {
    const key = m.name + (meshName.startsWith('puff_tulle') ? ':sleeve' : '');
    if (cache.has(key)) return cache.get(key);
    const base = { color: m.color.clone(), roughness: m.roughness, metalness: m.metalness, emissive: m.emissive ? m.emissive.clone() : undefined, emissiveIntensity: m.emissiveIntensity ?? 1 };
    let out;
    switch (m.name) {
      case 'dress': case 'over': case 'sash': case 'shoe':            // 緞面：柔光 + 細織紋
        out = new THREE.MeshPhysicalMaterial({ ...base, roughness: .36, sheen: 1, sheenRoughness: .3, sheenColor: m.color.clone().lerp(new THREE.Color(1, 1, 1), .5), bumpMap: T.satin, bumpScale: .4 });
        break;
      case 'skirt': case 'pinkR': case 'lilacR': case 'puff': case 'sock':   // 棉布：平織紋、霧面
        out = new THREE.MeshPhysicalMaterial({ ...base, roughness: .82, sheen: .6, sheenRoughness: .8, sheenColor: new THREE.Color(1, 1, 1), bumpMap: T.weave, bumpScale: .7 });
        break;
      case 'lace':                                                     // 蕾絲：鏤空花紋
        out = new THREE.MeshPhysicalMaterial({ ...base, roughness: .7, alphaMap: T.lace, alphaTest: .45, side: THREE.DoubleSide, sheen: .5, sheenColor: new THREE.Color(1, 1, 1) });
        break;
      case 'tulle': case 'tulleL':                                     // 紗：半透明網眼
        out = new THREE.MeshPhysicalMaterial({ ...base, roughness: .9, transparent: true, opacity: .55, alphaMap: meshName.startsWith('puff_tulle') ? T.netSleeve : T.net,
          depthWrite: false, side: THREE.DoubleSide, sheen: 1, sheenRoughness: .5, sheenColor: new THREE.Color(1, .9, .96) });
        break;
      case 'hair': case 'hairHi':                                      // 頭髮：沿髮絲方向的光澤
        out = new THREE.MeshPhysicalMaterial({ ...base, roughness: .42, anisotropy: .7, sheen: .3, sheenColor: m.color.clone().lerp(new THREE.Color(1, .85, .7), .5) });
        break;
      case 'gold':
        // 沒有環境貼圖時全金屬會反射成黑色，所以降低金屬度並加一點暖色自發光
        out = new THREE.MeshPhysicalMaterial({ ...base, roughness: .3, metalness: .55, clearcoat: .7, emissive: new THREE.Color(0x6a4a10), emissiveIntensity: .35 });
        break;
      case 'gemP': case 'gemB':
        out = new THREE.MeshPhysicalMaterial({ ...base, roughness: .05, clearcoat: 1, emissiveIntensity: 1.2 });
        break;
      default:
        out = new THREE.MeshStandardMaterial(base);
    }
    out.name = m.name;
    cache.set(key, out);
    return out;
  };
  root.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.material = Array.isArray(o.material) ? o.material.map(m => make(m, o.name)) : make(o.material, o.name);
    if (o.material.transparent) o.renderOrder = 2;
  });
}

/* ---------------- 表情貼圖：4×2 格，每格 512px ---------------- */
// 貼圖以「從正面看」的角度畫：橫向是繞頭的角度（弧度），縱向是由上往下的角度。
const PHI_SPAN = 1.9, TH0 = 1.15, TH_SPAN = 1.15;
function faceAtlas(THREE) {
  const C = 512;
  const c = canvas(C * 4, C * 2, (g) => {
    EXPRESSIONS.forEach((e, i) => { g.save(); g.translate((i % 4) * C, Math.floor(i / 4) * C); drawFace(g, C, e); g.restore(); });
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  t.repeat.set(.25, .5);
  return t;
}
function drawFace(g, C, e) {
  const X = d => C / 2 + d / PHI_SPAN * C;          // 水平角度（弧度，右為正）→ 像素
  const Y = th => (th - TH0) / TH_SPAN * C;         // 由頭頂量起的角度 → 像素
  const sx = C / PHI_SPAN, sy = C / TH_SPAN;        // 每弧度的像素（橫向較擠，畫圓要補償）
  const ell = (cx, cy, rx, ry, rot = 0) => { g.beginPath(); g.ellipse(X(cx), Y(cy), rx * sx, ry * sy, rot, 0, Math.PI * 2); };
  const LINE = '#3b1f1a', IRIS1 = '#5a2a1c', IRIS2 = '#b8743a', BLUSH = 'rgba(255,120,150,';

  const eyeY = 1.52, eyeX = .31;
  // 腮紅
  const blushA = e === 'shy' ? .62 : (e === 'happy' || e === 'star') ? .42 : .28;
  for (const s of [-1, 1]) {
    const gr = g.createRadialGradient(X(s * .43), Y(1.7), 0, X(s * .43), Y(1.7), .13 * sx);
    gr.addColorStop(0, BLUSH + blushA + ')'); gr.addColorStop(1, BLUSH + '0)');
    g.fillStyle = gr; ell(s * .43, 1.7, .15, .07); g.fill();
    if (e === 'shy') { g.strokeStyle = 'rgba(230,80,110,.8)'; g.lineWidth = 3;
      for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(X(s * .43 + k * .045 - .015), Y(1.72)); g.lineTo(X(s * .43 + k * .045 + .015), Y(1.67)); g.stroke(); } }
  }
  // 眉毛
  g.strokeStyle = '#6b3a26'; g.lineCap = 'round'; g.lineWidth = 7;
  for (const s of [-1, 1]) {
    const lift = e === 'wow' ? -.05 : e === 'sad' ? 0 : 0;
    const tilt = e === 'sad' ? -.035 : e === 'shy' ? -.015 : 0;
    g.beginPath();
    g.moveTo(X(s * (eyeX - .09)), Y(1.33 + lift + tilt));
    g.quadraticCurveTo(X(s * eyeX), Y(1.3 + lift), X(s * (eyeX + .1)), Y(1.335 + lift - tilt));
    g.stroke();
  }
  // 眼睛
  for (const s of [-1, 1]) {
    const cx = s * eyeX;
    if (e === 'blink' || e === 'happy' || e === 'shy') {
      // 閉眼（彎彎的線）；開心是 ^ ^
      g.strokeStyle = LINE; g.lineWidth = 9;
      g.beginPath();
      if (e === 'happy' || e === 'shy') { g.moveTo(X(cx - .07), Y(eyeY + .02)); g.quadraticCurveTo(X(cx), Y(eyeY - .07), X(cx + .07), Y(eyeY + .02)); }
      else { g.moveTo(X(cx - .075), Y(eyeY)); g.quadraticCurveTo(X(cx), Y(eyeY + .05), X(cx + .075), Y(eyeY)); }
      g.stroke();
      // 睫毛尾
      g.lineWidth = 5; g.beginPath(); g.moveTo(X(cx + s * .07), Y(eyeY + (e === 'blink' ? 0 : .02))); g.lineTo(X(cx + s * .095), Y(eyeY - .02)); g.stroke();
      continue;
    }
    const ry = e === 'wow' ? .15 : .138, rx = e === 'wow' ? .108 : .1;
    // 眼白
    g.fillStyle = '#fff'; ell(cx, eyeY, rx * 1.1, ry * 1.05); g.fill();
    // 虹膜：上深下亮
    const gr = g.createLinearGradient(0, Y(eyeY - ry), 0, Y(eyeY + ry));
    gr.addColorStop(0, IRIS1); gr.addColorStop(.6, '#7a3e22'); gr.addColorStop(1, IRIS2);
    g.fillStyle = gr; ell(cx, eyeY + .006, rx * .86, ry * .92); g.fill();
    g.fillStyle = '#2a120c'; ell(cx, eyeY + .01, rx * .42, ry * .48); g.fill();
    if (e === 'star') {
      // 星星眼
      g.fillStyle = '#ffe27a';
      g.beginPath();
      for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = (k % 2 ? .022 : .052); g[k ? 'lineTo' : 'moveTo'](X(cx + Math.cos(a) * rr * .8), Y(eyeY + .01 + Math.sin(a) * rr)); }
      g.fill();
    }
    // 兩個反光點
    g.fillStyle = '#fff';
    ell(cx - s * .02 - .012, eyeY - .03, .02, .022); g.fill();
    ell(cx + .018, eyeY + .035, .009, .01); g.fill();
    // 上睫毛（粗）與眼尾上翹、下睫毛（細）
    g.strokeStyle = LINE; g.lineWidth = 10;
    const lid = e === 'sad' ? .02 : 0;
    g.beginPath();
    g.moveTo(X(cx - rx * 1.15), Y(eyeY - ry * .45 + (s < 0 ? lid : 0)));
    g.quadraticCurveTo(X(cx), Y(eyeY - ry * 1.22), X(cx + rx * 1.15), Y(eyeY - ry * .45 + (s > 0 ? lid : 0)));
    g.stroke();
    g.lineWidth = 6; g.beginPath(); g.moveTo(X(cx + s * rx * 1.12), Y(eyeY - ry * .5)); g.lineTo(X(cx + s * rx * 1.45), Y(eyeY - ry * .95)); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.moveTo(X(cx - rx * .8), Y(eyeY + ry * .98)); g.quadraticCurveTo(X(cx), Y(eyeY + ry * 1.12), X(cx + rx * .8), Y(eyeY + ry * .98)); g.stroke();
    if (e === 'sad' && s > 0) { g.fillStyle = 'rgba(140,200,255,.9)'; g.beginPath(); g.ellipse(X(cx + .05), Y(eyeY + .13), 7, 11, 0, 0, 7); g.fill(); }
  }
  // 鼻子
  g.fillStyle = 'rgba(200,120,100,.55)'; ell(0, 1.66, .012, .01); g.fill();
  // 嘴巴
  const my = 1.84;
  g.strokeStyle = '#8a2c3a'; g.lineWidth = 6; g.fillStyle = '#b8344c';
  g.beginPath();
  switch (e) {
    case 'happy': case 'star':
      g.moveTo(X(-.07), Y(my - .01)); g.quadraticCurveTo(X(0), Y(my + .1), X(.07), Y(my - .01)); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#ff8a9c'; ell(0, my + .045, .03, .022); g.fill(); break;            // 舌頭
    case 'talk':
      ell(0, my + .012, .035, .03); g.fill(); g.stroke(); break;
    case 'wow':
      ell(0, my + .015, .028, .038); g.fill(); g.stroke(); break;
    case 'sad':
      g.moveTo(X(-.045), Y(my + .025)); g.quadraticCurveTo(X(0), Y(my - .02), X(.045), Y(my + .025)); g.stroke(); break;
    case 'shy':
      g.moveTo(X(-.04), Y(my)); g.quadraticCurveTo(X(-.02), Y(my + .02), X(0), Y(my)); g.quadraticCurveTo(X(.02), Y(my + .02), X(.04), Y(my)); g.stroke(); break;
    default:                                                                            // idle / blink：淺淺的微笑
      g.moveTo(X(-.05), Y(my)); g.quadraticCurveTo(X(0), Y(my + .045), X(.05), Y(my)); g.stroke();
  }
}

/* ---------------- 組裝 ---------------- */
export function createPrincess(THREE, gltfScene) {
  const root = gltfScene;
  const J = {};
  root.traverse(o => { if (o.name) J[o.name] = o; });
  upgradeMaterials(THREE, root);

  // 表情殼：貼合頭部正面、比頭大 1%
  const atlas = faceAtlas(THREE);
  const headSkin = J.head_skin;
  headSkin.geometry.computeBoundingBox();
  const bb = headSkin.geometry.boundingBox, size = new THREE.Vector3(), ctr = new THREE.Vector3();
  bb.getSize(size); bb.getCenter(ctr);
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(1, 64, 40, Math.PI / 2 - PHI_SPAN / 2, PHI_SPAN, TH0, TH_SPAN),
    new THREE.MeshStandardMaterial({ map: atlas, transparent: true, depthWrite: false, roughness: .6, polygonOffset: true, polygonOffsetFactor: -2 }));
  shell.scale.set(size.x / 2 * 1.012, size.y / 2 * 1.012, size.z / 2 * 1.012);
  shell.position.copy(ctr);
  shell.renderOrder = 1;
  headSkin.add(shell);

  // ---- 澆水器：壺身、上方的拱形把手、從前下方伸出的壺嘴與蓮蓬頭。
  // 原點就在把手頂端（手指捏住的位置），+Z 是壺嘴方向。
  const can = new THREE.Group();
  const tin = new THREE.MeshPhysicalMaterial({ color: 0x7fb3d6, metalness: .45, roughness: .32, clearcoat: .6, emissive: 0x10283a, emissiveIntensity: .4 });
  const tinDark = new THREE.MeshPhysicalMaterial({ color: 0x4f86ad, metalness: .45, roughness: .35, clearcoat: .5 });
  const canBody = new THREE.Mesh(new THREE.CylinderGeometry(.024, .028, .042, 28), tin);
  canBody.position.set(0, -.048, .006); can.add(canBody);
  const lid = new THREE.Mesh(new THREE.TorusGeometry(.024, .003, 8, 28), tinDark); lid.rotation.x = Math.PI / 2; lid.position.set(0, -.027, .006); can.add(lid);
  const grip = new THREE.Mesh(new THREE.TorusGeometry(.016, .0034, 10, 24, Math.PI), tinDark);   // 拱形把手（YZ 平面）
  grip.rotation.y = Math.PI / 2; grip.position.set(0, -.027, .004); can.add(grip);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(.0035, .0065, .06, 14), tin);          // 壺嘴：前下方往前上斜
  spout.position.set(0, -.052, .046); spout.rotation.x = 1.05; can.add(spout);
  const rose = new THREE.Mesh(new THREE.CylinderGeometry(.009, .005, .008, 16), tinDark);          // 灑水蓮蓬頭
  rose.position.set(0, -.038, .073); rose.rotation.x = 1.05; can.add(rose);
  can.visible = false;
  can.traverse(o => { if (o.isMesh) o.castShadow = true; });
  J.hand_R.add(can);
  // 捏住把手的點：每格畫面取大拇指、食指、中指末節的中點（右手局部座標）
  const PINCH = new THREE.Vector3(), _pv = new THREE.Vector3(), _hm = new THREE.Matrix4();
  function pinchPoint() {
    J.hand_R.updateWorldMatrix(true, true);
    _hm.copy(J.hand_R.matrixWorld).invert();
    PINCH.set(0, 0, 0);
    for (const n of ['finger_R_0_tip', 'finger_R_1_tip', 'thumb_R_tip']) PINCH.add(J[n].getWorldPosition(_pv).applyMatrix4(_hm));
    return PINCH.multiplyScalar(1 / 3);
  }

  // ---- 手指：每根兩節，依手勢彎曲（以 Blender 匯出的姿勢為基準再加彎曲量）
  // 彎向掌心的軸是關節局部的 Z（左手取負值）
  const HAND = {
    relax: { f: [[.18, .22], [.2, .24], [.24, .28], [.28, .32]], t: [0, 0, 0] },
    open:  { f: [[-.12, 0], [-.12, 0], [-.12, 0], [-.12, 0]], t: [-.2, -.1, 0] },
    fist:  { f: [[1.5, 1.55], [1.5, 1.55], [1.5, 1.55], [1.5, 1.55]], t: [.95, .35, .7] },
    thumb: { f: [[1.5, 1.55], [1.5, 1.55], [1.5, 1.55], [1.5, 1.55]], t: [-.25, -.35, -.1] },
    pinch: { f: [[1.2, 1.1], [1.25, 1.1], [1.55, 1.6], [1.55, 1.6]], t: [.8, .55, .4] },
  };
  const fingerJ = { L: [], R: [] }, base = new Map();
  for (const side of ['L', 'R']) {
    for (let k = 0; k < 4; k++) fingerJ[side].push([J[`finger_${side}_${k}`], J[`finger_${side}_${k}_tip`]]);
    fingerJ[side].push([J[`thumb_${side}`], J[`thumb_${side}_tip`]]);
    for (const pair of fingerJ[side]) for (const o of pair) if (o) base.set(o, o.quaternion.clone());
  }
  const handCur = { L: JSON.parse(JSON.stringify(HAND.relax)), R: JSON.parse(JSON.stringify(HAND.relax)) };
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), AX = new THREE.Vector3(1, 0, 0), AZ = new THREE.Vector3(0, 0, 1);
  function applyHand(side, target, k) {
    const s = side === 'L' ? 1 : -1, cur = handCur[side];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) cur.f[i][j] += (target.f[i][j] - cur.f[i][j]) * k;
    for (let j = 0; j < 3; j++) cur.t[j] += (target.t[j] - cur.t[j]) * k;
    fingerJ[side].forEach((pair, i) => {
      const [a, b] = pair;
      if (i < 4) {
        a.quaternion.copy(base.get(a)).multiply(qa.setFromAxisAngle(AZ, -s * cur.f[i][0]));
        b.quaternion.copy(base.get(b)).multiply(qa.setFromAxisAngle(AZ, -s * cur.f[i][1]));
      } else {   // 大拇指：t[0] 往掌心收、t[1] 往前後擺、t[2] 指尖彎
        a.quaternion.copy(base.get(a)).multiply(qa.setFromAxisAngle(AZ, -s * cur.t[0])).multiply(qb.setFromAxisAngle(AX, cur.t[1]));
        b.quaternion.copy(base.get(b)).multiply(qa.setFromAxisAngle(AZ, -s * cur.t[2]));
      }
    });
  }
  // 澆水器的世界方向：壺嘴朝角色正前方，澆水時往前傾
  const _qHand = new THREE.Quaternion(), _qWant = new THREE.Quaternion(), _qTilt = new THREE.Quaternion();

  const st = { expr: 'idle', exprT: 0, blinkT: 2, blinking: 0, randT: 5, poseW: {} };
  function express(name, sec = 1.8) { if (EXPRESSIONS.includes(name)) { st.expr = name; st.exprT = sec; } }
  function showFace(name) { const i = EXPRESSIONS.indexOf(name); atlas.offset.set((i % 4) * .25, i < 4 ? .5 : 0); }
  const ease = (cur, tgt, k) => cur + (tgt - cur) * k;

  function update(dt, t, state = {}) {
    const p = state.pose || '';
    const k = 1 - Math.exp(-dt * 7);
    // ---- 表情：互動 > 隨機表情 > 平常；加上隨機眨眼
    st.exprT -= dt;
    if (st.exprT <= 0 && st.expr !== 'idle') st.expr = 'idle';
    if (!p && st.exprT <= 0) {
      st.randT -= dt;
      if (st.randT < 0) { st.randT = 5 + Math.random() * 7; express(['happy', 'talk', 'shy', 'wow', 'star', 'happy'][Math.floor(Math.random() * 6)], 1.4 + Math.random() * 1.4); }
    }
    st.blinkT -= dt;
    if (st.blinkT < 0) { st.blinking = .13; st.blinkT = 2 + Math.random() * 3; }
    st.blinking -= dt;
    const canBlink = ['idle', 'talk', 'wow', 'sad', 'star'].includes(st.expr);
    let face = st.expr;
    if (st.expr === 'talk' && Math.sin(t * 16) > .2) face = 'idle';               // 說話時嘴巴一開一合
    showFace(st.blinking > 0 && canBlink ? 'blink' : face);

    // ---- 坐下：身體往下沉、蓬裙在地上攤開（裙子壓扁變寬），雙手放在膝上
    const sitK = 1 - Math.exp(-dt * 3);
    st.sit = (st.sit || 0) + ((p === 'sit' ? 1 : 0) - (st.sit || 0)) * sitK;
    if (st.hipsY === undefined) st.hipsY = J.hips.position.y;
    J.hips.position.y = st.hipsY - .14 * st.sit;
    J.skirt.scale.set(1 + .14 * st.sit, 1 - .45 * st.sit, 1 + .14 * st.sit);
    // ---- 身體：呼吸、微微搖擺
    J.chest.scale.y = 1 + Math.sin(t * 2.1) * .012;
    J.skirt.rotation.z = Math.sin(t * 1.3) * .025 * (1 - st.sit);
    J.skirt.rotation.x = Math.sin(t * 1.1 + 1) * .015 * (1 - st.sit);
    J.chest.rotation.x = ease(J.chest.rotation.x, p === 'pet' ? .3 : p === 'water' ? .14 : 0, k);
    J.chest.rotation.y = ease(J.chest.rotation.y, p === 'water' ? -.25 : 0, k);
    // ---- 頭
    const hx = p === 'stars' ? -.5 : state.birdOnHead ? -.35 : p === 'pet' ? .22 : p === 'reach' ? -.3 : 0;
    J.head.rotation.x = ease(J.head.rotation.x, hx, k);
    J.head.rotation.z = Math.sin(t * .7) * .07 + (p === 'wave' ? .12 : 0) + (p === 'sit' ? .16 : 0);
    // ---- 手臂（L 在角色左手邊 = +x）
    // 平常：手臂微微外張、手肘往前彎，手停在蓬裙外側（直直垂下會被裙子吃掉手指）
    const L = { uz: .34, ux: -.1, fz: .06, fx: -.6 }, R = { uz: -.34, ux: -.1, fz: -.06, fx: -.6 };
    if (p === 'wave') { L.uz = 2.45 + Math.sin(t * 11) * .3; L.ux = -.2; L.fz = .45 + Math.sin(t * 11 + 1) * .35; L.fx = 0; }
    if (p === 'reach') { L.uz = 2.75; L.ux = -.35; L.fz = .1; R.uz = -.6; R.ux = -.4; }
    if (p === 'pet') { R.ux = -1.15 + Math.sin(t * 8) * .1; R.uz = -.25; R.fx = -.5; }
    if (p === 'water') { R.ux = -1.05 + Math.sin(t * 2.4) * .08; R.uz = -.1; R.fx = -.35; }
    if (p === 'stars') { L.uz = .35; R.uz = -.35; L.ux = R.ux = .25; }          // 手背在身後抬頭看
    if (p === 'sit') { L.ux = R.ux = -.55; L.uz = .2; R.uz = -.2; L.fx = R.fx = -.75; }   // 坐著：雙手放在膝上
    if (p === 'thumb') { R.ux = -.4; R.uz = -.22; R.fx = -1.35; R.fz = .05; }   // 右手比讚：前臂水平朝前、拳頭的大拇指朝上
    if (p === 'cheer') { L.ux = R.ux = -.9; L.uz = .5; R.uz = -.5; L.fx = R.fx = -1.6 + Math.sin(t * 9) * .15; }  // 雙手握拳加油
    for (const [side, q] of [['L', L], ['R', R]]) {
      const ua = J['upperArm_' + side], fa = J['forearm_' + side];
      ua.rotation.z = ease(ua.rotation.z, q.uz, k); ua.rotation.x = ease(ua.rotation.x, q.ux, k);
      fa.rotation.z = ease(fa.rotation.z, q.fz, k); fa.rotation.x = ease(fa.rotation.x, q.fx, k);
    }
    // 手腕：揮手、伸手時轉成掌心朝前（沿手臂方向轉 90°）；比讚時轉成大拇指朝上
    J.hand_L.rotation.y = ease(J.hand_L.rotation.y, (p === 'wave' || p === 'reach') ? Math.PI / 2 : 0, k);
    J.hand_R.rotation.y = ease(J.hand_R.rotation.y, p === 'pet' ? -Math.PI / 2 : 0, k);
    // 手勢
    const hk = 1 - Math.exp(-dt * 10);
    const gL = { wave: 'open', reach: 'open', cheer: 'fist' }[p] || 'relax';
    const gR = { pet: 'open', reach: 'open', water: 'pinch', thumb: 'thumb', cheer: 'fist' }[p] || 'relax';
    applyHand('L', HAND[gL], hk); applyHand('R', HAND[gR], hk);
    // 澆水器：把手頂端放在捏住的點，壺嘴朝角色正前方，澆水時一前一後地傾斜
    can.visible = p === 'water';
    if (can.visible) {
      can.position.copy(pinchPoint());
      J.hand_R.getWorldQuaternion(_qHand);
      root.getWorldQuaternion(_qWant);
      _qWant.multiply(_qTilt.setFromAxisAngle(AX, .25 + (.5 + .5 * Math.sin(t * 2.4)) * .35));   // 往前傾倒水
      can.quaternion.copy(_qHand.invert().multiply(_qWant));
    }
    // ---- 頭髮與緞帶：延遲的大幅度擺動
    J.hairBack.rotation.x = .04 + Math.sin(t * 1.6) * .05 + (p === 'stars' ? .3 : 0);
    J.hairBack.rotation.z = Math.sin(t * 1.2 + .5) * .05;
    for (const side of ['L', 'R']) for (let i = 1; i <= 4; i++) {
      const r = J[`ribbon_${side}_${i}`];
      if (!r) continue;
      // 第一節沿裙子斜度（約 33°）往後下垂；擺動只往外加，緞帶不會插進裙子
      const base = i === 1 ? .58 : .03, sway = .5 + .5 * Math.sin(t * 2.3 - i * .75 + (side === 'L' ? 0 : .6));
      r.rotation.x = base + sway * (.06 + i * .04);
      r.rotation.z = (i === 1 ? .3 : 0) * (side === 'L' ? 1 : -1) + Math.sin(t * 1.7 - i * .6) * .06 * (side === 'L' ? 1 : -1);
    }
  }
  return { root, J, express, update, expressions: EXPRESSIONS };
}
