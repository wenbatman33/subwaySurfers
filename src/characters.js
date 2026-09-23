import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// 程序化卡通角色（Toon 著色 + 黑色描邊）：玩家、警衛、狗

const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

// 三階 Toon 漸層
const GRADIENT = (() => {
  const t = new THREE.DataTexture(new Uint8Array([120, 190, 235, 255]), 4, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
})();

const toon = (color, o = {}) => new THREE.MeshToonMaterial({ color, gradientMap: GRADIENT, ...o });

// 描邊：沿法線外推的背面材質
const OUTLINE = (() => {
  const m = new THREE.MeshBasicMaterial({ color: '#15151c', side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed += normalize(normal) * 0.013;');
  };
  return m;
})();

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// 建立部件（可選描邊）
function part(geo, mat, parent, x = 0, y = 0, z = 0, o = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (o.rot) m.rotation.set(...o.rot);
  if (o.scale) m.scale.set(...o.scale);
  m.castShadow = o.cast !== false;
  if (o.outline !== false) {
    const ol = new THREE.Mesh(geo, OUTLINE);
    ol.castShadow = false;
    m.add(ol);
  }
  parent.add(m);
  return m;
}

// 頭部球面座標 → 位置 + 朝外的旋轉
function onSphere(center, r, lat, lon) {
  const n = V(Math.sin(lon) * Math.cos(lat), Math.sin(lat), -Math.cos(lon) * Math.cos(lat));
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, -1), n);
  return { p: center.clone().addScaledVector(n, r), q };
}
function faceFeature(geo, mat, head, center, r, lat, lon, o = {}) {
  const { p, q } = onSphere(center, r, lat, lon);
  const m = part(geo, mat, head, p.x, p.y, p.z, { outline: false, cast: false, ...o });
  m.quaternion.copy(q);
  if (o.roll) m.rotateZ(o.roll);
  return m;
}

// 人形角色：面向 -Z（前進方向），root 位於腳底
export class Humanoid {
  constructor(opt = {}) {
    const c = {
      skin: '#f6c7a0', shirt: '#ff6b1f', shirt2: '#ffffff', pants: '#2f5ba8', cuff: '#4f7fd0',
      shoe: '#e8322b', sole: '#ffffff', cap: '#e8322b', hair: '#4a2a14', eye: '#2a6fdb',
      scale: 1, guard: false, ...opt,
    };
    this.c = c;
    const G = c.guard;
    this.root = new THREE.Group();
    this.rig = new THREE.Group();
    this.rig.position.y = 0.97;
    this.root.add(this.rig);

    const skin = toon(c.skin);
    const shirt = toon(c.shirt);
    const shirtDark = toon(new THREE.Color(c.shirt).multiplyScalar(0.72));
    const pants = toon(c.pants);
    const cuff = toon(c.cuff);
    const dark = toon('#1c1c22');
    const white = toon('#ffffff');
    const sole = toon(c.sole);
    const upper = toon(c.shoe);
    this.shoeMat = sole;

    // ── 骨盆 ──
    this.hips = new THREE.Group();
    this.rig.add(this.hips);
    part(new RoundedBoxGeometry(G ? 0.66 : 0.5, 0.26, G ? 0.44 : 0.32, 3, 0.1), pants, this.hips, 0, 0.0, 0);

    // ── 軀幹（車床曲面：寬胸窄腰）──
    this.torso = new THREE.Group();
    this.torso.position.y = 0.08;
    this.hips.add(this.torso);
    const prof = G
      ? [[0.001, 0], [0.34, 0.0], [0.4, 0.14], [0.42, 0.32], [0.4, 0.5], [0.33, 0.62], [0.14, 0.7], [0.001, 0.71]]
      : [[0.001, 0], [0.25, 0.0], [0.27, 0.12], [0.3, 0.32], [0.32, 0.5], [0.28, 0.62], [0.12, 0.69], [0.001, 0.7]];
    const torsoGeo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 24);
    part(torsoGeo, shirt, this.torso, 0, 0, 0, { scale: [1, 1, G ? 0.85 : 0.72] });
    const neck = part(new THREE.CylinderGeometry(0.09, 0.1, 0.14, 12), skin, this.torso, 0, 0.72, 0, { outline: false });
    void neck;

    if (G) {
      // 警衛：啤酒肚、扣子、皮帶、警徽、領帶
      part(new THREE.SphereGeometry(0.36, 20, 16), shirt, this.torso, 0, 0.22, -0.1, { scale: [1, 0.9, 0.9] });
      part(new THREE.CylinderGeometry(0.4, 0.4, 0.09, 24), dark, this.torso, 0, 0.03, 0, { scale: [1, 1, 0.86] });
      part(new RoundedBoxGeometry(0.14, 0.1, 0.04, 2, 0.02), toon('#ffcc33'), this.torso, 0, 0.03, -0.35, { outline: false });
      const gold = toon('#ffd24a', { emissive: '#553300' });
      for (const y of [0.18, 0.32, 0.46]) part(new THREE.SphereGeometry(0.028, 8, 6), gold, this.torso, 0, y, y < 0.3 ? -0.43 : -0.37, { outline: false });
      const badge = new THREE.Shape();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? 0.035 : 0.075;
        i ? badge.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : badge.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      part(new THREE.ShapeGeometry(badge), gold, this.torso, 0.17, 0.5, -0.33, { outline: false, rot: [0, Math.PI + 0.35, 0] });
      part(new THREE.BoxGeometry(0.06, 0.2, 0.02), toon('#1a2448'), this.torso, 0, 0.58, -0.3, { outline: false, rot: [0.3, 0, 0] });
      // 肩章
      for (const s of [-1, 1]) part(new RoundedBoxGeometry(0.18, 0.05, 0.16, 2, 0.02), toon('#ffcc33'), this.torso, s * 0.33, 0.62, 0, { rot: [0, 0, -s * 0.25] });
    } else {
      // 連帽衫：下擺、口袋、胸前圖案、帽繩、帽兜、背包
      part(new THREE.CylinderGeometry(0.265, 0.26, 0.08, 24), shirtDark, this.torso, 0, 0.03, 0, { scale: [1, 1, 0.74] });
      part(new RoundedBoxGeometry(0.34, 0.15, 0.06, 2, 0.03), shirtDark, this.torso, 0, 0.16, -0.2, { outline: false });
      const logo = part(new THREE.CircleGeometry(0.11, 24), white, this.torso, 0, 0.42, -0.232, { outline: false, rot: [0, Math.PI, 0] });
      const star = new THREE.Shape();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + Math.PI / 2, rr = i % 2 ? 0.035 : 0.08;
        i ? star.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : star.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      const st = new THREE.Mesh(new THREE.ShapeGeometry(star), toon('#2a6fdb'));
      st.position.z = 0.003;
      logo.add(st);
      for (const x of [-0.06, 0.06]) part(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 6), white, this.torso, x, 0.53, -0.215, { outline: false });
      part(new THREE.TorusGeometry(0.17, 0.075, 10, 20), shirt, this.torso, 0, 0.66, 0.08, { rot: [Math.PI / 2 - 0.35, 0, 0] });
      // 背包
      const bag = toon('#1fa35e');
      part(new RoundedBoxGeometry(0.46, 0.5, 0.22, 3, 0.09), bag, this.torso, 0, 0.36, 0.29);
      part(new RoundedBoxGeometry(0.32, 0.2, 0.08, 2, 0.05), toon('#ffd21a'), this.torso, 0, 0.26, 0.42);
      for (const x of [-0.15, 0.15]) {
        part(new RoundedBoxGeometry(0.06, 0.4, 0.03, 1, 0.012), toon('#16774a'), this.torso, x, 0.44, -0.24, { outline: false, rot: [-0.15, 0, 0] });
      }
    }

    // ── 頭 ──
    this.head = new THREE.Group();
    this.head.position.y = 0.72;
    this.torso.add(this.head);
    const R = G ? 0.35 : 0.39;
    const hc = V(0, R * 0.95, 0);
    part(new THREE.SphereGeometry(R, 32, 24), skin, this.head, hc.x, hc.y, hc.z, { scale: [1, 1.02, 0.98] });
    // 耳朵
    for (const s of [-1, 1]) part(new THREE.SphereGeometry(0.085, 12, 10), skin, this.head, s * R * 0.97, hc.y - 0.01, 0.02, { scale: [0.55, 1, 0.8] });
    // 眼睛
    const eyeW = toon('#ffffff');
    const iris = toon(G ? '#3a2a1a' : c.eye);
    const pupil = new THREE.MeshBasicMaterial({ color: '#111111' });
    const shine = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const eyeR = G ? 0.075 : 0.1;
    for (const s of [-1, 1]) {
      faceFeature(new THREE.SphereGeometry(eyeR, 16, 12), eyeW, this.head, hc, R - 0.035, 0.1, s * 0.35, { scale: [1, 1.2, 0.5] });
      faceFeature(new THREE.SphereGeometry(eyeR * 0.58, 14, 10), iris, this.head, hc, R + 0.005, 0.09, s * 0.33, { scale: [1, 1.15, 0.4] });
      faceFeature(new THREE.SphereGeometry(eyeR * 0.3, 10, 8), pupil, this.head, hc, R + 0.018, 0.09, s * 0.33, { scale: [1, 1.1, 0.4] });
      faceFeature(new THREE.SphereGeometry(eyeR * 0.16, 8, 6), shine, this.head, hc, R + 0.03, 0.14, s * 0.3);
      // 眉毛
      faceFeature(new RoundedBoxGeometry(G ? 0.16 : 0.13, 0.035, 0.03, 2, 0.012), toon(G ? '#6b6b6b' : c.hair), this.head, hc, R, 0.27, s * 0.35, { roll: G ? -s * 0.35 : s * 0.12 });
    }
    // 鼻子
    faceFeature(new THREE.SphereGeometry(G ? 0.085 : 0.055, 12, 10), skin, this.head, hc, R - 0.02, -0.06, 0, { scale: [1, 0.85, 0.9], outline: true });
    if (G) {
      // 大鬍子 + 嘴
      const must = toon('#6a6a6a');
      for (const s of [-1, 1]) faceFeature(new THREE.CapsuleGeometry(0.045, 0.12, 4, 10), must, this.head, hc, R - 0.01, -0.2, s * 0.13, { roll: Math.PI / 2 + s * 0.35, outline: true });
      faceFeature(new THREE.CircleGeometry(0.05, 16, 0, Math.PI), toon('#5a1a1a'), this.head, hc, R, -0.36, 0, { roll: Math.PI });
    } else {
      // 咧嘴笑（嘴 + 牙齒）
      const mouth = faceFeature(new THREE.CircleGeometry(0.1, 20, Math.PI, Math.PI), toon('#7a1f1f'), this.head, hc, R + 0.003, -0.22, 0.04);
      const teeth = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.03), shine);
      teeth.position.set(0, -0.016, 0.002);
      teeth.rotation.y = Math.PI;
      mouth.add(teeth);
      mouth.rotateY(Math.PI);
    }

    const capM = toon(c.cap);
    if (G) {
      // 警帽
      part(new THREE.CylinderGeometry(R * 1.02, R * 0.98, 0.16, 24), capM, this.head, 0, hc.y + 0.2, 0);
      part(new THREE.CylinderGeometry(R * 1.15, R * 1.05, 0.1, 24), capM, this.head, 0, hc.y + 0.32, -0.02, { rot: [-0.08, 0, 0] });
      part(new THREE.CylinderGeometry(R * 1.03, R * 1.03, 0.04, 24), dark, this.head, 0, hc.y + 0.14, 0, { outline: false });
      part(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 20, 1, false, 0, Math.PI), dark, this.head, 0, hc.y + 0.13, -R * 0.75, { rot: [0.2, Math.PI / 2, 0] });
      part(new THREE.CircleGeometry(0.06, 6), toon('#ffd24a'), this.head, 0, hc.y + 0.23, -R - 0.012, { outline: false, rot: [0, Math.PI, 0] });
      for (const s of [-1, 1]) part(new THREE.SphereGeometry(0.08, 10, 8), toon('#7a7a7a'), this.head, s * R * 0.9, hc.y - 0.02, 0.1, { scale: [0.5, 1, 0.8] });
    } else {
      // 反戴棒球帽 + 頭髮
      part(new THREE.SphereGeometry(R * 1.04, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), capM, this.head, 0, hc.y + 0.13, 0, { rot: [0.1, 0, 0] });
      part(new THREE.CylinderGeometry(R * 1.05, R * 1.05, 0.06, 28), capM, this.head, 0, hc.y + 0.14, 0, { outline: false, rot: [0.1, 0, 0] });
      part(new RoundedBoxGeometry(0.42, 0.04, 0.32, 2, 0.02), capM, this.head, 0, hc.y + 0.17, R + 0.12, { rot: [-0.3, 0, 0] });
      part(new THREE.SphereGeometry(0.04, 8, 6), capM, this.head, 0, hc.y + R + 0.13, 0.04);
      const hair = toon(c.hair);
      part(new THREE.SphereGeometry(R * 1.02, 20, 10, Math.PI / 2 - 1.7, 3.4, Math.PI / 2 - 0.05, 0.5), hair, this.head, 0, hc.y + 0.02, 0.01, { outline: false });
      // 前額瀏海（從帽口冒出）
      for (const [x, rz] of [[-0.12, 0.4], [0.0, 0], [0.12, -0.4]]) {
        part(new THREE.ConeGeometry(0.07, 0.14, 8), hair, this.head, x, hc.y + 0.2, -R * 0.86, { rot: [-2.5, 0, rz], outline: false });
      }
    }

    // ── 手臂 ──
    const chestHalf = G ? 0.42 : 0.33;
    this.arms = [-1, 1].map((s) => {
      const sh = new THREE.Group();
      sh.position.set(s * (chestHalf + 0.04), 0.56, 0);
      this.torso.add(sh);
      part(new THREE.SphereGeometry(G ? 0.13 : 0.11, 14, 10), shirt, sh, 0, 0, 0);
      part(new THREE.CapsuleGeometry(G ? 0.11 : 0.095, 0.2, 6, 12), shirt, sh, 0, -0.15, 0);
      const el = new THREE.Group();
      el.position.y = -0.32;
      sh.add(el);
      part(new THREE.CapsuleGeometry(G ? 0.1 : 0.088, 0.17, 6, 12), shirt, el, 0, -0.12, 0);
      part(new THREE.CylinderGeometry(0.1, 0.1, 0.07, 14), G ? dark : shirtDark, el, 0, -0.25, 0, { outline: false });
      const hand = part(new THREE.SphereGeometry(0.1, 14, 12), skin, el, 0, -0.35, 0, { scale: [0.85, 1, 1] });
      part(new THREE.CapsuleGeometry(0.035, 0.06, 4, 8), skin, hand, -s * 0.07, 0.02, -0.05, { rot: [0.5, 0, s * 0.4] });
      return { sh, el };
    });

    // ── 腿 ──
    this.legs = [-1, 1].map((s) => {
      const hip = new THREE.Group();
      hip.position.set(s * (G ? 0.18 : 0.13), -0.05, 0);
      this.hips.add(hip);
      part(new THREE.CapsuleGeometry(G ? 0.14 : 0.12, 0.22, 6, 12), pants, hip, 0, -0.19, 0);
      const kn = new THREE.Group();
      kn.position.y = -0.42;
      hip.add(kn);
      part(new THREE.CylinderGeometry(G ? 0.13 : 0.11, G ? 0.14 : 0.13, 0.3, 14), pants, kn, 0, -0.15, 0);
      if (!G) part(new THREE.CylinderGeometry(0.145, 0.145, 0.07, 16), cuff, kn, 0, -0.31, 0);
      // 大球鞋
      const shoe = new THREE.Group();
      shoe.position.set(0, -0.4, -0.05);
      kn.add(shoe);
      if (G) {
        part(new RoundedBoxGeometry(0.26, 0.16, 0.42, 3, 0.07), toon('#1b1b1b', { emissive: '#000' }), shoe, 0, -0.02, 0);
        this.shoeMat = sole;
      } else {
        part(new RoundedBoxGeometry(0.28, 0.09, 0.48, 3, 0.04), sole, shoe, 0, -0.075, -0.01);
        part(new RoundedBoxGeometry(0.25, 0.17, 0.4, 3, 0.08), upper, shoe, 0, 0.03, 0.01);
        part(new THREE.SphereGeometry(0.12, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), sole, shoe, 0, -0.03, -0.17, { scale: [1, 0.8, 0.8], rot: [-0.3, 0, 0], outline: false });
        for (let i = 0; i < 3; i++) part(new THREE.BoxGeometry(0.14, 0.015, 0.025), white, shoe, 0, 0.125 - i * 0.012, -0.08 + i * 0.06, { outline: false });
        part(new RoundedBoxGeometry(0.12, 0.12, 0.05, 2, 0.02), upper, shoe, 0, 0.14, 0.03, { rot: [-0.3, 0, 0], outline: false });
        part(new THREE.BoxGeometry(0.255, 0.035, 0.12), white, shoe, s * 0.001, 0.03, 0.1, { outline: false });
      }
      return { hip, kn };
    });

    this.root.scale.setScalar(c.scale);
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
    set(this.rig.position, 'y', p.rigY ?? 0.97);
  }

  runPose(phase, amt = 1) {
    const s = Math.sin(phase), c2 = Math.cos(phase);
    return {
      hipL: s * 0.95 * amt, hipR: -s * 0.95 * amt,
      knL: -Math.max(0, -c2) * 1.6 * amt - 0.25, knR: -Math.max(0, c2) * 1.6 * amt - 0.25,
      shL: -s * 0.95 * amt, shR: s * 0.95 * amt,
      shZL: -0.22, shZR: 0.22,
      elL: 1.35, elR: 1.35,
      torsoX: -0.2, torsoY: s * 0.14,
      headX: 0.14, headY: -s * 0.06,
      rigY: 0.97 + Math.abs(c2) * 0.1,
    };
  }
}

// 狗（警衛的搭檔）
export class Dog {
  constructor() {
    this.root = new THREE.Group();
    const fur = toon('#d0924e');
    const light = toon('#f3d3a6');
    const dark = toon('#5a3a1e');
    this.body = new THREE.Group();
    this.body.position.y = 0.52;
    this.root.add(this.body);
    part(new THREE.CapsuleGeometry(0.2, 0.5, 6, 14), fur, this.body, 0, 0, 0, { rot: [Math.PI / 2, 0, 0] });
    part(new THREE.SphereGeometry(0.16, 12, 10), light, this.body, 0, -0.06, -0.3, { scale: [1, 0.8, 1], outline: false });
    this.headG = new THREE.Group();
    this.headG.position.set(0, 0.22, -0.42);
    this.body.add(this.headG);
    part(new THREE.SphereGeometry(0.2, 18, 14), fur, this.headG, 0, 0, 0);
    part(new THREE.CapsuleGeometry(0.09, 0.12, 4, 10), light, this.headG, 0, -0.06, -0.2, { rot: [Math.PI / 2, 0, 0] });
    part(new THREE.SphereGeometry(0.05, 10, 8), toon('#111'), this.headG, 0, -0.03, -0.33, { outline: false });
    for (const x of [-0.08, 0.08]) {
      part(new THREE.SphereGeometry(0.04, 10, 8), toon('#111'), this.headG, x, 0.05, -0.17, { outline: false });
      part(new THREE.SphereGeometry(0.012, 6, 4), new THREE.MeshBasicMaterial({ color: '#fff' }), this.headG, x - 0.01, 0.065, -0.205, { outline: false });
      part(new THREE.CapsuleGeometry(0.05, 0.14, 4, 8), dark, this.headG, x * 1.9, 0.08, 0.02, { rot: [0.2, 0, x > 0 ? -0.5 : 0.5] });
    }
    part(new THREE.CapsuleGeometry(0.035, 0.06, 4, 8), toon('#ff6b8a'), this.headG, 0, -0.14, -0.26, { rot: [0.3, 0, 0], outline: false });
    this.tail = part(new THREE.CapsuleGeometry(0.04, 0.26, 4, 8), fur, this.body, 0, 0.14, 0.42);
    this.tail.rotation.x = -0.9;
    this.dlegs = [];
    for (const [x, z] of [[-0.12, -0.26], [0.12, -0.26], [-0.12, 0.26], [0.12, 0.26]]) {
      const g = new THREE.Group();
      g.position.set(x, -0.1, z);
      this.body.add(g);
      part(new THREE.CapsuleGeometry(0.06, 0.24, 4, 8), fur, g, 0, -0.18, 0);
      part(new THREE.SphereGeometry(0.07, 8, 6), light, g, 0, -0.34, -0.02, { scale: [1, 0.6, 1.3], outline: false });
      this.dlegs.push(g);
    }
    part(new THREE.TorusGeometry(0.15, 0.03, 8, 16), toon('#e8322b'), this.headG, 0, -0.12, 0.08, { rot: [Math.PI / 2 - 0.3, 0, 0], outline: false });
    part(new THREE.SphereGeometry(0.035, 8, 6), toon('#ffd24a'), this.headG, 0, -0.2, -0.05, { outline: false });
  }

  animate(t, running = true) {
    const ph = t * 16;
    const a = running ? 1 : 0.15;
    this.body.position.y = 0.52 + Math.abs(Math.sin(ph)) * 0.08 * a;
    this.body.rotation.x = Math.sin(ph) * 0.06 * a;
    this.dlegs[0].rotation.x = Math.sin(ph) * 0.9 * a;
    this.dlegs[1].rotation.x = Math.sin(ph + 0.5) * 0.9 * a;
    this.dlegs[2].rotation.x = -Math.sin(ph) * 0.9 * a;
    this.dlegs[3].rotation.x = -Math.sin(ph + 0.5) * 0.9 * a;
    this.tail.rotation.z = Math.sin(t * 20) * 0.6;
    this.headG.rotation.x = Math.sin(ph) * 0.1 * a;
  }
}

// 滑板（Hoverboard）
export function makeHoverboard() {
  const g = new THREE.Group();
  const deck = part(new RoundedBoxGeometry(0.62, 0.1, 1.6, 3, 0.05), new THREE.MeshStandardMaterial({ color: '#7a3bff', emissive: '#5a1bff', emissiveIntensity: 0.6, metalness: 0.4, roughness: 0.3 }), g);
  deck.castShadow = true;
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.11, 1.3), new THREE.MeshStandardMaterial({ color: '#3bd1ff', emissive: '#3bd1ff', emissiveIntensity: 2 })));
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.1), new THREE.MeshBasicMaterial({ color: '#9a6bff', transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -0.12;
  g.add(glow);
  return g;
}

// 噴射背包
export function makeJetpack() {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: '#d9dde2', metalness: 0.8, roughness: 0.25 });
  const red = toon('#e8322b');
  for (const x of [-0.16, 0.16]) {
    part(new THREE.CapsuleGeometry(0.13, 0.4, 4, 12), metal, g, x, 0, 0);
    part(new THREE.CylinderGeometry(0.08, 0.12, 0.14, 12), red, g, x, -0.33, 0);
  }
  return g;
}

export { damp };
