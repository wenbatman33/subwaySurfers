import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { TUNING, VISUAL, SKY, LAYOUT_PC, LAYOUT_MOBILE, IS_MOBILE } from './config.js';
import { World, THEMES, THEME_NAMES } from './world.js';
import { BEND } from './bend.js';
import { Level, laneX } from './level.js';
import { RAMP_LEN } from './props.js';
import { Humanoid, Dog, makeHoverboard, makeJetpack, damp } from './characters.js';
import { Particles, SpeedLines, FXShader, Rain } from './effects.js';
import { AudioEngine } from './audio.js';
import { UI } from './ui.js';
import { Input } from './input.js';
import { cloudTexture } from './textures.js';

const SAVE_KEY = 'ss3d_save_v1';
const PU_NAMES = { jetpack: 'JETPACK!', magnet: 'COIN MAGNET!', sneakers: 'SUPER SNEAKERS!', multiplier: '2X SCORE!' };
const PU_COLORS = { jetpack: '#ff9a1a', magnet: '#ff4d6d', sneakers: '#3bff8a', multiplier: '#b06bff' };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const THEME_COLORS = { city: '#ffd21a', coast: '#ff9a5a', neon: '#ff4df0', winter: '#9fe3ff' };
// 日夜關鍵影格位置（0~1 循環）
const TOD_KEYS = [[0, 'day'], [0.38, 'day'], [0.46, 'sunset'], [0.54, 'night'], [0.84, 'night'], [0.92, 'dawn'], [1, 'day']];
const SKY_COLOR_KEYS = ['skyTop', 'skyBottom', 'fog', 'sunColor', 'hemiSky', 'hemiGround'];
const SKY_NUM_KEYS = ['sun', 'hemi', 'exposure', 'bloom', 'stars', 'night'];

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.isMobile = IS_MOBILE;
    document.body.classList.toggle('is-mobile', this.isMobile);
    this.forcedProfile = null;
    this.devTimeScale = 1;
    this.godMode = false;
    this.timeScale = 1;
    this.targetTimeScale = 1;
    this.shake = 0;
    this.flash = 0;
    this.ca = 0;
    this.camBlend = 0;
    this.camY = 0;
    this.save = this._load();
    // 環境：日夜 / 天氣 / 彎道
    this.env = { tod: 0.06, todLock: null, weather: 'clear', weatherLock: null, weatherTimer: 20, rain: 0, snow: 0, thunderT: 5, lightning: 0, theme: 'city' };
    this.curve = { tx: 0, ty: 0, timer: 4, lock: false };
    this._sky = {};
    for (const k of SKY_COLOR_KEYS) this._sky[k] = new THREE.Color();
    this._ca = new THREE.Color();
    this._cb = new THREE.Color();

    this._initRenderer();
    this._initScene();
    this.world = new World(this.scene);
    this.level = new Level(this.scene);
    this._initCharacters();
    this.particles = new Particles(this.scene, 1800, true);
    this.dust = new Particles(this.scene, 1200, false);
    this.rain = new Rain(this.scene);
    this.speedLines = new SpeedLines(this.camera);
    this._initPost();
    this.audio = new AudioEngine();
    this.ui = new UI();
    this.input = new Input(canvas, (a) => this.onAction(a));
    this._bindUI();

    this.state = 'menu';
    this.resetRun();
    this.ui.show('menu');
    this.ui.setMenuStats(this.save.best, this.save.coins);
    this.onResize();
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.onResize(), 200));
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'playing') this.pause(); });

    this.last = performance.now();
    this.frameTimes = [];
    this.qualityTimer = 0;
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  // ───────────── 初始化 ─────────────
  _initRenderer() {
    const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, this.isMobile ? 1.6 : 2);
    r.setPixelRatio(this.pixelRatio);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = VISUAL.exposure;
    this.renderer = r;
  }

  _initScene() {
    const s = (this.scene = new THREE.Scene());
    s.fog = new THREE.Fog(VISUAL.fogColor, VISUAL.fogNear, VISUAL.fogFar);
    s.background = new THREE.Color(VISUAL.fogColor);
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 700);
    s.add(this.camera);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    s.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    s.environmentIntensity = 0.55;

    this.hemi = new THREE.HemisphereLight('#d4ebff', '#6d5a48', VISUAL.hemiIntensity);
    s.add(this.hemi);
    const sun = (this.sun = new THREE.DirectionalLight('#fff0d4', VISUAL.sunIntensity));
    sun.castShadow = true;
    const sm = this.isMobile ? 1024 : 2048;
    sun.shadow.mapSize.set(sm, sm);
    const sc = sun.shadow.camera;
    sc.left = -16; sc.right = 16; sc.top = 34; sc.bottom = -22; sc.near = 1; sc.far = 90;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    s.add(sun, sun.target);

    // 天空漸層球
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        top: { value: new THREE.Color(SKY.day.skyTop) },
        bottom: { value: new THREE.Color(SKY.day.skyBottom) },
        sunDir: { value: new THREE.Vector3(0.35, 0.28, -1).normalize() },
        sunCol: { value: new THREE.Color('#ffd9a0') },
        stars: { value: 0 },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunCol; uniform float stars; varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          float h = clamp(d.y, 0.0, 1.0);
          vec3 col = mix(bottom, top, pow(h, 0.55));
          float s = max(dot(d, sunDir), 0.0);
          col += sunCol * (pow(s, 600.0) * 6.0 + pow(s, 12.0) * 0.35);
          // 星空
          if (stars > 0.001) {
            vec3 p = floor(d * 420.0);
            float hs = fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
            float st = step(0.9972, hs) * smoothstep(0.02, 0.3, d.y);
            col += vec3(st * stars * (0.5 + fract(hs * 97.0)));
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), this.skyMat);
    this.sky.renderOrder = -1;
    s.add(this.sky);

    // 遠方雲朵
    this.clouds = new THREE.Group();
    const ct = cloudTexture();
    for (let i = 0; i < 12; i++) {
      const m = new THREE.SpriteMaterial({ map: ct, fog: false, transparent: true, depthWrite: false, opacity: 0.85 });
      const sp = new THREE.Sprite(m);
      const sc2 = 90 + Math.random() * 110;
      sp.scale.set(sc2, sc2 * 0.5, 1);
      sp.position.set((Math.random() - 0.5) * 900, 70 + Math.random() * 110, -380 - Math.random() * 150);
      sp.userData.vx = 2 + Math.random() * 3;
      this.clouds.add(sp);
    }
    s.add(this.clouds);
  }

  _initCharacters() {
    this.player = new Humanoid({});
    this.scene.add(this.player.root);
    this.board = makeHoverboard();
    this.board.position.y = 0.1;
    this.board.visible = false;
    this.player.root.add(this.board);
    this.jetpack = makeJetpack();
    this.jetpack.position.set(0, 0.42, 0.34);
    this.jetpack.visible = false;
    this.player.torso.add(this.jetpack);

    this.guard = new Humanoid({ guard: true, shirt: '#2d4a8a', pants: '#1f2d55', cap: '#1a2448', shoe: '#1b1b1b', shoeAccent: '#333', skin: '#e9b48a', scale: 1.1 });
    this.scene.add(this.guard.root);
    this.dog = new Dog();
    this.scene.add(this.dog.root);
  }

  _initPost() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: this.isMobile ? 0 : 4 });
    const c = (this.composer = new EffectComposer(this.renderer, rt));
    c.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), VISUAL.bloomStrength, VISUAL.bloomRadius, VISUAL.bloomThreshold);
    c.addPass(this.bloom);
    this.fx = new ShaderPass(FXShader);
    c.addPass(this.fx);
    c.addPass(new OutputPass());
  }

  _bindUI() {
    const $ = (id) => document.getElementById(id);
    const tap = (id, fn) => $(id).addEventListener('click', (e) => { e.stopPropagation(); this.audio.init(); this.audio.click(); fn(); });
    tap('btnPlay', () => this.start());
    tap('btnResume', () => this.resume());
    tap('btnRestart', () => { this.resetRun(); this.start(); });
    tap('btnHome', () => this.toMenu());
    tap('btnAgain', () => { this.resetRun(); this.start(); });
    tap('btnMenu', () => this.toMenu());
    tap('btnPause', () => this.pause());
    $('boardBox').addEventListener('pointerdown', (e) => { e.stopPropagation(); this.onAction('board'); });
    const snd = () => { this.audio.setEnabled(!this.audio.enabled); this.ui.setSoundLabel(this.audio.enabled); };
    tap('btnSound', snd);
    tap('btnSound2', snd);
  }

  _load() {
    try { return { best: 0, coins: 0, ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') }; } catch (e) { return { best: 0, coins: 0 }; }
  }
  _store() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) { /* 忽略 */ }
  }

  get profile() { return this.forcedProfile || (innerWidth < innerHeight ? 'mobile' : 'pc'); }
  get layout() { return this.profile === 'mobile' ? LAYOUT_MOBILE : LAYOUT_PC; }

  onResize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(w, h);
    this.bloom.resolution.set((w * this.pixelRatio) / 2, (h * this.pixelRatio) / 2);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.ui.applyLayout(this.layout, this.profile === 'mobile');
  }

  // 視覺參數由 _updateEnv 每幀套用（保留此方法供 DEV 工具呼叫）
  applyVisual() {}

  // 取得某時刻的天空關鍵影格插值
  _skyAt(tod) {
    let i = 0;
    while (i < TOD_KEYS.length - 2 && tod > TOD_KEYS[i + 1][0]) i++;
    const [p0, k0] = TOD_KEYS[i];
    const [p1, k1] = TOD_KEYS[i + 1];
    const t = clamp((tod - p0) / Math.max(1e-6, p1 - p0), 0, 1);
    const a = SKY[k0], b = SKY[k1];
    const out = this._sky;
    for (const k of SKY_COLOR_KEYS) out[k].set(a[k]).lerp(this._cb.set(b[k]), t);
    for (const k of SKY_NUM_KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
    return out;
  }

  // 日夜 / 天氣 / 主題光線
  _updateEnv(dt) {
    const E = this.env;
    const R = this.run;
    if (E.todLock == null && this.state !== 'paused') E.tod = (E.tod + dt / TUNING.dayLength) % 1;
    const tod = E.todLock ?? E.tod;
    const k = this._skyAt(tod);
    const w = this.world.themeWeights(R.d);

    // 主題進場提示
    const theme = this.world.themeAt(R.d);
    if (theme !== E.theme) {
      E.theme = theme;
      if (this.state === 'playing') this.ui.banner(THEME_NAMES[theme], THEME_COLORS[theme]);
    }

    // 天氣排程
    if (this.state === 'playing' && E.weatherLock == null) {
      E.weatherTimer -= dt;
      if (E.weatherTimer <= 0) {
        E.weatherTimer = TUNING.weatherInterval * (0.6 + Math.random() * 0.8);
        E.weather = Math.random() < TUNING.rainChance ? 'rain' : 'clear';
      }
    }
    const weather = E.weatherLock ?? E.weather;
    const snowT = weather === 'snow' || (E.weatherLock == null && w.winter > 0.5) ? 1 : 0;
    const rainT = weather === 'rain' && snowT === 0 ? 1 : 0;
    E.rain = damp(E.rain, rainT, 0.6, dt);
    E.snow = damp(E.snow, snowT, 0.8, dt);

    // 夜晚程度（霓虹主題偏暗）
    const night = Math.max(k.night, w.neon * 0.7);
    const neonMix = w.neon * 0.55 * (1 - k.night);
    const sky = this.skyMat.uniforms;
    const gray = this._ca.setRGB(0.42, 0.46, 0.52).multiplyScalar(1 - k.night * 0.75);
    const mixCol = (target, c) => {
      target.copy(c);
      if (neonMix > 0) target.lerp(this._cb.set(SKY.night[this._key]), neonMix);
      if (w.winter > 0 && this._key !== 'skyTop') target.lerp(this._cb.set('#c8d4e2').multiplyScalar(1 - k.night * 0.8), w.winter * 0.3);
      if (E.rain > 0) target.lerp(gray, E.rain * 0.7);
      if (E.snow > 0 && this._key === 'fog') target.lerp(this._cb.set('#c3cedb').multiplyScalar(1 - k.night * 0.75), E.snow * 0.25);
      return target;
    };
    this._key = 'skyTop'; mixCol(sky.top.value, k.skyTop);
    this._key = 'skyBottom'; mixCol(sky.bottom.value, k.skyBottom);
    this._key = 'fog'; mixCol(this.scene.fog.color, k.fog);
    this.scene.background.copy(this.scene.fog.color);
    sky.sunCol.value.copy(k.sunColor).multiplyScalar(1 - E.rain * 0.9);
    sky.stars.value = Math.max(k.stars, w.neon * 0.5) * (1 - E.rain);
    // 太陽高度：白天高、黃昏低、夜晚為月亮
    const elev = 0.3 * (1 - night) + 0.35 * night * night + 0.04;
    sky.sunDir.value.set(0.35, elev, -1).normalize();

    this.sun.color.copy(k.sunColor);
    this.sun.intensity = k.sun * VISUAL.sunIntensity * (1 - E.rain * 0.65) * (1 - neonMix * 0.5) * (1 - w.winter * 0.35);
    this.hemi.color.copy(k.hemiSky);
    this.hemi.groundColor.copy(k.hemiGround);
    E.lightning = Math.max(0, E.lightning - dt * 3);
    this.hemi.intensity = k.hemi * VISUAL.hemiIntensity * (1 - E.rain * 0.25) * (1 - w.winter * 0.2) + E.lightning * 3;
    this.renderer.toneMappingExposure = k.exposure * VISUAL.exposure;
    this.bloom.strength = k.bloom * VISUAL.bloomStrength;
    this.bloom.radius = VISUAL.bloomRadius;
    this.bloom.threshold = VISUAL.bloomThreshold;
    this.scene.fog.near = VISUAL.fogNear * (1 - E.rain * 0.6);
    this.scene.fog.far = VISUAL.fogFar * (1 - E.rain * 0.45 - E.snow * 0.12);
    this.world.setNight(night);
    // 雲朵隨時段變暗
    const cb = 1 - k.night * 0.75 - E.rain * 0.35;
    for (const c of this.clouds.children) c.material.color.setRGB(cb, cb, cb * 1.04 + k.night * 0.05);

    // 雨、雪、閃電
    const speed = this.state === 'playing' ? R.speed : 0;
    this.rain.update(dt, E.rain, R.x, R.y, -R.d, speed);
    this.audio.rain(this.state === 'paused' ? 0 : E.rain);
    if (E.snow > 0.05 && this.state !== 'paused') {
      const n = Math.random() < E.snow * 3 % 1 ? Math.ceil(E.snow * 3) : Math.floor(E.snow * 3);
      for (let i = 0; i < n; i++) {
        this.dust.emit({ x: R.x + (Math.random() - 0.5) * 30, y: R.y + 9 + Math.random() * 5, z: -R.d - Math.random() * 45 + 6, count: 1, spread: 0, vs: 0.5, vy: -2.4, vz: speed * 0.15, color: '#ffffff', size: 0.2, sizeEnd: 0.2, life: 4, lifeVar: 0.2, drag: 0.2 });
      }
    }
    if (E.rain > 0.6 && this.state === 'playing') {
      E.thunderT -= dt;
      if (E.thunderT <= 0) {
        E.thunderT = 7 + Math.random() * 12;
        E.lightning = 1;
        this.flash = Math.max(this.flash, 0.55);
        this.fx.uniforms.uFlashColor.value.set('#e8f0ff');
        this.audio.thunder();
      }
    }
  }

  // 彎道控制：定時隨機換彎道，平滑過渡
  _updateCurve(dt) {
    const C = this.curve;
    if (this.state === 'playing' && !C.lock) {
      C.timer -= dt;
      if (C.timer <= 0) {
        C.timer = TUNING.curveInterval * (0.7 + Math.random() * 0.8);
        const cm = TUNING.curveMax * (0.5 + Math.random() * 0.5);
        const hm = TUNING.hillMax * (0.5 + Math.random() * 0.5);
        const opts = [[0, 0], [cm, 0], [-cm, 0], [0, hm], [0, -hm], [cm, -hm], [-cm, hm], [cm, hm], [-cm, -hm]];
        const w = [2, 2, 2, 1, 1, 1, 1, 0.6, 0.6];
        let r = Math.random() * w.reduce((a, b) => a + b, 0);
        let i = 0;
        while ((r -= w[i]) > 0) i++;
        [C.tx, C.ty] = opts[i];
      }
    } else if (this.state === 'menu') {
      C.tx = 0; C.ty = 0;
    }
    const k = TUNING.curveSharpness;
    BEND.value.x = damp(BEND.value.x, C.tx, k, dt);
    BEND.value.y = damp(BEND.value.y, TUNING.baseHill + C.ty, k, dt);
    BEND.value.z = -this.run.d;
  }

  // ───────────── 流程 ─────────────
  resetRun() {
    this.level.reset();
    this.world.reset();
    this.particles.clear();
    this.dust.clear();
    this.ui.clearPowerups();
    this.audio.jetpackOn(false);
    this.run = {
      d: 0, prevD: 0, x: 0, lane: 1, prevLane: 1, y: 0, vy: 0, grounded: true, roll: 0, coyote: 0, jumpBuffer: 0, rollQueued: false,
      speed: TUNING.startSpeed, score: 0, coins: 0, combo: 0, comboTimer: 0, chase: 0, stumbleCool: 0,
      pu: { jetpack: 0, magnet: 0, sneakers: 0, multiplier: 0 }, board: 0, boards: TUNING.hoverboardsPerRun, invuln: 0,
      dead: false, deathTimer: 0, caught: false, phase: 0, guardGap: 4.2, guardX: 0.6, time: 0, rollSpin: 0, dustT: 0,
    };
    this.level.generate(0, TUNING.startSpeed, 0, this.run.pu);
    this.jetpack.visible = false;
    this.board.visible = false;
    this.player.rig.rotation.set(0, 0, 0);
    this.player.root.rotation.set(0, 0, 0);
    this.player.root.visible = true;
    this.player.shoeMat.emissive.set('#000000');
    this.camBlend = 0;
    this.timeScale = this.targetTimeScale = 1;
    this.env.tod = 0.06;
    this.env.weather = 'clear';
    this.env.weatherTimer = 20;
    this.env.theme = 'city';
    this.curve.tx = this.curve.ty = 0;
    this.curve.timer = 4;
  }

  start() {
    this.audio.init();
    this.audio.start();
    this.audio.setIntensity(1);
    this.audio.setMusicOpen(1, 1);
    this.state = 'playing';
    this.run.chase = 3;
    this.ui.show('hud');
    this.ui.banner('GO!', '#3bff8a');
    this.flash = 0.35;
    this.fx.uniforms.uFlashColor.value.set('#ffffff');
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.ui.show('pause');
    this.audio.setMusicOpen(0.15);
    this.audio.jetpackOn(false);
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.ui.show('hud');
    this.audio.setMusicOpen(1);
    if (this.run.pu.jetpack > 0) this.audio.jetpackOn(true);
    this.last = performance.now();
  }

  toMenu() {
    this.resetRun();
    this.state = 'menu';
    this.ui.show('menu');
    this.ui.setMenuStats(this.save.best, this.save.coins);
    this.audio.setIntensity(0);
    this.audio.setMusicOpen(0.3);
  }

  onAction(a) {
    const R = this.run;
    if (this.state === 'menu') {
      if (a === 'confirm' || a === 'up') this.start();
      return;
    }
    if (this.state === 'paused') { if (a === 'pause' || a === 'confirm') this.resume(); return; }
    if (this.state === 'gameover') { if (a === 'confirm') { this.resetRun(); this.start(); } return; }
    if (this.state !== 'playing' || R.dead) return;
    switch (a) {
      case 'pause': this.pause(); break;
      case 'left': case 'right': {
        const nl = clamp(R.lane + (a === 'left' ? -1 : 1), 0, 2);
        if (nl !== R.lane) {
          R.prevLane = R.lane;
          R.lane = nl;
          this.audio.swipe();
          if (R.grounded) this._dustBurst(4);
        }
        break;
      }
      case 'up':
        if (R.pu.jetpack > 0) break;
        if (R.grounded || R.coyote > 0) this._jump();
        else R.jumpBuffer = 0.16;
        break;
      case 'down':
        if (R.pu.jetpack > 0) break;
        if (R.grounded) { R.roll = TUNING.rollDuration; this.audio.roll(); this._dustBurst(8); }
        else { R.vy = -TUNING.fastFallVelocity; R.rollQueued = true; this.audio.whoosh(); }
        break;
      case 'board':
        if (R.board <= 0 && R.boards > 0) {
          R.boards--;
          R.board = TUNING.hoverboardDuration;
          this.audio.hoverboard();
          this.ui.banner('HOVERBOARD!', '#3bd1ff');
          this._burst(R.x, R.y + 0.3, R.d, '#9a6bff', 50, 6);
          this.flash = 0.25;
          this.fx.uniforms.uFlashColor.value.set('#a07bff');
        }
        break;
    }
  }

  _jump() {
    const R = this.run;
    const sup = R.pu.sneakers > 0;
    R.vy = sup ? TUNING.superJumpVelocity : TUNING.jumpVelocity;
    R.grounded = false;
    R.coyote = 0;
    R.roll = 0;
    R.jumpBuffer = 0;
    sup ? this.audio.superJump() : this.audio.jump();
    this._dustBurst(10);
    if (sup) this._burst(R.x, R.y + 0.2, R.d, '#3bff8a', 30, 5);
  }

  activate(type) {
    const R = this.run;
    const dur = { jetpack: TUNING.jetpackDuration, magnet: TUNING.magnetDuration, sneakers: TUNING.sneakersDuration, multiplier: TUNING.multiplierDuration }[type];
    R.pu[type] = dur;
    this.audio.powerup();
    this.ui.banner(PU_NAMES[type], PU_COLORS[type]);
    this.flash = 0.45;
    this.ca = 0.03;
    this.fx.uniforms.uFlashColor.value.set(PU_COLORS[type]);
    this._burst(R.x, R.y + 1, R.d, PU_COLORS[type], 80, 9);
    if (type === 'jetpack') {
      R.grounded = false;
      R.roll = 0;
      this.audio.jetpackOn(true);
      this.jetpack.visible = true;
      this.world.setJetMode(true);
      this.level.addAirCoins(R.d + 18, R.d + R.speed * 1.15 * (dur - 1.2), TUNING.jetpackHeight);
    }
  }

  // ───────────── 主迴圈 ─────────────
  _loop(now) {
    requestAnimationFrame(this._loop);
    let raw = (now - this.last) / 1000;
    this.last = now;
    if (!(raw > 0)) raw = 0.016;
    raw = Math.min(raw, 0.05);
    this._adaptQuality(raw);
    this.timeScale = damp(this.timeScale, this.targetTimeScale, 6, raw);
    const dt = raw * this.timeScale * this.devTimeScale;

    if (this.state === 'playing') this._updatePlaying(dt);
    else if (this.state === 'dying') this._updateDying(dt, raw);
    else if (this.state === 'menu') this.run.time += dt;

    if (this.state !== 'paused') {
      this.world.update(this.run.d);
      this._updateCurve(dt);
      this.level.syncCoins(dt);
      this.particles.update(dt);
      this.dust.update(dt);
      this._updateCharacters(dt);
    }
    this._updateCamera(raw, dt);
    this._updateEnv(this.state === 'paused' ? 0 : dt);
    this._updateFX(raw);
    this.composer.render(raw);
  }

  _adaptQuality(raw) {
    // 只在遊戲中、分頁可見時統計（排除卡頓尖峰）
    if (this.state !== 'playing' || document.hidden || raw >= 0.05) return;
    this.frameTimes.push(raw);
    if (this.frameTimes.length > 90) this.frameTimes.shift();
    this.qualityTimer += raw;
    if (this.qualityTimer > 2.5 && this.frameTimes.length >= 90) {
      this.qualityTimer = 0;
      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      if (avg > 1 / 40 && this.pixelRatio > 0.85) {
        this.pixelRatio = Math.max(0.85, this.pixelRatio - 0.15);
        this.frameTimes = [];
        this.onResize();
      }
    }
  }

  _updatePlaying(dt) {
    const R = this.run;
    R.time += dt;
    if (R.pu.jetpack <= 0) R.speed = Math.min(TUNING.maxSpeed, R.speed + TUNING.accel * dt);
    const speed = R.speed * (R.pu.jetpack > 0 ? 1.15 : 1);
    const diff = clamp((R.speed - TUNING.startSpeed) / (TUNING.maxSpeed - TUNING.startSpeed), 0, 1);

    this.level.update(dt, R.d, speed, this.audio);
    const steps = Math.max(1, Math.ceil(dt / (1 / 100)));
    const h = dt / steps;
    for (let i = 0; i < steps && !R.dead; i++) this._step(h, speed);
    if (R.dead) return;

    // 計時器
    for (const k of Object.keys(R.pu)) {
      if (R.pu[k] > 0) {
        R.pu[k] -= dt;
        if (R.pu[k] <= 0) this._powerEnd(k);
      }
    }
    if (R.board > 0) { R.board -= dt; if (R.board <= 0) this.audio.powerdown(); }
    R.invuln -= dt;
    R.chase -= dt;
    R.stumbleCool -= dt;
    R.jumpBuffer -= dt;
    R.coyote -= dt;
    R.comboTimer -= dt;
    if (R.comboTimer <= 0) R.combo = 0;

    const mult = R.pu.multiplier > 0 ? 2 : 1;
    R.score += speed * dt * mult;
    this._pickups(dt, mult);
    this.level.generate(R.d, speed, diff, R.pu);

    this.ui.hud({
      score: R.score, coins: R.coins, mult, boost: mult > 1, boards: R.boards, boardActive: R.board > 0,
      powerups: {
        jetpack: R.pu.jetpack / TUNING.jetpackDuration,
        magnet: R.pu.magnet / TUNING.magnetDuration,
        sneakers: R.pu.sneakers / TUNING.sneakersDuration,
        multiplier: R.pu.multiplier / TUNING.multiplierDuration,
      },
    });
  }

  _step(h, speed) {
    const R = this.run;
    R.prevD = R.d;
    R.d += speed * h;
    R.x = damp(R.x, laneX(R.lane), TUNING.laneSwitchSharpness, h);
    if (R.roll > 0) R.roll -= h;

    if (R.pu.jetpack > 0) {
      R.y = damp(R.y, TUNING.jetpackHeight, 2.5, h);
      R.vy = 0;
      R.grounded = false;
    } else {
      const surf = this.level.surfaceAt(R.x, R.d);
      if (R.grounded) {
        if (surf < R.y - 0.05) { R.grounded = false; R.vy = 0; R.coyote = 0.1; }
        else if (surf - R.y < 1.3) R.y = surf;
      } else {
        const g = TUNING.gravity * (R.vy < 0 ? 1.15 : 1);
        R.vy -= g * h;
        R.y += R.vy * h;
        if (R.vy <= 0 && R.y <= surf && R.y >= surf - 1.1) this._land(surf);
        else if (R.y < 0) this._land(0);
      }
    }
    this._collide();
  }

  _land(surf) {
    const R = this.run;
    const impact = -R.vy;
    R.y = surf;
    R.vy = 0;
    R.grounded = true;
    if (impact > 8) { this.audio.land(); this._dustBurst(Math.min(24, impact)); this.shake = Math.max(this.shake, impact > 20 ? 0.25 : 0.08); }
    if (R.rollQueued) { R.rollQueued = false; R.roll = TUNING.rollDuration; this.audio.roll(); }
    if (R.jumpBuffer > 0) this._jump();
  }

  _collide() {
    const R = this.run;
    if (this.godMode || R.invuln > 0) return;
    if (R.pu.jetpack > 0 && R.y > 4) return;
    const ph = R.roll > 0 ? 0.85 : 1.75;
    for (const o of this.level.obstacles) {
      if (o.d1 < R.prevD - 0.4 || o.d0 > R.d + 0.4) continue;
      const dx = Math.abs(R.x - laneX(o.lane));
      if (dx > 1.47) continue;
      let hit = false;
      if (o.kind === 'train') hit = R.y < o.top - 0.35;
      else if (o.kind === 'ramp') hit = R.y < clamp((o.top * (R.d - o.d0)) / RAMP_LEN, 0, o.top) - 1.0;
      else if (o.kind === 'hurdle') hit = R.y < o.top - 0.12;
      else if (o.kind === 'overhead') hit = R.y + ph > o.bottom && R.y < o.top;
      if (!hit) continue;
      let frontal;
      if (o.kind === 'train') frontal = R.prevD + 0.4 <= o.prevD0 + 0.12;
      else if (o.kind === 'ramp') frontal = false;
      else frontal = dx < 0.9;
      if (frontal) this._crash(o);
      else this._sideBump(o);
      return;
    }
  }

  _sideBump(o) {
    const R = this.run;
    const ox = laneX(o.lane);
    const nl = clamp(R.x < ox ? o.lane - 1 : o.lane + 1, 0, 2);
    R.lane = nl;
    R.prevLane = nl;
    if (R.stumbleCool > 0) return;
    R.stumbleCool = 0.6;
    this.audio.stumble();
    this.shake = Math.max(this.shake, 0.45);
    this.ca = 0.02;
    this._burst((R.x + ox) / 2, R.y + 1, R.d, '#ffd36b', 25, 5);
    if (R.board > 0) { this._breakBoard(); return; }
    if (R.chase > 0) { this._die(true); return; }
    R.chase = TUNING.chaseDuration;
  }

  _breakBoard() {
    const R = this.run;
    R.board = 0;
    R.invuln = 1.6;
    this.audio.boardBreak();
    this.shake = 0.6;
    this.flash = 0.5;
    this.fx.uniforms.uFlashColor.value.set('#b48bff');
    this._burst(R.x, R.y + 0.3, R.d, '#9a6bff', 90, 10);
  }

  _crash() {
    if (this.run.board > 0) { this._breakBoard(); return; }
    this._die(false);
  }

  _die(caught) {
    const R = this.run;
    R.dead = true;
    R.caught = caught;
    R.deathTimer = 0;
    this.state = 'dying';
    this.audio.crash();
    this.audio.jetpackOn(false);
    this.audio.setMusicOpen(0.08, 0.3);
    this.shake = 1.1;
    this.flash = 0.8;
    this.ca = 0.06;
    this.fx.uniforms.uFlashColor.value.set(caught ? '#ffffff' : '#ff4a3a');
    this.targetTimeScale = 0.3;
    if (!caught) R.d -= 0.5;
    this._burst(R.x, R.y + 1.2, R.d + 0.5, '#ffe08a', 70, 9);
    this._burst(R.x, R.y + 1.2, R.d + 0.5, '#ffffff', 30, 5);
    this.dust.emit({ x: R.x, y: R.y + 0.8, z: -R.d - 0.5, count: 40, spread: 0.6, vs: 5, color: '#8a8278', size: 0.9, sizeEnd: 1.8, life: 1.2, gravity: -0.5, drag: 2 });
    R.chase = 99;
  }

  _updateDying(dt, raw) {
    const R = this.run;
    R.deathTimer += raw;
    if (R.deathTimer > 0.5) this.targetTimeScale = 1;
    // 從空中掉落
    if (R.y > 0 && !R.caught) {
      const surf = this.level.surfaceAt(R.x, R.d);
      if (R.y > surf) { R.vy -= TUNING.gravity * dt; R.y = Math.max(surf, R.y + R.vy * dt); }
    }
    if (R.deathTimer > 2.1 && this.state === 'dying') {
      this.state = 'gameover';
      const score = Math.floor(R.score);
      const isBest = score > this.save.best;
      if (isBest) this.save.best = score;
      this.save.coins += R.coins;
      this._store();
      this.audio.gameOver();
      this.ui.gameOver({ score, coins: R.coins, dist: R.d, best: this.save.best, isBest, caught: R.caught });
    }
  }

  _powerEnd(k) {
    const R = this.run;
    R.pu[k] = 0;
    this.audio.powerdown();
    if (k === 'jetpack') {
      this.audio.jetpackOn(false);
      this.jetpack.visible = false;
      this.world.setJetMode(false);
      R.grounded = false;
      R.vy = 0;
      R.invuln = 1.2;
      // 清出降落區
      this.level.clearRange(R.d - 3, R.d + 55, (o) => {
        if (o.d0 - R.d < 45) this._burst(laneX(o.lane), 1.5, o.d0, '#ffffff', 20, 4);
      });
    }
  }

  _pickups(dt, mult) {
    const R = this.run;
    const magnet = R.pu.magnet > 0;
    const py = R.y + 0.9;
    const k = 1 - Math.exp(-14 * dt);
    for (const c of this.level.coins) {
      if (!c.alive) continue;
      const dz = c.d - R.d;
      if (dz > 14 || dz < -2) continue;
      if (magnet && !c.attract && dz < TUNING.magnetRadius && Math.abs(c.y - py) < 7) c.attract = true;
      if (c.attract) {
        c.x += (R.x - c.x) * k;
        c.y += (py - c.y) * k;
        c.d += (R.d + 0.3 - c.d) * k;
      }
      if (Math.abs(c.d - R.d) < 0.95 && Math.abs(c.x - R.x) < 0.95 && Math.abs(c.y - py) < 1.35) {
        c.alive = false;
        R.coins++;
        R.score += 10 * mult;
        R.combo++;
        R.comboTimer = 0.7;
        this.audio.coin(R.combo);
        this.particles.emit({ x: c.x, y: c.y, z: -c.d, count: 9, spread: 0.15, vs: 3.5, color: '#ffd23a', size: 0.22, life: 0.45, intensity: 2.2, drag: 3 });
        this.particles.emit({ x: c.x, y: c.y, z: -c.d, count: 1, spread: 0, vs: 0, color: '#fff3b0', size: 1.4, sizeEnd: 0.1, life: 0.2, intensity: 1.5 });
      }
    }
    for (const p of this.level.powerups) {
      if (!p.alive) continue;
      if (Math.abs(p.d - R.d) < 1.1 && Math.abs(laneX(p.lane) - R.x) < 1.1 && Math.abs(p.y - py) < 1.6) {
        p.alive = false;
        this.activate(p.type);
      }
    }
  }

  // ───────────── 角色視覺 ─────────────
  _updateCharacters(dt) {
    const R = this.run;
    const P = this.player;
    const onBoard = R.board > 0;
    P.root.position.set(R.x, R.y + (onBoard && R.grounded ? 0.18 : 0), -R.d);
    const lx = laneX(R.lane) - R.x;
    P.root.rotation.z = damp(P.root.rotation.z, -lx * 0.14, 12, dt);
    P.root.rotation.y = damp(P.root.rotation.y, lx * 0.12, 12, dt);
    this.board.visible = onBoard;
    P.root.visible = !(R.invuln > 0 && Math.floor(R.invuln * 14) % 2 === 0) || this.state !== 'playing';

    const speed = R.speed;
    let pose;
    let rigRot = 0;
    let bodyTilt = 0;
    if (this.state === 'menu') {
      const t = R.time;
      const beat = Math.sin(t * 10.9);
      pose = { shL: 0.15, shR: -0.2, elL: 0.4, elR: 1.2, shZL: -0.2, shZR: 0.3, torsoX: 0.05 + beat * 0.03, rigY: 0.93 + Math.abs(beat) * 0.03, headX: beat * 0.12, knL: -0.1 - Math.abs(beat) * 0.1, knR: -0.1 - Math.abs(beat) * 0.1 };
    } else if (R.dead) {
      pose = R.caught
        ? { shL: 0.3, shR: 0.3, elL: 0.4, elR: 0.4, headX: -0.3, rigY: 0.95 }
        : { shL: 2.8, shR: 2.6, shZL: -0.6, shZR: 0.6, hipL: 1.2, hipR: 0.4, knL: -0.4, knR: -0.3, headX: -0.4, rigY: 0.55 };
      rigRot = R.caught ? 0 : 1.35;
    } else if (R.pu.jetpack > 0) {
      pose = { torsoX: -0.3, hipL: -0.3, hipR: -0.1, knL: -0.9, knR: -0.5, shL: -0.5, shR: -0.5, shZL: -0.35, shZR: 0.35, elL: 0.4, elR: 0.4, headX: 0.35 };
      bodyTilt = -0.4;
    } else if (R.roll > 0) {
      pose = { hipL: 2.0, hipR: 2.0, knL: -2.4, knR: -2.4, shL: 1.2, shR: 1.2, elL: 1.6, elR: 1.6, torsoX: -0.6, rigY: 0.55, headX: 0.5 };
      R.rollSpin = 1 - R.roll / TUNING.rollDuration;
    } else if (!R.grounded) {
      const up = R.vy > 0;
      pose = { hipL: 1.1, knL: -1.7, hipR: up ? 0.2 : 0.6, knR: up ? -0.8 : -1.2, shL: 2.6, shR: 2.1, shZL: -0.3, shZR: 0.3, elL: 0.3, elR: 0.5, torsoX: -0.1, headX: 0.1 };
    } else if (onBoard) {
      const w = Math.sin(R.time * 5) * 0.05;
      pose = { hipsY: 1.1, torsoY: -0.7, hipZL: 0.35, hipZR: -0.35, knL: -0.6, knR: -0.6, hipL: 0.4, hipR: 0.4, shZL: -1.1 + w, shZR: 1.1 - w, elL: 0.3, elR: 0.3, rigY: 0.86 };
    } else {
      R.phase += dt * (6 + speed * 0.28);
      pose = P.runPose(R.phase);
      // 跑步揚塵
      R.dustT -= dt;
      if (R.dustT <= 0 && this.state === 'playing') {
        R.dustT = 0.07;
        this.dust.emit({ x: R.x, y: R.y + 0.1, z: -R.d + 0.4, count: 1, spread: 0.2, vs: 0.8, vz: speed * 0.1, color: '#b3a594', size: 0.35, sizeEnd: 0.9, life: 0.5, gravity: -0.4, drag: 2 });
      }
    }
    P.apply(pose, dt, R.roll > 0 ? 30 : 18);
    // 翻滾旋轉
    if (R.roll > 0) P.rig.rotation.x = -R.rollSpin * Math.PI * 2;
    else P.rig.rotation.x = damp(P.rig.rotation.x, rigRot, 10, dt);
    P.root.rotation.x = damp(P.root.rotation.x, bodyTilt, 6, dt);

    // 超級球鞋發光
    P.shoeMat.emissive.set(R.pu.sneakers > 0 ? '#20ff90' : '#000000');
    P.shoeMat.emissiveIntensity = R.pu.sneakers > 0 ? 0.8 + Math.sin(R.time * 12) * 0.3 : 0;

    // 道具特效粒子
    if (this.state === 'playing') {
      const z = -R.d;
      if (R.pu.jetpack > 0) {
        for (const s of [-0.16, 0.16]) {
          this.particles.emit({ x: R.x + s, y: R.y + 0.9, z: z + 0.55, count: 3, spread: 0.06, vs: 1, vy: -9, vz: 6, color: '#ffae2a', size: 0.5, sizeEnd: 0.05, life: 0.28, intensity: 3 });
          this.particles.emit({ x: R.x + s, y: R.y + 0.95, z: z + 0.55, count: 1, spread: 0.03, vs: 0.3, vy: -6, vz: 6, color: '#ffffff', size: 0.3, sizeEnd: 0.02, life: 0.12, intensity: 4 });
        }
        this.dust.emit({ x: R.x, y: R.y + 0.4, z: z + 1.2, count: 1, spread: 0.2, vs: 0.5, vz: 10, color: '#cfcfcf', size: 0.6, sizeEnd: 1.6, life: 0.7, drag: 1 });
      }
      if (R.pu.magnet > 0 && Math.random() < 0.6) {
        const a = Math.random() * Math.PI * 2;
        this.particles.emit({ x: R.x + Math.cos(a) * 1.1, y: R.y + 1 + Math.sin(a) * 1.1, z: z, count: 1, spread: 0, vs: 0.5, color: Math.random() < 0.5 ? '#ff4d6d' : '#6dd5ff', size: 0.25, life: 0.4, intensity: 2.5 });
      }
      if (onBoard) {
        this.particles.emit({ x: R.x, y: R.y + 0.1, z: z + 0.8, count: 2, spread: 0.2, vs: 0.6, vz: 5, color: '#a47bff', size: 0.3, sizeEnd: 0.02, life: 0.35, intensity: 2.5 });
      }
      if (R.pu.sneakers > 0 && Math.random() < 0.5) {
        this.particles.emit({ x: R.x, y: R.y + 0.15, z: z + 0.3, count: 1, spread: 0.2, vs: 0.4, vz: 3, color: '#3bff8a', size: 0.22, life: 0.35, intensity: 2.5 });
      }
    }

    // 警衛 + 狗
    const G = this.guard;
    let targetGap = 4.2;
    if (this.state === 'playing') targetGap = R.chase > 0 ? 3.4 : 34;
    if (this.state === 'dying') targetGap = R.caught ? 1.1 : 2.2;
    R.guardGap = damp(R.guardGap, targetGap, this.state === 'dying' ? 2.5 : R.chase > 0 ? 3 : 0.5, dt);
    R.guardX = damp(R.guardX, this.state === 'menu' ? 0.9 : R.x - 0.4, 5, dt);
    const gd = R.d - R.guardGap;
    G.root.position.set(R.guardX, 0, -gd);
    G.root.visible = R.guardGap < 30;
    this.dog.root.position.set(R.guardX + 1.1, 0, -(gd - 0.6));
    this.dog.root.visible = G.root.visible;
    const moving = this.state === 'playing' || (this.state === 'dying' && R.guardGap > (R.caught ? 1.2 : 2.3));
    if (moving) {
      R.guardPhase = (R.guardPhase || 0) + dt * (6 + speed * 0.26);
      const gp = G.runPose(R.guardPhase);
      gp.shR = 2.6 + Math.sin(R.guardPhase * 2) * 0.3; // 揮拳
      gp.elR = 0.6;
      G.apply(gp, dt);
    } else {
      const t = R.time;
      G.apply({ shL: 0.1, shR: this.state === 'menu' ? 0.1 : 2.4, elR: 0.8, headX: Math.sin(t * 2) * 0.1, torsoX: 0.05, rigY: 0.95 + Math.sin(t * 3) * 0.01 }, dt);
    }
    this.dog.animate(R.time + (R.guardPhase || 0), moving);

    // 雲朵飄移
    for (const c of this.clouds.children) {
      c.position.x += c.userData.vx * dt;
      if (c.position.x > 450) c.position.x = -450;
    }
  }

  // ───────────── 相機 ─────────────
  _updateCamera(raw, dt) {
    const R = this.run;
    const L = this.layout.camera;
    const cam = this.camera;
    const jet = R.pu.jetpack > 0;
    this.camY = damp(this.camY, R.y * (jet ? 0.85 : 0.72), jet ? 3 : 5, raw);
    const gx = R.x * L.followX;
    const gPos = new THREE.Vector3(gx, this.camY + L.height, -R.d + L.distance);
    const gLook = new THREE.Vector3(gx * 0.85, this.camY + L.lookHeight, -R.d - L.lookAhead);
    if (this.state === 'dying') {
      // 死亡時稍微拉近
      const k = clamp(R.deathTimer / 1.5, 0, 1);
      gPos.lerp(new THREE.Vector3(R.x + 1.5, R.y + 2.6, -R.d + 5), k * 0.6);
      gLook.lerp(new THREE.Vector3(R.x, R.y + 1, -R.d), k * 0.7);
    }
    let pos = gPos, look = gLook;
    if (this.state === 'menu' || this.camBlend < 1) {
      const t = R.time;
      const mPos = new THREE.Vector3(Math.sin(t * 0.25) * 1.4 + 1.2, 2.1, -R.d - 5.2);
      const mLook = new THREE.Vector3(0.2, 1.35, -R.d + 1.5);
      if (this.state !== 'menu') this.camBlend = Math.min(1, this.camBlend + raw * 1.1);
      const e = this.camBlend * this.camBlend * (3 - 2 * this.camBlend);
      pos = mPos.lerp(gPos, e);
      look = mLook.lerp(gLook, e);
    }
    cam.position.copy(pos);
    // 相機震動
    if (this.shake > 0) {
      const s = this.shake * this.shake * 0.5 * VISUAL.shake;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      this.shake = Math.max(0, this.shake - raw * 2.2);
    }
    cam.lookAt(look);
    const speedN = clamp((R.speed - TUNING.startSpeed) / (TUNING.maxSpeed - TUNING.startSpeed), 0, 1);
    const fov = L.fov + (this.state === 'playing' ? speedN * L.speedFov + (jet ? 8 : 0) : 0);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = damp(cam.fov, fov, 3, raw);
      cam.updateProjectionMatrix();
    }
    // 太陽與天空跟隨
    this.sun.position.set(R.x + 7, 26, -R.d + 12);
    this.sun.target.position.set(R.x, 0, -R.d - 8);
    this.sky.position.copy(cam.position);
    this.clouds.position.set(cam.position.x * 0.9, 0, cam.position.z);
    // 粒子尺寸
    const bh = this.renderer.domElement.height;
    const sc = bh / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)));
    this.particles.mat.uniforms.uScale.value = sc;
    this.dust.mat.uniforms.uScale.value = sc;
    // 速度線
    const sl = this.state === 'playing' ? (jet ? 1 : Math.max(0, speedN - 0.45) * 1.2 + (R.board > 0 ? 0.2 : 0)) : 0;
    this.speedLines.update(raw, sl, R.speed);
    void dt;
  }

  _updateFX(raw) {
    const u = this.fx.uniforms;
    const R = this.run;
    this.flash = Math.max(0, this.flash - raw * 2.2);
    this.ca = Math.max(0, this.ca - raw * 0.08);
    const speedN = clamp((R.speed - TUNING.startSpeed) / (TUNING.maxSpeed - TUNING.startSpeed), 0, 1);
    u.uFlash.value = this.flash * 0.7;
    u.uCA.value = this.ca + (this.state === 'playing' ? 0.002 + speedN * 0.004 : 0.001);
    u.uVignette.value = VISUAL.vignette + (this.state === 'dying' ? 0.3 : 0);
    u.uSat.value = this.state === 'gameover' ? VISUAL.saturation * 0.5 : VISUAL.saturation;
    u.uBlur.value = this.state === 'playing' ? (R.pu.jetpack > 0 ? 0.45 : speedN * 0.25) : 0;
  }

  // ───────────── 粒子工具 ─────────────
  _burst(x, y, d, color, count, vs) {
    this.particles.emit({ x, y, z: -d, count, spread: 0.3, vs, color, size: 0.35, sizeEnd: 0.02, life: 0.8, gravity: 4, drag: 1.5, intensity: 2.5 });
  }

  _dustBurst(n) {
    const R = this.run;
    this.dust.emit({ x: R.x, y: R.y + 0.1, z: -R.d, count: Math.round(n), spread: 0.35, vs: 2, vy: 0.5, color: '#b8ab9a', size: 0.45, sizeEnd: 1.2, life: 0.55, gravity: -0.3, drag: 3 });
  }
}
