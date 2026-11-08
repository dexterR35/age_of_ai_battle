// A* on the tile grid. Goals are rectangles (a tile, or "next to a building/tree").
const SQ2 = Math.SQRT2;
const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];

export class PathFinder {
  // mask: tiles with a non-zero value are closed. Land units use map.block; ships use map.water.
  constructor(map, mask = null) {
    this.m = map; this.naval = !!mask; this.mask = mask || map.block;
    const n = map.size * map.size;
    this.g = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.stamp = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.gen = 1;
    this.heap = new Int32Array(n); this.hf = new Float32Array(n); this.hn = 0;
    this.expansions = 0;
    this.comp = new Int32Array(n); // connected-region label per open tile (0 = blocked when labelled)
    this.label();
  }
  // Flood-fill regions so impossible searches can be rejected without expanding nodes.
  label() {
    const m = this.m, N = m.size, comp = this.comp, block = this.mask, q = this.heap;
    comp.fill(0); let id = 0; this.labelGen = (this.labelGen || 0) + 1;
    for (let s = 0; s < N * N; s++) {
      if (comp[s] || block[s]) continue;
      id++; let h = 0, t = 0; q[t++] = s; comp[s] = id;
      while (h < t) {
        const i = q[h++], x = i % N;
        if (x > 0 && !comp[i - 1] && !block[i - 1]) { comp[i - 1] = id; q[t++] = i - 1; }
        if (x < N - 1 && !comp[i + 1] && !block[i + 1]) { comp[i + 1] = id; q[t++] = i + 1; }
        if (i >= N && !comp[i - N] && !block[i - N]) { comp[i - N] = id; q[t++] = i - N; }
        if (i < N * N - N && !comp[i + N] && !block[i + N]) { comp[i + N] = id; q[t++] = i + N; }
      }
    }
  }
  reachable(si, x0, y0, x1, y1) {
    const N = this.m.size, cs = this.comp[si], mask = this.mask;
    if (!cs || mask[si]) return true; // unknown: let the search decide
    for (let y = Math.max(0, y0); y <= Math.min(N - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(N - 1, x1); x++) {
      const i = y * N + x; if (mask[i]) continue;
      const c = this.comp[i]; if (c === cs || c === 0) return true;
    }
    return false;
  }
  push(i, f) { let k = this.hn++; const H = this.heap, F = this.hf; while (k > 0) { const p = (k - 1) >> 1; if (F[p] <= f) break; H[k] = H[p]; F[k] = F[p]; k = p; } H[k] = i; F[k] = f; }
  pop() {
    const H = this.heap, F = this.hf, top = H[0], n = --this.hn;
    if (n > 0) {
      const li = H[n], lf = F[n]; let k = 0;
      for (;;) { let c = 2 * k + 1; if (c >= n) break; if (c + 1 < n && F[c + 1] < F[c]) c++; if (F[c] >= lf) break; H[k] = H[c]; F[k] = F[c]; k = c; }
      H[k] = li; F[k] = lf;
    }
    return top;
  }
  // rect = {x0,y0,x1,y1} inclusive target tiles; reach = how close (Chebyshev) we must get.
  find(sx, sy, rect, reach = 0, limit = 30000, weight = 0) {
    const m = this.m, N = m.size, block = this.mask, naval = this.naval;
    sx = Math.max(0, Math.min(N - 1, sx | 0)); sy = Math.max(0, Math.min(N - 1, sy | 0));
    const gen = ++this.gen; this.hn = 0;
    const x0 = rect.x0 - reach, y0 = rect.y0 - reach, x1 = rect.x1 + reach, y1 = rect.y1 + reach;
    const raw = (x, y) => { const dx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0, dy = y < y0 ? y0 - y : y > y1 ? y - y1 : 0; return dx + dy + (SQ2 - 2) * Math.min(dx, dy); };
    // long trips trade a little optimality for far fewer expansions
    const d0 = raw(sx, sy), w = weight || (d0 < 40 ? 1.1 : d0 < 120 ? 1.6 : 2.2);
    const h = (x, y) => raw(x, y) * w;
    const s = sy * N + sx;
    if (!this.reachable(s, x0, y0, x1, y1)) return { ok: false, cut: false, pts: [] };
    this.g[s] = 0; this.stamp[s] = gen; this.parent[s] = -1;
    this.push(s, h(sx, sy));
    let best = s, bestH = h(sx, sy), found = -1, exp = 0, cut = false;
    while (this.hn > 0) {
      const i = this.pop();
      if (this.closed[i] === gen) continue;
      this.closed[i] = gen;
      const x = i % N, y = (i / N) | 0;
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1 && (block[i] === 0 || i === s)) { found = i; break; }
      const hh = h(x, y); if (hh < bestH) { bestH = hh; best = i; }
      if (++exp > limit) { cut = true; break; }
      const gi = this.g[i];
      for (let d = 0; d < 8; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const j = ny * N + nx;
        if (block[j] !== 0) {
          // allow stepping onto the goal rectangle edge only if open; blocked tiles are never entered
          continue;
        }
        if (d >= 4 && (block[y * N + nx] !== 0 || block[ny * N + x] !== 0)) continue; // no corner cutting
        const ng = gi + (d >= 4 ? SQ2 : 1) * (naval ? 1 : m.cost(j));
        if (this.stamp[j] !== gen || ng < this.g[j]) {
          this.stamp[j] = gen; this.g[j] = ng; this.parent[j] = i;
          this.push(j, ng + h(nx, ny));
        }
      }
    }
    this.expansions += exp;
    const end = found >= 0 ? found : best;
    const tiles = [];
    for (let k = end; k >= 0 && tiles.length < 4000; k = this.parent[k]) { tiles.push(k); if (k === s) break; }
    tiles.reverse();
    return { ok: found >= 0, cut: found < 0 && cut, pts: this.smooth(tiles) };
  }
  // Keep only turning points that are needed for a clear line of travel.
  smooth(tiles) {
    const m = this.m, N = m.size, pts = [];
    if (tiles.length <= 1) return tiles.map(i => ({ x: i % N + 0.5, y: ((i / N) | 0) + 0.5 }));
    let a = 0;
    pts.push({ x: tiles[0] % N + 0.5, y: ((tiles[0] / N) | 0) + 0.5 });
    while (a < tiles.length - 1) {
      let b = Math.min(tiles.length - 1, a + 14);
      const ax = tiles[a] % N + 0.5, ay = ((tiles[a] / N) | 0) + 0.5;
      while (b > a + 1) { const bx = tiles[b] % N + 0.5, by = ((tiles[b] / N) | 0) + 0.5; if (this.naval ? m.lineClearW(ax, ay, bx, by) : m.lineClear(ax, ay, bx, by)) break; b--; }
      pts.push({ x: tiles[b] % N + 0.5, y: ((tiles[b] / N) | 0) + 0.5 });
      a = b;
    }
    pts.shift();
    return pts;
  }
}
