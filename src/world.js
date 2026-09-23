import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TUNING } from './config.js';
import { gravelTexture, graffitiWallTexture, facadeTextures, snowTexture, sandTexture, neonSignTexture } from './textures.js';

// 軌道環境：固定長度路段循環拼接，依距離輪替主題場景
// 主題：城市 → 海港 → 霓虹夜城 → 雪地小鎮（交界處以隧道過場）

export const SEG = 40;
export const WALL_X = 8.2;
export const THEMES = ['city', 'coast', 'neon', 'winter'];
export const THEME_NAMES = { city: '城市', coast: '海港', neon: '霓虹夜城', winter: '雪地小鎮' };
export const THEME_LEN = SEG * 20;
const VIEW_AHEAD = 340;

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

// 依世界尺寸縮放 UV 的方塊
export function boxUV(w, h, d, tu = 1, tv = tu) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * dims[f][0]) / tu, (uv.getY(k) * dims[f][1]) / tv);
    }
  }
  return g;
}

// 平面地板（世界尺寸 UV）
function groundPlane(w, d, tile) {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * d) / tile);
  return g;
}

// 依材質分桶合併幾何，降低 draw call
export class Bucket {
  constructor() { this.map = new Map(); }
  add(mat, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
      new THREE.Vector3(1, 1, 1),
    );
    const g = geo.clone();
    g.applyMatrix4(m);
    if (!this.map.has(mat)) this.map.set(mat, []);
    this.map.get(mat).push(g);
  }
  build(group, { cast = true, receive = true, noCast = [] } = {}) {
    const out = [];
    for (const [mat, geos] of this.map) {
      let list = geos;
      if (list.some((g) => !g.index)) list = list.map((g) => (g.index ? g.toNonIndexed() : g));
      const merged = mergeGeometries(list, false);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = cast && !noCast.includes(mat);
      mesh.receiveShadow = receive;
      mesh.matrixAutoUpdate = false;
      mesh.frustumCulled = false;
      mesh.updateMatrix();
      group.add(mesh);
      out.push(mesh);
      list.forEach((g) => g.dispose());
    }
    this.map.clear();
    return out;
  }
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.nightMats = [];
    this.forceTheme = null;
    this._makeMaterials();
    this.pool = [];
    const add = (type, theme, n) => { for (let i = 0; i < n; i++) this.pool.push(this._build(type, theme)); };
    add('normal', 'city', 7);
    add('bridge', 'city', 2);
    add('station', 'city', 2);
    add('normal', 'coast', 7);
    add('normal', 'neon', 7);
    add('normal', 'winter', 7);
    add('tunnel', 'any', 3);
    this.active = [];
    this.nextD = 0;
  }

  // 夜晚時會變亮的材質
  _night(mat, day, night) {
    this.nightMats.push({ mat, day, night });
    return mat;
  }

  _makeMaterials() {
    const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...o });
    const emi = (c, i) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i });
    const facade = (style, lit, day, night) => {
      const t = facadeTextures(style, lit);
      return this._night(std({ map: t.map, emissiveMap: t.emissiveMap, emissive: '#ffd08a', emissiveIntensity: day, roughness: 0.75 }), day, night);
    };
    this.m = {
      ground: std({ map: gravelTexture(false) }),
      snow: std({ map: snowTexture(), color: '#b4bfcc', roughness: 0.95 }),
      sand: std({ map: sandTexture() }),
      ballast: std({ map: gravelTexture(true) }),
      sleeper: std({ color: '#5e3d28', roughness: 0.95 }),
      rail: std({ color: '#7a8086', metalness: 0.3, roughness: 0.6 }),
      railBase: std({ color: '#5a4a3e', metalness: 0.1, roughness: 0.8 }),
      walls: Array.from({ length: 7 }, () => std({ map: graffitiWallTexture() })),
      cap: std({ color: '#77736d' }),
      snowCap: std({ color: '#c2ccd8', roughness: 0.9 }),
      facades: {
        city: [0, 1, 2, 3].map((i) => facade(i, 0.35, 0.25, 0.9)),
        coast: [4, 5, 1, 4].map((i) => facade(i, 0.3, 0.2, 0.9)),
        neon: [6, 7, 2, 6].map((i) => facade(i, 0.55, 0.45, 0.95)),
        winter: [8, 1, 0].map((i) => facade(i, 0.45, 0.25, 0.9)),
      },
      roof: std({ color: '#55524e' }),
      pole: std({ color: '#3a4048', metalness: 0.2, roughness: 0.65 }),
      wire: std({ color: '#161616', roughness: 0.6 }),
      bridge: std({ color: '#2f6fa8', metalness: 0.1, roughness: 0.7 }),
      concrete: std({ color: '#8d8880' }),
      tunnel: std({ color: '#6c6861', side: THREE.BackSide, roughness: 0.95 }),
      lamp: this._night(emi('#fff0c0', 1.2), 1.2, 2.6),
      red: emi('#ff2a2a', 4),
      green: emi('#2aff6a', 4),
      tank: std({ color: '#9a6a3c', roughness: 0.9 }),
      yellow: std({ color: '#ffd21a', roughness: 0.6 }),
      bench: std({ color: '#2d6bd6', roughness: 0.5 }),
      ac: std({ color: '#b7bcc2', metalness: 0.1, roughness: 0.7 }),
      sea: new THREE.MeshStandardMaterial({ color: '#1874b8', roughness: 0.25, metalness: 0.05 }),
      trunk: std({ color: '#8a6a44' }),
      frond: std({ color: '#2f9e44', roughness: 0.7, side: THREE.DoubleSide }),
      pine: std({ color: '#1f5a3a', roughness: 0.8 }),
      umbrella: [std({ color: '#ff4d6d' }), std({ color: '#ffd21a' }), std({ color: '#3bd1ff' })],
      railing: std({ color: '#d8dee3', metalness: 0.15, roughness: 0.6 }),
      neonPink: this._night(emi('#ff2bd6', 1.6), 1.6, 2.6),
      neonCyan: this._night(emi('#2bf3ff', 1.6), 1.6, 2.6),
      neonSigns: Array.from({ length: 8 }, () => {
        const t = neonSignTexture();
        return this._night(new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: '#ffffff', emissiveIntensity: 1.1, side: THREE.DoubleSide }), 1.1, 1.6);
      }),
      chimney: std({ color: '#7a3a28' }),
    };
  }

  // 夜晚程度 0~1：窗戶、路燈、霓虹亮度
  setNight(n) {
    for (const { mat, day, night } of this.nightMats) mat.emissiveIntensity = day + (night - day) * n;
    this.m.sea.color.setRGB(0.09 + 0.0 * n, 0.45 - 0.3 * n, 0.72 - 0.45 * n);
  }

  // ───────── 共用構件 ─────────
  _tracks(b, groundMat, { leftEdge = -35, rightEdge = 35 } = {}) {
    const lw = TUNING.laneWidth;
    const w = rightEdge - leftEdge;
    b.add(groundMat, groundPlane(w, SEG, 6), (leftEdge + rightEdge) / 2, 0, -SEG / 2);
    const bed = boxUV(3.0, 0.14, SEG, 4);
    const sleeper = new THREE.BoxGeometry(2.5, 0.12, 0.36);
    const rail = new THREE.BoxGeometry(0.1, 0.16, SEG);
    const railBase = new THREE.BoxGeometry(0.26, 0.05, SEG);
    for (let l = -1; l <= 1; l++) {
      const x = l * lw;
      b.add(this.m.ballast, bed, x, 0.07, -SEG / 2);
      for (let z = 0.6; z < SEG; z += 1.25) b.add(this.m.sleeper, sleeper, x, 0.2, -z);
      for (const s of [-0.72, 0.72]) {
        b.add(this.m.rail, rail, x + s, 0.34, -SEG / 2);
        b.add(this.m.railBase, railBase, x + s, 0.285, -SEG / 2);
      }
    }
  }

  _wall(b, side, height, snowy = false) {
    b.add(pick(this.m.walls), boxUV(0.8, height, SEG, 20, 5.4), side * WALL_X, height / 2, -SEG / 2);
    b.add(snowy ? this.m.snowCap : this.m.cap, new THREE.BoxGeometry(snowy ? 1.2 : 1.1, snowy ? 0.4 : 0.3, SEG), side * WALL_X, height + (snowy ? 0.2 : 0.15), -SEG / 2);
  }

  _buildings(b, side, facades, { hMin = 12, hMax = 38, signs = false, xOff = 1.5 } = {}) {
    let z = 0;
    while (z < SEG) {
      const dz = Math.min(rand(9, 16), SEG - z);
      if (dz < 3) break;
      const wx = rand(9, 16);
      const h = rand(hMin, hMax);
      const gap = rand(0, 3);
      const x = side * (WALL_X + xOff + wx / 2 + gap);
      const zc = -(z + dz / 2);
      b.add(pick(facades), boxUV(wx, h, dz - 0.4, 8), x, h / 2, zc);
      b.add(this.m.roof, new THREE.BoxGeometry(wx + 0.4, 0.5, dz), x, h + 0.25, zc);
      if (Math.random() < 0.3) {
        const tx = x + rand(-2, 2);
        b.add(this.m.tank, new THREE.CylinderGeometry(1.3, 1.3, 2.6, 12), tx, h + 2.8, zc);
        b.add(this.m.roof, new THREE.ConeGeometry(1.5, 1.1, 12), tx, h + 4.65, zc);
        const leg = new THREE.BoxGeometry(0.15, 1.5, 0.15);
        for (const [lx, lz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) b.add(this.m.pole, leg, tx + lx, h + 0.75, zc + lz);
      } else if (Math.random() < 0.5) {
        b.add(this.m.ac, new THREE.BoxGeometry(2, 1.2, 1.6), x + rand(-2, 2), h + 1.1, zc + rand(-2, 2));
      }
      // 霓虹招牌（面向軌道）
      if (signs) {
        const n = 1 + ((Math.random() * 2) | 0);
        for (let i = 0; i < n; i++) {
          const vertical = Math.random() < 0.4;
          const sw = vertical ? 1.6 : rand(4, 6.5), sh = vertical ? 4.5 : sw * 0.375;
          const geo = new THREE.PlaneGeometry(vertical ? sh : sw, vertical ? sw : sh);
          if (vertical) geo.rotateZ(Math.PI / 2);
          const fx = side * (WALL_X + xOff + gap - 0.15);
          b.add(pick(this.m.neonSigns), geo, fx, rand(7, Math.max(8, h - 3)), zc + rand(-dz / 3, dz / 3), 0, side < 0 ? Math.PI / 2 : -Math.PI / 2, 0);
        }
      }
      z += dz;
    }
  }

  _poles(b, snowy = false) {
    const px = WALL_X - 1.3;
    const pole = new THREE.BoxGeometry(0.3, 10.2, 0.3);
    const beam = new THREE.BoxGeometry(px * 2 + 0.4, 0.35, 0.35);
    const insul = new THREE.CylinderGeometry(0.09, 0.09, 0.4, 8);
    for (const z of [10, 30]) {
      b.add(this.m.pole, pole, -px, 5.1, -z);
      b.add(this.m.pole, pole, px, 5.1, -z);
      b.add(this.m.pole, beam, 0, 10.1, -z);
      if (snowy) b.add(this.m.snowCap, new THREE.BoxGeometry(px * 2 + 0.5, 0.15, 0.45), 0, 10.35, -z);
      for (let l = -1; l <= 1; l++) b.add(this.m.wire, insul, l * TUNING.laneWidth, 9.75, -z);
    }
  }

  _signal(b) {
    if (Math.random() > 0.6) return;
    const side = Math.random() < 0.5 ? -1 : 1;
    const sx = side * (WALL_X - 2.2), sz = -rand(3, SEG - 3);
    b.add(this.m.pole, new THREE.BoxGeometry(0.16, 3.2, 0.16), sx, 1.6, sz);
    b.add(this.m.wire, new THREE.BoxGeometry(0.5, 1.1, 0.4), sx, 3.5, sz);
    const bulb = new THREE.SphereGeometry(0.13, 10, 8);
    b.add(Math.random() < 0.5 ? this.m.red : this.m.green, bulb, sx, 3.75, sz + 0.2);
    b.add(this.m.wire, bulb, sx, 3.3, sz + 0.2);
  }

  _palm(b, x, z) {
    const h = rand(6, 9);
    const lean = rand(-0.25, 0.25);
    const segs = 6;
    let cx = x, cy = 0;
    for (let i = 0; i < segs; i++) {
      const sh = h / segs;
      const g = new THREE.CylinderGeometry(0.2 - i * 0.015, 0.24 - i * 0.015, sh, 8);
      cx += lean * sh * (i / segs) * 1.2;
      b.add(this.m.trunk, g, cx, cy + sh / 2, z, 0, 0, -lean * (i / segs));
      cy += sh;
    }
    const frond = new THREE.ConeGeometry(0.5, 3.4, 4);
    frond.scale(1, 1, 0.22);
    frond.translate(0, 1.7, 0);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + rand(-0.2, 0.2);
      const g = frond.clone().rotateZ(-rand(1.75, 2.1)).rotateY(a).translate(cx, cy, z);
      b.add(this.m.frond, g);
    }
    b.add(this.m.trunk, new THREE.SphereGeometry(0.35, 8, 6), cx, cy, z);
  }

  _pine(b, x, z, s = 1) {
    b.add(this.m.trunk, new THREE.CylinderGeometry(0.2 * s, 0.25 * s, 1.4 * s, 8), x, 0.7 * s, z);
    for (let i = 0; i < 3; i++) {
      const r = (1.8 - i * 0.45) * s, hh = (2.4 - i * 0.3) * s, y = (1.4 + i * 1.3) * s;
      b.add(this.m.pine, new THREE.ConeGeometry(r, hh, 10), x, y + hh / 2, z);
      b.add(this.m.snowCap, new THREE.ConeGeometry(r * 0.55, hh * 0.45, 10), x, y + hh * 0.78, z);
    }
  }

  _cabin(b, x, z, facades) {
    const w = rand(5, 7), d = rand(5, 7), h = rand(3.5, 5);
    b.add(pick(facades), boxUV(w, h, d, 6), x, h / 2, z);
    const roof = new THREE.CylinderGeometry(w * 0.72, w * 0.72, d + 0.8, 3, 1, false, Math.PI);
    roof.rotateX(Math.PI / 2);
    roof.scale(1, 0.55, 1);
    b.add(this.m.snowCap, roof, x, h + w * 0.2, z);
    b.add(this.m.chimney, new THREE.BoxGeometry(0.7, 2, 0.7), x + w * 0.2, h + 1.4, z + d * 0.2);
  }

  _umbrella(b, x, z) {
    b.add(this.m.railing, new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), x, 1.2, z);
    b.add(pick(this.m.umbrella), new THREE.ConeGeometry(1.4, 0.6, 10), x, 2.5, z);
  }

  // ───────── 各主題路段 ─────────
  _build(type, theme) {
    const g = new THREE.Group();
    g.userData.type = type;
    g.userData.theme = theme;
    g.visible = false;
    const bk = new Bucket();
    const noCast = [this.m.ground, this.m.snow, this.m.sand, this.m.sea, this.m.ballast, this.m.sleeper, this.m.lamp, this.m.red, this.m.green];

    if (type === 'tunnel') {
      this._tracks(bk, this.m.ground);
      this._buildTunnel(g, bk);
    } else if (theme === 'city') {
      this._tracks(bk, this.m.ground);
      const station = type === 'station';
      for (const s of [-1, 1]) {
        this._wall(bk, s, station ? 4.2 : 5.4);
        this._buildings(bk, s, this.m.facades.city);
      }
      if (!station) { this._poles(bk); this._signal(bk); }
      if (type === 'bridge') this._bridge(bk);
      if (station) this._station(bk);
    } else if (theme === 'coast') {
      // 左側粉彩建築，右側海堤 + 沙灘 + 海
      this._tracks(bk, this.m.ground, { rightEdge: WALL_X + 0.6 });
      this._wall(bk, -1, 3.2);
      this._buildings(bk, -1, this.m.facades.coast, { hMin: 8, hMax: 22 });
      bk.add(this.m.concrete, boxUV(0.9, 1.2, SEG, 4), WALL_X, 0.6, -SEG / 2);
      bk.add(this.m.railing, new THREE.BoxGeometry(0.08, 0.08, SEG), WALL_X, 2.1, -SEG / 2);
      bk.add(this.m.railing, new THREE.BoxGeometry(0.06, 0.06, SEG), WALL_X, 1.65, -SEG / 2);
      for (let z = 1; z < SEG; z += 2.5) bk.add(this.m.railing, new THREE.BoxGeometry(0.07, 0.9, 0.07), WALL_X, 1.65, -z);
      bk.add(this.m.sand, groundPlane(14, SEG, 5), WALL_X + 0.45 + 7, -0.15, -SEG / 2);
      bk.add(this.m.sea, new THREE.PlaneGeometry(400, SEG).rotateX(-Math.PI / 2), WALL_X + 14.4 + 200, -0.5, -SEG / 2);
      for (let z = rand(2, 6); z < SEG; z += rand(7, 12)) this._palm(bk, WALL_X + rand(3, 11), -z);
      for (let z = rand(4, 10); z < SEG; z += rand(12, 20)) this._umbrella(bk, WALL_X + rand(4, 12), -z);
      this._poles(bk);
    } else if (theme === 'neon') {
      this._tracks(bk, this.m.ground);
      for (const s of [-1, 1]) {
        this._wall(bk, s, 5.4);
        bk.add(s < 0 ? this.m.neonPink : this.m.neonCyan, new THREE.BoxGeometry(0.12, 0.12, SEG), s * (WALL_X - 0.45), 5.1, -SEG / 2);
        bk.add(s < 0 ? this.m.neonCyan : this.m.neonPink, new THREE.BoxGeometry(0.1, 0.1, SEG), s * (WALL_X - 0.45), 1.2, -SEG / 2);
        this._buildings(bk, s, this.m.facades.neon, { hMin: 16, hMax: 44, signs: true });
      }
      this._poles(bk);
      // 路燈
      for (const z of [0, 20]) {
        for (const s of [-1, 1]) {
          const x = s * (WALL_X - 1.8);
          bk.add(this.m.pole, new THREE.CylinderGeometry(0.08, 0.1, 4.2, 8), x, 2.1, -z - 5);
          bk.add(this.m.lamp, new THREE.SphereGeometry(0.25, 10, 8), x, 4.3, -z - 5);
        }
      }
    } else if (theme === 'winter') {
      this._tracks(bk, this.m.snow);
      for (const s of [-1, 1]) {
        this._wall(bk, s, 2.6, true);
        for (let z = rand(2, 8); z < SEG; z += rand(6, 11)) this._pine(bk, s * (WALL_X + rand(2.5, 6)), -z, rand(0.8, 1.3));
        for (let z = rand(3, 15); z < SEG; z += rand(16, 24)) this._cabin(bk, s * (WALL_X + rand(11, 15)), -z, this.m.facades.winter);
        for (let z = rand(1, 8); z < SEG; z += rand(8, 14)) this._pine(bk, s * (WALL_X + rand(18, 30)), -z, rand(1.4, 2.2));
      }
      this._poles(bk, true);
    }
    bk.build(g, { noCast });
    this.root.add(g);
    return g;
  }

  _bridge(bk) {
    const z = -SEG / 2;
    bk.add(this.m.bridge, new THREE.BoxGeometry(80, 1.4, 6), 0, 11.5, z);
    bk.add(this.m.bridge, new THREE.BoxGeometry(80, 1.2, 0.3), 0, 12.8, z - 2.9);
    bk.add(this.m.bridge, new THREE.BoxGeometry(80, 1.2, 0.3), 0, 12.8, z + 2.9);
    for (let x = -39; x <= 39; x += 3) bk.add(this.m.bridge, new THREE.BoxGeometry(0.2, 1.4, 0.2), x, 12.2, z + 2.9);
    for (const s of [-1, 1]) bk.add(this.m.concrete, boxUV(2.2, 10.8, 5, 4), s * (WALL_X + 1.8), 5.4, z);
    for (let l = -1; l <= 1; l++) bk.add(this.m.lamp, new THREE.BoxGeometry(1.2, 0.1, 0.4), l * TUNING.laneWidth, 10.75, z);
  }

  _station(bk) {
    for (const s of [-1, 1]) {
      const x = s * (WALL_X - 0.2);
      for (let z = 4; z < SEG; z += 8) bk.add(this.m.pole, new THREE.BoxGeometry(0.25, 6.2, 0.25), x, 3.1, -z);
      bk.add(this.m.bridge, new THREE.BoxGeometry(5, 0.3, SEG), s * (WALL_X + 1.2), 6.3, -SEG / 2, 0, 0, s * 0.12);
      bk.add(this.m.yellow, new THREE.BoxGeometry(0.4, 0.05, SEG), s * (WALL_X - 0.25), 4.23, -SEG / 2);
      for (let z = 6; z < SEG; z += 8) bk.add(this.m.lamp, new THREE.BoxGeometry(0.6, 0.1, 1.8), s * (WALL_X + 0.6), 6.05, -z);
      for (let z = 10; z < SEG; z += 16) bk.add(this.m.bench, new THREE.BoxGeometry(0.6, 0.5, 2.6), s * (WALL_X + 1.4), 4.5, -z);
    }
  }

  _buildTunnel(g, bk) {
    const R = WALL_X + 0.6;
    const arch = new THREE.CylinderGeometry(R, R, SEG, 28, 1, true, Math.PI / 2, Math.PI);
    arch.rotateX(Math.PI / 2);
    bk.add(this.m.tunnel, arch, 0, 0.2, -SEG / 2);
    const lamp = new THREE.BoxGeometry(0.5, 0.12, 2.4);
    for (let z = 3; z < SEG; z += 6) {
      bk.add(this.m.lamp, lamp, 0, R - 0.05, -z);
      bk.add(this.m.lamp, lamp, -R * 0.72, R * 0.68, -z, 0, 0, -0.8);
      bk.add(this.m.lamp, lamp, R * 0.72, R * 0.68, -z, 0, 0, 0.8);
    }
    const meshes = bk.build(g, { noCast: [this.m.ground, this.m.ballast, this.m.lamp] });
    g.userData.roof = meshes.filter((m) => m.material === this.m.tunnel || m.material === this.m.lamp);
    // 入口門面（拱形洞口）
    const shape = new THREE.Shape();
    shape.moveTo(-40, -1); shape.lineTo(40, -1); shape.lineTo(40, 20); shape.lineTo(-40, 20); shape.closePath();
    const hole = new THREE.Path();
    hole.moveTo(R, -0.5);
    hole.lineTo(R, 0.2);
    hole.absarc(0, 0.2, R, 0, Math.PI, false);
    hole.lineTo(-R, -0.5);
    hole.closePath();
    shape.holes.push(hole);
    const portalGeo = new THREE.ExtrudeGeometry(shape, { depth: 2, bevelEnabled: false });
    const uv = portalGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 20, uv.getY(i) / 5.4);
    const portalMat = pick(this.m.walls);
    for (const zz of [-2, -SEG]) {
      const p = new THREE.Mesh(portalGeo, portalMat);
      p.position.set(0, 0, zz);
      p.castShadow = true;
      p.receiveShadow = true;
      p.frustumCulled = false;
      g.add(p);
      g.userData.roof.push(p);
    }
    const top = new Bucket();
    top.add(this.m.concrete, boxUV(80, 20, SEG - 2, 8), 0, 30, -SEG / 2);
    g.userData.roof.push(...top.build(g));
  }

  // ───────── 主題排程 ─────────
  themeIndexAt(d) {
    if (this.forceTheme != null) return this.forceTheme;
    return Math.floor(Math.max(0, d) / THEME_LEN) % THEMES.length;
  }
  themeAt(d) { return THEMES[this.themeIndexAt(d)]; }

  // 玩家所在位置的主題權重（通過隧道時漸變）
  themeWeights(d) {
    const w = { city: 0, coast: 0, neon: 0, winter: 0 };
    const cur = this.themeAt(d);
    if (this.forceTheme != null || d < THEME_LEN) { w[cur] = 1; return w; }
    const prev = THEMES[(this.themeIndexAt(d) + THEMES.length - 1) % THEMES.length];
    const t = Math.min(1, Math.max(0, (d % THEME_LEN) / SEG));
    w[prev] += 1 - t;
    w[cur] += t;
    return w;
  }

  // 噴射背包模式：隱藏隧道頂（避免飛進天花板）
  setJetMode(on) {
    this.jetMode = on;
    if (on) for (const s of this.active) if (s.userData.roof) for (const m of s.userData.roof) m.visible = false;
  }

  reset() {
    this.jetMode = false;
    for (const s of this.pool) if (s.userData.roof) for (const m of s.userData.roof) m.visible = true;
    for (const s of this.active) s.visible = false;
    this.active = [];
    this.nextD = -SEG;
    this.lastType = 'normal';
    this.update(0);
  }

  // 強制切換主題（DEV）：重建前方路段
  setForceTheme(idx, playerD) {
    this.forceTheme = idx;
    for (const s of this.active) s.visible = false;
    this.active = [];
    this.nextD = Math.floor(playerD / SEG) * SEG - SEG;
    this.update(playerD);
  }

  _pickSegment() {
    const d = this.nextD;
    const theme = this.themeAt(d);
    let type = 'normal';
    if (d > 0 && d % THEME_LEN === 0 && this.forceTheme == null) type = 'tunnel';
    else if (theme === 'city' && d > 120) {
      const r = Math.random();
      if (r < 0.07 && this.lastType !== 'tunnel') type = 'tunnel';
      else if (r < 0.2) type = 'bridge';
      else if (r < 0.28) type = 'station';
    }
    const ok = (s) => !s.visible && s.userData.type === type && (type === 'tunnel' || s.userData.theme === theme);
    let free = this.pool.filter(ok);
    if (!free.length) free = this.pool.filter((s) => !s.visible && s.userData.theme === theme);
    if (!free.length) free = this.pool.filter((s) => !s.visible);
    const s = pick(free);
    this.lastType = s.userData.type;
    return s;
  }

  update(playerD) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const s = this.active[i];
      if (s.userData.startD + SEG < playerD - 30) {
        s.visible = false;
        this.active.splice(i, 1);
      }
    }
    while (this.nextD < playerD + VIEW_AHEAD) {
      const s = this._pickSegment();
      s.userData.startD = this.nextD;
      if (s.userData.roof) for (const m of s.userData.roof) m.visible = !this.jetMode;
      s.position.z = -this.nextD;
      s.visible = true;
      this.active.push(s);
      this.nextD += SEG;
    }
  }
}
