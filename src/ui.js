import { powerupIconCanvas } from './textures.js';

// DOM 介面：HUD、選單、暫停、結算，並依 LAYOUT 擺放

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.el = {
      hud: $('hud'), score: $('score'), coins: $('coins'), multi: $('multi'), powerups: $('powerups'),
      boards: $('boards'), boardBox: $('boardBox'), banner: $('banner'),
      menu: $('menu'), pause: $('pauseScreen'), over: $('overScreen'),
      best: $('bestScore'), total: $('totalCoins'),
    };
    this.puEls = {};
    this._last = {};
    this.uiScale = 1;
  }

  show(name) {
    for (const k of ['menu', 'pause', 'over']) this.el[k].classList.toggle('hidden', k !== name);
    this.el.hud.classList.toggle('hidden', !(name === 'hud' || name === 'pause'));
  }

  // 套用版面（位置 % + 字級 px × 縮放）
  applyLayout(layout, portrait) {
    const base = portrait ? 400 : 760;
    this.uiScale = Math.max(0.6, Math.min(1.35, Math.min(innerWidth, innerHeight) / base));
    const s = this.uiScale;
    const h = layout.hud;
    const place = (el, cfg) => { el.style.left = cfg.x + '%'; el.style.top = cfg.y + '%'; };
    place($('scoreBox'), h.score);
    this.el.score.style.fontSize = h.score.size * s + 'px';
    this.el.score.style.color = h.score.color;
    place($('coinBox'), h.coins);
    $('coinBox').style.fontSize = h.coins.size * s + 'px';
    this.el.coins.style.color = h.coins.color;
    place(this.el.powerups, h.powerups);
    this.el.powerups.style.transform = `translate(-100%, 0) scale(${h.powerups.size * s})`;
    this.el.powerups.style.transformOrigin = 'right top';
    place(this.el.boardBox, h.board);
    this.el.boardBox.style.fontSize = h.board.size * s + 'px';
    place($('btnPause'), h.pause);
    $('btnPause').style.scale = String(h.pause.size * s);
    place(this.el.banner, h.banner);
    this.el.banner.style.fontSize = h.banner.size * s + 'px';
  }

  setMenuStats(best, total) {
    this.el.best.textContent = best;
    this.el.total.textContent = total;
  }

  hud(state) {
    const { score, coins, mult, boost, boards, boardActive, powerups } = state;
    const sc = String(Math.floor(score));
    if (this._last.score !== sc) { this.el.score.textContent = sc; this._last.score = sc; }
    if (this._last.coins !== coins) { this.el.coins.textContent = coins; this._last.coins = coins; }
    const mt = 'x' + mult;
    if (this._last.mult !== mt) { this.el.multi.textContent = mt; this._last.mult = mt; }
    this.el.multi.classList.toggle('boost', boost);
    if (this._last.boards !== boards) { this.el.boards.textContent = boards; this._last.boards = boards; }
    this.el.boardBox.classList.toggle('active', boardActive);
    this.el.boardBox.classList.toggle('empty', boards <= 0 && !boardActive);
    // 道具倒數條
    for (const [type, frac] of Object.entries(powerups)) {
      let el = this.puEls[type];
      if (frac > 0) {
        if (!el) {
          el = document.createElement('div');
          el.className = 'pu';
          el.appendChild(powerupIconCanvas(type, 96));
          this.el.powerups.appendChild(el);
          this.puEls[type] = el;
        }
        el.style.setProperty('--p', frac.toFixed(3));
        el.classList.toggle('ending', frac < 0.2);
      } else if (el) {
        el.remove();
        delete this.puEls[type];
      }
    }
  }

  clearPowerups() {
    for (const el of Object.values(this.puEls)) el.remove();
    this.puEls = {};
  }

  banner(text, color = '#ffe23b') {
    const b = this.el.banner;
    b.textContent = text;
    b.style.color = color;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
  }

  gameOver({ score, coins, dist, best, isBest, caught }) {
    $('overTitle').textContent = caught ? '被抓到了！' : '撞車了！';
    $('rScore').textContent = Math.floor(score);
    $('rCoins').textContent = coins;
    $('rDist').textContent = Math.floor(dist) + 'm';
    $('rBest').textContent = best;
    $('newBest').classList.toggle('hidden', !isBest);
    this.show('over');
  }

  setSoundLabel(on) {
    for (const id of ['btnSound', 'btnSound2']) $(id).textContent = on ? '🔊 音效：開' : '🔇 音效：關';
  }
}
