// Terrain: smooth per-pixel ground colours, hill shading, water, mountains.
// Rendered in 16x16-tile chunks at several levels of detail and cached (LRU).
import { T } from '../map.js';
import { HW, HH, K, treeSprite } from './sprites.js';
import { fbm, hash2 } from '../util.js';

export const CH = 16;
const PAD = 64; // extra room above a chunk for peaks and trees (iso px at zoom 1)
const PIXEL_BUDGET = 56e6;

export class TerrainRenderer {
  constructor(map, seed) {
    this.m = map; this.seed = seed;
    this.cache = new Map(); this.pixels = 0; this.frame = 0;
    this.colors();
  }
  colors() {
    const m = this.m, N = m.size, col = new Float32Array(N * N * 3), S = this.seed % 997;
    const base = {
      [T.DEEP]: [26, 70, 118], [T.SHALLOW]: [58, 132, 160], [T.SAND]: [214, 196, 140], [T.GRASS]: [86, 136, 56], [T.DRY]: [156, 150, 84],
      [T.FOREST]: [56, 90, 42], [T.HILL]: [116, 126, 78], [T.MOUNTAIN]: [122, 114, 104], [T.SNOW]: [232, 236, 240], [T.DIRT]: [146, 116, 78],
    };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, t = m.terrain[i], h = m.height[i];
      let [r, g, b] = base[t];
      const v = (fbm(x * 0.045, y * 0.045, S, 3) - 0.5) * 0.22;
      if (t === T.GRASS) { const w = m.moist[i] - 0.5; r += -w * 40; g += w * 18; b += -w * 6; }
      if (t === T.DEEP) { const d = Math.max(0, Math.min(1, (0.12 - h) * 6)); r -= d * 10; g -= d * 22; b -= d * 20; }
      if (t === T.HILL) { const k = (h - 0.66) * 1.6; r += k * 40; g += k * 30; b += k * 26; }
      if (t === T.MOUNTAIN) { const k = (h - 0.84) * 2; r += k * 50; g += k * 50; b += k * 50; }
      // hill shading, light from the upper-left of the screen (-x)
      const hl = x > 0 ? m.height[i - 1] : h, hr = x < N - 1 ? m.height[i + 1] : h, hu = y > 0 ? m.height[i - N] : h, hd = y < N - 1 ? m.height[i + N] : h;
      const water = t === T.DEEP || t === T.SHALLOW;
      const sh = water ? 0 : ((hl - hr) * 2.2 + (hu - hd) * 1.1);
      const f = 1 + Math.max(-0.35, Math.min(0.35, sh)) + (water ? v * 0.3 : v);
      col[i * 3] = r * f; col[i * 3 + 1] = g * f; col[i * 3 + 2] = b * f;
    }
    this.col = col;
    this.baseCol = col.slice();
  }
  // a tile changed (a road was laid, a moat dug): recompute its colour from scratch
  recolor(i) {
    const m = this.m, col = this.col, t = m.terrain[i];
    if (t === T.SHALLOW && !(this.baseCol[i * 3 + 2] > this.baseCol[i * 3] * 1.6)) { col[i * 3] = 62; col[i * 3 + 1] = 128; col[i * 3 + 2] = 150; return; }
    const r0 = this.baseCol[i * 3], g0 = this.baseCol[i * 3 + 1], b0 = this.baseCol[i * 3 + 2];
    if (m.road[i] === 1) { col[i * 3] = r0 * 0.35 + 148 * 0.65; col[i * 3 + 1] = g0 * 0.35 + 118 * 0.65; col[i * 3 + 2] = b0 * 0.35 + 80 * 0.65; }
    else if (m.road[i] === 2) { col[i * 3] = r0 * 0.2 + 152 * 0.8; col[i * 3 + 1] = g0 * 0.2 + 146 * 0.8; col[i * 3 + 2] = b0 * 0.2 + 136 * 0.8; }
    else { col[i * 3] = r0; col[i * 3 + 1] = g0; col[i * 3 + 2] = b0; }
  }
  key(cx, cy, scale, baked) { return cx + ',' + cy + ',' + scale + (baked ? 't' : ''); }
  get(cx, cy, scale, baked, allowRender) {
    const k = this.key(cx, cy, scale, baked);
    let e = this.cache.get(k);
    const ver = this.m.chunkVer.get((cx << 16) | cy) || 0;
    if (e && (e.ver === ver || !allowRender)) { e.used = this.frame; return e; }
    if (!allowRender) return null;
    if (e) { this.pixels -= e.cv.width * e.cv.height; this.cache.delete(k); }
    e = this.render(cx, cy, scale, baked); e.ver = ver; e.used = this.frame;
    this.cache.set(k, e); this.pixels += e.cv.width * e.cv.height;
    if (this.pixels > PIXEL_BUDGET) this.evict();
    return e;
  }
  // any cached version of a chunk, used while the right one is still being drawn
  fallback(cx, cy) {
    for (const sc of [0.5, 0.25, 1, 0.125, 0.0625]) for (const b of [true, false]) { const e = this.cache.get(this.key(cx, cy, sc, b)); if (e) { e.used = this.frame; return e; } }
    return null;
  }
  evict() {
    const arr = [...this.cache.entries()].sort((a, b) => a[1].used - b[1].used);
    // never drop what was on screen in the last few frames, or a big window would repaint the same chunks forever
    for (const [k, e] of arr) { if (this.pixels < PIXEL_BUDGET * 0.8) break; if (e.used >= this.frame - 3) continue; this.cache.delete(k); this.pixels -= e.cv.width * e.cv.height; }
  }
  render(cx, cy, scale, baked) {
    const m = this.m, N = m.size, col = this.col;
    const x0 = cx * CH, y0 = cy * CH, x1 = Math.min(N, x0 + CH), y1 = Math.min(N, y0 + CH);
    const W = Math.ceil(2 * CH * HW * scale), Hh = Math.ceil(2 * CH * HH * scale), P = Math.ceil(PAD * scale);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = Hh + P;
    const c = cv.getContext('2d');
    const X0 = (x0 - y0 - CH) * HW, Y0 = (x0 + y0) * HH;
    const img = c.createImageData(W, Hh), d = img.data;
    const inv = 1 / scale, step = inv / (2 * HW);
    const ov = 0.12; // overlap hides seams between chunks
    const S = this.seed;
    for (let py = 0; py < Hh; py++) {
      const Y = Y0 + (py + 0.5) * inv;
      let X = X0 + 0.5 * inv;
      let wx = (X / HW + Y / HH) / 2, wy = (Y / HH - X / HW) / 2;
      let o = py * W * 4;
      for (let px = 0; px < W; px++, wx += step, wy -= step, o += 4) {
        if (wx < x0 - ov || wy < y0 - ov || wx >= x1 + ov || wy >= y1 + ov) continue;
        // bilinear blend of the four nearest tile colours
        let fx = wx - 0.5, fy = wy - 0.5;
        let ix = Math.floor(fx), iy = Math.floor(fy); const tx = fx - ix, ty = fy - iy;
        if (ix < 0) ix = 0; if (iy < 0) iy = 0; if (ix > N - 2) ix = N - 2; if (iy > N - 2) iy = N - 2;
        const i00 = (iy * N + ix) * 3, i10 = i00 + 3, i01 = i00 + N * 3, i11 = i01 + 3;
        const a = (1 - tx) * (1 - ty), b = tx * (1 - ty), cc = (1 - tx) * ty, dd = tx * ty;
        let r = col[i00] * a + col[i10] * b + col[i01] * cc + col[i11] * dd;
        let g = col[i00 + 1] * a + col[i10 + 1] * b + col[i01 + 1] * cc + col[i11 + 1] * dd;
        let bl = col[i00 + 2] * a + col[i10 + 2] * b + col[i01 + 2] * cc + col[i11 + 2] * dd;
        const tt = m.terrain[(wy | 0) * N + (wx | 0)];
        if (tt === T.DEEP || tt === T.SHALLOW) {
          const w = Math.sin(wx * 2.1 + wy * 1.3) * Math.sin(wy * 1.7 - wx * 0.6);
          const k = w * 7 + (hash2((wx * 3) | 0, (wy * 3) | 0, S) - 0.5) * 4;
          r += k; g += k; bl += k * 1.2;
        } else {
          const n = hash2((wx * 7) | 0, (wy * 7) | 0, S) - 0.5, n2 = hash2((wx * 2.5) | 0, (wy * 2.5) | 0, S + 1) - 0.5;
          const k = n * 16 + n2 * 10;
          r += k; g += k * (tt === T.SAND || tt === T.SNOW ? 0.9 : 1.1); bl += k * 0.7;
        }
        d[o] = r; d[o + 1] = g; d[o + 2] = bl; d[o + 3] = 255;
      }
    }
    c.putImageData(img, 0, P);
    // decorations, drawn in world-iso coordinates
    c.setTransform(scale, 0, 0, scale, -X0 * scale, -Y0 * scale + P);
    const Pt = (x, y) => [(x - y) * HW, (x + y) * HH];
    for (let s = x0 + y0; s <= x1 + y1 - 2; s++) for (let y = Math.max(y0, s - x1 + 1); y <= Math.min(y1 - 1, s - x0); y++) {
      const x = s - y, i = y * N + x, t = m.terrain[i], h = hash2(x, y, S + 5);
      const [sx, sy] = Pt(x + 0.5, y + 0.5);
      if (m.road[i] === 2 && scale >= 0.5) { c.fillStyle = 'rgba(90,86,80,0.35)'; for (let k = 0; k < 4; k++) { c.beginPath(); c.ellipse(sx + (hash2(x, y, k + 20) - 0.5) * 34, sy + (hash2(y, x, k + 20) - 0.5) * 16, 3.2, 1.6, 0, 0, Math.PI * 2); c.fill(); } }
      if (m.stump[i]) { c.fillStyle = '#5a4128'; c.beginPath(); c.ellipse(sx, sy, 3.2, 1.8, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#b38b5a'; c.beginPath(); c.ellipse(sx, sy - 1, 2.4, 1.2, 0, 0, Math.PI * 2); c.fill(); }
      if (t === T.MOUNTAIN || t === T.SNOW) {
        if (h < 0.55) {
          const ht = 18 + h * 40, w = 20 + h * 14;
          const rock = t === T.SNOW ? '#9a948c' : '#857c72';
          c.fillStyle = 'rgba(0,0,0,0.18)'; c.beginPath(); c.ellipse(sx + 4, sy + 2, w * 0.8, w * 0.3, 0, 0, Math.PI * 2); c.fill();
          c.beginPath(); c.moveTo(sx - w, sy + 4); c.lineTo(sx - w * 0.2, sy - ht); c.lineTo(sx + w * 0.15, sy - ht * 0.85); c.lineTo(sx + w, sy + 4); c.closePath(); c.fillStyle = rock; c.fill();
          c.beginPath(); c.moveTo(sx - w * 0.2, sy - ht); c.lineTo(sx + w * 0.15, sy - ht * 0.85); c.lineTo(sx + w, sy + 4); c.lineTo(sx + w * 0.1, sy + 4); c.closePath(); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fill();
          if (t === T.SNOW || h < 0.18) { c.beginPath(); c.moveTo(sx - w * 0.45, sy - ht * 0.55); c.lineTo(sx - w * 0.2, sy - ht); c.lineTo(sx + w * 0.15, sy - ht * 0.85); c.lineTo(sx + w * 0.32, sy - ht * 0.5); c.lineTo(sx, sy - ht * 0.62); c.closePath(); c.fillStyle = '#f2f4f6'; c.fill(); }
        }
      } else if (scale >= 0.5 && (t === T.GRASS || t === T.DRY || t === T.FOREST || t === T.HILL) && !m.tree[i]) {
        if (h < 0.35) { c.strokeStyle = t === T.DRY ? 'rgba(120,110,50,0.7)' : 'rgba(40,80,30,0.6)'; c.lineWidth = 1; c.beginPath(); for (let k = 0; k < 3; k++) { const ox = (hash2(x, y, k) - 0.5) * 30, oy = (hash2(y, x, k) - 0.5) * 14; c.moveTo(sx + ox, sy + oy); c.lineTo(sx + ox - 1.5, sy + oy - 4); c.moveTo(sx + ox, sy + oy); c.lineTo(sx + ox + 1.5, sy + oy - 3.5); } c.stroke(); }
        if (h > 0.96) { c.fillStyle = ['#e9d55a', '#e8e8f0', '#c45ac8'][(h * 1000 | 0) % 3]; for (let k = 0; k < 4; k++) c.fillRect(sx + (hash2(x, k, 3) - 0.5) * 24, sy + (hash2(k, y, 4) - 0.5) * 10, 1.6, 1.6); }
        if (h > 0.9 && h <= 0.96) { c.fillStyle = 'rgba(130,125,115,0.9)'; c.beginPath(); c.ellipse(sx + 6, sy + 2, 2.6, 1.6, 0, 0, Math.PI * 2); c.fill(); }
      } else if (t === T.SAND && h < 0.08 && scale >= 0.5) { c.fillStyle = 'rgba(160,140,90,0.8)'; c.beginPath(); c.ellipse(sx, sy, 2, 1, 0, 0, Math.PI * 2); c.fill(); }
      if (baked && m.tree[i]) { const sp = treeSprite(m.treeKind[i], (x * 7 + y * 3) % 5); const jx = (hash2(x, y, 91) - 0.5) * 0.55, jy = (hash2(x, y, 92) - 0.5) * 0.55; const tx = sx + (jx - jy) * HW, ty = sy + (jx + jy) * HH; c.drawImage(sp.cv, tx - sp.ax / K, ty - sp.ay / K, sp.cv.width / K, sp.cv.height / K); }
    }
    return { cv, X0, Y0, scale, P };
  }
  // One composite image of the whole world for far zoom levels (one texture instead of a thousand).
  world() {
    const m = this.m, N = m.size, sc = 0.0625, n = Math.ceil(N / CH);
    if (!this.wimg) {
      const cv = document.createElement('canvas'); cv.width = Math.ceil(2 * N * HW * sc); cv.height = Math.ceil((2 * N * HH + PAD) * sc);
      this.wimg = { cv, c: cv.getContext('2d'), sc, ver: new Map(), checked: 0 };
      for (let cy = 0; cy < n; cy++) for (let cx = 0; cx < n; cx++) this.blit(cx, cy);
    } else if (performance.now() - this.wimg.checked > 2000) {
      this.wimg.checked = performance.now();
      let redone = 0;
      for (const [k, v] of this.m.chunkVer) if (this.wimg.ver.get(k) !== v && redone++ < 24) this.blit(k >> 16, k & 0xffff);
    }
    return this.wimg;
  }
  blit(cx, cy) {
    const w = this.wimg, N = this.m.size, e = this.get(cx, cy, w.sc, true, true);
    w.c.drawImage(e.cv, Math.round((e.X0 + N * HW) * w.sc), Math.round((e.Y0 + PAD) * w.sc) - e.P);
    w.ver.set((cx << 16) | cy, this.m.chunkVer.get((cx << 16) | cy) || 0);
  }
  minimap(size) {
    const m = this.m, N = m.size, W = size * 2, H = size;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d'), img = c.createImageData(W, H), d = img.data;
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const X = (px / W - 0.5) * 2, Y = py / H * 2; // iso unit square
      const wx = (X + Y) / 2 * N, wy = (Y - X) / 2 * N;
      if (wx < 0 || wy < 0 || wx >= N || wy >= N) continue;
      const i = (wy | 0) * N + (wx | 0), o = (py * W + px) * 4;
      let r = this.col[i * 3], g = this.col[i * 3 + 1], b = this.col[i * 3 + 2];
      if (m.tree[i]) { r *= 0.6; g *= 0.78; b *= 0.6; }
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    return cv;
  }
}
