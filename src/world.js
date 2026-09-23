import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TUNING } from './config.js';
import { gravelTexture, graffitiWallTexture, facadeTextures } from './textures.js';

// 軌道環境：以固定長度路段循環拼接（鐵軌、塗鴉牆、大樓、電線桿、橋、隧道）

export const SEG = 40;
export const WALL_X = 8.2;
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
    for (const [mat, geos] of this.map) {
      let list = geos;
      if (list.some((g) => !g.index)) list = list.map((g) => (g.index ? g.toNonIndexed() : g));
      const merged = mergeGeometries(list, false);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = cast && !noCast.includes(mat);
      mesh.receiveShadow = receive;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
      list.forEach((g) => g.dispose());
    }
    this.map.clear();
  }
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this._makeMaterials();
    this.pool = [];
    for (let i = 0; i < 11; i++) this.pool.push(this._build('normal'));
    for (let i = 0; i < 3; i++) this.pool.push(this._build('bridge'));
    for (let i = 0; i < 3; i++) this.pool.push(this._build('tunnel'));
    for (let i = 0; i < 2; i++) this.pool.push(this._build('station'));
    this.active = [];
    this.nextD = 0;
  }

  _makeMaterials() {
    const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...o });
    this.m = {
      ground: std({ map: gravelTexture(false) }),
      ballast: std({ map: gravelTexture(true) }),
      sleeper: std({ color: '#5e3d28', roughness: 0.95 }),
      rail: std({ color: '#6f757b', metalness: 0.6, roughness: 0.55 }),
      railBase: std({ color: '#5a4a3e', metalness: 0.5, roughness: 0.6 }),
      walls: Array.from({ length: 7 }, () => std({ map: graffitiWallTexture() })),
      cap: std({ color: '#77736d' }),
      facades: [0, 1, 2, 3].map((i) => {
        const t = facadeTextures(i);
        return std({ map: t.map, emissiveMap: t.emissiveMap, emissive: '#ffd08a', emissiveIntensity: 0.9, roughness: 0.75 });
      }),
      roof: std({ color: '#55524e' }),
      pole: std({ color: '#3a4048', metalness: 0.6, roughness: 0.45 }),
      wire: std({ color: '#161616', roughness: 0.6 }),
      bridge: std({ color: '#2f6fa8', metalness: 0.4, roughness: 0.5 }),
      concrete: std({ color: '#8d8880' }),
      tunnel: std({ color: '#6c6861', side: THREE.BackSide, roughness: 0.95 }),
      lamp: new THREE.MeshStandardMaterial({ color: '#fff4cc', emissive: '#fff0c0', emissiveIntensity: 3.5 }),
      red: new THREE.MeshStandardMaterial({ color: '#ff2a2a', emissive: '#ff1a1a', emissiveIntensity: 4 }),
      green: new THREE.MeshStandardMaterial({ color: '#2aff6a', emissive: '#1aff5a', emissiveIntensity: 4 }),
      wood: std({ color: '#8a5a32' }),
      tank: std({ color: '#9a6a3c', roughness: 0.9 }),
      platform: std({ color: '#b9b2a5' }),
      yellow: std({ color: '#ffd21a', roughness: 0.6 }),
      bench: std({ color: '#2d6bd6', roughness: 0.5 }),
      ac: std({ color: '#b7bcc2', metalness: 0.3, roughness: 0.5 }),
    };
    // 碎石 UV 以 4m 一格
    this.m.ground.map.repeat.set(1, 1);
  }

  _tracks(b) {
    const lw = TUNING.laneWidth;
    const ground = new THREE.PlaneGeometry(70, SEG);
    ground.rotateX(-Math.PI / 2);
    const uv = ground.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * 70) / 6, (uv.getY(i) * SEG) / 6);
    b.add(this.m.ground, ground, 0, 0, -SEG / 2);
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

  _walls(b, height = 5.4) {
    const wall = boxUV(0.8, height, SEG, 20, height);
    const cap = new THREE.BoxGeometry(1.1, 0.3, SEG);
    for (const side of [-1, 1]) {
      b.add(pick(this.m.walls), wall, side * WALL_X, height / 2, -SEG / 2);
      b.add(this.m.cap, cap, side * WALL_X, height + 0.15, -SEG / 2);
    }
  }

  _buildings(b) {
    for (const side of [-1, 1]) {
      let z = 0;
      while (z < SEG) {
        const dz = Math.min(rand(9, 16), SEG - z);
        if (dz < 3) break;
        const wx = rand(9, 16);
        const h = rand(12, 38);
        const x = side * (WALL_X + 1.5 + wx / 2 + rand(0, 3));
        const geo = boxUV(wx, h, dz - 0.4, 8);
        b.add(pick(this.m.facades), geo, x, h / 2, -(z + dz / 2));
        b.add(this.m.roof, new THREE.BoxGeometry(wx + 0.4, 0.5, dz), x, h + 0.25, -(z + dz / 2));
        // 屋頂水塔（紐約風）
        if (Math.random() < 0.35) {
          const tx = x + rand(-2, 2), tz = -(z + dz / 2);
          const tank = new THREE.CylinderGeometry(1.3, 1.3, 2.6, 12);
          b.add(this.m.tank, tank, tx, h + 2.8, tz);
          b.add(this.m.roof, new THREE.ConeGeometry(1.5, 1.1, 12), tx, h + 4.65, tz);
          const leg = new THREE.BoxGeometry(0.15, 1.5, 0.15);
          for (const [lx, lz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) b.add(this.m.pole, leg, tx + lx, h + 0.75, tz + lz);
        } else if (Math.random() < 0.5) {
          b.add(this.m.ac, new THREE.BoxGeometry(2, 1.2, 1.6), x + rand(-2, 2), h + 1.1, -(z + dz / 2) + rand(-2, 2));
        }
        z += dz;
      }
    }
  }

  _poles(b) {
    // 高架門型電桿（高於相機，避免擋視線）
    const px = WALL_X - 1.3;
    const pole = new THREE.BoxGeometry(0.3, 10.2, 0.3);
    const beam = new THREE.BoxGeometry(px * 2 + 0.4, 0.35, 0.35);
    const insul = new THREE.CylinderGeometry(0.09, 0.09, 0.4, 8);
    for (const z of [10, 30]) {
      b.add(this.m.pole, pole, -px, 5.1, -z);
      b.add(this.m.pole, pole, px, 5.1, -z);
      b.add(this.m.pole, beam, 0, 10.1, -z);
      for (let l = -1; l <= 1; l++) b.add(this.m.wire, insul, l * TUNING.laneWidth, 9.75, -z);
    }
    // 號誌燈
    if (Math.random() < 0.6) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const sx = side * (WALL_X - 2.2), sz = -rand(3, SEG - 3);
      b.add(this.m.pole, new THREE.BoxGeometry(0.16, 3.2, 0.16), sx, 1.6, sz);
      b.add(this.m.wire, new THREE.BoxGeometry(0.5, 1.1, 0.4), sx, 3.5, sz);
      const bulb = new THREE.SphereGeometry(0.13, 10, 8);
      b.add(Math.random() < 0.5 ? this.m.red : this.m.green, bulb, sx, 3.75, sz + 0.2);
      b.add(this.m.wire, bulb, sx, 3.3, sz + 0.2);
    }
  }

  _build(type) {
    const g = new THREE.Group();
    g.userData.type = type;
    g.visible = false;
    const bk = new Bucket();
    this._tracks(bk);
    if (type === 'tunnel') {
      const R = WALL_X + 0.6;
      const arch = new THREE.CylinderGeometry(R, R, SEG, 28, 1, true, Math.PI / 2, Math.PI);
      arch.rotateX(Math.PI / 2);
      bk.add(this.m.tunnel, arch, 0, 0.2, -SEG / 2);
      // 天花板燈條
      const lamp = new THREE.BoxGeometry(0.5, 0.12, 2.4);
      for (let z = 3; z < SEG; z += 6) {
        bk.add(this.m.lamp, lamp, 0, R - 0.05, -z);
        bk.add(this.m.lamp, lamp, -R * 0.72, R * 0.68, -z, 0, 0, -0.8);
        bk.add(this.m.lamp, lamp, R * 0.72, R * 0.68, -z, 0, 0, 0.8);
      }
      const before = g.children.length;
      bk.build(g, { noCast: [this.m.ground, this.m.ballast, this.m.lamp] });
      g.userData.roof = g.children.slice(before).filter((m) => m.material === this.m.tunnel || m.material === this.m.lamp);
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
      const portalMat = this.m.walls[(Math.random() * this.m.walls.length) | 0];
      // 拱門貼圖以 20m 一張
      const uv = portalGeo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 20, uv.getY(i) / 5.4);
      for (const zz of [0, -SEG]) {
        const p = new THREE.Mesh(portalGeo, portalMat);
        p.position.set(0, 0, zz === 0 ? -2 : -SEG);
        p.castShadow = true;
        p.receiveShadow = true;
        g.add(p);
        g.userData.roof.push(p);
      }
      // 洞口上方的大樓
      const top = new Bucket();
      top.add(pick(this.m.facades), boxUV(80, 20, SEG - 2, 8), 0, 30, -SEG / 2);
      const nb = g.children.length;
      top.build(g);
      g.userData.roof.push(...g.children.slice(nb));
    } else {
      const station = type === 'station';
      this._walls(bk, station ? 4.2 : 5.4);
      this._buildings(bk);
      if (!station) this._poles(bk);
      if (type === 'bridge') {
        const z = -SEG / 2;
        bk.add(this.m.bridge, new THREE.BoxGeometry(80, 1.4, 6), 0, 11.5, z);
        bk.add(this.m.bridge, new THREE.BoxGeometry(80, 1.2, 0.3), 0, 12.8, z - 2.9);
        bk.add(this.m.bridge, new THREE.BoxGeometry(80, 1.2, 0.3), 0, 12.8, z + 2.9);
        for (let x = -39; x <= 39; x += 3) {
          bk.add(this.m.bridge, new THREE.BoxGeometry(0.2, 1.4, 0.2), x, 12.2, z + 2.9);
        }
        for (const s of [-1, 1]) bk.add(this.m.concrete, boxUV(2.2, 10.8, 5, 4), s * (WALL_X + 1.8), 5.4, z);
        // 橋下燈
        for (let l = -1; l <= 1; l++) bk.add(this.m.lamp, new THREE.BoxGeometry(1.2, 0.1, 0.4), l * TUNING.laneWidth, 10.75, z);
      }
      if (station) {
        // 月台雨棚
        for (const s of [-1, 1]) {
          const x = s * (WALL_X - 0.2);
          for (let z = 4; z < SEG; z += 8) {
            bk.add(this.m.pole, new THREE.BoxGeometry(0.25, 6.2, 0.25), x, 3.1, -z);
          }
          bk.add(this.m.bridge, new THREE.BoxGeometry(5, 0.3, SEG), s * (WALL_X + 1.2), 6.3, -SEG / 2, 0, 0, s * 0.12);
          bk.add(this.m.yellow, new THREE.BoxGeometry(0.4, 0.05, SEG), s * (WALL_X - 0.25), 4.23, -SEG / 2);
          for (let z = 6; z < SEG; z += 8) bk.add(this.m.lamp, new THREE.BoxGeometry(0.6, 0.1, 1.8), s * (WALL_X + 0.6), 6.05, -z);
          for (let z = 10; z < SEG; z += 16) bk.add(this.m.bench, new THREE.BoxGeometry(0.6, 0.5, 2.6), s * (WALL_X + 1.4), 4.5, -z);
        }
      }
      bk.build(g, { noCast: [this.m.ground, this.m.ballast, this.m.sleeper, this.m.lamp, this.m.red, this.m.green] });
    }
    this.root.add(g);
    return g;
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

  _pickSegment() {
    let type = 'normal';
    const r = Math.random();
    if (this.nextD > 120) {
      if (r < 0.1 && this.lastType !== 'tunnel') type = 'tunnel';
      else if (r < 0.22) type = 'bridge';
      else if (r < 0.3) type = 'station';
    }
    let free = this.pool.filter((s) => !s.visible && s.userData.type === type);
    if (!free.length) free = this.pool.filter((s) => !s.visible && s.userData.type === 'normal');
    if (!free.length) free = this.pool.filter((s) => !s.visible);
    const s = pick(free);
    this.lastType = s.userData.type;
    return s;
  }

  update(playerD) {
    // 回收後方路段
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

  // 判斷某距離是否位於隧道內（用於音效/光線）
  inTunnel(d) {
    for (const s of this.active) {
      if (s.userData.type === 'tunnel' && d >= s.userData.startD && d <= s.userData.startD + SEG) return true;
    }
    return false;
  }
}
