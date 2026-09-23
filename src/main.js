import { installBend } from './bend.js';
import { loadOverrides } from './config.js';
import { Game } from './game.js';
import { DevTools } from './devtools.js';
import { loadModels } from './models.js';

// 進入點：載入 DEV 覆寫值 → 等字型 → 建立遊戲

installBend();
loadOverrides();

async function boot() {
  // 等待字型載入，讓塗鴉貼圖使用正確字型
  try {
    await Promise.race([
      Promise.all([document.fonts.load('40px "Luckiest Guy"'), document.fonts.ready]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch (e) { /* 忽略 */ }
  // 角色來源：預設使用程序化 Toon 角色；設為 true 改用 public/models 的 GLB 模型
  const USE_GLB_MODELS = false;
  let models = null;
  if (USE_GLB_MODELS) {
    try { models = await loadModels(); } catch (e) { console.warn('模型載入失敗，改用程序化角色', e); }
  }
  const game = new Game(document.getElementById('game'), models);
  new DevTools(game);
  window.__game = game; // 除錯用
  const ld = document.getElementById('loading');
  ld.style.opacity = '0';
  setTimeout(() => ld.remove(), 500);
}

boot();
