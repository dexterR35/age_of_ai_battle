// App shell: menu -> battle (live or replay), the frame loop, camera input, director camera and sound.
import { TICK } from './config.js';
import { Game } from './game.js';
import { Renderer, QUALITY } from './render/renderer.js';
import { AnalyticsView } from './ui/analytics.js';
import { addRecords, loadPrices } from './records.js';
import { matchRecords } from './analytics.js';
import { Menu } from './ui/menu.js';
import { Hud } from './ui/hud.js';
import { LLMDirector } from './llm.js';
import { SoundEngine } from './audio.js';
import { saveReplay } from './replay.js';
import { HW, HH } from './render/sprites.js';

const canvas = document.getElementById('world');
const TIPS = [
  'Gates open only for their owner and allies. Attackers must break them, or bring a siege tower over the wall.',
  'Hidden traps wait outside the walls: stakes stop cavalry charges, pitch trenches burst into flames.',
  'Every important decision is graded three minutes later. Open 📈 Analytics to see who decides best.',
  'A far-away conquered town loses loyalty. Without a garrison or a courthouse it may break away.',
  'Live models are measured call by call: tokens, seconds and cost, in Analytics → AI calls & cost.',
  'Play a tournament: after 25 recorded nations, Analytics shows which habits win games.',
  'A capital grows from Village to Great City; a City unlocks the Bank, the Printing Press and the Wonder.',
  'Luxury goods from plantations sell at the Bazaar, and people with silk, spice and wine are happier.',
];
// the loading screen: a progress bar and a tip while the world is generated and painted
class Loading {
  constructor() { this.el = document.getElementById('loading'); this.bar = document.getElementById('ld-bar'); this.stepEl = document.getElementById('ld-step'); this.tip = document.getElementById('ld-tip'); }
  async show(text) { this.el.classList.remove('gone', 'fade'); this.tip.textContent = '💡 ' + TIPS[(Math.random() * TIPS.length) | 0]; await this.set(text, 0.02); }
  async set(text, f) { this.stepEl.textContent = text; this.bar.style.width = Math.round(f * 100) + '%'; await new Promise(r => { let done = false; const go = () => { if (!done) { done = true; r(); } }; requestAnimationFrame(() => setTimeout(go, 0)); setTimeout(go, 60); }); /* a background tab draws no frames: never wait for one forever */ }
  hide() { this.bar.style.width = '100%'; this.el.classList.add('fade'); setTimeout(() => this.el.classList.add('gone'), 400); }
}
const QLS = 'aoai-gfx';

class App {
  constructor() {
    this.audio = new SoundEngine();
    this.loading = new Loading();
    try { this.qMode = localStorage.getItem(QLS) || 'auto'; } catch { this.qMode = 'auto'; }
    this.qAuto = 'high'; this.fps = 60;
    this.menu = new Menu((setup, keys) => this.start(setup, keys), rep => this.startReplay(rep));
    this.analytics = new AnalyticsView(document.getElementById('analytics'), this);
    document.getElementById('home-analytics').onclick = () => this.analytics.open('wins');
    this.speed = 4; this.effSpeed = 0; this.director = true;
    this.bindInput();
    window.addEventListener('resize', () => this.renderer?.resize());
    // browsers only allow sound after a click or key press
    const unlock = () => { this.audio.unlock(); };
    window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
    this.menu.show('home');
    this.loading.show('Preparing the world…').then(() => { this.idleBackdrop(); this.loading.hide(); });
  }
  // graphics quality: Auto picks High and steps down when the frame rate drops
  quality() { return QUALITY[this.qMode === 'auto' ? this.qAuto : this.qMode]; }
  qualityName() { return this.qMode === 'auto' ? `Auto (${QUALITY[this.qAuto].name})` : QUALITY[this.qMode].name; }
  cycleQuality() {
    const order = ['auto', 'high', 'balanced', 'fast']; this.qMode = order[(order.indexOf(this.qMode) + 1) % order.length];
    try { localStorage.setItem(QLS, this.qMode); } catch { /* ignore */ }
    this.renderer?.setQuality(this.quality()); const l = document.getElementById('t-gfx-l'); if (l) l.textContent = ' ' + this.qualityName();
  }
  autoQuality(dtMs) {
    this.fps += (1000 / Math.max(1, dtMs) - this.fps) * 0.05;
    if (this.qMode !== 'auto' || !this.inBattle || document.hidden || dtMs > 250) return;
    const now = performance.now(); if (now - (this.qT || 0) < 5000) return;
    const order = ['high', 'balanced', 'fast'], i = order.indexOf(this.qAuto);
    if (this.fps < 38 && i < 2) { this.qAuto = order[i + 1]; this.qT = now; }
    else if (this.fps > 58 && i > 0 && now - (this.qT || 0) > 20000) { this.qAuto = order[i - 1]; this.qT = now; }
    else return;
    this.renderer.setQuality(this.quality()); const l = document.getElementById('t-gfx-l'); if (l) l.textContent = ' ' + this.qualityName();
  }
  // a slow, quiet battle behind the menu
  idleBackdrop() {
    const seed = 777;
    this.backdrop = new Game({ seed, size: 192, mapType: 'continental', mapName: 'Backdrop', resources: 'high', players: [{ ai: 'grok', civ: 'valorian', color: '#d8403a' }, { ai: 'claude', civ: 'sunspire', color: '#3d7fe0' }, { ai: 'gemini', civ: 'meridian', color: '#36a85c' }] });
    for (let i = 0; i < 3000; i++) this.backdrop.tick();
    this.game = this.backdrop; this.renderer = new Renderer(canvas, this.backdrop, this.quality());
    const h = this.backdrop.players[1].home; this.renderer.focus(h.x, h.y, 0.85); this.renderer.cam = { ...this.renderer.target };
    this.speed = 1; this.loop();
  }
  async start(setup, keys) {
    cancelAnimationFrame(this.raf);
    this.menu.hide();
    this.replay = null; this.recorded = false;
    await this.loading.show(`Generating a ${setup.size}×${setup.size} world: ${setup.mapName || setup.mapType}…`);
    this.game = new Game(setup);
    await this.loading.set(`Founding ${setup.players.length} nations…`, 0.3);
    this.game.sfxOn = true;
    this.renderer = new Renderer(canvas, this.game, this.quality(), false);
    await this.renderer.warmup(f => this.loading.set('Painting the land…', 0.35 + f * 0.6));
    this.loading.hide();
    this.hud = new Hud(this);
    this.llm = new LLMDirector(this.game, keys, loadPrices());
    this.speed = setup.speed || 4; this.hud.markSpeed();
    this.director = true;
    this.inBattle = true; this.saved = false;
    const h = this.game.players[0].home; this.renderer.focus(h.x, h.y, 0.85); this.renderer.cam = { ...this.renderer.target }; this.renderer.target = null;
    this.directorAt = 0;
    this.loop();
  }
  // watch a recorded battle: same seed and setup, the live models' orders replayed at the same ticks
  async startReplay(rep) {
    cancelAnimationFrame(this.raf);
    this.menu.hide();
    this.replay = rep; this.recorded = true;
    await this.loading.show('Rebuilding the recorded battle…');
    this.game = new Game({ ...rep.setup, replay: { directives: rep.directives || [] } });
    (rep.calls || []).forEach((log, i) => { if (this.game.players[i]) this.game.players[i].llm.log = log; }); // model costs come with the replay
    this.game.sfxOn = true;
    this.renderer = new Renderer(canvas, this.game, this.quality(), false);
    await this.renderer.warmup(f => this.loading.set('Painting the land…', 0.3 + f * 0.65));
    this.loading.hide();
    this.hud = new Hud(this);
    this.llm = null;
    this.speed = 8; this.hud.markSpeed();
    this.director = true; this.inBattle = true; this.saved = true;
    const h = this.game.players[0].home; this.renderer.focus(h.x, h.y, 0.85); this.renderer.cam = { ...this.renderer.target }; this.renderer.target = null;
    this.directorAt = 0;
    this.loop();
  }
  // jump forward in a replay by simulating quickly (no drawing)
  skip(minutes) {
    const g = this.game, end = g.time + minutes * 60, t0 = performance.now();
    while (g.time < end && !g.over && performance.now() - t0 < 20000) g.tick();
    g.sfx = []; this.renderer.parts = [];
  }
  // finished (or long) battles feed the cross-match regression in Analytics → What wins
  storeRecords() {
    const g = this.game; if (this.recorded || this.replay || !g || g === this.backdrop || g.time < 600) return;
    this.recorded = true;
    addRecords(matchRecords(g), { date: Date.now(), seed: g.seed, map: g.setup.mapType, minutes: Math.round(g.time / 60), over: g.over && { winners: g.over.winners.map(i => g.players[i].name), how: g.over.how } });
  }
  storeReplay() {
    if (this.saved || this.replay || !this.game || this.game === this.backdrop) return;
    if (this.game.time < 120) return;
    this.saved = true;
    saveReplay(this.game);
  }
  exit() {
    cancelAnimationFrame(this.raf);
    if (this.inBattle) { this.storeReplay(); this.storeRecords(); }
    this.analytics.close();
    this.inBattle = false; this.hud?.destroy(); this.hud = null; this.llm = null; this.replay = null;
    document.getElementById('hud').classList.add('hidden');
    this.menu.show('home'); this.menu.renderReplays?.();
    this.idleBackdrop();
  }
  setSpeed(s) { this.speed = s; }
  overview() {
    const r = this.renderer, N = this.game.N;
    r.focus(N / 2, N / 2, Math.min(r.w / (N * HW * 2), r.h / (N * HH * 2)) * 0.95);
    this.director = false; document.getElementById('t-director')?.classList.remove('on');
  }
  loop() {
    let last = performance.now(), acc = 0, hudT = 0, ticksWin = 0, winT = 0, heatT = 0;
    const frame = ts => {
      this.raf = requestAnimationFrame(frame);
      const g = this.game, r = this.renderer;
      const dt = Math.min(0.25, (ts - last) / 1000); this.autoQuality(ts - last); last = ts;
      if (this.speed > 0 && !(g.over && this.inBattle && g.time - g.over.time > 120)) {
        acc += dt * this.speed;
        const t0 = performance.now(); let n = 0;
        while (acc >= TICK && performance.now() - t0 < 13) { g.tick(); acc -= TICK; n++; }
        if (acc > TICK * 4) acc = TICK * 4; // the simulation cannot keep up: drop the backlog
        ticksWin += n;
      }
      winT += dt;
      if (winT > 0.5) { this.effSpeed = ticksWin * TICK / winT; ticksWin = 0; winT = 0; }
      if (this.inBattle) {
        this.directorTick(ts); this.llm?.update(Date.now());
        if (g.over && !this.saved) this.storeReplay();
        if (g.over && !this.recorded) this.storeRecords();
        if (ts - heatT > 400) { heatT = ts; this.audio.setIntensity(this.viewHeat()); }
      }
      r.draw(Math.min(1, acc / TICK), ts);
      if (this.inBattle) this.audio.update(g, r); else g.sfx.length = 0;
      if (this.hud && ts - hudT > 250) { hudT = ts; this.hud.update(); }
    };
    this.raf = requestAnimationFrame(frame);
  }
  // how much fighting is on screen (drives the music)
  viewHeat() {
    const g = this.game, r = this.renderer, cols = Math.ceil(g.N / 16);
    const [x0, y0] = r.toWorld(0, 0), [x1, y1] = r.toWorld(r.w, r.h), [x2, y2] = r.toWorld(r.w, 0), [x3, y3] = r.toWorld(0, r.h);
    const minX = Math.min(x0, x1, x2, x3), maxX = Math.max(x0, x1, x2, x3), minY = Math.min(y0, y1, y2, y3), maxY = Math.max(y0, y1, y2, y3);
    let h = 0;
    for (let i = 0; i < g.heat.length; i++) { const cx = (i % cols) * 16 + 8, cy = ((i / cols) | 0) * 16 + 8; if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) h += g.heat[i]; }
    return h / 60;
  }
  directorTick(ts) {
    if (!this.director || ts - this.directorAt < 9000) return;
    const g = this.game, r = this.renderer, cols = Math.ceil(g.N / 16);
    let bi = -1, bv = 10;
    for (let i = 0; i < g.heat.length; i++) if (g.heat[i] > bv) { bv = g.heat[i]; bi = i; }
    this.directorAt = ts;
    if (bi >= 0) { r.focus((bi % cols) * 16 + 8, ((bi / cols) | 0) * 16 + 8, 0.95); return; }
    // nothing fighting: visit a town
    const alive = g.players.filter(p => p.alive);
    this.tour = ((this.tour ?? -1) + 1) % alive.length;
    const p = alive[this.tour]; r.focus(p.home.x + (Math.random() - 0.5) * 12, p.home.y + (Math.random() - 0.5) * 12, 0.8);
  }
  bindInput() {
    let down = null, moved = false;
    const stopDirector = () => { if (this.director && this.inBattle) { this.director = false; document.getElementById('t-director')?.classList.remove('on'); } };
    canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; moved = false; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => {
      if (!down || !this.inBattle) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      if (moved) { this.renderer.pan(-dx, -dy); down = { x: e.clientX, y: e.clientY }; stopDirector(); }
    });
    canvas.addEventListener('pointerup', e => {
      if (down && !moved && this.inBattle) { const o = this.renderer.pick(e.clientX, e.clientY); this.hud.select(o); }
      down = null;
    });
    canvas.addEventListener('dblclick', e => { if (!this.inBattle) return; const [x, y] = this.renderer.toWorld(e.clientX, e.clientY); this.renderer.focus(x, y, Math.min(1.4, this.renderer.cam.zoom * 1.6)); stopDirector(); });
    canvas.addEventListener('wheel', e => { if (!this.inBattle) return; e.preventDefault(); this.renderer.zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY); stopDirector(); }, { passive: false });
    const keys = new Set();
    window.addEventListener('keydown', e => {
      if (!this.inBattle || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      keys.add(e.key.toLowerCase());
      const k = e.key;
      if (k === ' ') { this.speed = this.speed ? 0 : 4; this.hud.markSpeed(); e.preventDefault(); }
      else if (k >= '1' && k <= '6') { this.speed = [1, 2, 4, 8, 16, 32][+k - 1]; this.hud.markSpeed(); }
      else if (k === '+' || k === '=') this.renderer.zoomAt(1.2, this.renderer.w / 2, this.renderer.h / 2);
      else if (k === '-') this.renderer.zoomAt(1 / 1.2, this.renderer.w / 2, this.renderer.h / 2);
      else if (k === 'Home') this.overview();
      else if (k === 'Escape') { this.hud.select(null); this.hud.closeStats(); this.analytics.close(); }
      else if (k.toLowerCase() === 'c') { this.director = !this.director; document.getElementById('t-director')?.classList.toggle('on', this.director); this.directorAt = 0; }
      else if (k.toLowerCase() === 'g') this.hud.toggleStats();
      else if (k.toLowerCase() === 'i') this.analytics.openNow ? this.analytics.close() : this.analytics.open();
      else if (k.toLowerCase() === 'm') { this.audio.setMusic(!this.audio.musicOn); this.hud.markAudio(); }
    });
    window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
    const panLoop = () => {
      requestAnimationFrame(panLoop);
      if (!this.inBattle || !keys.size) return;
      let dx = 0, dy = 0; const s = 14;
      if (keys.has('w') || keys.has('arrowup')) dy -= s; if (keys.has('s') || keys.has('arrowdown')) dy += s;
      if (keys.has('a') || keys.has('arrowleft')) dx -= s; if (keys.has('d') || keys.has('arrowright')) dx += s;
      if (dx || dy) { this.renderer.pan(dx, dy); this.director = false; document.getElementById('t-director')?.classList.remove('on'); }
    };
    panLoop();
  }
}
window.app = new App(); // exposed for debugging in the console
