import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// GLB 骨骼動畫角色（Quaternius CC0 模型）
// 介面與程序化 Humanoid / Dog 相容：root / rig / torso / shoeMat / apply(pose) / runPose()

const BASE = import.meta.env.BASE_URL + 'models/';

export async function loadModels() {
  const loader = new GLTFLoader();
  const get = (f) => loader.loadAsync(BASE + f);
  const [hoodie, worker, shiba] = await Promise.all([get('hoodie.glb'), get('worker.glb'), get('shiba.glb')]);
  return { hoodie, worker, shiba };
}

function clipMap(gltf) {
  const m = {};
  for (const c of gltf.animations) m[c.name.split('|').pop()] = c;
  return m;
}

// 依材質名稱重新上色
function recolor(root, colors) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = false;
    o.frustumCulled = false;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const out = mats.map((m) => {
      const c = m.clone();
      if (colors[m.name]) c.color.set(colors[m.name]);
      c.roughness = 0.65;
      c.metalness = 0;
      return c;
    });
    o.material = Array.isArray(o.material) ? out : out[0];
  });
}

// 量測並縮放到指定高度，腳底對齊 y=0
function normalize(model, height, axis = 'y') {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model, true);
  const size = box.getSize(new THREE.Vector3());
  const s = height / (axis === 'y' ? size.y : size.z);
  model.scale.multiplyScalar(s);
  model.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(model, true);
  model.position.y -= b2.min.y;
  return b2.getSize(new THREE.Vector3());
}

export class ModelHumanoid {
  constructor(gltf, { height = 1.9, colors = {}, guard = false } = {}) {
    this.isModel = true;
    this.guard = guard;
    this.root = new THREE.Group();
    this.rig = new THREE.Group();
    this.root.add(this.rig);
    const model = gltf.scene;
    recolor(model, colors);
    // glTF 面向 +Z，遊戲前進方向為 -Z
    model.rotation.y = Math.PI;
    const size = normalize(model, height);
    // rig 樞紐放在身體中心（翻滾 / 倒地旋轉用）
    this.center = size.y * 0.5;
    this.rig.position.y = this.center;
    model.position.y -= this.center;
    this.rig.add(model);
    this.model = model;
    // 背部掛點（噴射背包）
    this.torso = new THREE.Group();
    this.torso.position.set(0, size.y * 0.1, 0);
    this.rig.add(this.torso);
    // 鞋子材質（超級球鞋發光）
    this.shoeMat = new THREE.MeshStandardMaterial();
    model.traverse((o) => {
      if (o.isMesh && /Feet/i.test(o.name)) {
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        this.shoeMat = m;
      }
    });
    this.mixer = new THREE.AnimationMixer(model);
    this.clips = clipMap(gltf);
    this.actions = {};
    for (const [k, c] of Object.entries(this.clips)) this.actions[k] = this.mixer.clipAction(c);
    for (const k of ['Death', 'HitRecieve', 'Roll', 'Punch_Right']) {
      const a = this.actions[k];
      if (a) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    }
    this.current = null;
    this.play('Idle');
  }

  play(name, fade = 0.18, timeScale = 1) {
    const a = this.actions[name];
    if (!a) return;
    a.timeScale = timeScale;
    if (this.current === name) return;
    const prev = this.actions[this.current];
    a.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (prev) prev.fadeOut(fade);
    this.current = name;
  }

  // 與程序化角色相容：pose.anim 決定動畫
  apply(pose) {
    if (!pose.anim) return;
    const fade = pose.anim === 'Roll' ? 0.08 : 0.18;
    // 連續翻滾：單次動畫播完後重播
    if (pose.anim === this.current && pose.anim === 'Roll' && !this.actions.Roll.isRunning()) this.actions.Roll.reset().play();
    this.play(pose.anim, fade, pose.timeScale ?? 1);
    if (this.actions[pose.anim]) this.actions[pose.anim].timeScale = pose.timeScale ?? 1;
  }

  runPose(phase, amt = 1, speed = 22) { return { anim: 'Run', timeScale: Math.max(0.8, speed / 22) }; }

  update(dt) { this.mixer.update(dt); }
}

export class ModelDog {
  constructor(gltf, { length = 1.1 } = {}) {
    this.root = new THREE.Group();
    const model = gltf.scene;
    recolor(model, {});
    model.rotation.y = Math.PI;
    normalize(model, length, 'y');
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    const clips = clipMap(gltf);
    this.actions = {};
    for (const [k, c] of Object.entries(clips)) this.actions[k] = this.mixer.clipAction(c);
    this.current = null;
    this._last = performance.now();
    this._set('Idle');
  }
  _set(name) {
    if (this.current === name || !this.actions[name]) return;
    this.actions[name].reset().fadeIn(0.2).play();
    this.actions[this.current]?.fadeOut(0.2);
    this.current = name;
  }
  animate(t, running = true) {
    this._set(running ? 'Gallop' : 'Idle');
    const now = performance.now();
    const dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    this.mixer.update(dt);
  }
}
