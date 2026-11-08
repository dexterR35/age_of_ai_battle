// Small math helpers, deterministic RNG and value noise.
export function rng(seed) {
  let a = seed >>> 0;
  const f = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.int = (lo, hi) => lo + Math.floor(f() * (hi - lo + 1));
  f.range = (lo, hi) => lo + f() * (hi - lo);
  f.pick = arr => arr[Math.floor(f() * arr.length)];
  return f;
}
export function hash2(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const fade = t => t * t * (3 - 2 * t);
export function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = fade(x - xi), yf = fade(y - yi);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}
export function fbm(x, y, s, oct = 5) {
  let v = 0, amp = 0.5, f = 1, tot = 0;
  for (let i = 0; i < oct; i++) { v += vnoise(x * f, y * f, s + i * 17) * amp; tot += amp; amp *= 0.5; f *= 2.03; }
  return v / tot;
}
export function ridged(x, y, s, oct = 4) {
  let v = 0, amp = 0.5, f = 1, tot = 0;
  for (let i = 0; i < oct; i++) { const n = 1 - Math.abs(vnoise(x * f, y * f, s + i * 31) * 2 - 1); v += n * n * amp; tot += amp; amp *= 0.5; f *= 2.1; }
  return v / tot;
}
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
export function addCost(a, b, k = 1) { const o = { ...a }; for (const r in b) o[r] = (o[r] || 0) + b[r] * k; return o; }
export function fmtTime(s) { s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, ss = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(ss).padStart(2, '0'); }
export function hexToRgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function shade(hex, f) {
  const [r, g, b] = hexToRgb(hex);
  const k = v => clamp(Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f)), 0, 255);
  return `rgb(${k(r)},${k(g)},${k(b)})`;
}
