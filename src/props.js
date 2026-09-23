import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  LIVERIES, trainSideTexture, trainFrontTextures, stripeTexture, signTexture, plateTexture, powerupIconCanvas, toTexture,
} from './textures.js';

// 障礙物與道具模型工廠（共用幾何與材質，clone 產生實例）

export const CAR_LEN = 10.5;
export const CAR_GAP = 0.6;
export const TRAIN_H = 3.6; // 車頂高度（碰撞用）
export const TRAIN_W = 2.4;
export const RAMP_LEN = 8;

const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.1, ...o });

export class Props {
  constructor() {
    this._trains();
    this._ramp();
    this._barriers();
    this._powerups();
  }

  _trains() {
    const body = new RoundedBoxGeometry(TRAIN_W, 3.0, CAR_LEN, 3, 0.3);
    this.carBody = body;
    const roof = std({ color: '#9aa3ad', metalness: 0.2, roughness: 0.6 });
    const under = std({ color: '#22252a', metalness: 0.2, roughness: 0.75 });
    // 每種塗裝：側面有/無塗鴉 + 車頭
    this.liveries = LIVERIES.map((liv) => {
      const front = trainFrontTextures(liv);
      const frontMat = std({ map: front.map, emissiveMap: front.emissiveMap, emissive: '#ffffff', emissiveIntensity: 2.2, metalness: 0.1, roughness: 0.55 });
      const sides = [false, true].map((gf) => std({ map: trainSideTexture(liv, gf), metalness: 0.1, roughness: 0.6 }));
      return sides.map((sideMat) => [sideMat, sideMat, roof, under, frontMat, frontMat]);
    });
    // 底盤 + 車輪 + 車頂冷氣
    const parts = [];
    const add = (g, x, y, z) => { g.translate(x, y, z); parts.push(g); };
    add(new THREE.BoxGeometry(TRAIN_W - 0.5, 0.5, CAR_LEN - 1.2), 0, 0.55, 0);
    for (const z of [-CAR_LEN / 2 + 1.6, CAR_LEN / 2 - 1.6]) {
      add(new THREE.BoxGeometry(1.9, 0.35, 2.4), 0, 0.42, z);
      for (const dz of [-0.75, 0.75]) {
        for (const x of [-0.72, 0.72]) {
          const w = new THREE.CylinderGeometry(0.38, 0.38, 0.18, 14);
          w.rotateZ(Math.PI / 2);
          add(w, x, 0.4, z + dz);
        }
      }
    }
    this.underGeo = mergeGeometries(parts.map((p) => p.toNonIndexed()));
    this.underMat = under;
    const acParts = [];
    for (const z of [-2.5, 2.5]) {
      const g = new RoundedBoxGeometry(1.3, 0.35, 2.2, 2, 0.1);
      g.translate(0, TRAIN_H + 0.05, z);
      acParts.push(g);
    }
    this.acGeo = mergeGeometries(acParts);
    this.acMat = std({ color: '#c4cad1', metalness: 0.15, roughness: 0.6 });
    this.bellowGeo = new THREE.BoxGeometry(1.8, 2.6, CAR_GAP + 0.4);
    // 移動列車頭燈光錐（加法混合，製造強烈光暈）
    this.beamMat = new THREE.MeshBasicMaterial({ color: '#fff3b0', transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.ConeGeometry(1.2, 9, 16, 1, true);
    beam.rotateX(-Math.PI / 2);
    beam.translate(0, 0, 4.5);
    this.beamGeo = beam;
  }

  // 建立一列火車：origin 在車頭（面向玩家 +z）地面中心
  makeTrain(cars, moving) {
    const g = new THREE.Group();
    const liv = this.liveries[(Math.random() * this.liveries.length) | 0];
    for (let i = 0; i < cars; i++) {
      const mats = liv[Math.random() < 0.45 ? 1 : 0];
      const car = new THREE.Mesh(this.carBody, mats);
      const zc = -(i * (CAR_LEN + CAR_GAP) + CAR_LEN / 2);
      car.position.set(0, 0.6 + 1.5, zc);
      car.castShadow = true;
      car.receiveShadow = true;
      g.add(car);
      const u = new THREE.Mesh(this.underGeo, this.underMat);
      u.position.z = zc;
      u.castShadow = true;
      g.add(u);
      const ac = new THREE.Mesh(this.acGeo, this.acMat);
      ac.position.set(0, -0.05, zc);
      ac.castShadow = true;
      g.add(ac);
      if (i > 0) {
        const bl = new THREE.Mesh(this.bellowGeo, this.underMat);
        bl.position.set(0, 2.1, -(i * (CAR_LEN + CAR_GAP) - CAR_GAP / 2));
        g.add(bl);
      }
    }
    if (moving) {
      for (const x of [-0.75, 0.75]) {
        const b = new THREE.Mesh(this.beamGeo, this.beamMat);
        b.position.set(x, 0.9, 0.2);
        b.rotation.x = 0.08;
        g.add(b);
      }
    }
    return g;
  }

  _ramp() {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(RAMP_LEN, TRAIN_H);
    shape.lineTo(RAMP_LEN, 0);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: TRAIN_W - 0.2, bevelEnabled: false });
    // 形狀 x → 前進方向（-z），擠出方向 → 世界 x
    geo.rotateY(Math.PI / 2);
    geo.translate(-(TRAIN_W - 0.2) / 2, 0, 0);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2.5, uv.getY(i) / 2.5);
    this.rampGeo = geo;
    const side = std({ map: stripeTexture('#ffd000', '#1b1b1b', 6), roughness: 0.6 });
    side.map.repeat.set(0.4, 1.4);
    const top = std({ map: plateTexture(), metalness: 0.25, roughness: 0.6 });
    this.rampMats = [side, top];
    // 支撐腳
    this.rampLegGeo = new THREE.BoxGeometry(0.25, 1, 0.25);
    this.rampLegMat = std({ color: '#3a3f45', metalness: 0.2 });
  }

  // 斜坡：origin 在坡底（面向玩家）
  makeRamp() {
    const g = new THREE.Group();
    const m = new THREE.Mesh(this.rampGeo, this.rampMats);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return g;
  }

  _barriers() {
    // 低欄（需跳躍）
    const redWhite = std({ map: stripeTexture('#ffffff', '#e8322b', 6), roughness: 0.5 });
    const post = std({ color: '#d9dde2', metalness: 0.2, roughness: 0.55 });
    const lamp = new THREE.MeshStandardMaterial({ color: '#ffae00', emissive: '#ff9000', emissiveIntensity: 5 });
    const hurdle = new THREE.Group();
    const board = new THREE.Mesh(new RoundedBoxGeometry(2.3, 0.55, 0.18, 2, 0.06), redWhite);
    board.position.y = 0.85;
    board.castShadow = true;
    hurdle.add(board);
    for (const x of [-1.0, 1.0]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, 0.12), post);
      leg.position.set(x, 0.5, 0);
      leg.castShadow = true;
      hurdle.add(leg);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.9), post);
      foot.position.set(x, 0.05, 0);
      hurdle.add(foot);
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), lamp);
      l.position.set(x, 1.18, 0);
      hurdle.add(l);
    }
    this.hurdle = hurdle;
    this.lampMat = lamp;

    // 高欄（需翻滾）
    const over = new THREE.Group();
    const sign = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.25, 0.2), [post, post, post, post, std({ map: signTexture(), emissive: '#ffffff', emissiveIntensity: 0.15 }), std({ map: signTexture() })]);
    sign.position.y = 1.35 + 0.625;
    sign.castShadow = true;
    over.add(sign);
    const ypost = std({ map: stripeTexture('#ffd000', '#1b1b1b', 4) });
    for (const x of [-1.15, 1.15]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.7, 0.16), ypost);
      leg.position.set(x, 1.35, 0);
      leg.castShadow = true;
      over.add(leg);
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), lamp);
      l.position.set(x, 2.75, 0);
      over.add(l);
    }
    this.overhead = over;
  }

  makeHurdle() { return this.hurdle.clone(); }
  makeOverhead() { return this.overhead.clone(); }

  _powerups() {
    this.powerupTemplates = {};
    const ringMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#7fdcff', emissiveIntensity: 2.5, metalness: 0.2, roughness: 0.3 });
    const ring = new THREE.TorusGeometry(0.72, 0.07, 10, 40);
    const disc = new THREE.CircleGeometry(0.62, 40);
    const glowMat = new THREE.MeshBasicMaterial({ color: '#8fe3ff', transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const type of ['jetpack', 'magnet', 'sneakers', 'multiplier']) {
      const tex = toTexture(powerupIconCanvas(type, 256), { repeat: false });
      const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.9, side: THREE.DoubleSide, transparent: true });
      const g = new THREE.Group();
      const inner = new THREE.Group();
      inner.add(new THREE.Mesh(disc, mat));
      inner.add(new THREE.Mesh(ring, ringMat));
      const glow = new THREE.Mesh(new THREE.CircleGeometry(1.1, 32), glowMat);
      glow.position.z = -0.02;
      inner.add(glow);
      g.add(inner);
      g.userData.inner = inner;
      this.powerupTemplates[type] = g;
    }
  }

  makePowerup(type) {
    const g = this.powerupTemplates[type].clone();
    g.userData.inner = g.children[0];
    return g;
  }
}
