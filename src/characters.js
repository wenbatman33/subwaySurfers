import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Pixar 風程序化角色（原創設計）：主角、警衛、狗
// 規格：.img2threejs/spec.json（img2threejs 流程；參考圖僅取風格與比例 ≈ 2.8 頭身）
// 材質：布料 MeshPhysical sheen、皮膚 sheen 近似 SSS、塑膠 clearcoat；無描邊

const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const col = (c) => new THREE.Color(c);
const lighten = (c, t = 0.35) => col(c).lerp(col('#ffffff'), t);

// ───────── 材質 ─────────
const MAT = {
  skin: (c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.62, sheen: 0.25, sheenRoughness: 0.6, sheenColor: col('#ffb89c') }),
  cloth: (c, sheen = 1) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.9, sheen: sheen * 0.45, sheenRoughness: 0.7, sheenColor: lighten(c, 0.3) }),
  plastic: (c, r = 0.35) => new THREE.MeshPhysicalMaterial({ color: c, roughness: Math.max(r, 0.45), clearcoat: 0.1, clearcoatRoughness: 0.5 }),
  rubber: (c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.7 }),
  hair: (c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.8, sheen: 0.25, sheenRoughness: 0.35, sheenColor: lighten(c, 0.3) }),
  glossy: (c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05 }),
  basic: (c, o = {}) => new THREE.MeshBasicMaterial({ color: c, ...o }),
};

// 條紋襪貼圖（白底紫條）
function stripeTex(base, stripe, n = 4) {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 16, 128);
  g.fillStyle = stripe;
  for (let i = 0; i < n; i++) g.fillRect(0, 60 + i * 16, 16, 8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 帽徽章貼圖（紫底白格）
function badgeTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#7b6ad6'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#ffffff';
  g.beginPath(); g.roundRect(14, 14, 36, 36, 6); g.fill();
  g.fillStyle = '#7b6ad6';
  g.fillRect(30, 14, 4, 36); g.fillRect(14, 30, 36, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 部件：建立並掛到 parent
function part(geo, mat, parent, x = 0, y = 0, z = 0, o = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (o.rot) m.rotation.set(...o.rot);
  if (o.scale) m.scale.set(...o.scale);
  m.castShadow = o.cast !== false;
  m.receiveShadow = false;
  if (o.name) m.name = o.name;
  parent.add(m);
  return m;
}

// 球面座標（臉部五官）：法線朝外
function onHead(center, r, lat, lon) {
  const n = V(Math.sin(lon) * Math.cos(lat), Math.sin(lat), -Math.cos(lon) * Math.cos(lat));
  return { p: center.clone().addScaledVector(n, r), q: new THREE.Quaternion().setFromUnitVectors(V(0, 0, -1), n), n };
}
function face(geo, mat, head, center, r, lat, lon, o = {}) {
  const { p, q } = onHead(center, r, lat, lon);
  const m = part(geo, mat, head, p.x, p.y, p.z, { cast: false, ...o });
  m.quaternion.copy(q);
  if (o.roll) m.rotateZ(o.roll);
  return m;
}

// Pixar 大眼：眼白 + 虹膜 + 瞳孔 + 雙高光（+ 選用上眼瞼）
function eye(head, hc, R, lat, lon, { size = 0.085, iris = '#3a2418', lid = null } = {}) {
  const g = new THREE.Group();
  const { p, q } = onHead(hc, R - size * 0.5, lat, lon);
  g.position.copy(p);
  g.quaternion.copy(q);
  head.add(g);
  part(new THREE.SphereGeometry(size, 24, 18), MAT.glossy('#fbfbfb'), g, 0, 0, 0, { cast: false });
  part(new THREE.SphereGeometry(size * 0.74, 22, 16), MAT.glossy(iris), g, 0, -size * 0.04, -size * 0.8, { cast: false, scale: [1, 1.05, 0.35] });
  part(new THREE.SphereGeometry(size * 0.42, 18, 12), MAT.glossy('#0b0706'), g, 0, -size * 0.04, -size * 0.94, { cast: false, scale: [1, 1.05, 0.35] });
  const hi = MAT.basic('#ffffff');
  part(new THREE.SphereGeometry(size * 0.19, 10, 8), hi, g, -size * 0.26, size * 0.24, -size * 1.06, { cast: false, scale: [1, 1, 0.4] });
  part(new THREE.SphereGeometry(size * 0.09, 8, 6), hi, g, size * 0.22, -size * 0.28, -size * 1.05, { cast: false, scale: [1, 1, 0.4] });
  if (lid) {
    const l = part(new THREE.SphereGeometry(size * 1.1, 22, 12, 0, Math.PI * 2, 0, 1.0), lid, g, 0, 0, 0, { cast: false });
    l.rotation.x = -0.5;
  }
  return g;
}

// 大手：掌 + 四指 + 拇指
function hand(parent, skin, y, side, s = 1) {
  const h = new THREE.Group();
  h.position.y = y;
  parent.add(h);
  part(new RoundedBoxGeometry(0.15 * s, 0.14 * s, 0.075 * s, 3, 0.03 * s), skin, h, 0, 0, 0);
  const fg = new THREE.CapsuleGeometry(0.023 * s, 0.06 * s, 4, 8);
  for (let i = 0; i < 4; i++) {
    const f = part(fg, skin, h, (-0.05 + i * 0.033) * s, -0.1 * s, -0.012 * s);
    f.rotation.x = 0.35;
  }
  const th = part(new THREE.CapsuleGeometry(0.025 * s, 0.05 * s, 4, 8), skin, h, -side * 0.085 * s, -0.02 * s, -0.03 * s);
  th.rotation.set(0.4, 0, side * 0.7);
  return h;
}

// ───────── 人形角色（面向 -Z，root 在腳底）─────────
export class Humanoid {
  constructor(opt = {}) {
    this.guard = !!opt.guard;
    this.root = new THREE.Group();
    this.rig = new THREE.Group();
    this.rig.position.y = this.guard ? 1.0 : 0.92;
    this.baseRigY = this.rig.position.y;
    this.root.add(this.rig);
    this.hips = new THREE.Group();
    this.rig.add(this.hips);
    this.torso = new THREE.Group();
    this.hips.add(this.torso);
    if (this.guard) this._buildGuard(); else this._buildKid();
    this.root.scale.setScalar(opt.scale ?? 1);
  }

  // ── 主角：紅帽、紫 T 恤、灰七分褲、條紋襪、紫球鞋 ──
  _buildKid() {
    const skin = MAT.skin('#f3c6a6');
    const shirt = MAT.cloth('#6a4cc6');
    const shirtDk = MAT.cloth('#5a3fb0');
    const shorts = MAT.cloth('#727276');
    const shortsDk = MAT.cloth('#606064');
    const hairM = MAT.hair('#3a2a22');
    const cap = MAT.cloth('#e3502c', 0.8);
    const sock = new THREE.MeshPhysicalMaterial({ map: stripeTex('#d9d9e0', '#5a4cb8'), roughness: 0.92, sheen: 0.3, sheenColor: col('#d0d0d8') });
    const shoe = MAT.cloth('#6b52c8', 0.5);
    const sole = MAT.rubber('#cfcac4');
    this.shoeMat = sole;

    // 骨盆 / 短褲腰
    part(new RoundedBoxGeometry(0.5, 0.26, 0.34, 4, 0.12), shorts, this.hips, 0, 0, 0, { name: 'hips' });
    // T 恤：車床曲面（下擺略寬的方正短 T）
    this.torso.position.y = 0.04;
    const prof = [[0.001, 0], [0.29, 0], [0.3, 0.05], [0.285, 0.18], [0.3, 0.32], [0.29, 0.4], [0.2, 0.46], [0.001, 0.47]];
    part(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 32), shirt, this.torso, 0, 0, 0, { scale: [1, 1, 0.74], name: 'torso' });
    part(new THREE.TorusGeometry(0.29, 0.03, 10, 36), shirtDk, this.torso, 0, 0.02, 0, { rot: [Math.PI / 2, 0, 0], scale: [1, 0.74, 1], name: 'shirt-hem' });
    part(new RoundedBoxGeometry(0.15, 0.13, 0.025, 2, 0.01), shirtDk, this.torso, 0.1, 0.24, -0.215, { cast: false, name: 'pocket' });
    part(new THREE.TorusGeometry(0.105, 0.028, 10, 24), shirtDk, this.torso, 0, 0.455, 0, { rot: [Math.PI / 2 - 0.12, 0, 0], name: 'collar' });

    // 頭
    this.head = new THREE.Group();
    this.head.position.y = 0.44;
    this.head.scale.setScalar(1.14);
    this.torso.add(this.head);
    part(new THREE.CylinderGeometry(0.08, 0.09, 0.14, 14), skin, this.head, 0, 0.05, 0, { name: 'neck' });
    const R = 0.35;
    const hc = V(0, 0.36, 0);
    part(new THREE.SphereGeometry(R, 40, 30), skin, this.head, hc.x, hc.y, hc.z, { scale: [1, 1, 0.96], name: 'head' });
    // 肉肉臉頰 + 下巴（Pixar 圓臉）
    part(new THREE.SphereGeometry(0.27, 30, 22), skin, this.head, 0, hc.y - 0.12, -0.07, { scale: [1.12, 0.9, 1] });
    for (const s of [-1, 1]) {
      const e = part(new THREE.SphereGeometry(0.075, 16, 12), skin, this.head, s * (R - 0.02), hc.y - 0.07, 0.03, { scale: [0.55, 1, 0.8], name: 'ear' });
      part(new THREE.SphereGeometry(0.04, 10, 8), MAT.skin('#e7a98a'), e, s * 0.02, 0, -0.01, { cast: false });
    }
    for (const s of [-1, 1]) eye(this.head, hc, R, -0.2, s * 0.33, { size: 0.082, iris: '#3b2519' });
    for (const s of [-1, 1]) face(new THREE.CapsuleGeometry(0.022, 0.1, 4, 10), hairM, this.head, hc, R + 0.005, 0.06, s * 0.33, { roll: Math.PI / 2 + s * 0.12, name: 'brow' });
    face(new THREE.SphereGeometry(0.045, 16, 12), skin, this.head, hc, R - 0.015, -0.42, 0.02, { scale: [1, 0.85, 1.25], name: 'nose' });
    const lowC = hc.clone().add(V(0, -0.12, -0.07));
    face(new THREE.TorusGeometry(0.045, 0.009, 6, 16, Math.PI * 0.8), MAT.skin('#9a4a3e'), this.head, lowC, 0.285, -0.12, 0.05, { roll: Math.PI * 1.1, name: 'mouth' });
    const blush = MAT.basic('#f38d86', { transparent: true, opacity: 0.35, depthWrite: false });
    for (const s of [-1, 1]) face(new THREE.CircleGeometry(0.055, 20), blush, this.head, lowC, 0.305, -0.05, s * 0.5, { scale: [1.2, 0.8, 1], name: 'cheek' });

    // 頭髮：底層髮殼（帽下後腦與兩側）+ 側撥瀏海髮塊
    part(new THREE.SphereGeometry(R * 1.035, 32, 16, Math.PI * 0.5 - 2.1, 4.2, Math.PI * 0.3, Math.PI * 0.32), hairM, this.head, hc.x, hc.y + 0.01, hc.z, { name: 'hair' });
    const lock = new THREE.SphereGeometry(0.1, 16, 12);
    const fringe = [
      // x, y, z, rotX, rotY, rotZ, sx, sy, sz（瀏海往右側撥）
      [-0.19, 0.49, -0.24, 0.5, -0.35, 0.45, 1.5, 0.55, 1.1],
      [-0.03, 0.5, -0.28, 0.45, -0.05, 0.35, 1.6, 0.55, 1.05],
      [0.14, 0.49, -0.26, 0.45, 0.3, 0.3, 1.5, 0.55, 1.05],
      [0.27, 0.45, -0.17, 0.5, 0.75, 0.2, 1.3, 0.6, 1.0],
      [0.33, 0.37, -0.02, 0.4, 1.3, 0.1, 1.1, 0.7, 1.0],
      [-0.32, 0.38, -0.06, 0.4, -1.2, -0.1, 1.1, 0.7, 1.0],
      [0.31, 0.3, 0.14, 0.3, 1.6, 0.0, 1.0, 0.75, 1.0],
      [-0.31, 0.3, 0.14, 0.3, -1.6, 0.0, 1.0, 0.75, 1.0],
    ];
    for (const [x, y, z, rx, ry, rz, sx, sy, sz] of fringe) part(lock, hairM, this.head, x, y, z, { rot: [rx, ry, rz], scale: [sx, sy, sz], name: 'hair' });

    // 紅帽（半球 + 捲邊 + 徽章），稍向後戴露出額頭
    const capG = new THREE.Group();
    capG.position.copy(hc).add(V(0, 0.02, 0.03));
    capG.rotation.x = 0.36;
    this.head.add(capG);
    part(new THREE.SphereGeometry(R * 1.07, 36, 20, 0, Math.PI * 2, 0, Math.PI * 0.52), cap, capG, 0, 0, 0, { name: 'cap' });
    part(new THREE.TorusGeometry(R * 1.05, 0.035, 12, 40), MAT.cloth('#cf4424', 0.8), capG, 0, -0.02, 0, { rot: [Math.PI / 2, 0, 0] });
    const bm = MAT.plastic('#7b6ad6');
    const badge = part(new RoundedBoxGeometry(0.12, 0.12, 0.03, 3, 0.02), [bm, bm, bm, bm, bm, new THREE.MeshPhysicalMaterial({ map: badgeTex(), roughness: 0.3, clearcoat: 0.4 })], capG, 0, 0, 0, { name: 'cap-badge' });
    const bp = onHead(V(0, 0, 0), R * 1.08, 0.55, -0.55);
    badge.position.copy(bp.p);
    badge.quaternion.setFromUnitVectors(V(0, 0, 1), bp.n.clone().negate());

    // 手臂：捲袖短袖 + 皮膚 + 大手
    this.arms = [-1, 1].map((s) => {
      const sh = new THREE.Group();
      sh.position.set(s * 0.3, 0.37, 0);
      this.torso.add(sh);
      part(new THREE.SphereGeometry(0.11, 16, 12), shirt, sh, 0, 0, 0);
      part(new THREE.CylinderGeometry(0.105, 0.12, 0.16, 18), shirt, sh, 0, -0.08, 0, { name: 'sleeve' });
      part(new THREE.TorusGeometry(0.112, 0.028, 8, 22), shirtDk, sh, 0, -0.16, 0, { rot: [Math.PI / 2, 0, 0] });
      part(new THREE.CapsuleGeometry(0.068, 0.14, 6, 14), skin, sh, 0, -0.2, 0, { name: 'arm-upper' });
      const el = new THREE.Group();
      el.position.y = -0.3;
      sh.add(el);
      part(new THREE.CapsuleGeometry(0.064, 0.16, 6, 14), skin, el, 0, -0.1, 0, { name: 'arm-lower' });
      hand(el, skin, -0.25, s, 1.05);
      return { sh, el };
    });

    // 腿：七分寬褲管 + 小腿 + 條紋襪 + 厚底大球鞋
    this.legs = [-1, 1].map((s) => {
      const hip = new THREE.Group();
      hip.position.set(s * 0.13, -0.04, 0);
      this.hips.add(hip);
      part(new THREE.CylinderGeometry(0.135, 0.16, 0.36, 20), shorts, hip, 0, -0.17, 0, { name: 'short' });
      part(new THREE.TorusGeometry(0.155, 0.025, 8, 24), shortsDk, hip, 0, -0.35, 0, { rot: [Math.PI / 2, 0, 0] });
      const kn = new THREE.Group();
      kn.position.y = -0.4;
      hip.add(kn);
      part(new THREE.CapsuleGeometry(0.07, 0.12, 6, 14), skin, kn, 0, -0.05, 0, { name: 'shin' });
      part(new THREE.CylinderGeometry(0.078, 0.082, 0.24, 18), sock, kn, 0, -0.22, 0, { name: 'sock' });
      const shoeG = new THREE.Group();
      shoeG.position.set(0, -0.4, -0.05);
      kn.add(shoeG);
      part(new RoundedBoxGeometry(0.27, 0.085, 0.48, 4, 0.04), sole, shoeG, 0, -0.07, -0.01, { name: 'sole' });
      part(new RoundedBoxGeometry(0.25, 0.17, 0.42, 4, 0.08), shoe, shoeG, 0, 0.03, 0.01, { name: 'shoe' });
      part(new THREE.SphereGeometry(0.12, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), sole, shoeG, 0, -0.03, -0.16, { scale: [1.02, 0.6, 0.85], rot: [-0.25, 0, 0], cast: false });
      part(new THREE.BoxGeometry(0.02, 0.05, 0.22), sole, shoeG, s * 0.126, 0.02, 0.04, { rot: [0.35, 0, 0], cast: false });
      for (let i = 0; i < 3; i++) part(new RoundedBoxGeometry(0.13, 0.018, 0.028, 2, 0.008), sole, shoeG, 0, 0.12 - i * 0.012, -0.07 + i * 0.055, { cast: false });
      part(new RoundedBoxGeometry(0.11, 0.1, 0.04, 2, 0.02), shoe, shoeG, 0, 0.15, 0.06, { rot: [-0.3, 0, 0], cast: false });
      return { hip, kn };
    });
  }

  // ── 警衛：啤酒肚、制服、警帽、大鬍子 ──
  _buildGuard() {
    const skin = MAT.skin('#eab390');
    const navy = MAT.cloth('#26386e');
    const navyDk = MAT.cloth('#1a2750');
    const pants = MAT.cloth('#1f2a4a');
    const gold = new THREE.MeshPhysicalMaterial({ color: '#ffc93a', metalness: 0.9, roughness: 0.25 });
    const black = MAT.plastic('#1a1a1e', 0.4);
    const stache = MAT.hair('#5b4a3e');
    this.shoeMat = black;

    part(new RoundedBoxGeometry(0.62, 0.3, 0.46, 4, 0.14), pants, this.hips, 0, 0, 0);
    this.torso.position.y = 0.04;
    const prof = [[0.001, 0], [0.36, 0], [0.42, 0.14], [0.43, 0.3], [0.4, 0.44], [0.3, 0.54], [0.14, 0.58], [0.001, 0.59]];
    part(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 32), navy, this.torso, 0, 0, 0, { scale: [1, 1, 0.82] });
    part(new THREE.SphereGeometry(0.36, 28, 20), navy, this.torso, 0, 0.22, -0.1, { scale: [1, 0.85, 0.9] });
    part(new THREE.CylinderGeometry(0.4, 0.4, 0.08, 32), black, this.torso, 0, 0.04, 0, { scale: [1, 1, 0.9] });
    part(new RoundedBoxGeometry(0.12, 0.08, 0.04, 2, 0.015), gold, this.torso, 0, 0.04, -0.37);
    for (const y of [0.16, 0.28, 0.4]) part(new THREE.SphereGeometry(0.022, 10, 8), gold, this.torso, 0, y, y < 0.3 ? -0.43 : -0.39, { cast: false });
    const star = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2, rr = i % 2 ? 0.035 : 0.075;
      i ? star.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : star.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    part(new THREE.ExtrudeGeometry(star, { depth: 0.015, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2 }), gold, this.torso, 0.18, 0.44, -0.35, { rot: [0, Math.PI + 0.4, 0], cast: false });
    for (const s of [-1, 1]) part(new RoundedBoxGeometry(0.2, 0.05, 0.16, 2, 0.02), navyDk, this.torso, s * 0.3, 0.53, 0, { rot: [0, 0, -s * 0.28] });
    part(new THREE.TorusGeometry(0.13, 0.035, 10, 24), navyDk, this.torso, 0, 0.57, 0, { rot: [Math.PI / 2 - 0.15, 0, 0] });

    this.head = new THREE.Group();
    this.head.position.y = 0.56;
    this.torso.add(this.head);
    part(new THREE.CylinderGeometry(0.11, 0.12, 0.12, 14), skin, this.head, 0, 0.04, 0);
    const R = 0.33;
    const hc = V(0, 0.33, 0);
    part(new THREE.SphereGeometry(R, 36, 28), skin, this.head, hc.x, hc.y, hc.z, { scale: [1.02, 0.98, 0.96] });
    part(new THREE.SphereGeometry(0.28, 28, 20), skin, this.head, 0, hc.y - 0.13, -0.05, { scale: [1.15, 0.85, 1] });
    for (const s of [-1, 1]) part(new THREE.SphereGeometry(0.075, 14, 10), skin, this.head, s * (R - 0.01), hc.y - 0.05, 0.03, { scale: [0.55, 1, 0.8] });
    const lid = MAT.skin('#e3a883');
    for (const s of [-1, 1]) eye(this.head, hc, R, -0.12, s * 0.3, { size: 0.058, iris: '#4a3322', lid });
    for (const s of [-1, 1]) face(new THREE.CapsuleGeometry(0.026, 0.1, 4, 10), stache, this.head, hc, R + 0.01, 0.1, s * 0.3, { roll: Math.PI / 2 - s * 0.35 });
    face(new THREE.SphereGeometry(0.075, 18, 14), MAT.skin('#e8a585'), this.head, hc, R - 0.01, -0.34, 0, { scale: [1, 0.9, 1.2] });
    for (const s of [-1, 1]) face(new THREE.CapsuleGeometry(0.045, 0.13, 6, 12), stache, this.head, hc, R - 0.005, -0.5, s * 0.12, { roll: Math.PI / 2 + s * 0.3, scale: [1, 1, 0.8] });
    const blush = MAT.basic('#ef8a7f', { transparent: true, opacity: 0.3, depthWrite: false });
    for (const s of [-1, 1]) face(new THREE.CircleGeometry(0.06, 20), blush, this.head, hc.clone().add(V(0, -0.13, -0.05)), 0.3, 0.0, s * 0.55);
    for (const s of [-1, 1]) part(new THREE.SphereGeometry(0.08, 12, 10), MAT.hair('#8a8a8a'), this.head, s * (R - 0.04), hc.y + 0.02, 0.08, { scale: [0.5, 1, 1.1] });
    const capG = new THREE.Group();
    capG.position.set(0, hc.y + 0.2, 0.01);
    this.head.add(capG);
    part(new THREE.CylinderGeometry(R * 1.02, R * 0.98, 0.16, 32), navy, capG, 0, 0, 0);
    part(new THREE.CylinderGeometry(R * 1.2, R * 1.08, 0.08, 32), navy, capG, 0, 0.11, -0.02, { rot: [-0.08, 0, 0] });
    part(new THREE.CylinderGeometry(R * 1.035, R * 1.035, 0.045, 32), black, capG, 0, -0.06, 0);
    const visor = part(new THREE.CylinderGeometry(0.24, 0.24, 0.025, 24, 1, false, 0, Math.PI), MAT.glossy('#111118'), capG, 0, -0.08, -R * 0.78);
    visor.rotation.set(0.2, Math.PI / 2, 0);
    part(new RoundedBoxGeometry(0.1, 0.1, 0.02, 2, 0.01), gold, capG, 0, 0.02, -R - 0.005);

    this.arms = [-1, 1].map((s) => {
      const sh = new THREE.Group();
      sh.position.set(s * 0.42, 0.46, 0);
      this.torso.add(sh);
      part(new THREE.SphereGeometry(0.14, 16, 12), navy, sh, 0, 0, 0);
      part(new THREE.CapsuleGeometry(0.11, 0.18, 6, 14), navy, sh, 0, -0.17, 0);
      const el = new THREE.Group();
      el.position.y = -0.34;
      sh.add(el);
      part(new THREE.CapsuleGeometry(0.1, 0.16, 6, 14), navy, el, 0, -0.1, 0);
      part(new THREE.CylinderGeometry(0.105, 0.105, 0.05, 16), navyDk, el, 0, -0.21, 0);
      hand(el, skin, -0.3, s, 1.25);
      return { sh, el };
    });

    this.legs = [-1, 1].map((s) => {
      const hip = new THREE.Group();
      hip.position.set(s * 0.17, -0.05, 0);
      this.hips.add(hip);
      part(new THREE.CapsuleGeometry(0.15, 0.2, 6, 14), pants, hip, 0, -0.2, 0);
      const kn = new THREE.Group();
      kn.position.y = -0.44;
      hip.add(kn);
      part(new THREE.CylinderGeometry(0.13, 0.14, 0.34, 18), pants, kn, 0, -0.17, 0);
      const shoeG = new THREE.Group();
      shoeG.position.set(0, -0.42, -0.06);
      kn.add(shoeG);
      part(new RoundedBoxGeometry(0.28, 0.16, 0.48, 4, 0.07), black, shoeG, 0, 0, 0);
      part(new RoundedBoxGeometry(0.29, 0.05, 0.5, 3, 0.02), MAT.rubber('#2a2a2e'), shoeG, 0, -0.07, 0, { cast: false });
      return { hip, kn };
    });
  }

  // 設定目標姿勢並平滑過渡
  apply(p, dt, k = 18) {
    const L = this.legs, A = this.arms;
    const set = (obj, prop, v) => { obj[prop] = damp(obj[prop], v, k, dt); };
    set(L[0].hip.rotation, 'x', p.hipL ?? 0);
    set(L[1].hip.rotation, 'x', p.hipR ?? 0);
    set(L[0].hip.rotation, 'z', p.hipZL ?? 0);
    set(L[1].hip.rotation, 'z', p.hipZR ?? 0);
    set(L[0].kn.rotation, 'x', p.knL ?? 0);
    set(L[1].kn.rotation, 'x', p.knR ?? 0);
    set(A[0].sh.rotation, 'x', p.shL ?? 0);
    set(A[1].sh.rotation, 'x', p.shR ?? 0);
    set(A[0].sh.rotation, 'z', p.shZL ?? -0.14);
    set(A[1].sh.rotation, 'z', p.shZR ?? 0.14);
    set(A[0].el.rotation, 'x', p.elL ?? 0);
    set(A[1].el.rotation, 'x', p.elR ?? 0);
    set(this.torso.rotation, 'x', p.torsoX ?? 0);
    set(this.torso.rotation, 'y', p.torsoY ?? 0);
    set(this.hips.rotation, 'y', p.hipsY ?? 0);
    set(this.head.rotation, 'x', p.headX ?? 0);
    set(this.head.rotation, 'y', p.headY ?? 0);
    // rigY 以 0.95 為基準的相對值（相容既有姿勢資料）
    set(this.rig.position, 'y', this.baseRigY + ((p.rigY ?? 0.95) - 0.95));
  }

  runPose(phase, amt = 1) {
    const s = Math.sin(phase), c2 = Math.cos(phase);
    return {
      hipL: s * 0.95 * amt, hipR: -s * 0.95 * amt,
      knL: -Math.max(0, -c2) * 1.6 * amt - 0.25, knR: -Math.max(0, c2) * 1.6 * amt - 0.25,
      shL: -s * 0.95 * amt, shR: s * 0.95 * amt,
      shZL: -0.28, shZR: 0.28,
      elL: 1.3, elR: 1.3,
      torsoX: -0.2, torsoY: s * 0.14,
      headX: 0.12, headY: -s * 0.06,
      rigY: 0.95 + Math.abs(c2) * 0.1,
    };
  }
}

// ───────── 狗（Pixar 風柴犬）─────────
export class Dog {
  constructor() {
    this.root = new THREE.Group();
    const fur = MAT.hair('#d98a3e');
    const cream = MAT.hair('#f6e2c2');
    this.body = new THREE.Group();
    this.body.position.y = 0.48;
    this.root.add(this.body);
    part(new THREE.SphereGeometry(0.26, 24, 18), fur, this.body, 0, 0, 0.05, { scale: [0.9, 0.85, 1.35] });
    part(new THREE.SphereGeometry(0.18, 18, 14), cream, this.body, 0, -0.06, -0.14, { scale: [0.85, 0.9, 1.1] });
    this.headG = new THREE.Group();
    this.headG.position.set(0, 0.26, -0.3);
    this.body.add(this.headG);
    const hc = V(0, 0, 0);
    part(new THREE.SphereGeometry(0.22, 26, 20), fur, this.headG, 0, 0, 0, { scale: [1.05, 0.95, 1] });
    part(new THREE.SphereGeometry(0.13, 18, 14), cream, this.headG, 0, -0.07, -0.15, { scale: [1.1, 0.8, 1.1] });
    part(new THREE.SphereGeometry(0.045, 12, 10), MAT.glossy('#1a1210'), this.headG, 0, -0.03, -0.29);
    for (const s of [-1, 1]) {
      eye(this.headG, hc, 0.22, 0.1, s * 0.42, { size: 0.055, iris: '#2a1a10' });
      const ear = part(new THREE.ConeGeometry(0.08, 0.16, 12), fur, this.headG, s * 0.13, 0.2, 0.02, { rot: [0, 0, -s * 0.35] });
      part(new THREE.ConeGeometry(0.05, 0.1, 10), cream, ear, 0, -0.02, -0.03, { cast: false });
      part(new THREE.SphereGeometry(0.05, 10, 8), MAT.basic('#f29a8e', { transparent: true, opacity: 0.35, depthWrite: false }), this.headG, s * 0.12, -0.08, -0.15, { cast: false, scale: [1, 0.6, 0.3] });
    }
    part(new THREE.CapsuleGeometry(0.03, 0.05, 4, 8), MAT.skin('#ff7a8a'), this.headG, 0.02, -0.15, -0.23, { rot: [0.4, 0, 0], cast: false });
    part(new THREE.TorusGeometry(0.15, 0.028, 8, 20), MAT.plastic('#e8322b'), this.body, 0, 0.16, -0.25, { rot: [Math.PI / 2 - 0.5, 0, 0] });
    part(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 14), new THREE.MeshPhysicalMaterial({ color: '#ffc93a', metalness: 0.9, roughness: 0.25 }), this.body, 0, 0.06, -0.37, { rot: [Math.PI / 2, 0, 0], cast: false });
    this.tail = part(new THREE.TorusGeometry(0.08, 0.045, 10, 16, Math.PI * 1.4), fur, this.body, 0, 0.2, 0.36, { rot: [0, Math.PI / 2, 0] });
    this.dlegs = [];
    for (const [x, z] of [[-0.12, -0.2], [0.12, -0.2], [-0.12, 0.28], [0.12, 0.28]]) {
      const g = new THREE.Group();
      g.position.set(x, -0.12, z);
      this.body.add(g);
      part(new THREE.CapsuleGeometry(0.06, 0.2, 4, 10), fur, g, 0, -0.15, 0);
      part(new THREE.SphereGeometry(0.068, 12, 10), cream, g, 0, -0.3, -0.02, { scale: [1, 0.65, 1.25] });
      this.dlegs.push(g);
    }
  }

  animate(t, running = true) {
    const ph = t * 16;
    const a = running ? 1 : 0.15;
    this.body.position.y = 0.48 + Math.abs(Math.sin(ph)) * 0.08 * a;
    this.body.rotation.x = Math.sin(ph) * 0.06 * a;
    this.dlegs[0].rotation.x = Math.sin(ph) * 0.9 * a;
    this.dlegs[1].rotation.x = Math.sin(ph + 0.5) * 0.9 * a;
    this.dlegs[2].rotation.x = -Math.sin(ph) * 0.9 * a;
    this.dlegs[3].rotation.x = -Math.sin(ph + 0.5) * 0.9 * a;
    this.tail.rotation.z = Math.sin(t * 20) * 0.4;
    this.headG.rotation.x = Math.sin(ph) * 0.08 * a;
  }
}

// 滑板（道具狀態）：青藍板面 + 黑輪架 + 深藍輪 + 黃輪圈，底部發光
export function makeHoverboard() {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  const w = 0.3, l = 0.85;
  shape.moveTo(-w, -l + w);
  shape.absarc(0, -l + w, w, Math.PI, 0, false);
  shape.lineTo(w, l - w);
  shape.absarc(0, l - w, w, 0, Math.PI, false);
  shape.closePath();
  const deckGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.015, bevelSegments: 3, curveSegments: 20 });
  deckGeo.rotateX(Math.PI / 2);
  part(deckGeo, MAT.plastic('#1fc2e4', 0.3), g, 0, 0.04, 0);
  const truck = MAT.plastic('#1b1b20', 0.4);
  const wheel = MAT.plastic('#34409e', 0.35);
  const rim = MAT.plastic('#f2b23a', 0.3);
  for (const z of [-0.52, 0.52]) {
    part(new RoundedBoxGeometry(0.42, 0.05, 0.1, 2, 0.02), truck, g, 0, -0.03, z);
    for (const x of [-0.23, 0.23]) {
      part(new THREE.CylinderGeometry(0.07, 0.07, 0.07, 18), wheel, g, x, -0.07, z, { rot: [0, 0, Math.PI / 2] });
      part(new THREE.CylinderGeometry(0.045, 0.045, 0.075, 14), rim, g, x, -0.07, z, { rot: [0, 0, Math.PI / 2], cast: false });
    }
  }
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.9), new THREE.MeshBasicMaterial({ color: '#6fe8ff', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -0.13;
  g.add(glow);
  return g;
}

// 噴射背包
export function makeJetpack() {
  const g = new THREE.Group();
  const metal = new THREE.MeshPhysicalMaterial({ color: '#c9cdd2', metalness: 0.35, roughness: 0.45 });
  const red = MAT.plastic('#e8322b');
  for (const x of [-0.15, 0.15]) {
    part(new THREE.CapsuleGeometry(0.12, 0.36, 6, 16), metal, g, x, 0, 0);
    part(new THREE.CylinderGeometry(0.075, 0.11, 0.13, 16), red, g, x, -0.3, 0);
  }
  return g;
}

export { damp };
