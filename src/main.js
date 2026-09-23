import { installBend } from './bend.js';
import { loadOverrides } from './config.js';
import { Game } from './game.js';
import { DevTools } from './devtools.js';

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
  const game = new Game(document.getElementById('game'));
  new DevTools(game);
  window.__game = game; // 除錯用
  const ld = document.getElementById('loading');
  ld.style.opacity = '0';
  setTimeout(() => ld.remove(), 500);
}

boot();
