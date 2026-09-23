// 輸入：鍵盤（PC）＋ 滑動手勢（手機 / 滑鼠拖曳），雙擊啟動滑板

export class Input {
  constructor(el, onAction) {
    this.onAction = onAction;
    this.el = el;
    this.start = null;
    this.fired = false;
    this.lastTap = 0;

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
      const k = e.code;
      const map = {
        ArrowLeft: 'left', KeyA: 'left',
        ArrowRight: 'right', KeyD: 'right',
        ArrowUp: 'up', KeyW: 'up', Space: 'up',
        ArrowDown: 'down', KeyS: 'down',
        KeyH: 'board', ShiftLeft: 'board', ShiftRight: 'board',
        Escape: 'pause', KeyP: 'pause',
        Enter: 'confirm',
      };
      const a = map[k];
      if (a) {
        if (e.repeat) return;
        e.preventDefault();
        this.onAction(a, e);
      }
    });

    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      this.start = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
      this.fired = false;
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.start || this.fired || e.pointerId !== this.start.id) return;
      const dx = e.clientX - this.start.x;
      const dy = e.clientY - this.start.y;
      const th = Math.max(22, Math.min(window.innerWidth, window.innerHeight) * 0.045);
      if (Math.abs(dx) < th && Math.abs(dy) < th) return;
      this.fired = true;
      if (Math.abs(dx) > Math.abs(dy)) this.onAction(dx < 0 ? 'left' : 'right', e);
      else this.onAction(dy < 0 ? 'up' : 'down', e);
    });
    const end = (e) => {
      if (!this.start || e.pointerId !== this.start.id) return;
      if (!this.fired) {
        const now = performance.now();
        if (now - this.lastTap < 300) { this.onAction('board', e); this.lastTap = 0; }
        else { this.lastTap = now; this.onAction('tap', e); }
      }
      this.start = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', () => { this.start = null; });
  }
}
