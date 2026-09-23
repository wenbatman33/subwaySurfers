// WebAudio 程序化音樂與音效（無外部音檔）

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI → Hz

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.musicOn = true;
    this.step = 0;
    this.bar = 0;
    this.nextTime = 0;
    this.tempo = 104;
    this.intensity = 0; // 0=選單, 1=遊戲
    this.jetNode = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 8;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    this.master.connect(comp).connect(ctx.destination);

    // 音樂匯流排（含低通濾波，暫停/死亡時悶住）
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 900;
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.55;
    this.musicFilter.connect(this.musicGain).connect(this.master);

    this.sfxGain = ctx.createGain();
    this.sfxGain.gain.value = 0.9;
    this.sfxGain.connect(this.master);

    // 殘響
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(1.6, 2.5);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.22;
    this.reverbSend.connect(this.reverb).connect(this.master);

    this.noiseBuf = this._noiseBuffer(2);
    this.nextTime = ctx.currentTime + 0.1;
    this._timer = setInterval(() => this._schedule(), 25);
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.85 : 0, this.ctx.currentTime, 0.05);
  }

  // 音樂濾波：0=悶, 1=全開
  setMusicOpen(v, time = 0.4) {
    if (!this.ctx) return;
    const f = 400 + Math.pow(v, 2) * 19000;
    this.musicFilter.frequency.setTargetAtTime(f, this.ctx.currentTime, time / 3);
  }

  setIntensity(v) { this.intensity = v; }

  _impulse(dur, decay) {
    const ctx = this.ctx;
    const len = ctx.sampleRate * dur;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  _noiseBuffer(sec) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _env(g, t, a, peak, dcy, sus = 0.0001) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(sus, 0.0001), t + a + dcy);
  }

  _osc(type, freq, t, dur, peak, dest, { a = 0.005, detune = 0, freqEnd = null, freqTime = null } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + (freqTime || dur));
    o.detune.value = detune;
    const g = ctx.createGain();
    this._env(g, t, a, peak, dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + a + dur + 0.05);
    return { o, g };
  }

  _noise(t, dur, peak, dest, { type = 'bandpass', freq = 1000, q = 1, freqEnd = null, a = 0.003 } = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    this._env(g, t, a, peak, dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random());
    src.stop(t + a + dur + 0.05);
    return { src, f, g };
  }

  // ───────────── 音樂編曲 ─────────────
  _schedule() {
    const ctx = this.ctx;
    if (!ctx || !this.musicOn) return;
    const spb = 60 / this.tempo / 4; // 每 16 分音符秒數
    while (this.nextTime < ctx.currentTime + 0.15) {
      this._playStep(this.step, this.bar, this.nextTime);
      // 搖擺節奏
      const swing = this.step % 2 === 0 ? 1.12 : 0.88;
      this.nextTime += spb * swing;
      this.step++;
      if (this.step >= 16) { this.step = 0; this.bar = (this.bar + 1) % 16; }
    }
  }

  _playStep(s, bar, t) {
    const out = this.musicFilter;
    const game = this.intensity > 0.5;
    const chords = [
      [57, 60, 64], // Am
      [53, 57, 60], // F
      [48, 52, 55], // C
      [55, 59, 62], // G
    ];
    const ci = Math.floor(bar / 1) % 4;
    const chord = chords[ci];
    const root = chord[0] - 24;

    // 鼓組
    const kickPat = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0];
    const kickPat2 = [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0];
    const kp = bar % 4 === 3 ? kickPat2 : kickPat;
    if (kp[s]) this._kick(t, out);
    if (game && (s === 4 || s === 12)) this._snare(t, out);
    if (game && bar % 8 === 7 && s >= 12) this._snare(t, out, 0.25); // 過門
    if (s % 2 === 0 || game) this._hat(t, out, s % 4 === 2 ? 0.09 : 0.045, s === 14 && game);

    // 貝斯
    const bassPat = [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0];
    const bassOff = [0, 0, 0, 0, 0, 0, 12, 0, 0, 0, 7, 0, 0, 0, 0, 0];
    if (bassPat[s]) this._bass(t, NOTE(root + bassOff[s]), 0.22, out);

    // 和弦刷奏
    if (s === 0 || s === 6 || (game && s === 10)) this._stab(t, chord.map(NOTE), s === 0 ? 0.35 : 0.18, out);

    // 主旋律琶音（遊戲中後半段）
    if (game && bar >= 8) {
      const arp = [0, 2, 1, 2, 0, 2, 1, 2, 0, 2, 1, 2, 0, 1, 2, 1];
      if (s % 2 === 0) this._lead(t, NOTE(chord[arp[s]] + 12), 0.12, out);
    }
    // 選單 pad
    if (!game && s === 0) {
      for (const n of chord) this._osc('triangle', NOTE(n), t, 1.8, 0.035, out, { a: 0.3 });
    }
  }

  _kick(t, out) {
    this._osc('sine', 160, t, 0.38, 1.0, out, { freqEnd: 42, freqTime: 0.14, a: 0.002 });
    this._osc('triangle', 1200, t, 0.02, 0.35, out, { freqEnd: 200, a: 0.001 });
  }
  _snare(t, out, vol = 0.5) {
    this._noise(t, 0.2, vol, out, { type: 'bandpass', freq: 2200, q: 0.8 });
    this._osc('triangle', 220, t, 0.1, vol * 0.6, out, { freqEnd: 150 });
    this._noise(t, 0.3, vol * 0.25, this.reverbSend, { type: 'highpass', freq: 3000 });
  }
  _hat(t, out, vol, open) {
    this._noise(t, open ? 0.22 : 0.04, vol, out, { type: 'highpass', freq: 8000, q: 0.5 });
  }
  _bass(t, f, dur, out) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = f;
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.Q.value = 6;
    flt.frequency.setValueAtTime(900, t);
    flt.frequency.exponentialRampToValueAtTime(160, t + dur);
    const g = ctx.createGain();
    this._env(g, t, 0.004, 0.32, dur);
    const g2 = ctx.createGain();
    this._env(g2, t, 0.004, 0.45, dur);
    o.connect(flt).connect(g).connect(out);
    sub.connect(g2).connect(out);
    o.start(t); sub.start(t);
    o.stop(t + dur + 0.1); sub.stop(t + dur + 0.1);
  }
  _stab(t, freqs, dur, out) {
    const ctx = this.ctx;
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(3200, t);
    flt.frequency.exponentialRampToValueAtTime(500, t + dur);
    const g = ctx.createGain();
    this._env(g, t, 0.005, 0.09, dur);
    flt.connect(g).connect(out);
    g.connect(this.reverbSend);
    for (const f of freqs) {
      for (const d of [-9, 9]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = d;
        o.connect(flt);
        o.start(t);
        o.stop(t + dur + 0.1);
      }
    }
  }
  _lead(t, f, dur, out) {
    const { g } = this._osc('square', f, t, dur, 0.05, out, { a: 0.005 });
    g.connect(this.reverbSend);
  }

  // ───────────── 音效 ─────────────
  get t() { return this.ctx ? this.ctx.currentTime : 0; }
  get ok() { return !!this.ctx && this.enabled; }

  coin(combo = 0) {
    if (!this.ok) return;
    const t = this.t;
    const base = 1318 * Math.pow(2, Math.min(combo, 14) / 24);
    this._osc('sine', base, t, 0.09, 0.22, this.sfxGain);
    this._osc('sine', base * 1.5, t + 0.05, 0.22, 0.2, this.sfxGain);
    this._osc('triangle', base * 3, t + 0.05, 0.1, 0.05, this.reverbSend);
  }
  jump() {
    if (!this.ok) return;
    const t = this.t;
    this._osc('square', 220, t, 0.16, 0.08, this.sfxGain, { freqEnd: 660 });
    this._noise(t, 0.2, 0.25, this.sfxGain, { type: 'bandpass', freq: 800, freqEnd: 3000, q: 1.5 });
  }
  superJump() {
    if (!this.ok) return;
    const t = this.t;
    this._osc('sawtooth', 180, t, 0.35, 0.12, this.sfxGain, { freqEnd: 1400 });
    this._noise(t, 0.4, 0.3, this.sfxGain, { type: 'bandpass', freq: 500, freqEnd: 5000, q: 2 });
  }
  roll() {
    if (!this.ok) return;
    this._noise(this.t, 0.3, 0.35, this.sfxGain, { type: 'bandpass', freq: 3000, freqEnd: 400, q: 1.2 });
  }
  swipe() {
    if (!this.ok) return;
    this._noise(this.t, 0.12, 0.22, this.sfxGain, { type: 'bandpass', freq: 1200, freqEnd: 4000, q: 2 });
  }
  land() {
    if (!this.ok) return;
    const t = this.t;
    this._osc('sine', 120, t, 0.12, 0.35, this.sfxGain, { freqEnd: 50 });
    this._noise(t, 0.08, 0.15, this.sfxGain, { type: 'lowpass', freq: 900 });
  }
  stumble() {
    if (!this.ok) return;
    const t = this.t;
    this._noise(t, 0.3, 0.7, this.sfxGain, { type: 'lowpass', freq: 1500, freqEnd: 200 });
    this._osc('square', 300, t, 0.25, 0.15, this.sfxGain, { freqEnd: 90 });
    this._osc('sine', 700, t + 0.05, 0.15, 0.1, this.sfxGain, { freqEnd: 500 });
  }
  crash() {
    if (!this.ok) return;
    const t = this.t;
    this._osc('sine', 110, t, 0.9, 1.0, this.sfxGain, { freqEnd: 30, freqTime: 0.6 });
    this._noise(t, 0.9, 1.0, this.sfxGain, { type: 'lowpass', freq: 5000, freqEnd: 120, q: 0.7 });
    this._noise(t, 1.5, 0.5, this.reverbSend, { type: 'bandpass', freq: 1800, freqEnd: 300, q: 0.5 });
    this._osc('sawtooth', 90, t, 0.5, 0.25, this.sfxGain, { freqEnd: 40 });
    // 金屬撞擊聲
    for (const f of [523, 787, 1103, 1571]) this._osc('triangle', f, t, 0.8, 0.07, this.reverbSend);
  }
  powerup() {
    if (!this.ok) return;
    const t = this.t;
    [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => {
      const { g } = this._osc('square', NOTE(72 + n), t + i * 0.045, 0.14, 0.09, this.sfxGain);
      g.connect(this.reverbSend);
    });
    this._noise(t, 0.6, 0.2, this.sfxGain, { type: 'highpass', freq: 3000, freqEnd: 9000 });
  }
  powerdown() {
    if (!this.ok) return;
    const t = this.t;
    [12, 7, 4, 0].forEach((n, i) => this._osc('triangle', NOTE(72 + n), t + i * 0.06, 0.12, 0.1, this.sfxGain));
  }
  hoverboard() {
    if (!this.ok) return;
    const t = this.t;
    this._osc('sawtooth', 200, t, 0.5, 0.15, this.sfxGain, { freqEnd: 800 });
    this._noise(t, 0.5, 0.3, this.reverbSend, { type: 'bandpass', freq: 600, freqEnd: 4000, q: 3 });
  }
  boardBreak() {
    if (!this.ok) return;
    const t = this.t;
    this._noise(t, 0.5, 0.9, this.sfxGain, { type: 'bandpass', freq: 3000, freqEnd: 300, q: 0.8 });
    this._osc('square', 600, t, 0.4, 0.2, this.sfxGain, { freqEnd: 60 });
  }
  horn(vol = 1) {
    if (!this.ok) return;
    const t = this.t;
    for (const f of [311, 370]) {
      const { g } = this._osc('sawtooth', f, t, 0.9, 0.09 * vol, this.sfxGain, { a: 0.05, freqEnd: f * 0.94, freqTime: 0.9 });
      g.connect(this.reverbSend);
    }
  }
  whoosh() {
    if (!this.ok) return;
    this._noise(this.t, 0.5, 0.35, this.sfxGain, { type: 'bandpass', freq: 300, freqEnd: 2500, q: 1 });
  }
  click() {
    if (!this.ok) return;
    this._osc('square', 880, this.t, 0.06, 0.1, this.sfxGain, { freqEnd: 1320 });
  }
  gameOver() {
    if (!this.ok) return;
    const t = this.t + 0.3;
    [7, 3, 0, -5].forEach((n, i) => {
      const { g } = this._osc('triangle', NOTE(64 + n), t + i * 0.18, 0.35, 0.14, this.sfxGain);
      g.connect(this.reverbSend);
    });
  }
  start() {
    if (!this.ok) return;
    const t = this.t;
    this._noise(t, 0.8, 0.5, this.sfxGain, { type: 'bandpass', freq: 200, freqEnd: 6000, q: 1 });
    this._osc('sawtooth', 110, t, 0.6, 0.2, this.sfxGain, { freqEnd: 880 });
    this._kick(t + 0.6, this.sfxGain);
  }

  // 噴射背包持續噴火聲
  jetpackOn(on) {
    if (!this.ctx) return;
    if (on && !this.jetNode) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 700;
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(this.enabled ? 0.45 : 0, ctx.currentTime, 0.1);
      src.connect(f).connect(g).connect(this.sfxGain);
      src.start();
      this.jetNode = { src, g };
    } else if (!on && this.jetNode) {
      const { src, g } = this.jetNode;
      g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      src.stop(this.ctx.currentTime + 0.5);
      this.jetNode = null;
    }
  }
}
