import * as THREE from 'three';
import { TUNING } from './config.js';
import { Props, CAR_LEN, CAR_GAP, TRAIN_H, RAMP_LEN } from './props.js';

// 關卡生成：障礙物、金幣、道具的配置與查詢

const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

export const laneX = (l) => (l - 1) * TUNING.laneWidth;

const MAX_COINS = 500;

export class Level {
  constructor(scene) {
    this.scene = scene;
    this.props = new Props();
    this.group = new THREE.Group();
    scene.add(this.group);
    this.obstacles = [];
    this.powerups = [];
    this.coins = [];

    // 金幣：InstancedMesh（全部同步旋轉）
    const coinGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.1, 28);
    coinGeo.rotateX(Math.PI / 2);
    const coinMat = new THREE.MeshStandardMaterial({ color: '#ffc629', metalness: 1, roughness: 0.22, emissive: '#ff9d00', emissiveIntensity: 0.55 });
    this.coinMesh = new THREE.InstancedMesh(coinGeo, coinMat, MAX_COINS);
    this.coinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.coinMesh.frustumCulled = false;
    this.coinMesh.castShadow = false;
    scene.add(this.coinMesh);
    // 金幣內圈（浮雕效果）
    const innerGeo = new THREE.TorusGeometry(0.3, 0.035, 6, 24);
    this.coinInner = new THREE.InstancedMesh(innerGeo, coinMat, MAX_COINS);
    this.coinInner.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.coinInner.frustumCulled = false;
    scene.add(this.coinInner);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
    this._zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this.coinSpin = 0;
  }

  reset() {
    for (const o of this.obstacles) this.group.remove(o.mesh);
    for (const p of this.powerups) this.group.remove(p.mesh);
    this.obstacles = [];
    this.powerups = [];
    this.coins = [];
    this.nextD = 50;
    this.difficulty = 0;
    this.lastPattern = '';
    // 起跑的金幣
    this.addCoinsLine(1, 18, 8);
  }

  // ───────── 放置 API ─────────
  addTrain(lane, d0, cars, { moving = false, ramp = false } = {}) {
    let start = d0;
    if (ramp) {
      const r = this.props.makeRamp();
      r.position.set(laneX(lane), 0, -d0);
      this.group.add(r);
      this.obstacles.push({ kind: 'ramp', lane, d0, d1: d0 + RAMP_LEN, top: TRAIN_H, mesh: r, prevD0: d0 });
      start = d0 + RAMP_LEN;
    }
    const len = cars * CAR_LEN + (cars - 1) * CAR_GAP;
    const mesh = this.props.makeTrain(cars, moving);
    mesh.position.set(laneX(lane), 0, -start);
    this.group.add(mesh);
    const o = { kind: 'train', lane, d0: start, d1: start + len, top: TRAIN_H, mesh, moving, active: false, prevD0: start, horned: false };
    this.obstacles.push(o);
    return o;
  }

  addHurdle(lane, d) {
    const mesh = this.props.makeHurdle();
    mesh.position.set(laneX(lane), 0, -d);
    this.group.add(mesh);
    this.obstacles.push({ kind: 'hurdle', lane, d0: d - 0.15, d1: d + 0.15, top: 1.15, mesh, prevD0: d - 0.15 });
  }

  addOverhead(lane, d) {
    const mesh = this.props.makeOverhead();
    mesh.position.set(laneX(lane), 0, -d);
    this.group.add(mesh);
    this.obstacles.push({ kind: 'overhead', lane, d0: d - 0.15, d1: d + 0.15, bottom: 1.35, top: 2.7, mesh, prevD0: d - 0.15 });
  }

  addCoin(x, y, d) {
    if (this.coins.length >= MAX_COINS) return;
    this.coins.push({ x, y, d, alive: true, attract: false });
  }

  addCoinsLine(lane, d0, count, spacing = 2.6, y = 1.0) {
    for (let i = 0; i < count; i++) this.addCoin(laneX(lane), y, d0 + i * spacing);
  }

  // 跳躍弧線金幣（依當前速度計算）
  addCoinArc(lane, dCenter, speed, baseY = 0) {
    const v = TUNING.jumpVelocity, g = TUNING.gravity;
    const T = (2 * v) / g;
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * T;
      const y = baseY + v * t - 0.5 * g * t * t + 1.0;
      this.addCoin(laneX(lane), y, dCenter - (speed * T) / 2 + speed * t);
    }
  }

  addPowerup(type, lane, d, y = 1.3) {
    const mesh = this.props.makePowerup(type);
    mesh.position.set(laneX(lane), y, -d);
    this.group.add(mesh);
    this.powerups.push({ type, lane, d, y, mesh, alive: true });
  }

  // ───────── 關卡模式 ─────────
  generate(playerD, speed, t, active) {
    this.difficulty = t;
    while (this.nextD < playerD + TUNING.spawnAhead) {
      const len = this._pattern(this.nextD, speed, t, active);
      this.nextD += len + Math.max(12, speed * 0.62) + rand(0, 6) * (1 - t);
    }
  }

  _pattern(d, speed, t, active) {
    const opts = [
      ['coins', 1.2 - t * 0.8],
      ['barriers', 1.2],
      ['trains', 1.4],
      ['wall', 0.5 + t * 0.8],
      ['moving', 0.25 + t * 1.1],
      ['slalom', 0.3 + t * 0.9],
      ['mixed', 0.4 + t],
    ];
    let total = opts.reduce((s, o) => s + o[1], 0);
    let r = Math.random() * total;
    let name = 'coins';
    for (const [n, w] of opts) { r -= w; if (r <= 0) { name = n; break; } }
    if (name === this.lastPattern && name !== 'trains') name = 'barriers';
    this.lastPattern = name;
    const len = this['_p_' + name](d, speed, t);
    // 機率放置道具
    if (Math.random() < TUNING.powerupChance && d > 150) this._placePowerup(d - 8, active);
    return len;
  }

  _placePowerup(d, active) {
    const types = ['magnet', 'jetpack', 'sneakers', 'multiplier'].filter((k) => !active[k]);
    if (!types.length) return;
    // 找一條在 d 附近沒有障礙物的軌道
    const lanes = shuffle([0, 1, 2]);
    for (const l of lanes) {
      if (!this._laneBlocked(l, d - 4, d + 4)) {
        this.addPowerup(pick(types), l, d);
        return;
      }
    }
  }

  _laneBlocked(l, a, b) {
    return this.obstacles.some((o) => o.lane === l && o.d1 >= a && o.d0 <= b);
  }

  _p_coins(d) {
    const l = randi(0, 2);
    this.addCoinsLine(l, d, 10);
    return 26;
  }

  _p_barriers(d, speed, t) {
    const lanes = [0, 1, 2];
    const kinds = lanes.map(() => pick(['hurdle', 'overhead', 'none', t > 0.3 ? 'hurdle' : 'none']));
    if (kinds.every((k) => k === 'none')) kinds[randi(0, 2)] = pick(['hurdle', 'overhead']);
    kinds.forEach((k, l) => {
      if (k === 'hurdle') { this.addHurdle(l, d); if (Math.random() < 0.6) this.addCoinArc(l, d, speed); }
      else if (k === 'overhead') { this.addOverhead(l, d); if (Math.random() < 0.5) this.addCoinsLine(l, d - 5, 5, 2.5, 0.7); }
      else if (Math.random() < 0.5) this.addCoinsLine(l, d - 8, 7);
    });
    return 4;
  }

  _p_trains(d, speed, t) {
    const n = Math.random() < 0.5 ? 1 : 2;
    const lanes = shuffle([0, 1, 2]);
    let end = d;
    for (let i = 0; i < n; i++) {
      const l = lanes[i];
      const ramp = Math.random() < 0.35;
      const cars = randi(1, 3);
      const o = this.addTrain(l, d + rand(0, 6), cars, { ramp });
      if (ramp && Math.random() < 0.8) this.addCoinsLine(l, o.d0 + 1, Math.floor((o.d1 - o.d0) / 2.8), 2.8, TRAIN_H + 1);
      end = Math.max(end, o.d1);
    }
    const free = lanes[n];
    if (t > 0.35 && Math.random() < 0.5) {
      const bd = d + rand(5, 15);
      Math.random() < 0.5 ? this.addHurdle(free, bd) : this.addOverhead(free, bd);
    } else {
      this.addCoinsLine(free, d, 8);
    }
    return end - d;
  }

  _p_wall(d) {
    // 三條軌道都有火車，其中一條有斜坡 → 必須爬上車頂
    const rampLane = randi(0, 2);
    let end = d;
    for (let l = 0; l < 3; l++) {
      const cars = randi(2, 3);
      const off = l === rampLane ? 0 : rand(4, 10);
      const o = this.addTrain(l, d + off, cars, { ramp: l === rampLane });
      if (l === rampLane) this.addCoinsLine(l, d + 2, Math.floor((o.d1 - d - 2) / 2.8), 2.8, 1.0);
      end = Math.max(end, o.d1);
    }
    // 修正坡道金幣高度：沿坡度上升
    for (const c of this.coins) {
      if (c.d >= d && c.d <= d + RAMP_LEN && Math.abs(c.x - laneX(rampLane)) < 0.1) c.y = 1.0 + (TRAIN_H * (c.d - d)) / RAMP_LEN;
      else if (c.d > d + RAMP_LEN && c.d <= end && Math.abs(c.x - laneX(rampLane)) < 0.1 && c.y < TRAIN_H) c.y = TRAIN_H + 1;
    }
    return end - d;
  }

  _p_moving(d, speed, t) {
    const ml = randi(0, 2);
    const others = [0, 1, 2].filter((l) => l !== ml);
    const cars = randi(2, 3);
    const mo = this.addTrain(ml, d + 55, cars, { moving: true });
    // 其他軌道：一條靜止火車、一條金幣或欄杆
    const sl = pick(others);
    const fl = others.find((l) => l !== sl);
    if (Math.random() < 0.7) {
      const o = this.addTrain(sl, d + rand(0, 10), randi(1, 2), { ramp: Math.random() < 0.3 });
      void o;
    }
    if (t > 0.4 && Math.random() < 0.5) this.addHurdle(fl, d + rand(10, 30));
    else this.addCoinsLine(fl, d + 5, 10);
    return mo.d1 - d;
  }

  _p_slalom(d, speed) {
    // 連續三排，每排只留一條可通過
    let open = randi(0, 2);
    for (let i = 0; i < 3; i++) {
      const rd = d + i * Math.max(14, speed * 0.55);
      for (let l = 0; l < 3; l++) {
        if (l === open) { this.addCoinsLine(l, rd - 4, 3); continue; }
        Math.random() < 0.5 ? this.addHurdle(l, rd) : this.addOverhead(l, rd);
      }
      const choices = [0, 1, 2].filter((l) => Math.abs(l - open) === 1);
      open = pick(choices);
    }
    return 2 * Math.max(14, speed * 0.55) + 2;
  }

  _p_mixed(d, speed) {
    // 一條火車 + 另兩條分別需跳 / 滾
    const lanes = shuffle([0, 1, 2]);
    const o = this.addTrain(lanes[0], d, randi(1, 3), { ramp: Math.random() < 0.4 });
    this.addHurdle(lanes[1], d + 6);
    this.addCoinArc(lanes[1], d + 6, speed);
    this.addOverhead(lanes[2], d + 12);
    this.addCoinsLine(lanes[2], d + 20, 6);
    return Math.max(o.d1 - d, 20);
  }

  // 噴射背包空中金幣
  addAirCoins(fromD, toD, height) {
    let lane = 1;
    for (let d = fromD; d < toD; d += 2.4) {
      if (Math.random() < 0.08) lane = Math.max(0, Math.min(2, lane + (Math.random() < 0.5 ? -1 : 1)));
      this.addCoin(laneX(lane), height + 0.6, d);
    }
  }

  // 清除範圍內障礙（噴射背包降落用）
  clearRange(a, b, onRemove) {
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      if (o.d1 >= a && o.d0 <= b) {
        if (onRemove) onRemove(o);
        this.group.remove(o.mesh);
        this.obstacles.splice(i, 1);
      }
    }
  }

  // ───────── 更新與查詢 ─────────
  update(dt, playerD, speed, audio) {
    // 移動列車
    for (const o of this.obstacles) {
      o.prevD0 = o.d0;
      if (o.moving) {
        if (!o.active && o.d0 - playerD < 115) {
          o.active = true;
        }
        if (o.active) {
          const dd = TUNING.trainSpeed * dt;
          o.d0 -= dd;
          o.d1 -= dd;
          o.mesh.position.z = -o.d0;
          if (!o.horned && o.d0 - playerD < 60) {
            o.horned = true;
            audio?.horn(1);
          }
        }
      }
    }
    // 回收
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      if (o.d1 < playerD - 25) {
        this.group.remove(o.mesh);
        this.obstacles.splice(i, 1);
      }
    }
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const p = this.powerups[i];
      if (!p.alive || p.d < playerD - 10) {
        this.group.remove(p.mesh);
        this.powerups.splice(i, 1);
        continue;
      }
      p.mesh.userData.inner.rotation.y += dt * 2.5;
      p.mesh.position.y = p.y + Math.sin(performance.now() * 0.004 + p.d) * 0.15;
    }
    this.coins = this.coins.filter((c) => c.alive && c.d > playerD - 8);
  }

  // 更新金幣實例矩陣
  syncCoins(dt) {
    this.coinSpin += dt * 3.2;
    this._q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.coinSpin);
    let i = 0;
    for (const c of this.coins) {
      if (!c.alive) continue;
      this._p.set(c.x, c.y, -c.d);
      this._m.compose(this._p, this._q, this._s);
      this.coinMesh.setMatrixAt(i, this._m);
      this.coinInner.setMatrixAt(i, this._m);
      i++;
    }
    this.coinMesh.count = i;
    this.coinInner.count = i;
    this.coinMesh.instanceMatrix.needsUpdate = true;
    this.coinInner.instanceMatrix.needsUpdate = true;
  }

  // 玩家腳下表面高度（車頂 / 斜坡）
  surfaceAt(x, d) {
    let s = 0;
    for (const o of this.obstacles) {
      if (o.kind !== 'train' && o.kind !== 'ramp') continue;
      if (Math.abs(x - laneX(o.lane)) > 1.4) continue;
      if (o.kind === 'train') {
        if (d >= o.d0 - 0.3 && d <= o.d1 + 0.3) s = Math.max(s, o.top);
      } else if (d >= o.d0 && d <= o.d1 + 0.3) {
        s = Math.max(s, Math.min(o.top, (o.top * (d - o.d0)) / RAMP_LEN));
      }
    }
    return s;
  }
}
