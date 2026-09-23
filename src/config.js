// 遊戲全域設定：DEV 工具會即時修改這些物件，匯出後再 bake 回此檔

export const GAME_TITLE = 'SUBWAY SURF 3D';

// 遊戲手感參數
export const TUNING = {
  laneWidth: 2.6,
  startSpeed: 21,
  maxSpeed: 44,
  accel: 0.22, // 每秒增加的速度
  gravity: 40,
  jumpVelocity: 13.2,
  superJumpVelocity: 19.5,
  fastFallVelocity: 34,
  laneSwitchSharpness: 16, // 換道追隨速度（越大越快）
  rollDuration: 0.62,
  jetpackDuration: 8,
  jetpackHeight: 13,
  magnetDuration: 12,
  sneakersDuration: 12,
  multiplierDuration: 15,
  hoverboardDuration: 30,
  hoverboardsPerRun: 3,
  magnetRadius: 9,
  chaseDuration: 4.5,
  trainSpeed: 17,
  spawnAhead: 280,
  powerupChance: 0.16,
  // 彎道
  curveMax: 0.0018, // 左右彎曲最大量
  hillMax: 0.00045, // 上下起伏最大量
  baseHill: -0.00018, // 基本下彎（地平線感）
  curveInterval: 6, // 幾秒換一次彎道
  curveSharpness: 0.45, // 彎道過渡速度
  // 日夜與天氣
  dayLength: 150, // 一整個日夜循環秒數
  rainChance: 0.35,
  weatherInterval: 35,
};

// 視覺參數（全域倍率；顏色由日夜關鍵影格決定）
export const VISUAL = {
  exposure: 1,
  bloomStrength: 1,
  bloomRadius: 0.45,
  bloomThreshold: 0.95,
  sunIntensity: 1,
  hemiIntensity: 1,
  fogNear: 70,
  fogFar: 290,
  vignette: 0.38,
  saturation: 1.12,
  shake: 1,
};

// 日夜關鍵影格（DEV 工具可調色）
export const SKY = {
  day: { skyTop: '#2f7bff', skyBottom: '#d6ecff', fog: '#c4e2ff', sunColor: '#fff0d4', sun: 2.8, hemiSky: '#d4ebff', hemiGround: '#6d5a48', hemi: 1.15, exposure: 1.05, bloom: 0.55, stars: 0, night: 0 },
  sunset: { skyTop: '#4a45c8', skyBottom: '#ffa66b', fog: '#f0a07a', sunColor: '#ffa45c', sun: 2.2, hemiSky: '#ffc49a', hemiGround: '#5a3f3a', hemi: 0.95, exposure: 1.05, bloom: 0.65, stars: 0.15, night: 0.55 },
  night: { skyTop: '#040820', skyBottom: '#2a1f5c', fog: '#1e1a46', sunColor: '#9fb4ff', sun: 0.6, hemiSky: '#5566b8', hemiGround: '#1a1426', hemi: 0.6, exposure: 1.0, bloom: 0.75, stars: 1, night: 1 },
  dawn: { skyTop: '#3d6bd6', skyBottom: '#ffc4a8', fog: '#e6c2c0', sunColor: '#ffcfa8', sun: 1.9, hemiSky: '#e0d4ff', hemiGround: '#5a4a48', hemi: 0.95, exposure: 1.05, bloom: 0.7, stars: 0.25, night: 0.4 },
};

// PC 版面（橫向）
export const LAYOUT_PC = {
  camera: { height: 6.2, distance: 8.4, lookAhead: 7, lookHeight: 0.2, fov: 60, followX: 0.7, speedFov: 10 },
  hud: {
    score: { x: 94, y: 6, size: 46, color: '#ffffff' },
    coins: { x: 94, y: 14, size: 32, color: '#ffd43b' },
    powerups: { x: 96.5, y: 20, size: 1 },
    board: { x: 6, y: 92, size: 26 },
    pause: { x: 4, y: 7, size: 1 },
    banner: { x: 50, y: 28, size: 64 },
  },
};

// Mobile 版面（直向）
export const LAYOUT_MOBILE = {
  camera: { height: 7.2, distance: 9.4, lookAhead: 8, lookHeight: 0.4, fov: 70, followX: 0.6, speedFov: 10 },
  hud: {
    score: { x: 88, y: 5, size: 34, color: '#ffffff' },
    coins: { x: 88, y: 10, size: 26, color: '#ffd43b' },
    powerups: { x: 96, y: 14, size: 0.8 },
    board: { x: 12, y: 93, size: 24 },
    pause: { x: 9, y: 5, size: 0.9 },
    banner: { x: 50, y: 26, size: 42 },
  },
};

// 深拷貝預設值，供 DEV 工具「重置」使用
export const DEFAULTS = JSON.parse(JSON.stringify({ TUNING, VISUAL, SKY, LAYOUT_PC, LAYOUT_MOBILE }));

const OVERRIDE_KEY = 'ss3d_dev_overrides_v2';

// 讀取 DEV 工具暫存的覆寫值（尚未 bake 進原始碼前）
export function loadOverrides() {
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY);
    if (!raw) return;
    const o = JSON.parse(raw);
    deepAssign(TUNING, o.TUNING);
    deepAssign(VISUAL, o.VISUAL);
    deepAssign(SKY, o.SKY);
    deepAssign(LAYOUT_PC, o.LAYOUT_PC);
    deepAssign(LAYOUT_MOBILE, o.LAYOUT_MOBILE);
  } catch (e) { /* 忽略 */ }
}

export function saveOverrides() {
  try {
    localStorage.setItem(OVERRIDE_KEY, JSON.stringify({ TUNING, VISUAL, SKY, LAYOUT_PC, LAYOUT_MOBILE }));
  } catch (e) { /* 忽略 */ }
}

export function clearOverrides() {
  try { localStorage.removeItem(OVERRIDE_KEY); } catch (e) { /* 忽略 */ }
  deepAssign(TUNING, DEFAULTS.TUNING);
  deepAssign(VISUAL, DEFAULTS.VISUAL);
  deepAssign(SKY, DEFAULTS.SKY);
  deepAssign(LAYOUT_PC, DEFAULTS.LAYOUT_PC);
  deepAssign(LAYOUT_MOBILE, DEFAULTS.LAYOUT_MOBILE);
}

export function exportAll() {
  return JSON.stringify({ TUNING, VISUAL, SKY, LAYOUT_PC, LAYOUT_MOBILE }, null, 2);
}

function deepAssign(target, src) {
  if (!src) return;
  for (const k of Object.keys(src)) {
    if (!(k in target)) continue;
    if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) deepAssign(target[k], src[k]);
    else target[k] = src[k];
  }
}

export const IS_MOBILE = (() => {
  const ua = navigator.userAgent || '';
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
})();
