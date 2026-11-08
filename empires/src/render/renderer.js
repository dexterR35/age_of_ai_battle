// Draws the world: terrain chunks, depth-sorted objects, projectiles and effects.
import { HW, HH, K, S, unitSprite, treeSprite, nodeSprite, buildingSprite, fishSprite, ruinSprite, luxSprite } from './sprites.js';
import { TerrainRenderer, CH } from './terrain.js';
import { BUILDINGS, UNITS, HERO_LEVELS, TOWN_RANKS } from '../config.js';
import { clamp, hash2 } from '../util.js';
export const treeJit = (x, y, k) => (hash2(x, y, 90 + k) - 0.5) * 0.55;

const SCALES = [0.0625, 0.125, 0.25, 0.5, 1];
// graphics presets: sharpness (device pixel ratio), particles, smoke and the day/weather layer
export const QUALITY = {
  high: { name: 'High', dpr: 2, parts: true, smoke: true, atmo: true },
  balanced: { name: 'Balanced', dpr: 1.5, parts: true, smoke: false, atmo: true },
  fast: { name: 'Fast', dpr: 1, parts: false, smoke: false, atmo: false },
};

export class Renderer {
  constructor(canvas, game, quality = QUALITY.high, warm = true) {
    this.quality = quality;
    this.cv = canvas; this.c = canvas.getContext('2d', { alpha: false });
    this.g = game;
    this.terrain = new TerrainRenderer(game.map, game.seed);
    const p0 = game.players[0].home;
    this.cam = { x: (p0.x - p0.y) * HW, y: (p0.x + p0.y) * HH, zoom: 0.8 };
    this.target = null; // smooth camera move target
    this.selected = null; this.hover = null;
    this.showLabels = true; this.atmosphere = true;
    this.parts = []; // purely visual particles (dust, embers); never touch the simulation
    this.resize();
    // warm the lowest level of detail for the whole map so nothing is ever blank
    if (warm) { const n = Math.ceil(game.N / CH); for (let cy = 0; cy < n; cy++) for (let cx = 0; cx < n; cx++) this.terrain.get(cx, cy, 0.0625, true, true); }
  }
  // the same warm-up, a few rows per frame, reporting progress (for the loading screen)
  async warmup(onProgress) {
    const n = Math.ceil(this.g.N / CH);
    for (let cy = 0; cy < n; cy++) {
      for (let cx = 0; cx < n; cx++) this.terrain.get(cx, cy, 0.0625, true, true);
      if (cy % 4 === 3) { onProgress?.((cy + 1) / n); await new Promise(r => setTimeout(r, 0)); }
    }
  }
  setQuality(q) { this.quality = q; this.resize(); }
  resize() {
    const dpr = Math.min(this.quality?.dpr || 2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    const r = this.cv.getBoundingClientRect();
    this.w = r.width; this.h = r.height;
    this.cv.width = Math.round(r.width * dpr); this.cv.height = Math.round(r.height * dpr);
  }
  toScreen(x, y, z = 0) { const c = this.cam; return [((x - y) * HW - c.x) * c.zoom + this.w / 2, ((x + y) * HH - z - c.y) * c.zoom + this.h / 2]; }
  toWorld(sx, sy) { const c = this.cam; const X = (sx - this.w / 2) / c.zoom + c.x, Y = (sy - this.h / 2) / c.zoom + c.y; return [(X / HW + Y / HH) / 2, (Y / HH - X / HW) / 2]; }
  focus(x, y, zoom) { this.target = { x: (x - y) * HW, y: (x + y) * HH, zoom: zoom ?? this.cam.zoom }; }
  pan(dx, dy) { this.cam.x += dx / this.cam.zoom; this.cam.y += dy / this.cam.zoom; this.target = null; this.clampCam(); }
  zoomAt(f, sx, sy) {
    const [wx, wy] = this.toWorld(sx, sy);
    this.cam.zoom = clamp(this.cam.zoom * f, 0.07, 2.2);
    const [nx, ny] = this.toWorld(sx, sy);
    this.cam.x += ((wx - wy) - (nx - ny)) * HW; this.cam.y += ((wx + wy) - (nx + ny)) * HH;
    this.target = null; this.clampCam();
  }
  clampCam() { const N = this.g.N; this.cam.x = clamp(this.cam.x, -N * HW, N * HW); this.cam.y = clamp(this.cam.y, 0, N * 2 * HH); }

  pick(sx, sy) {
    const g = this.g, [wx, wy] = this.toWorld(sx, sy);
    let best = null, bd = 0.9;
    g.grid.query(wx, wy, 2, u => { if (u.dead || u.inside) return; const d = Math.hypot(u.x - wx + 0.4, u.y - wy + 0.4); if (d < bd) { bd = d; best = u; } });
    if (best) return best;
    const i = g.map.idx(clamp(wx | 0, 0, g.N - 1), clamp(wy | 0, 0, g.N - 1)), id = g.map.occ[i];
    if (id) return g.ents.get(id);
    for (const s of g.sacred) if (Math.hypot(s.x - wx, s.y - wy) < 2.2) return { kind: 'sacred', ...s, ref: s };
    return null;
  }

  draw(alpha, realT) {
    const g = this.g, c = this.c, cam = this.cam, dpr = this.dpr, z = cam.zoom;
    this.realT = realT; this.frameN = (this.frameN || 0) + 1;
    if (this.target) {
      const t = this.target, k = 0.12;
      cam.x += (t.x - cam.x) * k; cam.y += (t.y - cam.y) * k; cam.zoom += (t.zoom - cam.zoom) * k;
      if (Math.abs(t.x - cam.x) < 1 && Math.abs(t.y - cam.y) < 1 && Math.abs(t.zoom - cam.zoom) < 0.002) this.target = null;
    }
    this.terrain.frame++;
    while (g.map.paintQ.length) this.terrain.recolor(g.map.paintQ.pop());
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#0d1418'; c.fillRect(0, 0, this.w, this.h);
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = z < 0.5 ? 'medium' : 'high';
    const baked = z < 0.42;
    const want = SCALES.find(s => s >= z * dpr * 0.9) || 1;
    // visible tile bounds
    const pts = [this.toWorld(-80, -160), this.toWorld(this.w + 80, -160), this.toWorld(-80, this.h + 120), this.toWorld(this.w + 80, this.h + 120)];
    const N = g.N;
    const tx0 = clamp(Math.floor(Math.min(...pts.map(p => p[0]))), 0, N - 1), tx1 = clamp(Math.ceil(Math.max(...pts.map(p => p[0]))), 0, N - 1);
    const ty0 = clamp(Math.floor(Math.min(...pts.map(p => p[1]))), 0, N - 1), ty1 = clamp(Math.ceil(Math.max(...pts.map(p => p[1]))), 0, N - 1);
    const vis = (x, y, m = 2) => { const [sx, sy] = this.toScreen(x, y); return sx > -120 * m && sx < this.w + 120 * m && sy > -120 * m && sy < this.h + 200 * m; };

    // ---- terrain
    const t0 = performance.now();
    const chunks = [];
    for (let cy = Math.floor(ty0 / CH); cy <= Math.floor(ty1 / CH); cy++) for (let cx = Math.floor(tx0 / CH); cx <= Math.floor(tx1 / CH); cx++) {
      const X0 = (cx * CH - cy * CH - CH) * HW, Y0 = (cx * CH + cy * CH) * HH;
      const sx = (X0 - cam.x) * z + this.w / 2, sy = (Y0 - 64 - cam.y) * z + this.h / 2;
      if (sx > this.w || sy > this.h || sx + 2 * CH * HW * z < 0 || sy + (2 * CH * HH + 64) * z < 0) continue;
      chunks.push([cx, cy]);
    }
    chunks.sort((a, b) => a[0] + a[1] - b[0] - b[1]);
    if (z * dpr <= 0.11) {
      const W = this.terrain.world(), sc = W.sc;
      c.drawImage(W.cv, (-N * HW - cam.x) * z + this.w / 2, (-64 - cam.y) * z + this.h / 2, W.cv.width / sc * z, W.cv.height / sc * z);
      chunks.length = 0;
    }
    for (const [cx, cy] of chunks) {
      const allow = performance.now() - t0 < 10;
      let e = this.terrain.get(cx, cy, want, baked, allow) || this.terrain.fallback(cx, cy);
      if (!e) continue;
      const sx = (e.X0 - cam.x) * z + this.w / 2, sy = (e.Y0 - cam.y) * z + this.h / 2 - e.P / e.scale * z;
      c.drawImage(e.cv, sx, sy, e.cv.width / e.scale * z, e.cv.height / e.scale * z);
    }

    // ---- flat ground things: farms, rubble, corpses, stuck arrows
    const far = z < 0.28;
    for (const b of g.buildings) {
      if (b.dead || (b.type !== 'farm' && !BUILDINGS[b.type]?.trap)) continue;
      if (b.x + 3 < tx0 || b.x > tx1 || b.y + 3 < ty0 || b.y > ty1) continue;
      if (b.type === 'farm') this.drawBuilding(b); else if (z > 0.25) this.drawTrap(b);
    }
    const now = g.time;
    for (const f of g.fx) {
      if (f.x < tx0 - 3 || f.x > tx1 + 3 || f.y < ty0 - 3 || f.y > ty1 + 3) continue;
      const age = now - f.t0; if (age < 0) continue;
      if (f.kind === 'rubble') {
        c.globalAlpha = clamp((f.life - age) / 40, 0, 1) * 0.95;
        if (z < 0.2) { const [sx, sy] = this.toScreen(f.x + f.size / 2, f.y + f.size / 2); c.fillStyle = '#3e342b'; c.fillRect(sx - f.size * 8 * z, sy - f.size * 4 * z, f.size * 16 * z, f.size * 8 * z); }
        else { const sp = ruinSprite(f.size, (f.x * 7 + f.y) | 0), [sx, sy] = this.toScreen(f.x, f.y); c.drawImage(sp.cv, sx - sp.ax / S * z, sy - sp.ay / S * z, sp.cv.width / S * z, sp.cv.height / S * z); }
        c.globalAlpha = 1;
        if (age < 45 && z > 0.25 && this.quality.smoke) this.smokeColumn(f.x + f.size / 2, f.y + f.size / 2, f.size, realT, 1 - age / 45, f.x * 13 + f.y);
      } else if (f.kind === 'corpse' && !far) {
        const a = clamp((f.life - age) / 8, 0, 1); c.globalAlpha = a * 0.95;
        const sp = unitSprite(f.type, g.players[f.owner]?.color || '#888', 'dead', 0, 'front');
        const [sx, sy] = this.toScreen(f.x, f.y);
        c.drawImage(sp.cv, sx - sp.ax / K * z, sy - sp.ay / K * z, sp.cv.width / K * z, sp.cv.height / K * z);
        c.globalAlpha = 1;
      } else if (f.kind === 'stuck' && z > 0.6) {
        const [sx, sy] = this.toScreen(f.x, f.y); c.globalAlpha = clamp((f.life - age) / 2, 0, 1); c.strokeStyle = '#4a3420'; c.lineWidth = 1.2 * z; c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + Math.cos(f.a) * 5 * z, sy - 6 * z); c.stroke(); c.globalAlpha = 1;
      }
    }

    // ---- depth-sorted objects
    const objs = [];
    const m = g.map;
    if (!baked) {
      for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
        const i = y * N + x; if (!m.tree[i]) continue;
        if (!vis(x + 0.5, y + 0.5, 1)) continue;
        objs.push({ d: x + y + 1, k: 0, x, y, i });
      }
    }
    for (const n of g.nodes) { if (n.x < tx0 - 1 || n.x > tx1 + 1 || n.y < ty0 - 1 || n.y > ty1 + 1) continue; objs.push({ d: n.x + n.y + 1, k: 1, o: n }); }
    for (const b of g.buildings) { if (b.dead || b.type === 'farm' || BUILDINGS[b.type]?.trap) continue; if (b.x + b.size < tx0 - 2 || b.x > tx1 + 2 || b.y + b.size < ty0 - 2 || b.y > ty1 + 2) continue; objs.push({ d: b.x + b.y + b.size * 1.5 + (b.size === 1 ? 0.5 : 0), k: 2, o: b }); }
    for (const s of g.sacred) { if (s.x < tx0 - 3 || s.x > tx1 + 3 || s.y < ty0 - 3 || s.y > ty1 + 3) continue; objs.push({ d: s.x + s.y + 1.5, k: 3, o: s }); }
    const ux0 = tx0 - 1, ux1 = tx1 + 1, uy0 = ty0 - 1, uy1 = ty1 + 1;
    for (const u of g.units) {
      if (u.dead || u.inside) continue;
      const x = u.px + (u.x - u.px) * alpha, y = u.py + (u.y - u.py) * alpha;
      if (x < ux0 || x > ux1 || y < uy0 || y > uy1) continue;
      objs.push({ d: x + y, k: 4, o: u, x, y });
    }
    objs.sort((a, b) => a.d - b.d);
    for (const ob of objs) {
      switch (ob.k) {
        case 0: { const sp = treeSprite(m.treeKind[ob.i], (ob.x * 7 + ob.y * 3) % 5); const [sx, sy] = this.toScreen(ob.x + 0.5 + treeJit(ob.x, ob.y, 1), ob.y + 0.5 + treeJit(ob.x, ob.y, 2)); c.drawImage(sp.cv, sx - sp.ax / K * z, sy - sp.ay / K * z, sp.cv.width / K * z, sp.cv.height / K * z); break; }
        case 1: { const n = ob.o, sp = n.fish ? fishSprite(n.var) : n.res === 'lux' ? luxSprite(n.good, n.var) : nodeSprite(n.res, n.var, n.amount / n.max); const [sx, sy] = this.toScreen(n.x + 0.5, n.y + 0.5); c.drawImage(sp.cv, sx - sp.ax / K * z, sy - sp.ay / K * z, sp.cv.width / K * z, sp.cv.height / K * z); break; }
        case 2: this.drawBuilding(ob.o); break;
        case 3: { const s = ob.o, col = s.owner >= 0 ? g.players[s.owner].color : '#888888'; const sp = buildingSprite('sacred', col, null, 4); const [sx, sy] = this.toScreen(s.x - 1.5, s.y - 1.5); c.drawImage(sp.cv, sx - sp.ax / S * z, sy - sp.ay / S * z, sp.cv.width / S * z, sp.cv.height / S * z); break; }
        case 4: this.drawUnit(ob.o, ob.x, ob.y, far); break;
      }
    }

    // ---- projectiles
    for (const p of g.projectiles) {
      if (p.t < 0 || p.x < tx0 - 2 || p.x > tx1 + 2 || p.y < ty0 - 2 || p.y > ty1 + 2) continue;
      const k = clamp((p.t + alpha * 0.1) / p.dur, 0, 1);
      const x = p.sx + (p.tx - p.sx) * k, y = p.sy + (p.ty - p.sy) * k;
      const hz = Math.sin(Math.PI * k) * p.h * 26 + (p.sz || 0.6) * 18 * (1 - k);
      const [sx, sy] = this.toScreen(x, y, hz);
      if (p.kind === 'stone' || p.kind === 'boulder') {
        const [gx, gy] = this.toScreen(x, y);
        c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(gx, gy, 3 * z, 1.5 * z, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#4a4440'; c.beginPath(); c.arc(sx, sy, (p.kind === 'boulder' ? 4.5 : 3) * z, 0, Math.PI * 2); c.fill();
      } else {
        const k2 = clamp(k + 0.04, 0, 1), x2 = p.sx + (p.tx - p.sx) * k2, y2 = p.sy + (p.ty - p.sy) * k2, hz2 = Math.sin(Math.PI * k2) * p.h * 26 + (p.sz || 0.6) * 18 * (1 - k2);
        const [ex, ey] = this.toScreen(x2, y2, hz2);
        const dx = ex - sx, dy = ey - sy, l = Math.hypot(dx, dy) || 1, len = (p.kind === 'bolt' ? 5 : 7) * Math.max(0.6, z);
        c.strokeStyle = '#2c2218'; c.lineWidth = Math.max(0.8, 1.1 * z); c.beginPath(); c.moveTo(sx - dx / l * len, sy - dy / l * len); c.lineTo(sx, sy); c.stroke();
        if (z > 0.5) { c.strokeStyle = '#e8e0d0'; c.lineWidth = 1; c.beginPath(); c.moveTo(sx - dx / l * len, sy - dy / l * len); c.lineTo(sx - dx / l * (len - 2), sy - dy / l * (len - 2)); c.stroke(); }
      }
    }

    // ---- effects in the air
    for (const f of g.fx) {
      if (f.x < tx0 - 3 || f.x > tx1 + 3 || f.y < ty0 - 3 || f.y > ty1 + 3) continue;
      const age = now - f.t0; if (age < 0) continue; const p = age / f.life;
      if (f.kind === 'smoke') { const [sx, sy] = this.toScreen(f.x, f.y, 10 + p * 70); c.fillStyle = `rgba(70,66,62,${0.35 * (1 - p)})`; c.beginPath(); c.arc(sx, sy, (6 + p * 18) * z, 0, Math.PI * 2); c.fill(); }
      else if (f.kind === 'fire') { const [sx, sy] = this.toScreen(f.x, f.y, 12 + p * 20); const fl = Math.sin(realT * 0.03 + f.x * 9) * 0.3 + 0.7; c.fillStyle = `rgba(255,${120 + fl * 80 | 0},40,${0.8 * (1 - p)})`; c.beginPath(); c.ellipse(sx, sy, 4 * z * fl, 8 * z * fl, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = `rgba(80,70,60,${0.3 * (1 - p)})`; c.beginPath(); c.arc(sx, sy - 20 * z - p * 30 * z, (5 + p * 10) * z, 0, Math.PI * 2); c.fill(); }
      else if (f.kind === 'dust') { const [sx, sy] = this.toScreen(f.x, f.y, 4); c.fillStyle = `rgba(160,140,100,${0.4 * (1 - p)})`; c.beginPath(); c.arc(sx, sy, (4 + p * 10) * z, 0, Math.PI * 2); c.fill(); }
      else if (f.kind === 'impact') { const [sx, sy] = this.toScreen(f.x, f.y); c.strokeStyle = `rgba(90,70,50,${1 - p})`; c.lineWidth = 2 * z; c.beginPath(); c.ellipse(sx, sy, (6 + p * (f.big ? 30 : 16)) * z, (3 + p * (f.big ? 15 : 8)) * z, 0, 0, Math.PI * 2); c.stroke(); }
      else if (f.kind === 'camp') {
        const col = g.players[f.owner]?.color || '#888', fade = clamp((f.life - age) / 10, 0, 1);
        c.globalAlpha = fade;
        for (let k = 0; k < 6; k++) {
          const a = k / 6 * Math.PI * 2, [sx, sy] = this.toScreen(f.x + Math.cos(a) * 4, f.y + Math.sin(a) * 4);
          c.fillStyle = k % 2 ? '#e8dcc0' : col; c.beginPath(); c.moveTo(sx - 9 * z, sy); c.lineTo(sx, sy - 14 * z); c.lineTo(sx + 9 * z, sy); c.closePath(); c.fill();
          c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 1; c.stroke();
        }
        const [fx, fy] = this.toScreen(f.x, f.y); c.fillStyle = 'rgba(255,170,60,0.8)'; c.beginPath(); c.ellipse(fx, fy - 3 * z, 3 * z, 4 * z, 0, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 1;
      }
      else if (f.kind === 'ring') { const [sx, sy] = this.toScreen(f.x, f.y); c.strokeStyle = f.color; c.globalAlpha = 1 - p; c.lineWidth = 3 * z; c.beginPath(); c.ellipse(sx, sy, (30 + p * 120) * z, (15 + p * 60) * z, 0, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1; }
      else if (f.kind === 'text') { const [sx, sy] = this.toScreen(f.x, f.y, 30 + p * 30); c.globalAlpha = 1 - p; c.font = `600 ${Math.max(10, 12 * z)}px system-ui, sans-serif`; c.textAlign = 'center'; c.fillStyle = '#000'; c.fillText(f.text, sx + 1, sy + 1); c.fillStyle = f.color; c.fillText(f.text, sx, sy); c.globalAlpha = 1; }
    }

    // ---- smoke over damaged buildings, visual particles
    if (z > 0.22 && this.quality.smoke) for (const b of g.buildings) {
      if (b.dead || !b.done || b.owner < 0 || b.hp > b.maxHp * 0.6 || BUILDINGS[b.type]?.wall) continue;
      if (b.x + b.size < tx0 || b.x > tx1 || b.y + b.size < ty0 || b.y > ty1) continue;
      this.smokeColumn(b.x + b.size / 2, b.y + b.size / 2, b.size, realT, 1 - b.hp / b.maxHp, b.id);
    }
    if (this.quality.parts) this.drawParts(realT, tx0, tx1, ty0, ty1);
    if (this.atmosphere && this.quality.atmo) this.drawAtmosphere(realT, tx0, tx1, ty0, ty1);

    // ---- labels
    if (this.showLabels) {
      c.textAlign = 'center';
      for (const p of g.players) {
        if (!p.alive || !p.tc || p.tc.dead) continue;
        const b = p.tc, [sx, sy] = this.toScreen(b.x + 2, b.y + 2, 130);
        if (sx < -100 || sx > this.w + 100 || sy < -40 || sy > this.h + 100) continue;
        const txt = `${p.name} · ${b.townName || p.civ.name}${p.townRank ? ' (' + TOWN_RANKS[p.townRank].name + ')' : ''}`;
        c.font = `700 ${clamp(13 * Math.sqrt(z) + 3, 11, 16)}px system-ui, sans-serif`;
        const w = c.measureText(txt).width + 18;
        c.fillStyle = 'rgba(12,16,20,0.78)'; roundRect(c, sx - w / 2, sy - 12, w, 22, 6); c.fill();
        c.fillStyle = p.color; c.fillRect(sx - w / 2, sy - 12, 4, 22);
        c.fillStyle = '#f3efe4'; c.fillText(txt, sx + 2, sy + 4);
      }
      if (z > 0.15) { const b = g.bazaar, [sx, sy] = this.toScreen(b.x + 2.5, b.y + 2.5, 110); c.font = '600 12px system-ui'; c.fillStyle = 'rgba(12,16,20,0.7)'; roundRect(c, sx - 62, sy - 11, 124, 20, 6); c.fill(); c.fillStyle = '#e8cf7a'; c.fillText('⚖ Great Bazaar', sx, sy + 4); }
    }
    // selection
    const sel = this.selected;
    if (sel && !sel.dead) {
      c.strokeStyle = '#fff3b0'; c.lineWidth = 2;
      if (sel.kind === 'unit') { const [sx, sy] = this.toScreen(sel.x, sel.y); c.beginPath(); c.ellipse(sx, sy, 10 * z, 5 * z, 0, 0, Math.PI * 2); c.stroke(); }
      else if (sel.kind === 'building' || sel.kind === 'node') { const s = sel.size || 1; const a = this.toScreen(sel.x, sel.y), b2 = this.toScreen(sel.x + s, sel.y), cc = this.toScreen(sel.x + s, sel.y + s), d = this.toScreen(sel.x, sel.y + s); c.beginPath(); c.moveTo(...a); c.lineTo(...b2); c.lineTo(...cc); c.lineTo(...d); c.closePath(); c.stroke(); }
    }
  }

  smokeColumn(x, y, size, realT, k, seed) {
    const c = this.c, z = this.cam.zoom, n = 2 + Math.round(k * 4);
    for (let i = 0; i < n; i++) {
      const ph = ((realT / 2600 + i / n + (seed % 7) * 0.13) % 1);
      const [sx, sy] = this.toScreen(x + Math.sin(seed + i * 1.7) * size * 0.25 + ph * 0.8, y + Math.cos(seed + i) * size * 0.25 - ph * 0.8, size * 12 + 10 + ph * 90);
      c.fillStyle = `rgba(${55 + i * 4},${52 + i * 3},${50 + i * 3},${(0.42 * k + 0.12) * (1 - ph)})`;
      c.beginPath(); c.arc(sx, sy, (5 + ph * 20) * z * (0.7 + size * 0.15), 0, Math.PI * 2); c.fill();
    }
  }
  drawParts(realT, tx0, tx1, ty0, ty1) {
    const c = this.c, z = this.cam.zoom, keep = [];
    for (const p of this.parts) {
      const a = (realT - p.t0) / p.life; if (a >= 1 || a < 0) continue; keep.push(p);
      if (p.x < tx0 || p.x > tx1 || p.y < ty0 || p.y > ty1) continue;
      if (p.k === 'dust') { const [sx, sy] = this.toScreen(p.x, p.y, 3 + a * 8); c.fillStyle = `rgba(165,145,105,${0.32 * (1 - a)})`; c.beginPath(); c.arc(sx, sy, (3 + a * 9) * z * p.r, 0, Math.PI * 2); c.fill(); }
      else if (p.k === 'wake') { const [sx, sy] = this.toScreen(p.x, p.y); c.strokeStyle = `rgba(235,245,255,${0.35 * (1 - a)})`; c.lineWidth = 1; c.beginPath(); c.ellipse(sx, sy, (4 + a * 14) * z, (2 + a * 7) * z, 0, 0, Math.PI * 2); c.stroke(); }
    }
    this.parts = keep;
  }
  // Day and night, clouds, rain, snow and fog. Decoration only: derived from game time and seed.
  weatherAt(t) {
    const g = this.g, slot = Math.floor(t / 360), r = hash2(slot, g.seed & 0xffff, 77);
    const cold = g.map.type === 'highlands', dry = g.map.type === 'steppe';
    return r < 0.5 ? 'clear' : r < 0.68 ? 'cloudy' : r < (dry ? 0.76 : 0.86) ? (cold ? 'snow' : 'rain') : r < 0.94 ? 'fog' : 'storm';
  }
  // a 20-minute day: long days, short nights
  daylight(t) { const ph = (t / 1200 + 0.28) % 1; const s = Math.sin(ph * Math.PI * 2); return { ph, light: clamp(0.75 + s * 0.9, 0, 1), dusk: clamp(1 - Math.abs(s + 0.25) * 3.2, 0, 1) }; }
  drawAtmosphere(realT, tx0, tx1, ty0, ty1) {
    const g = this.g, c = this.c, W = this.w, H = this.h, z = this.cam.zoom;
    const { light, dusk } = this.daylight(g.time), w = this.weatherAt(g.time);
    const wet = w === 'rain' || w === 'storm' || w === 'snow';
    // overcast skies dim the land
    if (w !== 'clear') { c.fillStyle = `rgba(60,70,85,${w === 'cloudy' ? 0.1 : w === 'fog' ? 0.06 : 0.18})`; c.fillRect(0, 0, W, H); }
    // night
    const night = 1 - light;
    if (night > 0.02) {
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = `rgb(${Math.round(255 - night * 118)},${Math.round(255 - night * 108)},${Math.round(255 - night * 62)})`; c.fillRect(0, 0, W, H);
      c.globalCompositeOperation = 'source-over';
      // torches and windows
      if (night > 0.25 && z > 0.12) {
        c.globalCompositeOperation = 'lighter';
        for (const b of g.buildings) {
          if (b.dead || !b.done || b.owner < 0 && b.type !== 'bazaar') continue;
          const t = b.type; if (t === 'farm' || BUILDINGS[t]?.wall) continue;
          if (b.x + b.size < tx0 || b.x > tx1 || b.y + b.size < ty0 || b.y > ty1) continue;
          const [sx, sy] = this.toScreen(b.x + b.size / 2, b.y + b.size / 2, 12);
          const r = (20 + b.size * 16) * z * (0.9 + 0.1 * Math.sin(realT * 0.006 + b.id));
          const gr = c.createRadialGradient(sx, sy, 1, sx, sy, r); gr.addColorStop(0, `rgba(255,170,80,${0.32 * night})`); gr.addColorStop(1, 'rgba(255,140,60,0)');
          c.fillStyle = gr; c.fillRect(sx - r, sy - r, r * 2, r * 2);
        }
        c.globalCompositeOperation = 'source-over';
      }
    }
    if (dusk > 0.05) { c.fillStyle = `rgba(255,120,50,${dusk * 0.12})`; c.fillRect(0, 0, W, H); }
    // drifting cloud shadows
    if ((w === 'cloudy' || wet) && z > 0.15) {
      for (let k = 0; k < 6; k++) {
        const x = ((k * 397 + realT * 0.012 * (1 + k % 3)) % (W + 600)) - 300, y = (k * 211 + Math.sin(k * 3) * 80) % H;
        const gr = c.createRadialGradient(x, y, 10, x, y, 260); gr.addColorStop(0, 'rgba(20,25,35,0.16)'); gr.addColorStop(1, 'rgba(20,25,35,0)');
        c.fillStyle = gr; c.fillRect(x - 260, y - 260, 520, 520);
      }
    }
    if (w === 'fog') { const gr = c.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(210,215,220,0.38)'); gr.addColorStop(1, 'rgba(210,215,220,0.12)'); c.fillStyle = gr; c.fillRect(0, 0, W, H); }
    // falling rain or snow in screen space
    if (wet) {
      const n = w === 'storm' ? 260 : 150, snow = w === 'snow';
      c.strokeStyle = 'rgba(200,215,235,0.35)'; c.fillStyle = 'rgba(245,248,255,0.8)'; c.lineWidth = 1;
      c.beginPath();
      for (let k = 0; k < n; k++) {
        const sp = snow ? 0.05 : 0.9, x0 = hash2(k, 1, 5) * (W + 100) - 50, y0 = hash2(k, 2, 5) * H;
        const y = (y0 + realT * sp * (0.7 + hash2(k, 3, 5) * 0.6)) % (H + 20) - 10, x = (x0 + (snow ? Math.sin(realT * 0.001 + k) * 12 : -y * 0.18)) % W;
        if (snow) { c.moveTo(x + 1.6, y); c.arc(x, y, 1.6, 0, Math.PI * 2); } else { c.moveTo(x, y); c.lineTo(x - 3, y + 14); }
      }
      if (snow) c.fill(); else c.stroke();
      if (w === 'storm' && hash2(Math.floor(realT / 90), 9, 3) > 0.985) { c.fillStyle = 'rgba(230,235,255,0.35)'; c.fillRect(0, 0, W, H); }
    }
  }

  drawBuilding(b) {
    const g = this.g, c = this.c, z = this.cam.zoom;
    const owner = g.players[b.owner];
    const stage = b.done ? 4 : Math.min(3, Math.floor(b.progress * 4));
    const sp = buildingSprite(b.type, owner ? owner.color : '#c9a540', owner?.civKey, stage, owner ? owner.age : 2, b.type === 'plantation' ? (g.ents.get(b.lux)?.good || '') : BUILDINGS[b.type]?.gate && b.open ? 'open' : '');
    const [sx, sy] = this.toScreen(b.x, b.y);
    if (z < 0.1 && b.type !== 'bazaar') { // tiny: draw a coloured footprint
      const [cx, cy] = this.toScreen(b.x + b.size / 2, b.y + b.size / 2);
      c.fillStyle = owner ? owner.color : '#c9a540'; c.fillRect(cx - b.size * 3 * z * 8, cy - b.size * 1.5 * z * 8, b.size * 6 * z * 8, b.size * 3 * z * 8); return;
    }
    if (b.hp < b.maxHp * 0.35 && b.done) c.filter = 'brightness(0.7) saturate(0.7)';
    c.drawImage(sp.cv, sx - sp.ax / S * z, sy - sp.ay / S * z, sp.cv.width / S * z, sp.cv.height / S * z);
    c.filter = 'none';
    if (z > 0.3 && b.owner >= 0) {
      const [bx, by] = this.toScreen(b.x + b.size / 2, b.y + b.size / 2, (b.size * 14 + 22));
      if (!b.done) bar(c, bx, by, 34 * Math.sqrt(b.size) * z, '#e9d26a', b.progress);
      else if (b.hp < b.maxHp) bar(c, bx, by, 34 * Math.sqrt(b.size) * z, owner.color, b.hp / b.maxHp);
      if (b.queue.length && z > 0.55 && b.done) { const q = b.queue[0]; bar(c, bx, by + 6, 24 * Math.sqrt(b.size) * z, '#9fd0ff', q.t / q.total); }
    }
  }
  drawTrap(b) {
    const c = this.c, z = this.cam.zoom, t = BUILDINGS[b.type].trap;
    const [sx, sy] = this.toScreen(b.x + 0.5, b.y + 0.5);
    c.globalAlpha = b.revealed ? 0.95 : 0.5; // hidden traps are faint: the enemy cannot see them
    if (t === 'stakes') { c.strokeStyle = '#6b4a2a'; c.lineWidth = 2 * z; for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(sx + k * 7 * z, sy + 2 * z); c.lineTo(sx + k * 7 * z + 6 * z, sy - 9 * z); c.stroke(); } }
    else if (t === 'spikes') { c.fillStyle = '#2a2018'; c.beginPath(); c.moveTo(sx, sy - 7 * z); c.lineTo(sx + 14 * z, sy); c.lineTo(sx, sy + 7 * z); c.lineTo(sx - 14 * z, sy); c.closePath(); c.fill(); c.strokeStyle = '#c8bfa8'; c.lineWidth = 1; for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(sx + k * 4 * z, sy + 2 * z); c.lineTo(sx + k * 4 * z, sy - 3 * z); c.stroke(); } }
    else if (t === 'caltrops') { c.fillStyle = '#5d6066'; for (let k = 0; k < 7; k++) { c.beginPath(); c.arc(sx + Math.cos(k * 2.4) * 9 * z, sy + Math.sin(k * 2.4) * 4 * z, 1.4 * z, 0, Math.PI * 2); c.fill(); } }
    else if (t === 'fire') { c.fillStyle = b.burning ? '#3a1e10' : '#3e3020'; c.beginPath(); c.moveTo(sx, sy - 6 * z); c.lineTo(sx + 15 * z, sy + 1 * z); c.lineTo(sx, sy + 8 * z); c.lineTo(sx - 15 * z, sy + 1 * z); c.closePath(); c.fill(); }
    c.globalAlpha = 1;
  }
  drawUnit(u, x, y, far) {
    const g = this.g, c = this.c, z = this.cam.zoom, p = g.players[u.owner];
    const [sx, sy] = this.toScreen(x, y);
    if (far) { const r = Math.max(1.2, (u.cls === 'cavalry' || u.cls === 'siege' ? 3 : 2) * z * 3); c.fillStyle = p.color; c.fillRect(sx - r / 2, sy - r, r, r); return; }
    const fx = Math.cos(u.facing), fy = Math.sin(u.facing);
    const scx = fx - fy, scy = fx + fy;
    const view = scy >= -0.3 ? 'front' : 'back';
    const flip = scx < 0;
    let anim = u.anim, frame = 0;
    const T = u.animT;
    if (anim === 'walk') frame = Math.floor(T * 9 * (UNITS[u.type].speed > 2 ? 1.2 : 1)) % 8;
    else if (anim === 'attack') frame = Math.min(3, Math.floor(T / 0.1));
    else if (anim === 'ready') { anim = 'attack'; frame = 0; }
    else if (anim === 'work' || anim === 'build' || anim === 'heal') frame = Math.floor(T * 7) % 6;
    else anim = 'idle';
    let carry = null;
    if (u.cls === 'villager') {
      if (anim === 'work') { const t = u.task; carry = t?.tk === 'node' && t.res === 'food' ? 'berries' : t?.res; }
      else if (anim === 'walk' && u.carry > 0.5) carry = u.carryRes;
    }
    const sp = unitSprite(u.type, p.color, anim, frame, view, carry);
    const w = sp.cv.width / K * z, h = sp.cv.height / K * z;
    if (u.wounded || u.sick) c.globalAlpha = 0.75;
    if (flip) { c.save(); c.translate(sx, sy); c.scale(-1, 1); c.drawImage(sp.cv, -sp.ax / K * z, -sp.ay / K * z, w, h); c.restore(); }
    else c.drawImage(sp.cv, sx - sp.ax / K * z, sy - sp.ay / K * z, w, h);
    c.globalAlpha = 1;
    if (z > 0.45) {
      const top = UNITS[u.type].naval ? 64 : UNITS[u.type].cls === 'cavalry' || UNITS[u.type].mounted ? 36 : 28;
      if (u.hp < u.maxHp - 0.5 || u === this.selected) bar(c, sx, sy - top * z, 16 * z, p.color, u.hp / u.maxHp);
      if (u.hero && this.showLabels) { const t = `⭐ ${u.hero.name} · ${HERO_LEVELS[u.hero.level].title}`; c.font = `700 ${Math.max(10, 11 * z)}px system-ui, sans-serif`; c.textAlign = 'center'; c.fillStyle = 'rgba(10,12,16,0.75)'; const w = c.measureText(t).width + 10; c.fillRect(sx - w / 2, sy - (top + 18) * z - 9, w, 14); c.fillStyle = '#ffd76a'; c.fillText(t, sx, sy - (top + 18) * z + 2); }
      if (u.wounded && z > 0.6) { c.fillStyle = '#ff5a5a'; c.font = `700 ${10 * z + 4}px system-ui`; c.textAlign = 'center'; c.fillText('✚', sx, sy - 30 * z); }
      if (u.routing && z > 0.6) { c.fillStyle = '#ffffff'; c.font = `700 ${9 * z + 4}px system-ui`; c.textAlign = 'center'; c.fillText('⚑', sx, sy - 31 * z); }
      if (u.hero) { c.strokeStyle = `rgba(255,215,90,${0.25 + 0.1 * Math.sin(this.realT * 0.004)})`; c.lineWidth = 1.5; c.beginPath(); c.ellipse(sx, sy, (15 + u.hero.level * 2) * z, (7.5 + u.hero.level) * z, 0, 0, Math.PI * 2); c.stroke(); }
    }
    // dust behind galloping horses and rolling siege engines
    if (this.quality.parts && u.anim === 'walk' && (u.cls === 'cavalry' || u.cls === 'siege' || UNITS[u.type].mounted) && z > 0.35 && this.parts.length < 500 && ((u.id + this.frameN) % 5 === 0)) this.parts.push({ k: 'dust', x: x - Math.cos(u.facing) * 0.4, y: y - Math.sin(u.facing) * 0.4, t0: this.realT, life: 900 + (u.id % 5) * 100, r: u.cls === 'siege' ? 1.3 : 1 });
    if (this.quality.parts && u.naval && u.anim === 'walk' && z > 0.35 && this.parts.length < 500 && ((u.id + this.frameN) % 6 === 0)) this.parts.push({ k: 'wake', x: x - Math.cos(u.facing) * 0.6, y: y - Math.sin(u.facing) * 0.6, t0: this.realT, life: 1400, r: 1 });
  }
}
function bar(c, x, y, w, col, f) {
  c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(x - w / 2 - 1, y - 1, w + 2, 4);
  c.fillStyle = col; c.fillRect(x - w / 2, y, w * clamp(f, 0, 1), 2);
}
function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
