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
};

// 視覺參數
export const VISUAL = {
  exposure: 1.05,
  bloomStrength: 0.55,
  bloomRadius: 0.45,
  bloomThreshold: 0.85,
  sunIntensity: 2.8,
  hemiIntensity: 1.15,
  fogNear: 70,
  fogFar: 290,
  fogColor: '#c4e2ff',
  skyTop: '#2f7bff',
  skyBottom: '#d6ecff',
  vignette: 0.38,
  saturation: 1.12,
  shake: 1,
};

// PC 版面（橫向）
export const LAYOUT_PC = {
  camera: { height: 6.2, distance: 8.4, lookAhead: 7, lookHeight: 0.2, fov: 60, followX: 0.7, speedFov: 10 },
  hud: {
    score: { x: 94, y: 6, size: 46, color: '#ffffff' },
    coins: { x: 94, y: 14, size: 32, color: '#ffd43b' },
    powerups: { x: 93, y: 30, size: 1 },
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
    powerups: { x: 86, y: 22, size: 0.85 },
    board: { x: 12, y: 93, size: 24 },
    pause: { x: 9, y: 5, size: 0.9 },
    banner: { x: 50, y: 26, size: 42 },
  },
};

// 深拷貝預設值，供 DEV 工具「重置」使用
export const DEFAULTS = JSON.parse(JSON.stringify({ TUNING, VISUAL, LAYOUT_PC, LAYOUT_MOBILE }));

const OVERRIDE_KEY = 'ss3d_dev_overrides_v1';

// 讀取 DEV 工具暫存的覆寫值（尚未 bake 進原始碼前）
export function loadOverrides() {
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY);
    if (!raw) return;
    const o = JSON.parse(raw);
    deepAssign(TUNING, o.TUNING);
    deepAssign(VISUAL, o.VISUAL);
    deepAssign(LAYOUT_PC, o.LAYOUT_PC);
    deepAssign(LAYOUT_MOBILE, o.LAYOUT_MOBILE);
  } catch (e) { /* 忽略 */ }
}

export function saveOverrides() {
  try {
    localStorage.setItem(OVERRIDE_KEY, JSON.stringify({ TUNING, VISUAL, LAYOUT_PC, LAYOUT_MOBILE }));
  } catch (e) { /* 忽略 */ }
}

export function clearOverrides() {
  try { localStorage.removeItem(OVERRIDE_KEY); } catch (e) { /* 忽略 */ }
  deepAssign(TUNING, DEFAULTS.TUNING);
  deepAssign(VISUAL, DEFAULTS.VISUAL);
  deepAssign(LAYOUT_PC, DEFAULTS.LAYOUT_PC);
  deepAssign(LAYOUT_MOBILE, DEFAULTS.LAYOUT_MOBILE);
}

export function exportAll() {
  return JSON.stringify({ TUNING, VISUAL, LAYOUT_PC, LAYOUT_MOBILE }, null, 2);
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
