import GUI from 'lil-gui';
import { TUNING, VISUAL, SKY, LAYOUT_PC, LAYOUT_MOBILE, saveOverrides, clearOverrides, exportAll } from './config.js';
import { THEMES, THEME_NAMES } from './world.js';

// DEV 開發者微調工具：` 或 F2 或右下角 ⚙ 開啟
// - 即時調整相機、HUD、遊戲手感、視覺
// - HUD 元件可直接滑鼠拖曳
// - PC / Mobile 版面分開調整、分開匯出
// - 可手動觸發各種狀態

export class DevTools {
  constructor(game) {
    this.game = game;
    this.open = false;
    this.gui = null;
    this.editProfile = 'pc';
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Backquote' || e.code === 'F2') { e.preventDefault(); this.toggle(); }
    });
    document.getElementById('devBtn').addEventListener('click', (e) => { e.stopPropagation(); this.toggle(); });
    this._initDrag();
  }

  toggle() {
    this.open = !this.open;
    document.body.classList.toggle('dev', this.open);
    document.getElementById('devHint').classList.toggle('hidden', !this.open);
    if (this.open) {
      this.editProfile = this.game.profile;
      this._build();
    } else {
      this.gui?.destroy();
      this.gui = null;
      this.game.forcedProfile = null;
      this.game.onResize();
    }
  }

  get layout() { return this.editProfile === 'mobile' ? LAYOUT_MOBILE : LAYOUT_PC; }

  _changed() {
    saveOverrides();
    this.game.applyVisual();
    this.game.ui.applyLayout(this.game.layout, this.game.profile === 'mobile');
  }

  _build() {
    this.gui?.destroy();
    const gui = (this.gui = new GUI({ title: '🛠 DEV 微調工具' }));
    const g = this.game;
    const ch = () => this._changed();

    // 版面切換
    const prof = { profile: this.editProfile, preview: false };
    const fp = gui.addFolder('版面 Profile');
    fp.add(prof, 'profile', { 'PC（橫向）': 'pc', 'Mobile（直向）': 'mobile' }).name('編輯版面').onChange((v) => {
      this.editProfile = v;
      g.forcedProfile = prof.preview ? v : null;
      g.onResize();
      this._build();
    });
    fp.add(prof, 'preview').name('強制預覽此版面').onChange((v) => { g.forcedProfile = v ? this.editProfile : null; g.onResize(); });

    // 相機
    const L = this.layout;
    const fc = gui.addFolder(`相機 Camera（${this.editProfile}）`);
    fc.add(L.camera, 'height', 1, 14, 0.05).name('高度').onChange(ch).listen();
    fc.add(L.camera, 'distance', 2, 20, 0.05).name('後方距離').onChange(ch).listen();
    fc.add(L.camera, 'lookAhead', 0, 30, 0.1).name('前瞻距離').onChange(ch).listen();
    fc.add(L.camera, 'lookHeight', -2, 6, 0.05).name('注視高度').onChange(ch).listen();
    fc.add(L.camera, 'fov', 35, 100, 0.5).name('FOV').onChange(ch).listen();
    fc.add(L.camera, 'speedFov', 0, 30, 0.5).name('高速 FOV 增量').onChange(ch).listen();
    fc.add(L.camera, 'followX', 0, 1, 0.01).name('左右跟隨').onChange(ch).listen();

    // HUD
    const fh = gui.addFolder(`HUD（${this.editProfile}）— 可直接拖曳`);
    const names = { score: '分數', coins: '金幣', powerups: '道具列', board: '滑板鈕', pause: '暫停鈕', banner: '中央橫幅' };
    for (const [k, cfg] of Object.entries(L.hud)) {
      const f = fh.addFolder(names[k] || k);
      f.add(cfg, 'x', 0, 100, 0.1).name('x %').onChange(ch).listen();
      f.add(cfg, 'y', 0, 100, 0.1).name('y %').onChange(ch).listen();
      const big = k === 'powerups' || k === 'pause';
      f.add(cfg, 'size', big ? 0.3 : 8, big ? 2.5 : 140, big ? 0.01 : 1).name(big ? '縮放' : '字級 px').onChange(ch).listen();
      if ('color' in cfg) f.addColor(cfg, 'color').name('顏色').onChange(ch);
      f.close();
    }
    fh.close();

    // 遊戲手感
    const ft = gui.addFolder('遊戲參數 Tuning');
    const T = [
      ['startSpeed', 5, 60, '起始速度'], ['maxSpeed', 10, 90, '最高速度'], ['accel', 0, 2, '加速度'],
      ['gravity', 10, 100, '重力'], ['jumpVelocity', 5, 30, '跳躍初速'], ['superJumpVelocity', 5, 40, '超級跳初速'],
      ['fastFallVelocity', 5, 80, '空中下壓'], ['laneSwitchSharpness', 3, 40, '換道速度'], ['rollDuration', 0.2, 1.5, '翻滾時間'],
      ['trainSpeed', 0, 50, '對向列車速度'], ['jetpackDuration', 1, 20, '噴射背包秒數'], ['jetpackHeight', 4, 20, '噴射高度'],
      ['magnetDuration', 1, 30, '磁鐵秒數'], ['sneakersDuration', 1, 30, '超級鞋秒數'], ['multiplierDuration', 1, 30, '2倍秒數'],
      ['hoverboardDuration', 1, 60, '滑板秒數'], ['magnetRadius', 2, 20, '磁鐵範圍'], ['powerupChance', 0, 1, '道具機率'],
    ];
    for (const [k, a, b, n] of T) ft.add(TUNING, k, a, b).name(n).onChange(ch).listen();
    ft.close();

    // 場景 / 日夜 / 天氣 / 彎道
    const fw = gui.addFolder('🌍 場景 · 日夜 · 天氣 · 彎道');
    const envCtl = {
      theme: g.world.forceTheme == null ? -1 : g.world.forceTheme,
      lockTime: g.env.todLock != null,
      tod: g.env.todLock ?? g.env.tod,
      weather: g.env.weatherLock ?? 'auto',
      autoCurve: !g.curve.lock,
    };
    const themeOpts = { '自動輪替': -1 };
    THEMES.forEach((t, i) => { themeOpts[THEME_NAMES[t]] = i; });
    fw.add(envCtl, 'theme', themeOpts).name('場景').onChange((v) => g.world.setForceTheme(v < 0 ? null : v, g.run.d));
    fw.add(envCtl, 'lockTime').name('鎖定時間').onChange((v) => { g.env.todLock = v ? envCtl.tod : null; });
    fw.add(envCtl, 'tod', 0, 1, 0.005).name('時間（0白天→0.5夜）').onChange((v) => { envCtl.lockTime = true; g.env.todLock = v; fw.controllersRecursive().forEach((c) => c.updateDisplay()); });
    fw.add(envCtl, 'weather', { 自動: 'auto', 晴天: 'clear', 下雨: 'rain', 下雪: 'snow' }).name('天氣').onChange((v) => { g.env.weatherLock = v === 'auto' ? null : v; });
    fw.add(envCtl, 'autoCurve').name('自動彎道').onChange((v) => { g.curve.lock = !v; });
    const cv = {
      left: () => { g.curve.lock = true; g.curve.tx = -TUNING.curveMax; g.curve.ty = 0; },
      right: () => { g.curve.lock = true; g.curve.tx = TUNING.curveMax; g.curve.ty = 0; },
      up: () => { g.curve.lock = true; g.curve.tx = 0; g.curve.ty = TUNING.hillMax; },
      down: () => { g.curve.lock = true; g.curve.tx = 0; g.curve.ty = -TUNING.hillMax; },
      straight: () => { g.curve.lock = true; g.curve.tx = 0; g.curve.ty = 0; },
    };
    fw.add(cv, 'left').name('↰ 左彎');
    fw.add(cv, 'right').name('↱ 右彎');
    fw.add(cv, 'up').name('⤴ 上坡');
    fw.add(cv, 'down').name('⤵ 下坡');
    fw.add(cv, 'straight').name('↑ 直線');
    fw.add(TUNING, 'curveMax', 0, 0.004, 0.0001).name('彎道強度').onChange(ch);
    fw.add(TUNING, 'hillMax', 0, 0.002, 0.00005).name('起伏強度').onChange(ch);
    fw.add(TUNING, 'baseHill', -0.001, 0.001, 0.00005).name('基本下彎').onChange(ch);
    fw.add(TUNING, 'curveInterval', 1, 20, 0.5).name('換彎秒數').onChange(ch);
    fw.add(TUNING, 'dayLength', 20, 600, 5).name('日夜循環秒數').onChange(ch);
    fw.add(TUNING, 'rainChance', 0, 1, 0.05).name('下雨機率').onChange(ch);
    fw.close();

    // 視覺
    const fv = gui.addFolder('視覺 Visual（全域倍率）');
    fv.add(VISUAL, 'exposure', 0.3, 2.5, 0.01).name('曝光倍率').onChange(ch);
    fv.add(VISUAL, 'bloomStrength', 0, 3, 0.01).name('Bloom 倍率').onChange(ch);
    fv.add(VISUAL, 'bloomRadius', 0, 1.5, 0.01).name('Bloom 半徑').onChange(ch);
    fv.add(VISUAL, 'bloomThreshold', 0, 1.5, 0.01).name('Bloom 門檻').onChange(ch);
    fv.add(VISUAL, 'sunIntensity', 0, 3, 0.05).name('太陽光倍率').onChange(ch);
    fv.add(VISUAL, 'hemiIntensity', 0, 3, 0.05).name('環境光倍率').onChange(ch);
    fv.add(VISUAL, 'fogNear', 0, 300, 1).name('霧 起點').onChange(ch);
    fv.add(VISUAL, 'fogFar', 50, 600, 1).name('霧 終點').onChange(ch);
    fv.add(VISUAL, 'vignette', 0, 1.5, 0.01).name('暗角').onChange(ch);
    fv.add(VISUAL, 'saturation', 0, 2, 0.01).name('飽和度').onChange(ch);
    fv.add(VISUAL, 'shake', 0, 3, 0.05).name('震動強度').onChange(ch);
    fv.close();

    // 各時段天空色
    const fsky = gui.addFolder('🎨 日夜配色');
    const skyNames = { day: '白天', sunset: '黃昏', night: '夜晚', dawn: '清晨' };
    for (const [key, cfg] of Object.entries(SKY)) {
      const f = fsky.addFolder(skyNames[key]);
      f.addColor(cfg, 'skyTop').name('天空上').onChange(ch);
      f.addColor(cfg, 'skyBottom').name('天空下').onChange(ch);
      f.addColor(cfg, 'fog').name('霧色').onChange(ch);
      f.addColor(cfg, 'sunColor').name('日光色').onChange(ch);
      f.add(cfg, 'sun', 0, 6, 0.05).name('日光強度').onChange(ch);
      f.addColor(cfg, 'hemiSky').name('環境光(天)').onChange(ch);
      f.addColor(cfg, 'hemiGround').name('環境光(地)').onChange(ch);
      f.add(cfg, 'hemi', 0, 3, 0.05).name('環境光強度').onChange(ch);
      f.add(cfg, 'exposure', 0.3, 2.5, 0.01).name('曝光').onChange(ch);
      f.add(cfg, 'bloom', 0, 3, 0.01).name('Bloom').onChange(ch);
      f.add(cfg, 'stars', 0, 1, 0.01).name('星星').onChange(ch);
      f.add(cfg, 'night', 0, 1, 0.01).name('夜燈亮度').onChange(ch);
      f.close();
    }
    fsky.close();

    // 狀態觸發
    const fs = gui.addFolder('狀態觸發');
    const act = {
      start: () => { if (g.state === 'menu') g.start(); },
      jetpack: () => this._ensurePlay() && g.activate('jetpack'),
      magnet: () => this._ensurePlay() && g.activate('magnet'),
      sneakers: () => this._ensurePlay() && g.activate('sneakers'),
      multiplier: () => this._ensurePlay() && g.activate('multiplier'),
      board: () => { if (this._ensurePlay()) { g.run.boards++; g.onAction('board'); } },
      stumble: () => { if (this._ensurePlay()) { g.run.chase = 0; g.run.stumbleCool = 0; g.audio.stumble(); g.run.chase = TUNING.chaseDuration; g.shake = 0.45; } },
      crash: () => this._ensurePlay() && g._die(false),
      caught: () => this._ensurePlay() && g._die(true),
      banner: () => g.ui.banner('SUPER SNEAKERS!', '#3bff8a'),
      menu: () => g.toMenu(),
    };
    fs.add(act, 'start').name('▶ 開始遊戲');
    fs.add(act, 'jetpack').name('🚀 噴射背包');
    fs.add(act, 'magnet').name('🧲 磁鐵');
    fs.add(act, 'sneakers').name('👟 超級球鞋');
    fs.add(act, 'multiplier').name('✖2 分數加倍');
    fs.add(act, 'board').name('🛹 滑板');
    fs.add(act, 'stumble').name('😵 絆倒（警衛追）');
    fs.add(act, 'crash').name('💥 撞車死亡');
    fs.add(act, 'caught').name('👮 被抓');
    fs.add(act, 'banner').name('📣 預覽橫幅');
    fs.add(act, 'menu').name('🏠 回主選單');
    fs.add(g, 'godMode').name('無敵模式');
    fs.add(g, 'devTimeScale', 0.05, 2, 0.05).name('時間倍率');

    // 匯出
    const fe = gui.addFolder('💾 匯出 / 鎖定');
    const ex = {
      copy: async () => {
        const json = exportAll();
        console.log('[DEV EXPORT]\n' + json);
        try { await navigator.clipboard.writeText(json); alert('已複製設定 JSON 到剪貼簿！\n貼給 Claude 並說「我調好了，鎖定」即可寫入原始碼。'); }
        catch (e) { prompt('複製以下 JSON：', json); }
      },
      download: () => {
        const blob = new Blob([exportAll()], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'layout-export.json';
        a.click();
      },
      reset: () => { if (confirm('重置所有調整回預設值？')) { clearOverrides(); this._changed(); this._build(); } },
    };
    fe.add(ex, 'copy').name('📋 匯出 JSON（複製）');
    fe.add(ex, 'download').name('⬇ 下載 JSON 檔');
    fe.add(ex, 'reset').name('↺ 重置為預設');
  }

  _ensurePlay() {
    const g = this.game;
    if (g.state === 'menu') g.start();
    if (g.state === 'gameover') { g.resetRun(); g.start(); }
    return g.state === 'playing';
  }

  // HUD 元件拖曳
  _initDrag() {
    let drag = null;
    document.addEventListener('pointerdown', (e) => {
      if (!this.open) return;
      const el = e.target.closest?.('[data-hud]');
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      const key = el.dataset.hud;
      const cfg = this.layout.hud[key];
      drag = { key, cfg, sx: e.clientX, sy: e.clientY, ox: cfg.x, oy: cfg.y };
    }, true);
    document.addEventListener('pointermove', (e) => {
      if (!drag) return;
      drag.cfg.x = +(drag.ox + ((e.clientX - drag.sx) / innerWidth) * 100).toFixed(1);
      drag.cfg.y = +(drag.oy + ((e.clientY - drag.sy) / innerHeight) * 100).toFixed(1);
      this._changed();
    });
    document.addEventListener('pointerup', () => { drag = null; });
    // 拖曳時避免觸發按鈕
    document.addEventListener('click', (e) => {
      if (this.open && e.target.closest?.('[data-hud]')) { e.stopPropagation(); e.preventDefault(); }
    }, true);
  }
}
