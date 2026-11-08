// World map: terrain generation and tile queries shared by simulation, AI and renderer.
import { rng, fbm, ridged, vnoise, clamp } from './util.js';
import { MAP_TYPES } from './config.js';

export const T = { DEEP: 0, SHALLOW: 1, SAND: 2, GRASS: 3, DRY: 4, FOREST: 5, HILL: 6, MOUNTAIN: 7, SNOW: 8, DIRT: 9 };
export const B = { TERRAIN: 1, TREE: 2, BUILDING: 4, NODE: 8 };
const TREE_WOOD = 125;

export class GameMap {
  constructor(size) {
    this.size = size;
    const n = size * size;
    this.terrain = new Uint8Array(n);
    this.height = new Float32Array(n);
    this.moist = new Float32Array(n);
    this.tree = new Float32Array(n);     // wood left on this tile
    this.treeKind = new Uint8Array(n);   // 1 oak, 2 pine, 3 birch, 4 palm, 5 dead
    this.stump = new Uint8Array(n);
    this.block = new Uint8Array(n);      // bit flags from B
    this.occ = new Int32Array(n);        // building/node id occupying the tile
    this.road = new Uint8Array(n);        // 1 dirt road, 2 paved road
    this.gate = new Int32Array(n);        // gate building id: open for its owner and allies, shut to everyone else
    this.traffic = new Uint16Array(n);    // footsteps of workers and carts; busy tiles become roads
    this.paintQ = [];                     // tiles whose ground colour changed (roads, moats)
    this.version = 0;                    // bumps when anything visible on terrain changes
    this.chunkVer = new Map();           // chunk key -> version; renderer redraws stale chunks
  }
  idx(x, y) { return y * this.size + x; }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.size && y < this.size; }
  passable(x, y) { return x >= 0 && y >= 0 && x < this.size && y < this.size && this.block[y * this.size + x] === 0; }
  cost(i) { const t = this.terrain[i]; return this.road[i] ? (this.road[i] === 2 ? 0.7 : 0.8) : t === T.SHALLOW ? 2.4 : t === T.HILL ? 1.35 : t === T.FOREST ? 1.1 : t === T.SAND ? 1.1 : 1; }
  speedAt(x, y) {
    const xi = x | 0, yi = y | 0; if (!this.inside(xi, yi)) return 1;
    const i = yi * this.size + xi, t = this.terrain[i];
    return this.road[i] ? (this.road[i] === 2 ? 1.35 : 1.2) : t === T.SHALLOW ? 0.55 : t === T.HILL ? 0.8 : t === T.FOREST ? 0.9 : t === T.SAND ? 0.92 : 1;
  }
  paint(i) { this.paintQ.push(i); this.markDirty(i % this.size, (i / this.size) | 0); }
  markDirty(x, y) { const k = ((x >> 4) << 16) | (y >> 4); this.chunkVer.set(k, (this.chunkVer.get(k) || 0) + 1); this.version++; }
  setTree(i, wood) {
    this.tree[i] = wood;
    if (wood > 0) this.block[i] |= B.TREE; else { this.block[i] &= ~B.TREE; if (this.treeKind[i]) this.stump[i] = 1; this.treeKind[i] = 0; this.markDirty(i % this.size, (i / this.size) | 0); }
  }
  // Ground that a building can stand on.
  buildable(x, y) {
    if (!this.inside(x, y)) return false;
    const i = this.idx(x, y), t = this.terrain[i];
    return this.block[i] === 0 && this.occ[i] === 0 && (t === T.GRASS || t === T.DRY || t === T.DIRT || t === T.SAND || t === T.FOREST || t === T.HILL);
  }
  areaBuildable(x, y, s, margin = 1) {
    for (let yy = y - margin; yy < y + s + margin; yy++) for (let xx = x - margin; xx < x + s + margin; xx++) {
      const inner = xx >= x && yy >= y && xx < x + s && yy < y + s;
      if (inner) { if (!this.buildable(xx, yy)) return false; }
      else if (!this.inside(xx, yy) || this.occ[this.idx(xx, yy)] !== 0 || this.block[this.idx(xx, yy)] !== 0) return false; // keep a fully open ring so towns never seal themselves in
    }
    return true;
  }
  // Clear line of movement between two points (samples every 0.3 tiles, with radius).
  lineClear(ax, ay, bx, by) {
    const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d / 0.3);
    for (let k = 1; k <= n; k++) {
      const t = k / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
      if (!this.passable(x | 0, y | 0)) return false;
      if (!this.passable((x + 0.25) | 0, (y + 0.25) | 0) || !this.passable((x - 0.25) | 0, (y - 0.25) | 0) || !this.passable((x + 0.25) | 0, (y - 0.25) | 0) || !this.passable((x - 0.25) | 0, (y + 0.25) | 0)) return false;
    }
    return true;
  }
  // Nearest tree tile within radius, scanning rings outward.
  findTree(cx, cy, maxR = 22) {
    cx |= 0; cy |= 0;
    for (let r = 0; r <= maxR; r++) {
      let best = -1, bd = 1e9;
      for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r || !this.inside(x, y)) continue;
        const i = y * this.size + x;
        if (this.tree[i] > 0 && this.hasOpenNeighbor(x, y)) { const d = (x - cx) ** 2 + (y - cy) ** 2; if (d < bd) { bd = d; best = i; } }
      }
      if (best >= 0) return best;
    }
    return -1;
  }
  // Water that ships can sail: deep or shallow, not under a building.
  navigable(x, y) { if (x < 0 || y < 0 || x >= this.size || y >= this.size) return false; const i = y * this.size + x; return this.water[i] === 0; }
  lineClearW(ax, ay, bx, by) {
    const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d / 0.4);
    for (let k = 1; k <= n; k++) {
      const t = k / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
      if (!this.navigable(x | 0, y | 0) || !this.navigable((x + 0.3) | 0, (y + 0.3) | 0) || !this.navigable((x - 0.3) | 0, (y - 0.3) | 0)) return false;
    }
    return true;
  }
  // tiles of navigable water touching a footprint (for docks)
  shoreWater(x, y, s) {
    const out = [];
    for (let yy = y - 1; yy <= y + s; yy++) for (let xx = x - 1; xx <= x + s; xx++) {
      if (xx >= x && yy >= y && xx < x + s && yy < y + s) continue;
      if (this.navigable(xx, yy)) out.push(yy * this.size + xx);
    }
    return out;
  }
  hasOpenNeighbor(x, y) { return this.passable(x + 1, y) || this.passable(x - 1, y) || this.passable(x, y + 1) || this.passable(x, y - 1); }
  countTrees(cx, cy, r) { let n = 0; for (let y = cy - r; y <= cy + r; y += 2) for (let x = cx - r; x <= cx + r; x += 2) if (this.inside(x, y) && this.tree[this.idx(x, y)]) n++; return n; }
}

// ------------------------------------------------------------------ generation
export function generateMap(size, type, playerCount, seed) {
  const P = MAP_TYPES[type] || MAP_TYPES.continental;
  const R = rng(seed), S = seed % 10000;
  const m = new GameMap(size), N = size, cx = N / 2, cy = N / 2;
  const sc = 4.2 / 128 * (128 / N) * (N / 128) ** 0.35; // feature scale grows slowly with map size

  // Player start ring
  const starts = [];
  const ang0 = R() * Math.PI * 2;
  const ringR = N * (playerCount <= 2 ? 0.33 : 0.355);
  for (let i = 0; i < playerCount; i++) {
    const a = ang0 + i / playerCount * Math.PI * 2;
    starts.push({ x: Math.round(cx + Math.cos(a) * ringR), y: Math.round(cy + Math.sin(a) * ringR), a });
  }
  const startDist = (x, y) => { let d = 1e9; for (const s of starts) d = Math.min(d, Math.hypot(x - s.x, y - s.y)); return d; };

  // Elevation, mountains, moisture
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    let h = fbm(x * sc, y * sc, S, 5);
    const r = Math.hypot(x - cx, y - cy) / (N / 2);
    if (P.sea) h = h * 0.85 + 0.2 - Math.max(0, r - 0.78) * 2.4; else h = h * 0.8 + 0.18;
    const rid = ridged(x * sc * 0.9, y * sc * 0.9, S + 99, 4);
    if (rid > 0.78 - P.mountains * 0.22) h += (rid - (0.78 - P.mountains * 0.22)) * 2.2;
    h += (fbm(x * sc * 2.5, y * sc * 2.5, S + 7, 3) - 0.5) * P.hills * 0.35;
    // flatten the start estates
    const sd = startDist(x, y);
    if (sd < 30) { const k = clamp((30 - sd) / 14, 0, 1); h = h * (1 - k) + 0.5 * k; }
    // flatten the center (bazaar)
    const cd = Math.hypot(x - cx, y - cy);
    if (cd < 14) { const k = clamp((14 - cd) / 6, 0, 1); h = h * (1 - k) + 0.48 * k; }
    m.height[i] = h;
    m.moist[i] = fbm(x * sc * 1.3 + 50, y * sc * 1.3, S + 3, 4) - (P.dry ? 0.18 : 0);
  }

  // Lakes
  for (let k = 0; k < P.lakes * (N / 256); k++) {
    const lx = R.int(20, N - 20), ly = R.int(20, N - 20), lr = R.range(4, 9) * (N / 256) ** 0.5;
    if (startDist(lx, ly) < 38 || Math.hypot(lx - cx, ly - cy) < 22) continue;
    for (let y = Math.floor(ly - lr * 1.6); y <= ly + lr * 1.6; y++) for (let x = Math.floor(lx - lr * 1.6); x <= lx + lr * 1.6; x++) {
      if (!m.inside(x, y)) continue;
      const d = Math.hypot(x - lx, y - ly) / lr + (vnoise(x * 0.2, y * 0.2, S + k) - 0.5) * 0.6;
      if (d < 1) m.height[y * N + x] = Math.min(m.height[y * N + x], 0.1 + d * 0.08);
    }
  }

  // Rivers run outward from the middle between player wedges, with shallow fords.
  const riverTiles = new Uint8Array(N * N);
  const fords = [];
  for (let k = 0; k < P.rivers; k++) {
    const a = ang0 + (k + 0.5) / Math.max(P.rivers, playerCount) * Math.PI * 2 * (P.rivers >= playerCount ? 1 : playerCount / P.rivers) + R.range(-0.12, 0.12);
    let x = cx + Math.cos(a) * N * 0.09, y = cy + Math.sin(a) * N * 0.09, dir = a, step = 0;
    const width = R.range(1.3, 2.3) * (N / 256) ** 0.3;
    let nextFord = R.int(14, 24);
    while (m.inside(x | 0, y | 0) && step < N * 1.5) {
      dir += (vnoise(step * 0.05, k * 9.1, S + 55) - 0.5) * 0.22;
      dir = dir * 0.92 + a * 0.08;
      x += Math.cos(dir); y += Math.sin(dir); step++;
      const ford = --nextFord <= 0;
      if (ford) { nextFord = R.int(28, 46); fords.push({ x: x | 0, y: y | 0 }); }
      const w = width + (ford ? 0.5 : 0);
      for (let yy = Math.floor(y - w - 1); yy <= y + w + 1; yy++) for (let xx = Math.floor(x - w - 1); xx <= x + w + 1; xx++) {
        if (!m.inside(xx, yy)) continue;
        const d = Math.hypot(xx - x, yy - y), i = yy * N + xx;
        if (startDist(xx, yy) < 22) continue;
        if (d <= w) { riverTiles[i] = Math.max(riverTiles[i], ford ? 1 : 2); m.height[i] = Math.min(m.height[i], 0.12); }
        else if (d <= w + 1.2) m.height[i] = Math.min(m.height[i], 0.24);
      }
      if (P.sea && m.height[(y | 0) * N + (x | 0)] < 0.05 && Math.hypot(x - cx, y - cy) > N * 0.4) break;
    }
  }

  // Classify terrain
  const SEA = 0.16, HILL = 0.66, MOUNT = 0.84, SNOW = 0.97;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, h = m.height[i];
    let t;
    if (riverTiles[i] === 2) t = T.DEEP;
    else if (riverTiles[i] === 1) t = T.SHALLOW;
    else if (h < SEA - 0.04) t = T.DEEP;
    else if (h < SEA) t = T.SHALLOW;
    else if (h < SEA + 0.035) t = T.SAND;
    else if (h > SNOW) t = T.SNOW;
    else if (h > MOUNT) t = T.MOUNTAIN;
    else if (h > HILL) t = T.HILL;
    else t = m.moist[i] < 0.38 ? T.DRY : T.GRASS;
    if (x === 0 || y === 0 || x === N - 1 || y === N - 1) t = t === T.DEEP || t === T.SHALLOW ? T.DEEP : T.MOUNTAIN;
    m.terrain[i] = t;
  }
  // Shallow banks for deep water so coasts look natural
  for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
    const i = y * N + x;
    if (m.terrain[i] !== T.DEEP) continue;
    let land = false;
    for (let d = 0; d < 4 && !land; d++) { const j = i + [1, -1, N, -N][d]; const t = m.terrain[j]; if (t !== T.DEEP && t !== T.SHALLOW) land = true; }
    if (land && riverTiles[i] !== 2) m.terrain[i] = T.SHALLOW;
  }

  // Forests
  const fsc = sc * 2.1;
  for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
    const i = y * N + x, t = m.terrain[i];
    if (t !== T.GRASS && t !== T.DRY && t !== T.HILL) continue;
    const sd = startDist(x, y);
    if (sd < 13 || Math.hypot(x - cx, y - cy) < 16) continue;
    let f = fbm(x * fsc, y * fsc, S + 21, 4) + (m.moist[i] - 0.5) * 0.4;
    // guaranteed woodlines behind each estate
    if (sd > 17 && sd < 27) f += 0.16 * (vnoise(x * 0.15, y * 0.15, S + 8) > 0.42 ? 1 : 0);
    const thr = 0.66 - P.forest * 0.2;
    if (f > thr && hashTree(x, y, S) < 0.86) {
      m.terrain[i] = t === T.HILL ? T.HILL : T.FOREST;
      m.treeKind[i] = t === T.HILL || m.moist[i] > 0.6 ? 2 : t === T.DRY ? (hashTree(x, y, S + 1) < 0.5 ? 3 : 1) : (hashTree(x, y, S + 2) < 0.3 ? 3 : 1);
      if (m.height[i] < SEA + 0.06) m.treeKind[i] = 4;
      m.tree[i] = TREE_WOOD;
    } else if (f > thr - 0.06) m.terrain[i] = t === T.HILL ? T.HILL : T.FOREST; // forest floor edge
  }
  // Scattered lone trees for life
  for (let k = 0; k < N * N / 260; k++) {
    const x = R.int(2, N - 3), y = R.int(2, N - 3), i = y * N + x;
    if ((m.terrain[i] === T.GRASS || m.terrain[i] === T.DRY) && !m.tree[i] && startDist(x, y) > 11 && Math.hypot(x - cx, y - cy) > 14) { m.tree[i] = TREE_WOOD; m.treeKind[i] = R() < 0.5 ? 1 : 3; }
  }
  // Dirt patches
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = y * N + x; if (m.terrain[i] === T.GRASS && vnoise(x * 0.11, y * 0.11, S + 77) > 0.83) m.terrain[i] = T.DIRT; }

  // Start estates: clean grass and a dirt plaza
  for (const s of starts) for (let y = s.y - 13; y <= s.y + 13; y++) for (let x = s.x - 13; x <= s.x + 13; x++) {
    if (!m.inside(x, y)) continue; const d = Math.hypot(x - s.x, y - s.y); if (d > 13) continue;
    const i = y * N + x; m.tree[i] = 0; m.treeKind[i] = 0;
    m.terrain[i] = d < 4.5 ? T.DIRT : (m.moist[i] < 0.38 ? T.DRY : T.GRASS);
  }

  // Sacred sites & bazaar
  const sacred = [], nSacred = Math.max(3, Math.min(6, Math.ceil(playerCount * 0.75) + 1));
  for (let k = 0; k < nSacred; k++) {
    const a = ang0 + (k + 0.5) / nSacred * Math.PI * 2 + 0.3;
    const r = N * (nSacred > 4 ? 0.2 : 0.17);
    sacred.push({ x: Math.round(cx + Math.cos(a) * r), y: Math.round(cy + Math.sin(a) * r) });
  }
  const clearings = [...sacred.map(p => ({ ...p, r: 5 })), { x: cx, y: cy, r: 9 }];
  for (const c of clearings) for (let y = c.y - c.r; y <= c.y + c.r; y++) for (let x = c.x - c.r; x <= c.x + c.r; x++) {
    if (!m.inside(x, y) || Math.hypot(x - c.x, y - c.y) > c.r) continue;
    const i = y * N + x; m.tree[i] = 0; m.treeKind[i] = 0; m.terrain[i] = T.GRASS;
  }

  for (let i = 0; i < N * N; i++) m.block[i] = (m.terrain[i] === T.DEEP || m.terrain[i] === T.MOUNTAIN || m.terrain[i] === T.SNOW ? B.TERRAIN : 0) | (m.tree[i] ? B.TREE : 0);

  // Resources: clusters near each start, richer clusters between players and toward the middle.
  const nodes = [];
  const used = new Set();
  const place = (res, x, y, count, amount) => {
    const pts = [[x, y]]; let tries = 0;
    while (pts.length < count && tries++ < 200) {
      const [bx, by] = pts[R.int(0, pts.length - 1)];
      const nx = bx + R.int(-1, 1), ny = by + R.int(-1, 1);
      if (!pts.some(p => p[0] === nx && p[1] === ny)) pts.push([nx, ny]);
    }
    for (const [px, py] of pts) {
      if (!m.inside(px, py) || used.has(py * N + px)) continue;
      const i = py * N + px, t = m.terrain[i];
      if (m.block[i] || t === T.SHALLOW || t === T.DEEP) continue;
      used.add(i); nodes.push({ res, x: px, y: py, amount });
    }
  };
  const openSpot = (x, y, rad = 2) => {
    for (let k = 0; k < 40; k++) {
      const px = Math.round(x + R.range(-rad, rad)), py = Math.round(y + R.range(-rad, rad));
      let ok = m.inside(px, py);
      for (let yy = py - 2; ok && yy <= py + 2; yy++) for (let xx = px - 2; ok && xx <= px + 2; xx++) if (!m.inside(xx, yy) || m.block[yy * N + xx] & B.TERRAIN) ok = false;
      if (ok) return [px, py];
    }
    return [Math.round(x), Math.round(y)];
  };
  for (const s of starts) {
    const base = s.a + Math.PI; // toward the outer side first
    const layout = [['food', 7.5, 0.0, 7, 160], ['gold', 11, 1.4, 7, 800], ['stone', 12, -1.5, 6, 700], ['iron', 15, 2.6, 6, 700], ['food', 10, 3.6, 6, 160], ['gold', 21, -2.6, 8, 800], ['stone', 22, 0.8, 5, 700]];
    for (const [res, d, off, cnt, amt] of layout) {
      const a = base + off + R.range(-0.25, 0.25);
      const [px, py] = openSpot(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d, 1.5);
      clearAround(m, px, py, 2);
      place(res, px, py, cnt, amt);
    }
  }
  const expansions = [];
  for (let i = 0; i < playerCount; i++) {
    const a = starts[i], b = starts[(i + 1) % playerCount];
    if (playerCount > 1) expansions.push({ x: (a.x + b.x) / 2 * 0.85 + cx * 0.15, y: (a.y + b.y) / 2 * 0.85 + cy * 0.15 });
    expansions.push({ x: a.x * 0.55 + cx * 0.45, y: a.y * 0.55 + cy * 0.45 });
  }
  for (const e of expansions) {
    const [px, py] = openSpot(e.x, e.y, 6);
    clearAround(m, px, py, 3);
    place(R.pick(['gold', 'gold', 'stone', 'iron']), px, py, 9, 1000);
    const [qx, qy] = openSpot(px + R.int(-7, 7), py + R.int(-7, 7), 3);
    clearAround(m, qx, qy, 2);
    place(R.pick(['iron', 'stone', 'gold']), qx, qy, 7, 900);
  }
  // Luxury deposits: silk, spice, wine and salt, between the estates and toward the middle
  const LUX = ['silk', 'spice', 'wine', 'salt'];
  for (let k = 0; k < playerCount * 2 + 4; k++) {
    const a = ang0 + (k + 0.5) / (playerCount * 2 + 4) * Math.PI * 2 + R.range(-0.15, 0.15), r = N * R.range(0.14, 0.3);
    const [px, py] = openSpot(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 4);
    const i = py * N + px; if (used.has(i) || m.block[i] || startDist(px, py) < 26) continue;
    clearAround(m, px, py, 3);
    used.add(i); nodes.push({ res: 'lux', good: LUX[k % 4], x: px, y: py, amount: 4000 });
  }
  // Wild berry groves across the map
  for (let k = 0; k < N * N / 9000; k++) {
    const x = R.int(10, N - 10), y = R.int(10, N - 10);
    if (startDist(x, y) < 30 || m.block[y * N + x]) continue;
    place('food', x, y, 5, 160);
  }

  // Fishing grounds: shoals in water close to a shore
  const fish = [];
  const isWater = i => m.terrain[i] === T.DEEP || m.terrain[i] === T.SHALLOW;
  let shoals = 0;
  for (let k = 0; k < N * N / 30 && shoals < N * N / 3800; k++) {
    const x = R.int(4, N - 5), y = R.int(4, N - 5), i = y * N + x;
    if (!isWater(i) || used.has(i)) continue;
    if (fish.some(f => Math.abs(f.x - x) + Math.abs(f.y - y) < 12)) continue;
    let land = 0, water = 0;
    for (let yy = y - 4; yy <= y + 4; yy++) for (let xx = x - 4; xx <= x + 4; xx++) { const j = yy * N + xx; if (isWater(j)) water++; else if (Math.abs(xx - x) <= 3 && Math.abs(yy - y) <= 3) land++; }
    if (!land || water < 30) continue;
    shoals++;
    const pts = [[x, y], [x + R.int(-1, 1), y + R.int(-1, 1)], [x + R.int(-2, 2), y + R.int(-2, 2)]];
    for (const [px, py] of pts) { const j = py * N + px; if (m.inside(px, py) && isWater(j) && !used.has(j)) { used.add(j); fish.push({ res: 'food', fish: true, x: px, y: py, amount: 350 }); } }
  }
  nodes.push(...fish);

  // Connectivity: every start, site and the bazaar must be reachable from start 0.
  const ensure = (tx, ty) => {
    const reach = flood(m, starts[0].x, starts[0].y);
    if (reach[ty * N + tx]) return;
    // carve a ford/pass along the straight line
    const sx = starts[0].x, sy = starts[0].y, L = Math.hypot(tx - sx, ty - sy);
    for (let k = 0; k <= L; k++) {
      const x = Math.round(sx + (tx - sx) * k / L), y = Math.round(sy + (ty - sy) * k / L);
      for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) {
        if (!m.inside(xx, yy)) continue; const i = yy * N + xx;
        if (m.block[i] & B.TERRAIN) { m.terrain[i] = m.terrain[i] === T.DEEP ? T.SHALLOW : T.HILL; m.block[i] &= ~B.TERRAIN; }
        if (m.tree[i] && (xx === x || yy === y)) { m.tree[i] = 0; m.treeKind[i] = 0; m.block[i] &= ~B.TREE; }
      }
    }
  };
  for (const s of starts) ensure(s.x, s.y);
  for (const s of sacred) ensure(s.x, s.y);
  ensure(cx | 0, cy | 0);

  m.water = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) m.water[i] = m.terrain[i] === T.DEEP || m.terrain[i] === T.SHALLOW ? 0 : 1;
  m.starts = starts; m.sacred = sacred; m.bazaar = { x: (cx | 0) - 2, y: (cy | 0) - 2 }; m.nodesInit = nodes; m.fords = fords; m.type = type;
  return m;
}

function hashTree(x, y, s) { return vnoise(x * 1.7, y * 1.7, s + 400); }
function clearAround(m, x, y, r) {
  for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) {
    if (!m.inside(xx, yy)) continue; const i = m.idx(xx, yy);
    if (m.tree[i]) { m.tree[i] = 0; m.treeKind[i] = 0; m.block[i] &= ~B.TREE; }
  }
}
export function flood(m, sx, sy) {
  const N = m.size, seen = new Uint8Array(N * N), q = new Int32Array(N * N);
  let h = 0, t = 0; const s = sy * N + sx; seen[s] = 1; q[t++] = s;
  while (h < t) {
    const i = q[h++], x = i % N, y = (i / N) | 0;
    const nb = [x > 0 ? i - 1 : -1, x < N - 1 ? i + 1 : -1, y > 0 ? i - N : -1, y < N - 1 ? i + N : -1];
    for (const j of nb) if (j >= 0 && !seen[j] && !m.block[j]) { seen[j] = 1; q[t++] = j; }
  }
  return seen;
}
