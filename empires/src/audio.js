// Battle sounds and music, synthesized live with the Web Audio API (no audio files).
// The game pushes sound cues into game.sfx; we only play the ones on screen, panned by position.
const LS = 'aoai-audio';
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const CHORDS = [[0, 3, 7], [-2, 2, 5], [5, 9, 12], [-5, -2, 2]]; // Dm, C, G, Am (relative to D)
const LIMIT = { hit: 4, clang: 3, bow: 3, siege: 2, die: 2, sink: 1, collapse: 1, capture: 1, fanfare: 1, horn: 1, bell: 1 };

export class SoundEngine {
  constructor() {
    let s = {}; try { s = JSON.parse(localStorage.getItem(LS) || '{}'); } catch { /* storage blocked */ }
    this.sfxOn = s.sfx ?? true; this.musicOn = s.music ?? true;
    this.ctx = null; this.intensity = 0; this.count = {}; this.countT = 0;
  }
  save() { try { localStorage.setItem(LS, JSON.stringify({ sfx: this.sfxOn, music: this.musicOn })); } catch { /* ignore */ } }
  get enabled() { return !!this.ctx && (this.sfxOn || this.musicOn); }
  // must run inside a user gesture (a click), as browsers require
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const c = this.ctx = new AC();
      this.master = c.createGain(); this.master.gain.value = 0.8; this.master.connect(c.destination);
      this.sfxBus = c.createGain(); this.sfxBus.gain.value = this.sfxOn ? 0.55 : 0; this.sfxBus.connect(this.master);
      this.musicBus = c.createGain(); this.musicBus.gain.value = this.musicOn ? 0.2 : 0; this.musicBus.connect(this.master);
      const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      this.startMusic();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  setSfx(on) { this.sfxOn = on; this.save(); if (this.sfxBus) this.sfxBus.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.05); }
  setMusic(on) { this.musicOn = on; this.save(); if (this.musicBus) this.musicBus.gain.setTargetAtTime(on ? 0.2 : 0, this.ctx.currentTime, 0.3); }

  // ------------------------------------------------------------ per frame: play visible cues
  update(g, r) {
    if (!g.sfx.length) return;
    const cues = g.sfx; g.sfx = [];
    if (!this.ctx || !this.sfxOn) return;
    const now = performance.now();
    if (now - this.countT > 120) { this.count = {}; this.countT = now; }
    const z = r.cam.zoom, vz = Math.max(0.12, Math.min(1, z * 1.15));
    for (const e of cues) {
      const [sx, sy] = r.toScreen(e.x, e.y);
      const big = e.k === 'fanfare' || e.k === 'capture' || e.k === 'horn' || e.k === 'collapse';
      const m = big ? 400 : 60;
      if (sx < -m || sx > r.w + m || sy < -m || sy > r.h + m) continue;
      if ((this.count[e.k] = (this.count[e.k] || 0) + 1) > (LIMIT[e.k] || 2)) continue;
      const pan = Math.max(-0.9, Math.min(0.9, (sx / r.w) * 2 - 1));
      this.play(e.k, pan, big ? Math.max(0.5, vz) : vz);
    }
  }
  setIntensity(v) { this.intensity += (Math.max(0, Math.min(1, v)) - this.intensity) * 0.05; }

  // ------------------------------------------------------------ synth helpers
  out(pan, vol) {
    const c = this.ctx, g = c.createGain(); g.gain.value = vol;
    if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(this.sfxBus); } else g.connect(this.sfxBus);
    return g;
  }
  noise(dest, t, dur, type, f0, f1, q, v0) {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur); f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(v0, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * 1.5, dur + 0.05);
  }
  tone(dest, t, dur, type, f0, f1, v0, attack = 0.004) {
    const c = this.ctx, o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v0, t + attack); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  brass(dest, t, dur, freq, v) {
    const c = this.ctx, f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(400, t); f.frequency.linearRampToValueAtTime(1800, t + 0.08); f.frequency.linearRampToValueAtTime(900, t + dur);
    f.connect(dest);
    for (const det of [-4, 4]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq; o.detune.value = det; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.05); g.gain.setValueAtTime(v, t + dur - 0.08); g.gain.exponentialRampToValueAtTime(0.0008, t + dur); o.connect(g); g.connect(f); o.start(t); o.stop(t + dur + 0.05); }
  }
  play(k, pan, vol) {
    const c = this.ctx, t = c.currentTime + 0.01 + Math.random() * 0.03, o = this.out(pan, vol), R = Math.random;
    switch (k) {
      case 'hit': this.noise(o, t, 0.07, 'bandpass', 700 + R() * 500, 300, 1.2, 0.5); this.tone(o, t, 0.09, 'sine', 140 + R() * 40, 60, 0.35); break;
      case 'clang': { const f = 1500 + R() * 1200; this.tone(o, t, 0.22, 'triangle', f, f * 0.98, 0.12); this.tone(o, t, 0.16, 'square', f * 1.51, 0, 0.04); this.noise(o, t, 0.05, 'highpass', 3000, 0, 0.7, 0.3); break; }
      case 'bow': this.tone(o, t, 0.05, 'triangle', 260 + R() * 60, 120, 0.12); this.noise(o, t + 0.02, 0.22, 'bandpass', 2600, 700, 2, 0.12); break;
      case 'siege': this.noise(o, t, 0.35, 'lowpass', 500, 120, 0.8, 0.6); this.tone(o, t, 0.3, 'sine', 70, 40, 0.5); this.tone(o, t, 0.12, 'square', 180, 90, 0.04); break;
      case 'collapse': this.noise(o, t, 1.6, 'lowpass', 600, 80, 0.6, 0.9); this.tone(o, t, 1.0, 'sine', 55, 30, 0.6); for (let i = 0; i < 6; i++) this.noise(o, t + 0.1 + R() * 0.9, 0.06, 'bandpass', 1800 + R() * 1500, 0, 3, 0.18); break;
      case 'die': this.noise(o, t, 0.12, 'lowpass', 500, 150, 0.8, 0.28); break;
      case 'sink': this.noise(o, t, 0.7, 'bandpass', 1600, 300, 1, 0.5); this.noise(o, t + 0.2, 1.0, 'lowpass', 400, 100, 0.7, 0.3); break;
      case 'capture': this.brass(o, t, 0.25, 196, 0.18); this.brass(o, t + 0.26, 0.5, 293.7, 0.2); break;
      case 'fanfare': [261.6, 329.6, 392, 523.3].forEach((f, i) => this.brass(o, t + i * 0.13, i === 3 ? 0.6 : 0.14, f, 0.14)); break;
      case 'horn': { const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700; f.connect(o); const os = c.createOscillator(); os.type = 'sawtooth'; os.frequency.setValueAtTime(98, t); os.frequency.linearRampToValueAtTime(147, t + 0.35); os.frequency.setValueAtTime(147, t + 1.2); const gg = c.createGain(); gg.gain.setValueAtTime(0.0001, t); gg.gain.exponentialRampToValueAtTime(0.3, t + 0.2); gg.gain.setValueAtTime(0.3, t + 1.1); gg.gain.exponentialRampToValueAtTime(0.0008, t + 1.6); os.connect(gg); gg.connect(f); os.start(t); os.stop(t + 1.7); break; }
      case 'bell': for (const [m, v] of [[1, 0.3], [2.4, 0.12], [3.9, 0.06]]) this.tone(o, t, 2.4, 'sine', 523 * m, 0, v, 0.002); break;
    }
  }

  // ------------------------------------------------------------ music: a modal lute-and-drone score that swells in battle
  startMusic() {
    const c = this.ctx;
    this.verb = c.createConvolver();
    const len = c.sampleRate * 2.2, ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    this.verb.buffer = ir; const wet = c.createGain(); wet.gain.value = 0.35; this.verb.connect(wet); wet.connect(this.musicBus);
    this.mdry = c.createGain(); this.mdry.gain.value = 0.8; this.mdry.connect(this.musicBus); this.mdry.connect(this.verb);
    // drone
    this.drone = [];
    for (const [f, v] of [[73.4, 0.12], [110, 0.07], [146.8, 0.03]]) { const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f; const g = c.createGain(); g.gain.value = v; const lfo = c.createOscillator(); lfo.frequency.value = 0.07 + Math.random() * 0.05; const lg = c.createGain(); lg.gain.value = v * 0.4; lfo.connect(lg); lg.connect(g.gain); o.connect(g); g.connect(this.mdry); o.start(); lfo.start(); this.drone.push(o); }
    this.nextNote = c.currentTime + 0.5; this.step = 0; this.mel = 4;
    this.timer = setInterval(() => this.schedule(), 90);
  }
  schedule() {
    const c = this.ctx; if (!c || c.state !== 'running') return;
    const I = this.intensity, bpm = 70 + I * 40, eighth = 60 / bpm / 2;
    while (this.nextNote < c.currentTime + 0.35) {
      const t = this.nextNote, s = this.step, bar = Math.floor(s / 8) % 4, chord = CHORDS[bar];
      const base = 146.83; // D3
      const hz = semi => base * Math.pow(2, semi / 12);
      // harp arpeggio on each beat
      if (s % 2 === 0) { const n = chord[(s / 2) % 3]; this.pluck(t, hz(n - 12), 0.09, 1.4); }
      // lute melody: a random walk through the mode
      if (Math.random() < 0.45 + I * 0.3) {
        this.mel = Math.max(0, Math.min(13, this.mel + [-2, -1, -1, 0, 1, 1, 2][(Math.random() * 7) | 0]));
        const deg = DORIAN[this.mel % 7] + 12 * Math.floor(this.mel / 7);
        this.pluck(t, hz(deg), 0.07, 0.6);
      }
      // war drums when fighting is on screen
      if (I > 0.25) {
        if (s % 4 === 0) this.drum(t, 0.5 * I);
        if (I > 0.55 && s % 8 === 6) this.drum(t, 0.3 * I);
        if (I > 0.7 && s % 2 === 1 && Math.random() < 0.4) this.drum(t, 0.12 * I, true);
      }
      this.nextNote += eighth; this.step++;
    }
  }
  pluck(t, f, v, dur) {
    const c = this.ctx, o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
    o.type = 'triangle'; o2.type = 'sawtooth'; o.frequency.value = f; o2.frequency.value = f * 1.002;
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(f * 6, t); lp.frequency.exponentialRampToValueAtTime(f * 1.5, t + dur);
    const g2 = c.createGain(); g2.gain.value = 0.25;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
    o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(this.mdry);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }
  drum(t, v, rim = false) {
    const c = this.ctx;
    if (rim) { this.noise(this.mdry, t, 0.05, 'bandpass', 2500, 0, 2, v); return; }
    this.tone(this.mdry, t, 0.35, 'sine', 110, 45, v);
    this.noise(this.mdry, t, 0.12, 'lowpass', 900, 200, 0.7, v * 0.5);
  }
}
