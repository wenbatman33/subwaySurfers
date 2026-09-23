import * as THREE from 'three';

// 程序化產生所有貼圖（不依賴外部素材）

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

export function toTexture(c, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

function noise(g, w, h, count, colFn, sMin = 1, sMax = 3) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = colFn();
    const s = rand(sMin, sMax);
    g.fillRect(rand(0, w), rand(0, h), s, s);
  }
}

// 碎石地面
export function gravelTexture(dark = false) {
  const [c, g] = makeCanvas(512, 512);
  g.fillStyle = dark ? '#4a423c' : '#7a6e62';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 7000; i++) {
    const v = (dark ? rand(40, 100) : rand(70, 160)) | 0;
    g.fillStyle = `rgb(${v + 8},${v},${v - 10})`;
    const s = rand(1.5, 5);
    g.beginPath();
    g.ellipse(rand(0, 512), rand(0, 512), s, s * rand(0.5, 1), rand(0, 3), 0, Math.PI * 2);
    g.fill();
  }
  // 暗色陰影點
  for (let i = 0; i < 1500; i++) {
    g.fillStyle = `rgba(0,0,0,${rand(0.1, 0.35)})`;
    g.fillRect(rand(0, 512), rand(0, 512), rand(1, 3), rand(1, 3));
  }
  return toTexture(c);
}

// 混凝土 + 塗鴉牆
const WORDS = ['SURF', 'RUN!', 'HYPE', 'ZOOM', 'YO!', 'FRESH', 'KING', 'DASH', 'WILD', 'BOOM', 'RUSH', 'JAKE', 'FLY', 'COOL', 'GO!', 'WOW'];
const SPRAY = [
  ['#ff3b6b', '#ffb13b'], ['#3bd1ff', '#7a3bff'], ['#6bff3b', '#00b894'], ['#ffe23b', '#ff6b00'],
  ['#ff4df0', '#6a00ff'], ['#00e5ff', '#00ff95'], ['#ff5a36', '#ffd000'],
];

function drawGraffitiWord(g, text, x, y, size, rot) {
  const [c1, c2] = pick(SPRAY);
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.font = `900 ${size}px "Luckiest Guy", "Arial Black", Impact, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  // 噴漆光暈
  const halo = g.createRadialGradient(0, 0, 10, 0, 0, size * 1.6);
  halo.addColorStop(0, c1 + '55');
  halo.addColorStop(1, c1 + '00');
  g.fillStyle = halo;
  g.fillRect(-size * 2.5, -size * 1.5, size * 5, size * 3);
  // 立體陰影
  g.lineWidth = size * 0.22;
  g.strokeStyle = '#111';
  g.strokeText(text, size * 0.06, size * 0.08);
  g.strokeText(text, 0, 0);
  // 漸層填色
  const grad = g.createLinearGradient(0, -size / 2, 0, size / 2);
  grad.addColorStop(0, c1);
  grad.addColorStop(1, c2);
  g.fillStyle = grad;
  g.fillText(text, 0, 0);
  // 高光
  g.lineWidth = size * 0.03;
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.strokeText(text, -size * 0.02, -size * 0.03);
  // 滴漆
  const w = g.measureText(text).width;
  g.fillStyle = c2;
  for (let i = 0; i < 6; i++) {
    const dx = rand(-w / 2, w / 2);
    const len = rand(size * 0.2, size * 0.7);
    g.fillRect(dx, size * 0.35, size * 0.05, len);
    g.beginPath();
    g.arc(dx + size * 0.025, size * 0.35 + len, size * 0.05, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

function drawTag(g, x, y) {
  g.save();
  g.strokeStyle = pick(['#111', '#e8322b', '#1e5bff', '#fff', '#111']);
  g.lineWidth = rand(3, 6);
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x, y);
  for (let i = 0; i < 6; i++) g.quadraticCurveTo(x + rand(-10, 40) * i * 0.4, y + rand(-30, 30), x + i * 18, y + rand(-20, 20));
  g.stroke();
  g.restore();
}

export function graffitiWallTexture() {
  const W = 1024, H = 320;
  const [c, g] = makeCanvas(W, H);
  // 混凝土
  const base = pick(['#8f8b84', '#9b958a', '#86827d', '#a29a8c']);
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  noise(g, W, H, 9000, () => `rgba(${rand(0, 1) > 0.5 ? '255,255,255' : '0,0,0'},${rand(0.03, 0.12)})`, 1, 4);
  // 面板接縫
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 3;
  for (let x = 0; x <= W; x += 256) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  // 底部水漬
  const stain = g.createLinearGradient(0, H * 0.6, 0, H);
  stain.addColorStop(0, 'rgba(40,30,20,0)');
  stain.addColorStop(1, 'rgba(40,30,20,0.55)');
  g.fillStyle = stain;
  g.fillRect(0, 0, W, H);
  // 塗鴉作品
  const n = (rand(1, 3) | 0);
  for (let i = 0; i < n; i++) {
    drawGraffitiWord(g, pick(WORDS), (i + 0.5) * (W / n) + rand(-60, 60), H * rand(0.42, 0.6), rand(110, 170), rand(-0.12, 0.12));
  }
  for (let i = 0; i < 8; i++) drawTag(g, rand(0, W), rand(H * 0.2, H * 0.9));
  // 頂部壓邊
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(0, 0, W, 10);
  return toTexture(c);
}

// 大樓外牆（含窗戶發光貼圖）
// style: 0 紅磚 1 米色 2 藍灰 3 橘褐 4 粉紅 5 薄荷 6 深灰(夜城) 7 深磚 8 木屋
export function facadeTextures(style, litChance = 0.35) {
  const S = 256;
  const [c, g] = makeCanvas(S, S);
  const [ec, eg] = makeCanvas(S, S);
  const palettes = [
    { wall: '#a8553c', trim: '#7a3a28', brick: true },
    { wall: '#d9c7a3', trim: '#b09a74' },
    { wall: '#7d8aa0', trim: '#5c677a' },
    { wall: '#c98a4b', trim: '#9c6533', brick: true },
    { wall: '#f4a3c0', trim: '#ffffff' },
    { wall: '#9ddcc8', trim: '#ffffff' },
    { wall: '#34344a', trim: '#22222e' },
    { wall: '#5a3333', trim: '#3a2020', brick: true },
    { wall: '#8a5a3a', trim: '#5e3a22', wood: true },
  ];
  const p = palettes[style % palettes.length];
  g.fillStyle = p.wall;
  g.fillRect(0, 0, S, S);
  if (p.brick) {
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    g.lineWidth = 1;
    for (let y = 0; y < S; y += 8) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke();
      for (let x = (y / 8) % 2 ? 0 : 8; x < S; x += 16) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 8); g.stroke(); }
    }
  } else if (p.wood) {
    for (let y = 0; y < S; y += 16) {
      g.fillStyle = `rgba(0,0,0,${rand(0.05, 0.2)})`;
      g.fillRect(0, y, S, 14);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(0, y + 14, S, 2);
    }
  } else {
    noise(g, S, S, 1500, () => `rgba(0,0,0,${rand(0.03, 0.1)})`, 1, 3);
  }
  eg.fillStyle = '#000';
  eg.fillRect(0, 0, S, S);
  const warm = ['#ffcf7a', '#ffe2a8', '#ffb45c', '#fff1c8'];
  for (let r = 0; r < 2; r++) {
    for (let col = 0; col < 2; col++) {
      const x = col * 128 + 28, y = r * 128 + 22, w = 72, h = 84;
      g.fillStyle = p.trim;
      g.fillRect(x - 8, y - 8, w + 16, h + 20);
      const lit = Math.random() < litChance;
      const glass = g.createLinearGradient(x, y, x + w, y + h);
      glass.addColorStop(0, lit ? '#ffe7a8' : '#3a5a7a');
      glass.addColorStop(1, lit ? '#ffb85c' : '#1c2c40');
      g.fillStyle = glass;
      g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + w * 0.5, y); g.lineTo(x, y + h * 0.5); g.fill();
      g.fillStyle = p.trim;
      g.fillRect(x + w / 2 - 3, y, 6, h);
      g.fillRect(x, y + h / 2 - 3, w, 6);
      if (lit) { eg.fillStyle = pick(warm); eg.fillRect(x, y, w, h); }
    }
  }
  return { map: toTexture(c), emissiveMap: toTexture(ec) };
}

// 雪地
export function snowTexture() {
  const [c, g] = makeCanvas(512, 512);
  g.fillStyle = '#e9f0f7';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 5000; i++) {
    const v = rand(200, 255) | 0;
    g.fillStyle = `rgba(${v - 20},${v - 8},${v},${rand(0.2, 0.6)})`;
    const s = rand(1, 6);
    g.beginPath(); g.arc(rand(0, 512), rand(0, 512), s, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(90,80,70,${rand(0.1, 0.4)})`;
    g.fillRect(rand(0, 512), rand(0, 512), rand(1, 4), rand(1, 4));
  }
  return toTexture(c);
}

// 沙灘
export function sandTexture() {
  const [c, g] = makeCanvas(256, 256);
  g.fillStyle = '#e8d09a';
  g.fillRect(0, 0, 256, 256);
  noise(g, 256, 256, 5000, () => `rgba(${rand(0, 1) > 0.5 ? '255,255,255' : '120,90,40'},${rand(0.05, 0.25)})`, 1, 3);
  return toTexture(c);
}

// 霓虹招牌
const NEON_WORDS = ['RAMEN', 'BAR', '24H', 'HOTEL', 'CLUB', 'PIZZA', 'GAME', '拉麵', '酒吧', '夜市', 'KARAOKE', 'SUSHI', 'OPEN', 'CAFE'];
const NEON_COLORS = ['#ff2bd6', '#2bf3ff', '#ffe600', '#ff5a1f', '#6bff4a', '#b05bff'];
export function neonSignTexture() {
  const [c, g] = makeCanvas(512, 192);
  const col = pick(NEON_COLORS);
  const text = pick(NEON_WORDS);
  g.fillStyle = '#0a0a14';
  g.fillRect(0, 0, 512, 192);
  g.shadowColor = col;
  g.shadowBlur = 24;
  g.strokeStyle = col;
  g.lineWidth = 8;
  g.beginPath(); g.roundRect(14, 14, 484, 164, 26); g.stroke();
  g.font = `900 ${/[一-鿿]/.test(text) ? 110 : 96}px "Noto Sans TC", "Arial Black", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#ffffff';
  g.shadowBlur = 30;
  g.fillText(text, 256, 100);
  // 中文不描邊（避免筆畫重疊處出現內線），改用第二層彩色光暈
  g.shadowBlur = 16;
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = col;
  g.globalAlpha = 0.35;
  g.fillText(text, 256, 100);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  return toTexture(c, { repeat: false });
}

// 列車側面（塗裝款式）
export const LIVERIES = [
  { base: '#dfe3e8', base2: '#aab2bc', stripe: '#e8322b', stripe2: '#1f4fa8' },
  { base: '#ffcc2e', base2: '#d9a300', stripe: '#1b1b1b', stripe2: '#ffffff' },
  { base: '#35a66a', base2: '#1f7a4a', stripe: '#f5f5f5', stripe2: '#ffd400' },
  { base: '#3a73e0', base2: '#2350a8', stripe: '#ffd400', stripe2: '#ffffff' },
  { base: '#d6453a', base2: '#a02a22', stripe: '#ffe066', stripe2: '#1b1b1b' },
];

export function trainSideTexture(liv, withGraffiti) {
  const W = 1024, H = 320;
  const [c, g] = makeCanvas(W, H);
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, liv.base);
  grad.addColorStop(0.55, liv.base);
  grad.addColorStop(1, liv.base2);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // 金屬面板線
  g.strokeStyle = 'rgba(0,0,0,0.18)';
  g.lineWidth = 2;
  for (let x = 0; x < W; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  // 條紋
  g.fillStyle = liv.stripe;
  g.fillRect(0, H * 0.62, W, H * 0.09);
  g.fillStyle = liv.stripe2;
  g.fillRect(0, H * 0.73, W, H * 0.035);
  // 窗戶列
  const winY = H * 0.16, winH = H * 0.36;
  const drawWin = (x, w) => {
    g.fillStyle = '#20252e';
    g.fillRect(x - 5, winY - 5, w + 10, winH + 10);
    const gl = g.createLinearGradient(x, winY, x + w, winY + winH);
    gl.addColorStop(0, '#7fb2d9');
    gl.addColorStop(0.5, '#2c4a66');
    gl.addColorStop(1, '#16283a');
    g.fillStyle = gl;
    g.fillRect(x, winY, w, winH);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath(); g.moveTo(x + 8, winY); g.lineTo(x + w * 0.45, winY); g.lineTo(x + 8, winY + winH * 0.8); g.fill();
  };
  // 車門
  const drawDoor = (x) => {
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(x - 4, H * 0.1, 108, H * 0.82);
    g.fillStyle = liv.base2;
    g.fillRect(x, H * 0.12, 48, H * 0.78);
    g.fillRect(x + 52, H * 0.12, 48, H * 0.78);
    drawWin(x + 8, 32);
    drawWin(x + 60, 32);
  };
  drawDoor(150);
  drawDoor(W - 260);
  for (let x = 300; x < W - 300; x += 110) drawWin(x, 84);
  drawWin(40, 80);
  drawWin(W - 120, 80);
  // 車號
  g.font = '900 34px "Arial Black", sans-serif';
  g.fillStyle = liv.stripe2 === '#ffffff' ? '#ffffff' : '#111';
  g.fillText(String((Math.random() * 9000 + 1000) | 0), 40, H * 0.9);
  // 塗鴉
  if (withGraffiti) {
    drawGraffitiWord(g, pick(WORDS), W * rand(0.35, 0.65), H * 0.78, rand(90, 120), rand(-0.08, 0.08));
  }
  // 底部髒污
  const dirt = g.createLinearGradient(0, H * 0.8, 0, H);
  dirt.addColorStop(0, 'rgba(30,20,10,0)');
  dirt.addColorStop(1, 'rgba(30,20,10,0.6)');
  g.fillStyle = dirt;
  g.fillRect(0, 0, W, H);
  return toTexture(c, { repeat: false });
}

export function trainFrontTextures(liv) {
  const W = 256, H = 320;
  const [c, g] = makeCanvas(W, H);
  const [ec, eg] = makeCanvas(W, H);
  g.fillStyle = liv.base;
  g.fillRect(0, 0, W, H);
  g.fillStyle = liv.stripe;
  g.fillRect(0, H * 0.62, W, H * 0.09);
  // 擋風玻璃
  g.fillStyle = '#15191f';
  g.fillRect(22, H * 0.1, W - 44, H * 0.42);
  const gl = g.createLinearGradient(0, H * 0.1, W, H * 0.5);
  gl.addColorStop(0, '#6aa0cc');
  gl.addColorStop(1, '#101c2a');
  g.fillStyle = gl;
  g.fillRect(30, H * 0.12, W - 60, H * 0.38);
  g.fillStyle = 'rgba(255,255,255,0.3)';
  g.beginPath(); g.moveTo(40, H * 0.12); g.lineTo(130, H * 0.12); g.lineTo(40, H * 0.4); g.fill();
  // 路線號
  g.fillStyle = '#111';
  g.fillRect(W / 2 - 34, H * 0.015, 68, 26);
  eg.fillStyle = '#000';
  eg.fillRect(0, 0, W, H);
  eg.fillStyle = '#ff8a00';
  eg.font = '900 22px "Arial Black", sans-serif';
  eg.textAlign = 'center';
  eg.fillText(pick(['A', 'C', 'E', '7', 'Q', 'L']), W / 2, H * 0.015 + 21);
  g.fillStyle = '#ff8a00';
  g.font = '900 22px "Arial Black", sans-serif';
  g.textAlign = 'center';
  g.fillText('', W / 2, 0);
  // 車頭燈
  for (const x of [48, W - 48]) {
    g.fillStyle = '#222';
    g.beginPath(); g.arc(x, H * 0.82, 22, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fffbe0';
    g.beginPath(); g.arc(x, H * 0.82, 15, 0, Math.PI * 2); g.fill();
    eg.fillStyle = '#fff6c8';
    eg.beginPath(); eg.arc(x, H * 0.82, 16, 0, Math.PI * 2); eg.fill();
  }
  // 保險桿
  g.fillStyle = '#2a2a2a';
  g.fillRect(0, H * 0.93, W, H * 0.07);
  return { map: toTexture(c, { repeat: false }), emissiveMap: toTexture(ec, { repeat: false }) };
}

// 警示條紋
export function stripeTexture(c1, c2, stripes = 8) {
  const [c, g] = makeCanvas(256, 64);
  g.fillStyle = c1;
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = c2;
  const w = 256 / stripes;
  for (let i = -2; i < stripes + 2; i++) {
    g.beginPath();
    g.moveTo(i * w, 64); g.lineTo(i * w + w / 2, 64); g.lineTo(i * w + w / 2 + 32, 0); g.lineTo(i * w + 32, 0);
    g.fill();
  }
  g.strokeStyle = 'rgba(0,0,0,0.4)';
  g.lineWidth = 4;
  g.strokeRect(0, 0, 256, 64);
  return toTexture(c);
}

// 頭頂障礙告示牌
export function signTexture() {
  const [c, g] = makeCanvas(512, 192);
  g.fillStyle = '#1b1b1b';
  g.fillRect(0, 0, 512, 192);
  g.fillStyle = '#ffd000';
  for (let i = -2; i < 14; i++) {
    g.beginPath();
    g.moveTo(i * 44, 192); g.lineTo(i * 44 + 22, 192); g.lineTo(i * 44 + 22 + 60, 0); g.lineTo(i * 44 + 60, 0);
    g.fill();
  }
  g.fillStyle = '#d7261e';
  g.fillRect(80, 40, 352, 112);
  g.strokeStyle = '#fff';
  g.lineWidth = 8;
  g.strokeRect(84, 44, 344, 104);
  g.fillStyle = '#fff';
  g.font = '900 80px "Arial Black", Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('STOP', 256, 100);
  return toTexture(c, { repeat: false });
}

// 斜坡金屬花紋板
export function plateTexture() {
  const [c, g] = makeCanvas(256, 256);
  g.fillStyle = '#8c939b';
  g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) {
    for (let x = (y / 32) % 2 ? 16 : 0; x < 256; x += 32) {
      g.save();
      g.translate(x + 8, y + 8);
      g.rotate(Math.PI / 4 * ((x / 16 + y / 32) % 2 ? 1 : -1));
      g.fillStyle = '#b5bcc4';
      g.fillRect(-10, -3, 20, 6);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(-10, 3, 20, 2);
      g.restore();
    }
  }
  noise(g, 256, 256, 800, () => `rgba(60,40,20,${rand(0.05, 0.2)})`, 1, 4);
  return toTexture(c);
}

// 圓形柔光（粒子用）
export function glowTexture() {
  const [c, g] = makeCanvas(64, 64);
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.3, 'rgba(255,255,255,0.7)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return toTexture(c, { repeat: false });
}

// 雲朵
export function cloudTexture() {
  const [c, g] = makeCanvas(512, 256);
  for (let i = 0; i < 22; i++) {
    const x = rand(90, 420), y = rand(110, 170), r = rand(40, 90);
    const grad = g.createRadialGradient(x, y - r * 0.2, r * 0.1, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.7, 'rgba(240,246,255,0.7)');
    grad.addColorStop(1, 'rgba(230,240,255,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  return toTexture(c, { repeat: false });
}

// 道具圖示（HUD 與 3D 共用）
export function powerupIconCanvas(type, size = 128) {
  const [c, g] = makeCanvas(size, size);
  const s = size / 128;
  g.scale(s, s);
  const bg = { jetpack: ['#ff7a00', '#ffcf00'], magnet: ['#e8322b', '#ff7aa2'], sneakers: ['#20c997', '#a3ff5c'], multiplier: ['#7a3bff', '#3bd1ff'] }[type];
  const grd = g.createRadialGradient(64, 50, 10, 64, 64, 64);
  grd.addColorStop(0, bg[1]);
  grd.addColorStop(1, bg[0]);
  g.fillStyle = grd;
  g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
  g.lineWidth = 7;
  g.strokeStyle = '#fff';
  g.stroke();
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.strokeStyle = '#1b1b1b';
  g.lineWidth = 5;
  if (type === 'jetpack') {
    g.fillStyle = '#d9dde2';
    g.beginPath(); g.roundRect(34, 30, 26, 56, 10); g.fill(); g.stroke();
    g.beginPath(); g.roundRect(68, 30, 26, 56, 10); g.fill(); g.stroke();
    g.fillStyle = '#ffdd00';
    g.beginPath(); g.moveTo(38, 90); g.lineTo(47, 116); g.lineTo(56, 90); g.fill();
    g.beginPath(); g.moveTo(72, 90); g.lineTo(81, 116); g.lineTo(90, 90); g.fill();
  } else if (type === 'magnet') {
    g.lineWidth = 22;
    g.strokeStyle = '#1b1b1b';
    g.beginPath(); g.arc(64, 58, 28, Math.PI, 0); g.lineTo(92, 92); g.moveTo(36, 58); g.lineTo(36, 92); g.stroke();
    g.lineWidth = 14;
    g.strokeStyle = '#e8322b';
    g.beginPath(); g.arc(64, 58, 28, Math.PI, 0); g.lineTo(92, 80); g.moveTo(36, 58); g.lineTo(36, 80); g.stroke();
    g.strokeStyle = '#e8eef5';
    g.beginPath(); g.moveTo(36, 82); g.lineTo(36, 94); g.moveTo(92, 82); g.lineTo(92, 94); g.stroke();
  } else if (type === 'sneakers') {
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(22, 84); g.lineTo(26, 54); g.quadraticCurveTo(46, 48, 58, 64); g.quadraticCurveTo(90, 70, 106, 80); g.lineTo(106, 92); g.lineTo(22, 92); g.closePath();
    g.fill(); g.stroke();
    g.fillStyle = '#20c997';
    g.fillRect(24, 84, 82, 8);
    g.fillStyle = '#ffdd00';
    g.beginPath(); g.moveTo(30, 44); g.lineTo(16, 30); g.lineTo(34, 36); g.fill();
  } else {
    g.fillStyle = '#fff';
    g.font = '900 60px "Luckiest Guy", "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 8;
    g.strokeText('2x', 64, 70);
    g.fillText('2x', 64, 70);
  }
  return c;
}
