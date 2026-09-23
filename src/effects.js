import * as THREE from 'three';
import { BEND, BEND_GLSL } from './bend.js';

// 粒子系統（CPU 模擬、GPU 繪製）
export class Particles {
  constructor(scene, max = 1500, additive = true) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('psize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('palpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 }, uBend: BEND },
      vertexShader: /* glsl */`
        attribute vec3 pcolor; attribute float psize; attribute float palpha;
        uniform float uScale;
        uniform vec3 uBend;
        ${BEND_GLSL}
        varying vec3 vColor; varying float vAlpha;
        void main(){
          vec4 mv = viewMatrix * bendApply(modelMatrix * vec4(position, 1.0));
          gl_PointSize = psize * uScale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
          vColor = pcolor; vAlpha = palpha;
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vColor; varying float vAlpha;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          a = a * a * vAlpha;
          if (a < 0.003) discard;
          gl_FragColor = vec4(vColor * a, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    if (!additive) {
      this.mat.fragmentShader = this.mat.fragmentShader.replace('gl_FragColor = vec4(vColor * a, a);', 'gl_FragColor = vec4(vColor, a);');
    }
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this._c = new THREE.Color();
  }

  setScale(h) { this.mat.uniforms.uScale.value = h * 0.9; }

  emit(o) {
    const {
      x = 0, y = 0, z = 0, count = 10, spread = 0.3, vx = 0, vy = 0, vz = 0, vs = 2, color = '#ffffff', colorVar = 0,
      size = 0.3, sizeEnd = 0, life = 0.8, lifeVar = 0.3, gravity = 0, drag = 0.5, intensity = 1,
    } = o;
    this._c.set(color);
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      const i3 = i * 3;
      this.pos[i3] = x + (Math.random() - 0.5) * spread * 2;
      this.pos[i3 + 1] = y + (Math.random() - 0.5) * spread * 2;
      this.pos[i3 + 2] = z + (Math.random() - 0.5) * spread * 2;
      // 球狀隨機方向
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      const sp = vs * (0.4 + Math.random() * 0.6);
      this.vel[i3] = vx + r * Math.cos(th) * sp;
      this.vel[i3 + 1] = vy + u * sp;
      this.vel[i3 + 2] = vz + r * Math.sin(th) * sp;
      const cv = 1 - Math.random() * colorVar;
      this.col[i3] = this._c.r * cv * intensity;
      this.col[i3 + 1] = this._c.g * cv * intensity;
      this.col[i3 + 2] = this._c.b * cv * intensity;
      const l = life * (1 - lifeVar + Math.random() * lifeVar * 2);
      this.life[i] = l;
      this.maxLife[i] = l;
      this.s0[i] = size * (0.7 + Math.random() * 0.6);
      this.s1[i] = sizeEnd;
      this.grav[i] = gravity;
      this.drag[i] = drag;
    }
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const i3 = i * 3;
      const k = Math.exp(-this.drag[i] * dt);
      this.vel[i3] *= k; this.vel[i3 + 1] = this.vel[i3 + 1] * k - this.grav[i] * dt; this.vel[i3 + 2] *= k;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.size[i] = this.s1[i] + (this.s0[i] - this.s1[i]) * t;
      this.alpha[i] = Math.min(1, t * 2.5);
    }
    const a = this.geo.attributes;
    a.position.needsUpdate = true;
    a.pcolor.needsUpdate = true;
    a.psize.needsUpdate = true;
    a.palpha.needsUpdate = true;
  }

  clear() { this.life.fill(0); this.alpha.fill(0); }
}

// 速度線（掛在相機上）
export class SpeedLines {
  constructor(camera, n = 70) {
    this.n = n;
    const pos = new Float32Array(n * 6);
    this.data = [];
    for (let i = 0; i < n; i++) this.data.push(this._spawn({}, true));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo = geo;
    this.mat = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
    this.lines = new THREE.LineSegments(geo, this.mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 10;
    camera.add(this.lines);
    this.intensity = 0;
  }
  _spawn(d, init) {
    const a = Math.random() * Math.PI * 2;
    const r = 1.4 + Math.random() * 2.2;
    d.x = Math.cos(a) * r;
    d.y = Math.sin(a) * r * 0.7;
    d.z = init ? -Math.random() * 30 - 2 : -30 - Math.random() * 6;
    d.len = 1.5 + Math.random() * 3.5;
    return d;
  }
  update(dt, intensity, speed) {
    this.intensity += (intensity - this.intensity) * Math.min(1, dt * 5);
    this.mat.opacity = this.intensity * 0.55;
    this.lines.visible = this.intensity > 0.01;
    if (!this.lines.visible) return;
    const p = this.geo.attributes.position.array;
    for (let i = 0; i < this.n; i++) {
      const d = this.data[i];
      d.z += speed * 2.2 * dt;
      if (d.z > 0) this._spawn(d, false);
      p[i * 6] = d.x; p[i * 6 + 1] = d.y; p[i * 6 + 2] = d.z;
      p[i * 6 + 3] = d.x * 1.05; p[i * 6 + 4] = d.y * 1.05; p[i * 6 + 5] = d.z - d.len * (0.5 + this.intensity);
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}

// 後製：色差、暗角、飽和度、閃光、徑向模糊
export const FXShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.35 },
    uCA: { value: 0.0 },
    uSat: { value: 1.1 },
    uFlash: { value: 0.0 },
    uFlashColor: { value: new THREE.Color('#ffffff') },
    uBlur: { value: 0.0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uVignette, uCA, uSat, uFlash, uBlur;
    uniform vec3 uFlashColor;
    varying vec2 vUv;
    void main(){
      vec2 c = vUv - 0.5;
      float r = length(c);
      vec2 off = c * (uCA * r);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      // 徑向模糊（衝刺感）
      if (uBlur > 0.001) {
        vec3 acc = col;
        for (int i = 1; i < 6; i++) {
          float s = 1.0 - float(i) * uBlur * 0.02 * r;
          acc += texture2D(tDiffuse, 0.5 + c * s).rgb;
        }
        col = acc / 6.0;
      }
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, uSat);
      col *= 1.0 - uVignette * smoothstep(0.35, 0.9, r);
      col = mix(col, uFlashColor, uFlash);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

// 雨絲（跟隨玩家的局部空間）
export class Rain {
  constructor(scene, n = 700) {
    this.n = n;
    this.group = new THREE.Group();
    this.drops = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) this._spawn(i, true);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3).setUsage(THREE.DynamicDrawUsage));
    this.geo = geo;
    this.mat = new THREE.LineBasicMaterial({ color: '#cfe0ff', transparent: true, opacity: 0, depthWrite: false });
    this.lines = new THREE.LineSegments(geo, this.mat);
    this.lines.frustumCulled = false;
    this.group.add(this.lines);
    scene.add(this.group);
    this.amount = 0;
  }
  _spawn(i, init) {
    this.drops[i * 3] = (Math.random() - 0.5) * 30;
    this.drops[i * 3 + 1] = init ? Math.random() * 18 : 16 + Math.random() * 4;
    this.drops[i * 3 + 2] = -Math.random() * 50 + 8;
  }
  update(dt, amount, x, y, z, speed) {
    this.amount = amount;
    this.mat.opacity = amount * 0.45;
    this.lines.visible = amount > 0.01;
    if (!this.lines.visible) return;
    this.group.position.set(x, y, z);
    const p = this.geo.attributes.position.array;
    const count = Math.floor(this.n * amount);
    const fall = 38 * dt;
    const lenZ = 0.2 + speed * 0.025;
    for (let i = 0; i < this.n; i++) {
      const i3 = i * 3;
      this.drops[i3 + 1] -= fall;
      this.drops[i3 + 2] += speed * dt * 0.3;
      if (this.drops[i3 + 1] < -1 || this.drops[i3 + 2] > 8) this._spawn(i, false);
      const o = i * 6;
      if (i >= count) { p[o] = p[o + 1] = p[o + 2] = p[o + 3] = p[o + 4] = p[o + 5] = 0; continue; }
      p[o] = this.drops[i3]; p[o + 1] = this.drops[i3 + 1]; p[o + 2] = this.drops[i3 + 2];
      p[o + 3] = this.drops[i3]; p[o + 4] = this.drops[i3 + 1] + 0.9; p[o + 5] = this.drops[i3 + 2] - lenZ;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}
