// Authoritative simulation. Everything that happens in the world happens here.
import { TICK, UNITS, BUILDINGS, TECHS, AGES, LINES, POP_MAX, RES, HERO_LEVELS, HERO_NAMES, HERO_EPITHETS, AI, GOODS, CIVS, GOVERNOR_TRAITS, LAWS } from './config.js';
import { generateMap, B, T } from './map.js';
import { PathFinder } from './path.js';
import { Player } from './player.js';
import { Brain } from './ai.js';
import { rng, clamp } from './util.js';
import { gradeOf } from './analytics.js';

const GATHER = { food: 0.5, wood: 0.44, gold: 0.4, stone: 0.38, iron: 0.36 };
const FARM_RATE = 0.5;
const CARRY = 10;
const GARRISON_CAP = { town_center: 15, castle: 20, watch_tower: 5 };
// buildings soldiers can seize instead of burning down
const CAPTURE = { courthouse: 1, plantation: 1, monument: 1, printing_press: 1, foundry: 1, bank: 1, star_fort: 1, town_center: 1, castle: 1, house: 1, barracks: 1, archery_range: 1, stable: 1, market: 1, mill: 1, lumber_camp: 1, mining_camp: 1, blacksmith: 1, temple: 1, infirmary: 1, council_hall: 1, siege_workshop: 1, university: 1, hospital: 1, shrine: 1, watch_tower: 1, dock: 1, cathedral: 1 };

class Grid { // spatial hash for units: linked lists in typed arrays, cheap to rebuild every tick
  constructor(size, cell) { this.cell = cell; this.cols = Math.ceil(size / cell); this.head = new Int32Array(this.cols * this.cols).fill(-1); this.next = new Int32Array(8192); this.items = []; }
  clear() { this.head.fill(-1); this.items.length = 0; }
  add(u) {
    const cx = clamp((u.x / this.cell) | 0, 0, this.cols - 1), cy = clamp((u.y / this.cell) | 0, 0, this.cols - 1), c = cy * this.cols + cx;
    const k = this.items.length; this.items.push(u);
    if (k >= this.next.length) { const n = new Int32Array(this.next.length * 2); n.set(this.next); this.next = n; }
    this.next[k] = this.head[c]; this.head[c] = k;
  }
  query(x, y, r, fn) {
    const c = this.cell, x0 = clamp(((x - r) / c) | 0, 0, this.cols - 1), x1 = clamp(((x + r) / c) | 0, 0, this.cols - 1), y0 = clamp(((y - r) / c) | 0, 0, this.cols - 1), y1 = clamp(((y + r) / c) | 0, 0, this.cols - 1);
    const items = this.items, next = this.next, head = this.head;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) for (let k = head[cy * this.cols + cx]; k >= 0; k = next[k]) fn(items[k]);
  }
}

export function rectDist(x, y, b) {
  const s = b.size || 1;
  const dx = Math.max(b.x - x, 0, x - (b.x + s)), dy = Math.max(b.y - y, 0, y - (b.y + s));
  return Math.hypot(dx, dy);
}

export class Game {
  constructor(setup) {
    this.setup = setup;
    this.seed = setup.seed >>> 0;
    this.R = rng(this.seed ^ 0x9e3779b9);
    this.map = generateMap(setup.size, setup.mapType, setup.players.length, this.seed);
    this.N = this.map.size;
    this.pf = new PathFinder(this.map);
    this.pfW = new PathFinder(this.map, this.map.water); // ships
    this.waterSize = new Map(); for (let i = 0; i < this.pfW.comp.length; i++) { const c = this.pfW.comp[i]; if (c && !this.map.water[i]) this.waterSize.set(c, (this.waterSize.get(c) || 0) + 1); }
    this.sfx = []; this.sfxOn = false;          // sound cues for the browser; never read by the simulation
    this.moments = []; this.directiveLog = []; this.checks = [];
    this.replayQ = setup.replay ? [...setup.replay.directives] : null;
    this.time = 0; this.tickN = 0; this.nextId = 1;
    this.ents = new Map();
    this.units = []; this.buildings = []; this.nodes = []; this.projectiles = []; this.fx = []; this.events = [];
    this.grid = new Grid(this.N, 4);
    this.BC = 8; this.bcols = Math.ceil(this.N / 8); this.bcells = Array.from({ length: this.bcols * this.bcols }, () => []); this.bq = 0; // buildings by area
    this.pathQueue = []; this.pathCache = new Map();
    this.heat = new Float32Array(Math.ceil(this.N / 16) ** 2);
    this.over = null;
    this.market = { food: 1, wood: 1, stone: 0.9, iron: 1.2 }; // gold paid per unit sold
    this.prices = Object.fromEntries(Object.entries(GOODS).map(([k, v]) => [k, v.price])); // luxury prices at the bazaar
    this.pacts = new Set(); this.embargo = new Set();   // 'a:b' trade agreements, 'a>b' a refuses to trade with b
    this.hotTiles = new Set();                            // busy tiles on their way to becoming roads
    this.players = setup.players.map((cfg, i) => new Player(this, i, cfg));
    const P = this.players.length;
    // relations: teams are permanent allies, otherwise everyone starts at war
    this.rel = Array.from({ length: P }, (_, i) => Array.from({ length: P }, (_, j) => i === j ? 'self' : (setup.teams && this.players[i].team != null && this.players[i].team === this.players[j].team) ? 'ally' : 'war'));
    this.peaceUntil = (setup.peace || 0) * 60;
    for (const n of this.map.nodesInit) { const nd = this.addNode(n.res, n.x, n.y, n.amount, !!n.fish); if (n.good) nd.good = n.good; }
    this.sacred = this.map.sacred.map((s, i) => ({ id: i, x: s.x, y: s.y, owner: -1, claimant: -1, progress: 0 }));
    this.bazaar = this.placeBuilding(-1, 'bazaar', this.map.bazaar.x, this.map.bazaar.y, true);
    this.players.forEach((p, i) => {
      const s = this.map.starts[i];
      p.home = { x: s.x, y: s.y };
      const tc = this.placeBuilding(i, 'town_center', s.x - 2, s.y - 2, true);
      p.tc = tc;
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; this.spawnUnit(i, 'villager', s.x + Math.cos(a) * 3.2, s.y + Math.sin(a) * 3.2); }
      this.spawnUnit(i, 'scout', s.x + 3.5, s.y + 3.5);
      // early houses are placed by the AI, starting stock covers them
    });
    this.brains = this.players.map(p => new Brain(this, p));
    this.log(`The age of AI begins: ${this.players.map(p => p.name).join(', ')} enter the ${setup.mapName || 'world'}.`, 'big');
  }

  // ---------------------------------------------------------------- entities
  addNode(res, x, y, amount, fish = false) {
    const n = { id: this.nextId++, kind: "node", res, x, y, size: 1, amount, max: amount, var: (x * 7 + y * 13) % 4, fish };
    this.nodes.push(n); this.ents.set(n.id, n);
    const i = this.map.idx(x, y); this.map.block[i] |= B.NODE; this.map.occ[i] = n.id;
    return n;
  }
  removeNode(n) {
    n.dead = true; this.ents.delete(n.id);
    const i = this.map.idx(n.x, n.y); this.map.block[i] &= ~B.NODE; this.map.occ[i] = 0; this.map.markDirty(n.x, n.y);
    this.nodes = this.nodes.filter(k => k !== n);
  }
  placeBuilding(owner, type, x, y, done = false) {
    const spec = type === 'bazaar' ? { size: 5, hp: 99999 } : BUILDINGS[type];
    const p = this.players[owner];
    const maxHp = p ? this.bldMaxHp(p, type) : spec.hp;
    const b = { id: this.nextId++, kind: 'building', type, owner, x, y, size: spec.size, hp: done ? maxHp : Math.max(1, maxHp * 0.05), maxHp, done, progress: done ? 1 : 0, queue: [], garrison: [], nb: 0, nbNow: 0, cool: 0, farmer: 0, food: 600, born: this.time, lastHit: -1e9 };
    this.buildings.push(b); this.ents.set(b.id, b);
    if (p) p.blds.push(b);
    if (this.fx.length) this.fx = this.fx.filter(f => f.kind !== 'rubble' || f.x >= x + spec.size || f.x + f.size <= x || f.y >= y + spec.size || f.y + f.size <= y);
    this.bcellsDo(b, cell => cell.push(b));
    const m = this.map;
    for (let yy = y; yy < y + spec.size; yy++) for (let xx = x; xx < x + spec.size; xx++) {
      const i = m.idx(xx, yy); m.occ[i] = b.id;
      if (spec.gate) m.gate[i] = b.id; else if (!spec.passable) m.block[i] |= B.BUILDING;
      if (m.tree[i]) m.setTree(i, 0);
      m.stump[i] = 0;
    }
    if (done && p) this.recountPop(p);
    if (type === 'town_center' && p) b.townName = this.townName(p);
    // units standing inside the footprint are pushed out
    if (!spec.passable && !spec.gate) this.grid.query(x + spec.size / 2, y + spec.size / 2, spec.size, u => { if (u.x >= x && u.x < x + spec.size && u.y >= y && u.y < y + spec.size) this.ejectFrom(u, b); });
    return b;
  }
  removeBuilding(b, killer = -1, quiet = false) {
    if (b.dead) return;
    b.dead = true; this.ents.delete(b.id);
    this.bcellsDo(b, cell => { const i = cell.indexOf(b); if (i >= 0) cell.splice(i, 1); });
    const p = this.players[b.owner];
    const m = this.map;
    for (let yy = b.y; yy < b.y + b.size; yy++) for (let xx = b.x; xx < b.x + b.size; xx++) { const i = m.idx(xx, yy); m.occ[i] = 0; m.block[i] &= ~B.BUILDING; m.gate[i] = 0; }
    if (b.breach) this.closeBreach(b, true);
    if (b.type === 'monument' && p) p.recalc();
    m.markDirty(b.x, b.y);
    for (const id of b.garrison) { const u = this.ents.get(id); if (u) { u.inside = 0; this.ejectFrom(u, b); u.hp = Math.max(1, u.hp * 0.6); } }
    b.garrison = [];
    if (p) {
      p.blds = p.blds.filter(k => k !== b);
      for (const q of b.queue) p.refund(q.cost, 0.5);
      this.recountPop(p);
      if (!quiet) p.stats.lost++;
      if (b.done && !quiet && !BUILDINGS[b.type]?.trap && b.type !== 'farm' && p.alive) this.brains[b.owner]?.lostSites.push({ type: b.type, x: b.x, y: b.y, t: this.time, tries: 0 });
      if (b.done && killer >= 0) { this.players[killer].stats.razed++; this.log(`🔥 ${this.players[killer].name} destroys ${p.name}'s ${BUILDINGS[b.type].name}.`, b.type === 'town_center' || b.type === 'castle' ? 'big' : 'war', [killer, b.owner], b.x + b.size / 2, b.y + b.size / 2); }
    }
    if (quiet) return;
    this.fx.push({ kind: 'rubble', x: b.x, y: b.y, size: b.size, type: b.type, owner: b.owner, t0: this.time, life: b.size >= 3 ? 900 : 240 });
    if (b.size >= 2) this.sound('collapse', b.x + b.size / 2, b.y + b.size / 2);
    for (let k = 0; k < b.size * 3; k++) this.fx.push({ kind: 'smoke', x: b.x + this.R() * b.size, y: b.y + this.R() * b.size, t0: this.time + this.R() * 2, life: 4 + this.R() * 3 });
  }
  spawnUnit(owner, type, x, y) {
    const p = this.players[owner], st = p.st(type);
    const u = { id: this.nextId++, kind: 'unit', type, cls: st.cls, owner, x, y, px: x, py: y, hp: st.hp, maxHp: st.hp, pop: st.pop,
      facing: this.R() * Math.PI * 2, anim: 'idle', animT: this.R() * 10, task: { type: 'idle' }, path: null, pathI: 0, needPath: false,
      cool: 0, morale: p.moraleBase(), kills: 0, carry: 0, carryRes: null, inside: 0, wounded: false, sick: false, routing: 0,
      lastCombat: -1e9, lastHit: -1e9, moved: 0, army: 0, scanT: this.R() * 0.5, born: this.time, gx: x, gy: y, naval: !!UNITS[type].naval };
    this.units.push(u); this.ents.set(u.id, u); p.units.push(u);
    p.pop += u.pop;
    return u;
  }
  bcellsDo(b, fn) {
    const C = this.BC, n = this.bcols;
    for (let cy = (b.y / C) | 0; cy <= Math.min(n - 1, ((b.y + b.size - 1) / C) | 0); cy++) for (let cx = (b.x / C) | 0; cx <= Math.min(n - 1, ((b.x + b.size - 1) / C) | 0); cx++) fn(this.bcells[cy * n + cx]);
  }
  // buildings whose footprint may lie within r of (x, y)
  buildingsNear(x, y, r, fn) {
    const q = ++this.bq, C = this.BC, n = this.bcols;
    const cx0 = Math.max(0, ((x - r - 5) / C) | 0), cx1 = Math.min(n - 1, ((x + r) / C) | 0), cy0 = Math.max(0, ((y - r - 5) / C) | 0), cy1 = Math.min(n - 1, ((y + r) / C) | 0);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) for (const b of this.bcells[cy * n + cx]) { if (b._q === q || b.dead) continue; b._q = q; fn(b); }
  }
  recountPop(p) {
    let cap = 0; for (const b of p.blds) if (b.done) cap += BUILDINGS[b.type].pop || 0;
    p.popCap = Math.min(POP_MAX, cap);
  }
  hostile(a, b) { return a !== b && a >= 0 && b >= 0 && this.rel[a][b] === 'war' && this.time >= this.peaceUntil; }
  setRelation(a, b, state, why = '') {
    if (a === b || this.rel[a][b] === state) return;
    if (this.setup.teams && this.players[a].team != null && this.players[a].team === this.players[b].team) return;
    const old = this.rel[a][b];
    this.rel[a][b] = this.rel[b][a] = state;
    const A = this.players[a].name, Bn = this.players[b].name;
    if (state === 'ally') for (const q of [this.players[a], this.players[b]]) q.stats.alliances = (q.stats.alliances || 0) + 1;
    const msg = state === 'ally' ? `🤝 ${A} and ${Bn} sign an alliance.` : state === 'peace' ? `🕊 ${A} and ${Bn} agree to peace.` : old === 'ally' ? `🗡 ${A} betrays the alliance with ${Bn}!` : `⚔ ${A} declares war on ${Bn}!`;
    this.log(msg + (why ? ` (${why})` : ''), 'diplo', [a, b]);
  }
  log(text, kind = 'info', pids = [], x, y) {
    this.events.unshift({ t: this.time, text, kind, pids, x, y });
    if (this.events.length > 400) this.events.pop();
    if (kind === 'big' || (kind === 'age' && text.includes(' enters '))) this.moments.push({ t: this.time, text, pids, x, y });
  }
  sound(k, x, y) { if (this.sfxOn && this.sfx.length < 300) this.sfx.push({ k, x, y }); }
  // a strategy directive from a live model (or from a replay log); recorded so replays stay exact
  applyDirective(pid, d) {
    const p = this.players[pid], br = this.brains[pid]; if (!p || !br) return;
    br.directive = { ...(br.directive || {}), ...d, at: this.time };
    br.onDirective?.(d);
    this.directiveLog.push({ tick: this.tickN, pid, d });
    if (d.message) { this.log(`💬 ${p.name}: "${d.message}"`, 'chat', [pid]); this.talk(pid, d.message); }
    const parts = [d.posture, d.attack && 'attack ' + d.attack, d.target != null && this.players[d.target] && 'target ' + this.players[d.target].name, d.research?.length && 'research ' + d.research.join('/'), d.build?.length && 'build ' + d.build.join('/'), d.laws?.length && 'laws ' + d.laws.join('/'), d.government, d.diplomacy?.length && d.diplomacy.map(x => x.action + '→' + (this.players[x.to]?.name || '?')).join(' ')].filter(Boolean);
    this.decide(pid, 'orders', 'model orders: ' + (parts.join(', ') || 'keep course'), 'llm');
  }

  // ---------------------------------------------------------------- orders used by the AI
  queueUnit(b, type) {
    const p = this.players[b.owner];
    if (!b.done || b.queue.length >= 5 || !p.canTrain(type) || UNITS[type].building !== b.type) return false;
    const cost = p.cost(type);
    if (!p.pay(cost)) return false;
    b.queue.push({ kind: 'unit', key: type, t: 0, total: UNITS[type].time, cost });
    return true;
  }
  queueTech(b, key) {
    const p = this.players[b.owner], T = TECHS[key];
    if (!b.done || b.type !== T.building || b.queue.length >= 5 || !p.canResearch(key)) return false;
    if (!p.pay(T.cost)) return false;
    b.queue.unshift({ kind: 'tech', key, t: 0, total: T.time, cost: T.cost });
    return true;
  }
  queueAge(p) {
    const next = p.age + 1, A = AGES[next - 1], tc = p.blds.find(b => b.type === 'town_center' && b.done);
    if (!A || !tc || p.ageResearching || !p.ageReady(next).ok || !p.pay(A.cost)) return false;
    tc.queue.unshift({ kind: 'age', key: 'age' + next, t: 0, total: A.time, cost: A.cost });
    p.ageResearching = true;
    this.log(`📜 ${p.name} begins advancing to the ${A.name}.`, 'age', [p.id], tc.x + 2, tc.y + 2);
    return true;
  }
  startBuilding(p, type, x, y, builders = []) {
    const spec = BUILDINGS[type];
    if (!p.canBuild(type) || !this.map.areaBuildable(x, y, spec.size, spec.wall || spec.passable || spec.coastal ? 0 : 1)) return null;
    if (spec.wall) { // walls never touch other buildings, or they could close the gaps between them
      for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) { const o = this.map.inside(xx, yy) ? this.ents.get(this.map.occ[this.map.idx(xx, yy)]) : null; if (o && o.kind === 'building' && !BUILDINGS[o.type]?.wall) return null; if (o && o.kind === 'node') return null; }
    }
    const cost = p.cost(type, true);
    if (!p.pay(cost)) return null;
    const b = this.placeBuilding(p.id, type, x, y, false);
    b.cost = cost;
    for (const u of builders) this.order(u, { type: 'build', id: b.id });
    return b;
  }
  order(u, task) {
    if (u.dead || u.wounded) return;
    if (u.inside && task.type !== 'garrison') { const b = this.ents.get(u.inside); this.ungarrison(u, b); }
    if (u.task?.type === 'gather' && u.task.tk === 'farm') { const f = this.ents.get(u.task.ti); if (f && f.farmer === u.id) f.farmer = 0; }
    u.task = task; u.path = null; u.needPath = false; u.dest = null;
  }

  // ---------------------------------------------------------------- movement
  setDest(u, x, y, rect = null, reach = 0) {
    u.dest = { x, y, rect, reach }; u.path = null; u.pathI = 0; u.needPath = false; u.stuckT = 0; u.lastPos = null; u.unreachable = false; u.pathFail = false;
    let tx = x, ty = y;
    if (rect) {
      tx = clamp(u.x, rect.x0 - 0.45 - reach * 0.6, rect.x1 + 1.45 + reach * 0.6);
      ty = clamp(u.y, rect.y0 - 0.45 - reach * 0.6, rect.y1 + 1.45 + reach * 0.6);
    }
    const d = Math.hypot(tx - u.x, ty - u.y);
    if (d < 0.05) return;
    if (u.naval) { if (d < 22 && this.map.navigable(tx | 0, ty | 0) && this.map.lineClearW(u.x, u.y, tx, ty)) { u.path = [{ x: tx, y: ty }]; return; } }
    else if (d < 22 && this.map.passable(tx | 0, ty | 0) && this.map.lineClear(u.x, u.y, tx, ty)) { u.path = [{ x: tx, y: ty }]; return; }
    u.needPath = true; this.pathQueue.push(u);
  }
  arrived(u) {
    const d = u.dest; if (!d) return true;
    if (d.rect) { const r = d.rect; return rectDist(u.x, u.y, { x: r.x0, y: r.y0, size: r.x1 - r.x0 + 1 }) <= d.reach + 0.7; }
    return Math.hypot(u.x - d.x, u.y - d.y) < 0.4;
  }
  processPaths() {
    let budget = 40000;
    while (this.pathQueue.length && budget > 0) {
      const u = this.pathQueue.shift();
      if (u.dead || !u.needPath || !u.dest) continue;
      const d = u.dest;
      const rect = d.rect || { x0: d.x | 0, y0: d.y | 0, x1: d.x | 0, y1: d.y | 0 };
      const pf = u.naval ? this.pfW : this.pf;
      // short errands may not turn into a march around a river: their search is capped by the straight distance
      const tt = u.task?.type, local = tt === 'attack' || tt === 'build' || tt === 'repair' || tt === 'gather' || tt === 'garrison' || tt === 'heal';
      const dd = Math.max(Math.abs(u.x - (rect.x0 + rect.x1) / 2), Math.abs(u.y - (rect.y0 + rect.y1) / 2));
      const cap = local ? Math.min(25000, 3000 + dd * dd * 8) : 25000;
      // soldiers leaving the same area for the same place share one route (and one failure)
      const reachK = d.rect ? Math.max(1, Math.ceil(d.reach)) : 0;
      const key = dd > 16 && !(u.noCacheUntil > this.time) ? `${u.naval ? 1 : 0}|${(u.x / 6) | 0},${(u.y / 6) | 0}|${((rect.x0 + rect.x1) / 8) | 0},${((rect.y0 + rect.y1) / 8) | 0}|${reachK}` : null;
      const hit = key && this.pathCache.get(key);
      if (hit && this.time - hit.t < 25) {
        u.needPath = false; budget -= 30;
        if (hit.fail || !hit.pts.length) { u.path = null; u.pathFail = true; continue; }
        u.path = hit.pts.slice(); u.pathI = 0; u.pathFail = false;
        if (hit.cut && (u.task.cuts = (u.task.cuts || 0) + 1) > 3) u.pathFail = true;
        continue;
      }
      const before = pf.expansions, lim = Math.min(cap, budget + 2000);
      const res = pf.find(u.x, u.y, rect, d.rect ? Math.max(1, Math.ceil(d.reach)) : 0, lim);
      budget -= pf.expansions - before + 50;
      if (!res.ok && res.cut && lim < cap) { this.pathQueue.unshift(u); break; } // out of budget this tick: finish it next tick
      if (!res.ok && res.cut && local) res.cut = false; // too far around: treat as unreachable
      if (key) this.pathCache.set(key, { t: this.time, pts: res.pts.slice(), fail: !res.ok && !res.cut, cut: res.cut });
      u.needPath = false;
      u.path = res.pts; u.pathI = 0;
      if (!d.rect && res.ok && (u.naval ? this.map.navigable(d.x | 0, d.y | 0) : this.map.passable(d.x | 0, d.y | 0))) u.path.push({ x: d.x, y: d.y });
      u.pathFail = !res.ok && !res.cut; // a long trip cut short is walked in stages, re-planning at the end
      if (res.cut && (u.task.cuts = (u.task.cuts || 0) + 1) > 3) u.pathFail = true; // ...but not forever
      if (!u.path.length) u.path = null;
    }
  }
  // Advance along the path. Returns true when the destination is reached.
  step(u, dt, speedK = 1) {
    if (u.needPath) return false;
    if (!u.path) {
      if (this.arrived(u)) return true;
      if (u.pathFail || u.unreachable) { u.pathFail = false; u.unreachable = true; return true; }
      if (u.dest) { const dd = u.dest; this.setDest(u, dd.x, dd.y, dd.rect, dd.reach); if (!u.path && !u.needPath) return true; }
      return false;
    }
    const p = u.path[u.pathI];
    const dx = p.x - u.x, dy = p.y - u.y, d = Math.hypot(dx, dy);
    const st = this.players[u.owner].st(u.type);
    let sp = st.speed * (u.naval ? 1 : this.map.speedAt(u.x, u.y)) * speedK * dt;
    if (u.wounded || u.sick) sp *= 0.55;
    if (u.routing) sp *= 1.15;
    if (u.slowUntil > this.time) sp *= 0.5; // caltrops
    if (u.cls === 'villager') sp *= 0.85 + this.players[u.owner].productivity * 0.15;
    u.anim = 'walk';
    if (d > 0.001) u.facing = Math.atan2(dy, dx);
    const nx = d <= sp ? p.x : u.x + dx / d * sp, ny = d <= sp ? p.y : u.y + dy / d * sp;
    // a closed gate: only its owner and allies pass; soldiers at war break it down
    const gi = this.map.gate[(ny | 0) * this.N + (nx | 0)];
    if (gi && !u.naval && gi !== this.map.gate[(u.y | 0) * this.N + (u.x | 0)]) {
      const gb = this.ents.get(gi);
      if (gb && gb.done && !gb.dead && gb.owner !== u.owner && this.rel[u.owner][gb.owner] !== 'ally') {
        u.path = null;
        if (this.military(u) && this.hostile(u.owner, gb.owner) && !UNITS[u.type].wallOnly) { if (u.task.type !== 'attack' || u.task.id !== gb.id) u.task = { type: 'attack', id: gb.id, then: u.task.type === 'attack' ? u.task.then : u.task }; u.dest = null; return false; }
        u.unreachable = true; u.ignoreId = gb.id; u.ignoreUntil = this.time + 20;
        return true;
      }
    }
    if (d <= sp) { u.x = p.x; u.y = p.y; u.pathI++; u.moved += d; if (u.pathI >= u.path.length) { u.path = null; return this.arrived(u); } }
    else { u.x = nx; u.y = ny; u.moved += sp; }
    if ((u.cls === 'villager' || u.cls === 'trade') && !u.naval && (this.tickN + u.id) % 4 === 0) { const ti = (u.y | 0) * this.N + (u.x | 0), m = this.map; if (m.traffic[ti] < 65000) m.traffic[ti]++; if (m.traffic[ti] === 30 && !m.road[ti]) this.hotTiles.add(ti); }
    // stuck detection: re-plan if we stopped making progress
    u.stuckT = (u.stuckT || 0) + dt;
    if (u.stuckT > 1.2) {
      if (u.lastPos && Math.hypot(u.x - u.lastPos.x, u.y - u.lastPos.y) < 0.25 && u.dest) { const dd = u.dest; u.noCacheUntil = this.time + 6; this.setDest(u, dd.x, dd.y, dd.rect, dd.reach); if (!u.path) { u.needPath = true; this.pathQueue.push(u); } }
      u.lastPos = { x: u.x, y: u.y }; u.stuckT = 0;
    }
    return false;
  }
  ejectFrom(u, b) {
    const cx = b.x + b.size / 2, cy = b.y + b.size / 2;
    for (let r = Math.ceil(b.size / 2) + 1; r < b.size + 8; r++) for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2 + r, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (u.naval ? this.map.navigable(x | 0, y | 0) : this.map.passable(x | 0, y | 0)) { u.x = u.px = x; u.y = u.py = y; return; }
    }
  }
  garrisonInto(u, b) {
    if (b.garrison.length >= (GARRISON_CAP[b.type] || 30)) return false;
    u.inside = b.id; b.garrison.push(u.id); u.path = null; u.x = b.x + b.size / 2; u.y = b.y + b.size / 2; return true;
  }
  ungarrison(u, b) {
    u.inside = 0; if (b) { b.garrison = b.garrison.filter(id => id !== u.id); this.ejectFrom(u, b); }
  }

  // ---------------------------------------------------------------- combat
  findTarget(u, r, st, prefer) {
    let best = null, bs = 1e9;
    const p = u.owner;
    const melee = st.range <= 2, naval = u.naval;
    if (!st.bldOnly) this.grid.query(u.x, u.y, r, e => {
      if (e.owner === p || e.dead || e.inside || e.wounded || !this.hostile(p, e.owner) || e.id === u.ignoreId && this.time < u.ignoreUntil) return;
      if (e.naval ? melee && !naval : naval && melee) return; // swords cannot reach ships; fire ships only ram ships
      const d = Math.hypot(e.x - u.x, e.y - u.y); if (d > r) return;
      let s = d;
      if (st.cls === 'spear' && e.cls === 'cavalry') s *= 0.5;
      else if (st.cls === 'cavalry' && (e.cls === 'ranged' || e.cls === 'siege')) s *= 0.55;
      else if (st.cls === 'ranged' && (e.cls === 'infantry' || e.cls === 'spear')) s *= 0.8;
      else if (st.cls === 'infantry' && e.cls === 'spear') s *= 0.75;
      if (prefer === 'villager' && e.cls === 'villager') s *= 0.35;
      else if (prefer && prefer === e.cls) s *= 0.3; // siege for sallies, trade for ambushes, cavalry for escorts
      if (e.cls === 'villager' && prefer !== 'villager') s *= 1.3;
      if (e.type === 'general') s *= 0.8;
      if (naval && e.naval) s *= 0.6;
      if (s < bs) { bs = s; best = e; }
    });
    if (best && st.cls !== 'siege') return best;
    if (naval && melee) return best;
    // buildings
    const br = st.bldOnly || st.cls === 'siege' ? r + 4 : Math.min(r, 7);
    const q = ++this.bq, C = this.BC, n = this.bcols;
    const cx0 = Math.max(0, ((u.x - br - 5) / C) | 0), cx1 = Math.min(n - 1, ((u.x + br) / C) | 0), cy0 = Math.max(0, ((u.y - br - 5) / C) | 0), cy1 = Math.min(n - 1, ((u.y + br) / C) | 0);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) for (const b of this.bcells[cy * n + cx]) {
      if (b._q === q) continue; b._q = q;
      if (b.owner < 0 || b.owner === p || b.dead || !this.hostile(p, b.owner) || b.id === u.ignoreId && this.time < u.ignoreUntil) continue;
      const bs2 = BUILDINGS[b.type];
      if (bs2.trap || (UNITS[u.type].wallOnly && (!bs2.wall || bs2.gate || b.breach && b.breach !== u.id))) continue;
      if (Math.abs(b.x - u.x) > br + 5 || Math.abs(b.y - u.y) > br + 5) continue;
      const d = rectDist(u.x, u.y, b); if (d > br) continue;
      let s = d * 1.6 + 2;
      const t = b.type;
      if (st.bldOnly || st.cls === 'siege') s *= t === 'castle' || t === 'watch_tower' || t === 'town_center' ? 0.5 : 1;
      if (t === 'stone_wall' || t === 'palisade') s *= 2.5;
      if (bs2.gate) s *= st.bldOnly ? 0.5 : 1.6;
      if (s < bs) { bs = s; best = b; }
    }
    return best;
  }
  attack(u, t, st) {
    const p = this.players[u.owner];
    u.cool = st.rate * (0.92 + this.R() * 0.16);
    u.anim = 'attack'; u.animT = 0; u.lastCombat = this.time;
    if (t.kind === 'unit') t.lastCombat = this.time;
    const tx = t.kind === 'building' ? t.x + t.size / 2 : t.x, ty = t.kind === 'building' ? t.y + t.size / 2 : t.y;
    u.facing = Math.atan2(ty - u.y, tx - u.x);
    this.heatAt(u.x, u.y, 1);
    if (this.sfxOn) this.sound(st.range > 2 ? (st.dmg === 'siege' ? 'siege' : 'bow') : (u.cls === 'cavalry' || st.atk > 9 ? 'clang' : 'hit'), u.x, u.y);
    if (st.range > 2) { // projectile
      const d = Math.hypot(tx - u.x, ty - u.y);
      const kind = st.dmg === 'siege' ? (u.type === 'trebuchet' ? 'boulder' : 'stone') : u.type === 'crossbowman' || u.type === 'arbalest' || u.type === 'musketeer' ? 'bolt' : 'arrow';
      const miss = t.kind === 'unit' && this.R() > st.accuracy;
      const ox = miss ? (this.R() - 0.5) * 2.2 : 0, oy = miss ? (this.R() - 0.5) * 2.2 : 0;
      this.projectiles.push({ kind, owner: u.owner, src: u.id, srcType: u.type, sx: u.x, sy: u.y, x: u.x, y: u.y, tx: tx + ox, ty: ty + oy, tid: miss ? 0 : t.id, t: 0, dur: Math.max(0.25, d / (kind === 'arrow' || kind === 'bolt' ? 15 : 8)), h: kind === 'boulder' ? 3 + d * 0.25 : 0.6 + d * 0.12, splash: st.splash });
    } else this.hit(u, st, t, p);
  }
  dmgVs(st, t, src) {
    if (t.kind === 'building') {
      const f = st.cls === 'siege' || st.dmg === 'siege' ? 1 : st.dmg === 'pierce' ? 0.04 : st.cls === 'villager' ? 0.4 : 0.22;
      let d = st.atk * f + (st.bonus.building || 0);
      if (BUILDINGS[t.type]?.wall) d *= 0.6;
      return Math.max(0.5, d * (1 + st.atkMul));
    }
    const ts = this.players[t.owner].st(t.type);
    const armor = (st.dmg === 'pierce' ? ts.pa + (t.onWall ? 2 : 0) : st.dmg === 'siege' ? ts.pa * 0.15 : ts.ma);
    let d = Math.max(1, st.atk - armor) + (st.bonus[ts.cls] || 0);
    if (st.bldOnly) d = st.cls === 'siege' && ts.cls === 'siege' ? st.atk : 1;
    let mul = 1 + st.atkMul;
    if (src) {
      // flanking: hits to the side or rear of a unit hurt more and shake its nerve
      if (st.range <= 2 && t.kind === 'unit') {
        const ax = src.x - t.x, ay = src.y - t.y, l = Math.hypot(ax, ay) || 1;
        const c = (Math.cos(t.facing) * ax + Math.sin(t.facing) * ay) / l;
        if (c < -0.5) { mul *= 1.35; t.morale -= 3; } else if (c < 0.35) mul *= 1.15;
      }
      const dh = this.map.height[this.map.idx(src.x | 0, src.y | 0)] - this.map.height[this.map.idx(t.x | 0, t.y | 0)];
      if (dh > 0.05) mul *= 1.15; else if (dh < -0.05) mul *= 0.9;
      mul *= 1 + Math.min(0.3, src.kills * 0.03);
      if (src.hero) mul *= 1 + src.hero.level * 0.12;
      mul *= src.morale < 25 ? 0.65 : src.morale < 40 ? 0.82 : 1;
    }
    if (t.routing) mul *= 1.25;
    if (!t.naval && this.map.terrain[this.map.idx(t.x | 0, t.y | 0)] === T.SHALLOW) mul *= 1.15; // wading in a moat or ford
    return d * mul * (0.9 + this.R() * 0.2);
  }
  hit(src, st, t, p) {
    let d = this.dmgVs(st, t, src);
    if (st.charge && src.moved > 4 && t.kind === 'unit') { d += st.charge; t.morale -= 8; this.fx.push({ kind: 'dust', x: t.x, y: t.y, t0: this.time, life: 0.8 }); }
    src.moved = 0;
    this.damage(t, d, src);
  }
  damage(t, d, src) {
    if (t.dead) return;
    if (t.kind === 'building') {
      if (t.owner < 0) return;
      t.hp -= d; t.lastHit = this.time;
      const p = this.players[t.owner]; p.lastAttacked = this.time;
      if (src) { p.attackedBy[src.owner] = this.time; p.threatAt = { x: src.x, y: src.y, t: this.time }; }
      if (t.hp > 0 && t.done && t.hp < t.maxHp * 0.3 && src && src.kind === 'unit' && src.owner >= 0 && CAPTURE[t.type] && this.time - (t.capT || -9) > 1.5) { t.capT = this.time; if (this.tryCapture(t, src.owner)) return; }
      if (t.hp <= 0) this.removeBuilding(t, src ? src.owner : -1);
      return;
    }
    t.hp -= d; t.lastHit = this.time; t.lastCombat = this.time;
    t.morale -= d / t.maxHp * 22;
    const p = this.players[t.owner];
    if (src) {
      p.attackedBy[src.owner] = this.time;
      if (Math.hypot(t.x - p.home.x, t.y - p.home.y) < 40) { p.lastAttacked = this.time; p.threatAt = { x: src.x, y: src.y, t: this.time }; }
      // retaliate if idle
      if (t.cls !== 'villager' && t.cls !== 'support' && t.cls !== 'trade' && !t.routing && (t.task.type === 'idle' || t.task.type === 'move' && !t.task.force)) t.task = { type: 'attack', id: src.id, then: t.task };
      if (t.cls === 'villager' && src.cls !== 'villager' && t.hp < t.maxHp * 0.7 && t.task.type !== 'garrison' && t.task.type !== 'seekHeal') this.fleeHome(t);
    }
    if (t.hp <= 0) this.unitDown(t, src);
  }
  fleeHome(u) {
    const p = this.players[u.owner];
    const shelters = p.blds.filter(b => b.done && GARRISON_CAP[b.type] && b.garrison.length < GARRISON_CAP[b.type]);
    let best = null, bd = 1e9; for (const b of shelters) { const d = rectDist(u.x, u.y, b); if (d < bd) { bd = d; best = b; } }
    if (best && bd < 45) this.order(u, { type: 'garrison', id: best.id });
  }
  unitDown(u, src) {
    const p = this.players[u.owner];
    const canWound = u.cls !== 'siege' && u.cls !== 'trade' && !u.naval && !u.wounded;
    if (canWound && this.R() < p.woundChance()) {
      u.hp = 1; u.routing = 0; this.leaveArmy(u);
      this.order(u, { type: 'seekHeal' }); u.wounded = true;
      p.stats.wounded++;
      return;
    }
    this.kill(u, src);
  }
  kill(u, src) {
    if (u.dead) return;
    u.dead = true; this.ents.delete(u.id);
    const p = this.players[u.owner];
    p.pop -= u.pop; p.stats.losses++; p.stats.deathsRecent++;
    if (u.inside) { const b = this.ents.get(u.inside); if (b) b.garrison = b.garrison.filter(id => id !== u.id); }
    if (u.task?.type === 'gather' && u.task.tk === 'farm') { const f = this.ents.get(u.task.ti); if (f && f.farmer === u.id) f.farmer = 0; }
    this.leaveArmy(u);
    if (u.docked) { const w = this.ents.get(u.docked); if (w) this.closeBreach(w); }
    if (u.cls === 'trade') { p.stats.cartsLost = (p.stats.cartsLost || 0) + 1; p.lastCartLost = this.time; }
    if (src && src.kind === 'unit' && src.owner >= 0) { if (src.kills != null) src.kills++; this.players[src.owner].stats.kills++; this.heroFame(src.owner, src, u.hero ? 40 : u.pop * (u.cls === 'villager' ? 0.5 : 1)); }
    this.fx.push({ kind: 'corpse', x: u.x, y: u.y, type: u.type, owner: u.owner, facing: u.facing, t0: this.time, life: u.naval ? 12 : 30 });
    if (this.sfxOn && (this.R() < 0.35 || u.hero)) this.sound(u.naval ? 'sink' : 'die', u.x, u.y);
    // nearby comrades lose heart
    const shock = u.type === 'general' ? 30 : 5, r = u.type === 'general' ? 20 : 6;
    this.grid.query(u.x, u.y, r, e => { if (e.owner === u.owner && !e.dead) e.morale -= shock; });
    if (u.hero) {
      const h = u.hero; h.died = this.time; h.kills = u.kills;
      this.log(`☠ ${h.name}, ${HERO_LEVELS[h.level].title} of ${p.name}, has fallen after ${u.kills} kills (fame ${Math.round(h.fame)})${src && src.owner >= 0 ? ', slain by ' + this.players[src.owner].name : ''}.`, 'big', [u.owner, src?.owner ?? -1], u.x, u.y);
      if (src && src.owner >= 0) this.heroFame(src.owner, src, 25);
    }
  }
  leaveArmy(u) { if (u.army) { const a = this.brains[u.owner].armies.get(u.army); if (a) a.units.delete(u.id); u.army = 0; } }
  heatAt(x, y, v) { const c = Math.ceil(this.N / 16); this.heat[clamp((y / 16) | 0, 0, c - 1) * c + clamp((x / 16) | 0, 0, c - 1)] += v; }

  // ---------------------------------------------------------------- per-tick
  tick() {
    const dt = TICK;
    while (this.replayQ && this.replayQ.length && this.replayQ[0].tick <= this.tickN) { const r = this.replayQ.shift(); this.applyDirective(r.pid, r.d); }
    this.time += dt; this.tickN++;
    if (this.tickN % 600 === 0) this.checks.push(this.checksum());
    this.grid.clear();
    for (const u of this.units) if (!u.inside) this.grid.add(u);
    if (this.tickN % 200 === 1) this.pf.label();
    if (this.tickN % 300 === 7) for (const [k, v] of this.pathCache) if (this.time - v.t > 25) this.pathCache.delete(k);
    this.processPaths();
    for (let i = 0; i < this.units.length; i++) { const u = this.units[i]; if (!u.dead) this.tickUnit(u, dt); }
    if (this.tickN % 2 === 0) this.separate();
    for (let i = 0; i < this.buildings.length; i++) { const b = this.buildings[i]; if (!b.dead) this.tickBuilding(b, dt); }
    this.tickProjectiles(dt);
    if (this.tickN % 10 === 0) this.perSecond();
    for (let i = 0; i < this.brains.length; i++) if ((this.tickN + i * 3) % 10 === 0 && this.players[i].alive) this.brains[i].think();
    if (this.tickN % 5 === 0) for (const br of this.brains) if (br.p.alive) br.tickArmies();
    if (this.tickN % 10 === 5) {
      this.units = this.units.filter(u => !u.dead);
      this.buildings = this.buildings.filter(b => !b.dead);
      for (const p of this.players) { p.units = p.units.filter(u => !u.dead); }
      this.fx = this.fx.filter(f => this.time - f.t0 < f.life);
      if (this.fx.length > 1500) this.fx.splice(0, this.fx.length - 1500);
    }
  }
  separate() {
    // light push so crowds spread instead of stacking on one point
    for (const u of this.units) {
      if (u.dead || u.inside) continue;
      const rad = u.naval ? 1.0 : u.cls === 'cavalry' || u.cls === 'siege' || UNITS[u.type].mounted ? 0.55 : 0.36;
      let px = 0, py = 0;
      this.grid.query(u.x, u.y, u.naval ? 2.2 : 1, e => {
        if (e === u || e.dead || e.naval !== u.naval) return;
        const dx = u.x - e.x, dy = u.y - e.y, d2 = dx * dx + dy * dy, min = rad + (u.naval ? 1.0 : 0.3);
        if (d2 < min * min && d2 > 1e-6) { const d = Math.sqrt(d2), f = (min - d) / min * 0.08; px += dx / d * f; py += dy / d * f; }
        else if (d2 <= 1e-6) { px += (this.R() - 0.5) * 0.05; py += (this.R() - 0.5) * 0.05; }
      });
      if (px || py) { const nx = u.x + px, ny = u.y + py; if (u.naval ? this.map.navigable(nx | 0, ny | 0) : this.map.passable(nx | 0, ny | 0) && !this.foreignGate(u, nx, ny)) { u.x = nx; u.y = ny; } }
    }
  }

  tickUnit(u, dt) {
    u.px = u.x; u.py = u.y; u.animT += dt;
    if (u.cool > 0) u.cool -= dt;
    if (u.inside) return;
    if (u.docked && (u.task.type !== 'attack' || u.task.id !== u.docked)) { const w = this.ents.get(u.docked); if (w) this.closeBreach(w); else u.docked = 0; }
    if ((this.tickN + u.id) % 10 === 0 && u.cls === 'ranged') u.onWall = this.nearOwnWall(u);
    const t = u.task || (u.task = { type: 'idle' });
    const prevAnim = u.anim;
    u.anim = 'idle';
    switch (t.type) {
      case 'idle': this.tIdle(u, t, dt); break;
      case 'move': if (!u.dest) this.setDest(u, t.x, t.y); if (this.step(u, dt)) u.task = t.then || { type: 'idle' }; break;
      case 'amove': this.tAmove(u, t, dt); break;
      case 'attack': this.tAttack(u, t, dt); break;
      case 'gather': this.tGather(u, t, dt); break;
      case 'build': case 'repair': this.tBuild(u, t, dt); break;
      case 'garrison': this.tGarrison(u, t, dt); break;
      case 'seekHeal': this.tSeekHeal(u, t, dt); break;
      case 'heal': this.tHealer(u, t, dt); break;
      case 'trade': this.tTrade(u, t, dt); break;
      case 'rout': this.tRout(u, t, dt); break;
      default: u.task = { type: 'idle' };
    }
    if (u.anim !== prevAnim && u.anim !== 'walk') u.animT = u.anim === 'attack' ? u.animT : 0;
  }
  military(u) { return u.cls !== 'villager' && u.cls !== 'trade' && u.cls !== 'support' && u.cls !== 'fisher'; }
  tIdle(u, t, dt) {
    if (this.military(u)) {
      u.scanT -= dt;
      if (u.scanT <= 0) {
        u.scanT = 0.5;
        const st = this.players[u.owner].st(u.type);
        const e = this.findTarget(u, st.sight + (st.range > 2 ? 1 : 0), st, t.prefer);
        if (e) { u.task = { type: 'attack', id: e.id, then: t, leash: { x: u.x, y: u.y, r: t.leash || 16 } }; return; }
      }
      // drift back to guard point
      if (t.gx != null && Math.hypot(u.x - t.gx, u.y - t.gy) > 2.5) {
        if (!u.dest || u.dest.x !== t.gx) this.setDest(u, t.gx, t.gy);
        if (this.step(u, dt) && u.unreachable) { t.gx = u.x; t.gy = u.y; u.unreachable = false; }
      }
    } else if (u.cls === 'support') { u.task = { type: 'heal' }; }
  }
  tAmove(u, t, dt) {
    const st = this.players[u.owner].st(u.type);
    u.scanT -= dt;
    if (u.scanT <= 0 && this.military(u)) {
      u.scanT = 0.45;
      const e = this.findTarget(u, st.sight + 1.5, st, t.prefer);
      if (e) { u.task = { type: 'attack', id: e.id, then: t, leash: t.leash ? { x: u.x, y: u.y, r: t.leash } : null }; return; }
    }
    if (!u.dest || Math.abs(u.dest.x - t.x) > 0.01 || Math.abs(u.dest.y - t.y) > 0.01) this.setDest(u, t.x, t.y);
    if (this.step(u, dt)) { const far = u.unreachable; u.unreachable = false; u.task = { type: 'idle', gx: far ? u.x : t.x, gy: far ? u.y : t.y, prefer: t.prefer, leash: 10 }; }
  }
  tAttack(u, t, dt) {
    const tgt = this.ents.get(t.id);
    const st = this.players[u.owner].st(u.type);
    if (!tgt || tgt.dead || tgt.inside || tgt.wounded || !this.hostile(u.owner, tgt.owner)) {
      const e = this.findTarget(u, st.sight + 1, st, t.then?.prefer);
      if (e) { t.id = e.id; return; }
      u.task = t.then || { type: 'idle' }; u.dest = null; return;
    }
    if (t.leash && Math.hypot(u.x - t.leash.x, u.y - t.leash.y) > t.leash.r && tgt.kind === 'unit') { u.task = t.then || { type: 'idle' }; u.dest = null; return; }
    const isB = tgt.kind === 'building';
    const d = isB ? rectDist(u.x, u.y, tgt) : Math.hypot(tgt.x - u.x, tgt.y - u.y) - 0.3;
    const rangeNow = st.range + (u.onWall && st.range > 2 ? 1.5 : 0);
    if (UNITS[u.type].wallOnly && isB && d <= st.range) { u.path = null; u.dest = null; if (!tgt.breach) this.openBreach(tgt, u); u.anim = 'attack'; u.animT = 0.3; return; }
    if (d <= rangeNow && d >= st.minRange - 0.5) {
      u.path = null; u.dest = null;
      const tx = isB ? tgt.x + tgt.size / 2 : tgt.x, ty = isB ? tgt.y + tgt.size / 2 : tgt.y;
      u.facing = Math.atan2(ty - u.y, tx - u.x);
      u.anim = u.animT < 0.45 && u.cool > st.rate - 0.5 ? 'attack' : 'ready';
      if (u.cool <= 0) this.attack(u, tgt, st);
      if (u.cool > st.rate - 0.45) u.anim = 'attack';
      return;
    }
    // chase
    t.repath = (t.repath || 0) - dt;
    if (!u.dest || t.repath <= 0) {
      t.repath = isB ? 3 : 0.6;
      if (isB) this.setDest(u, 0, 0, { x0: tgt.x, y0: tgt.y, x1: tgt.x + tgt.size - 1, y1: tgt.y + tgt.size - 1 }, Math.max(0, Math.floor(st.range - 0.5)));
      else if (u.naval !== !!tgt.naval) this.setDest(u, 0, 0, { x0: tgt.x | 0, y0: tgt.y | 0, x1: tgt.x | 0, y1: tgt.y | 0 }, Math.max(1, Math.floor(st.range - 0.5)));
      else if (d < st.minRange) { const a = Math.atan2(u.y - tgt.y, u.x - tgt.x); this.setDest(u, u.x + Math.cos(a) * 2, u.y + Math.sin(a) * 2); }
      else this.setDest(u, tgt.x, tgt.y);
    }
    if (this.step(u, dt) && u.unreachable) { // cannot get there (water, walls): forget this target for a while
      u.unreachable = false; u.ignoreId = tgt.id; u.ignoreUntil = this.time + 20;
      u.task = t.then || { type: 'idle' }; u.dest = null;
    }
  }
  tRout(u, t, dt) {
    const p = this.players[u.owner];
    if (!u.dest) this.setDest(u, p.home.x + (this.R() - 0.5) * 8, p.home.y + (this.R() - 0.5) * 8);
    this.step(u, dt);
    if (this.time > u.routing) {
      let near = 0; this.grid.query(u.x, u.y, 9, e => { if (this.hostile(u.owner, e.owner) && !e.dead) near++; });
      if (!near && u.morale > 30) { u.routing = 0; u.task = { type: 'idle' }; u.dest = null; }
    }
  }

  // --- villagers
  dropSite(p, res, x, y, naval = false) {
    let best = null, bd = 1e9;
    for (const b of p.blds) { if (!b.done || (naval && b.type !== 'dock')) continue; const dr = BUILDINGS[b.type].drop; if (!dr || !dr.includes(res)) continue; const d = rectDist(x, y, b); if (d < bd) { bd = d; best = b; } }
    return best;
  }
  tGather(u, t, dt) {
    const p = this.players[u.owner], m = this.map;
    const cap = CARRY + p.mod('carry');
    if (t.phase === 'return') {
      const drop = this.ents.get(t.drop);
      if (!drop || drop.dead || drop.owner !== u.owner) { const d2 = this.dropSite(p, u.carryRes, u.x, u.y, u.naval); if (!d2) { u.task = { type: 'idle' }; return; } t.drop = d2.id; this.setDest(u, 0, 0, rectOf(d2), u.naval ? 1 : 0); return; }
      if (!u.dest) this.setDest(u, 0, 0, rectOf(drop), u.naval ? 1 : 0);
      if (this.step(u, dt)) {
        u.dest = null;
        if (rectDist(u.x, u.y, drop) > (u.naval ? 2.3 : 1.3)) { u.unreachable = false; u.task = { type: 'idle', starved: u.carryRes }; return; }
        if (u.carry > 0) { p.res[u.carryRes] += u.carry; p.stats.gathered[u.carryRes] += u.carry; }
        u.carry = 0; t.phase = 'go';
      }
      return;
    }
    // locate target
    let tx, ty, valid = true, farm = null, node = null;
    if (t.tk === 'tree') { tx = t.ti % m.size; ty = (t.ti / m.size) | 0; valid = m.tree[t.ti] > 0; }
    else if (t.tk === 'node') { node = this.ents.get(t.ti); valid = !!node && !node.dead; if (valid) { tx = node.x; ty = node.y; } }
    else if (t.tk === 'farm') { farm = this.ents.get(t.ti); valid = !!farm && !farm.dead && farm.done && farm.owner === u.owner && (farm.farmer === u.id || !farm.farmer); if (valid) { farm.farmer = u.id; tx = farm.x + 1; ty = farm.y + 1; } }
    if (!valid) {
      // find another source of the same kind nearby
      if (t.tk === 'tree') { const i = m.findTree(u.x, u.y, 14); if (i >= 0) { t.ti = i; u.dest = null; return; } }
      else if (t.tk === 'node') { const n = this.nearestNode(t.res, u.x, u.y, u.naval ? 30 : 18, u.naval); if (n) { t.ti = n.id; u.dest = null; return; } }
      if (u.carry > 0) { const d = this.dropSite(p, u.carryRes, u.x, u.y, u.naval); if (d) { t.phase = 'return'; t.drop = d.id; u.dest = null; return; } }
      u.task = { type: 'idle', starved: t.res }; return;
    }
    if (t.phase !== 'work') {
      t.phase = 'go';
      if (!u.dest) {
        if (farm) this.setDest(u, farm.x + 0.5 + ((u.id * 7) % 20) / 10, farm.y + 0.5 + ((u.id * 3) % 20) / 10);
        else this.setDest(u, 0, 0, { x0: tx, y0: ty, x1: tx, y1: ty }, 0);
      }
      if (this.step(u, dt)) {
        u.dest = null;
        if (u.unreachable) { // cannot reach it: try something else
          u.unreachable = false; t.fails = (t.fails || 0) + 1;
          if (t.tk === 'tree' && t.fails < 4) { const i = m.findTree(u.x + (this.R() - 0.5) * 10, u.y + (this.R() - 0.5) * 10, 10); if (i >= 0 && i !== t.ti) { t.ti = i; return; } }
          u.task = { type: 'idle', starved: t.res }; return;
        }
        t.phase = 'work';
      }
      return;
    }
    // working
    u.anim = 'work';
    u.facing = farm ? u.facing : Math.atan2(ty + 0.5 - u.y, tx + 0.5 - u.x);
    const rate = (farm ? FARM_RATE : u.naval ? 0.62 : GATHER[t.res]) * (1 + p.mod('gather.' + t.res)) * p.productivity * (u.sick ? 0.3 : 1);
    const amt = Math.min(rate * dt, cap - u.carry);
    if (u.carryRes !== t.res) { u.carry = 0; u.carryRes = t.res; }
    if (t.tk === 'tree') { const w = m.tree[t.ti]; const take = Math.min(w, amt); u.carry += take; if (w - take > 0.01) m.tree[t.ti] = w - take; else m.setTree(t.ti, 0); }
    else if (node) { const take = Math.min(node.amount, amt); u.carry += take; node.amount -= take; if (node.amount <= 0.01) this.removeNode(node); }
    else if (farm) { u.carry += amt; farm.food -= amt; if (farm.food <= 0) this.reseed(farm, p); }
    if (u.carry >= cap - 0.001) {
      const d = this.dropSite(p, t.res, u.x, u.y, u.naval);
      if (!d) { u.task = { type: 'idle', starved: t.res }; return; }
      t.phase = 'return'; t.drop = d.id; u.dest = null;
    }
  }
  reseed(farm, p) {
    if (p.pay({ wood: 50 })) { farm.food = 600; }
    else { this.removeBuilding(farm); }
  }
  nearestNode(res, x, y, r, fish = false) {
    let best = null, bd = r * r;
    for (const n of this.nodes) { if (n.res !== res || n.dead || !!n.fish !== fish) continue; const d = (n.x - x) ** 2 + (n.y - y) ** 2; if (d < bd) { bd = d; best = n; } }
    return best;
  }
  tBuild(u, t, dt) {
    const b = this.ents.get(t.id), p = this.players[u.owner];
    if (!b || b.dead || b.owner !== u.owner || (t.type === 'build' && b.done) || (t.type === 'repair' && (!b.done || b.hp >= b.maxHp))) {
      if (b && b.done && b.type === 'farm' && !b.farmer && t.type === 'build') { u.task = { type: 'gather', res: 'food', tk: 'farm', ti: b.id, phase: 'go' }; u.dest = null; return; }
      u.task = { type: 'idle' }; return;
    }
    if (!u.dest) this.setDest(u, 0, 0, rectOf(b), 0);
    const arrivedB = this.step(u, dt);
    if (rectDist(u.x, u.y, b) > 1.0) {
      if (arrivedB) {
        u.dest = null;
        if (u.unreachable) {
          u.unreachable = false; u.task = { type: 'idle' };
          // a site nobody can reach is abandoned instead of sending builders again and again
          if (!b.done && (b.unreach = (b.unreach || 0) + 1) >= 3 && b.progress < 0.1) { if (b.cost) p.refund(b.cost, 0.8); this.removeBuilding(b, -1, true); p.log(`Abandoned an unreachable ${BUILDINGS[b.type].name} site.`); }
        }
      }
      return;
    }
    u.path = null;
    u.anim = 'build'; u.facing = Math.atan2(b.y + b.size / 2 - u.y, b.x + b.size / 2 - u.x);
    b.nbNow++;
    const nb = Math.max(1, b.nb);
    const spec = BUILDINGS[b.type];
    const rate = dt * (1 + p.mod('buildSpeed')) * p.productivity * Math.pow(nb, -0.25) / spec.time;
    if (t.type === 'build') {
      b.progress = Math.min(1, b.progress + rate);
      b.hp = Math.min(b.maxHp, b.hp + b.maxHp * rate * 0.95);
      if (b.progress >= 1) this.complete(b);
    } else {
      const mat = (spec.cost.stone || 0) > (spec.cost.wood || 0) ? 'stone' : 'wood';
      if (p.res[mat] < 0.5) return;
      const heal = b.maxHp * rate * 0.5; b.hp = Math.min(b.maxHp, b.hp + heal); p.res[mat] -= heal * (mat === 'stone' ? 0.006 : 0.01);
    }
  }
  complete(b) {
    const p = this.players[b.owner];
    b.done = true; b.progress = 1; b.hp = Math.max(b.hp, b.maxHp * 0.6); b.doneAt = this.time;
    p.stats.built++;
    { const s = p.stats; (s.firsts ||= {})[b.type] ??= this.time; if (BUILDINGS[b.type].wall) s.wallsBuilt = (s.wallsBuilt || 0) + 1; if (BUILDINGS[b.type].trap) s.trapsBuilt = (s.trapsBuilt || 0) + 1; }
    this.recountPop(p);
    if (b.type === 'monument') { p.recalc(); this.log(`🗿 ${p.name} raises the ${p.civ.monument.name}: ${p.civ.monument.desc}`, 'build', [p.id], b.x + 1.5, b.y + 1.5); }
    if ((b.type === 'town_center' || b.type === 'castle') && p.tc && p.tc !== b) this.appoint(b, p);
    const big = ['castle', 'wonder', 'cathedral', 'town_center', 'star_fort'].includes(b.type);
    if (big) this.log(`🏰 ${p.name} completes a ${BUILDINGS[b.type].name}.`, b.type === 'wonder' ? 'big' : 'build', [p.id], b.x + b.size / 2, b.y + b.size / 2);
    if (b.type === 'town_center' && !p.tc?.done) p.tc = b;
    this.brains[b.owner].onBuilt(b);
  }
  tGarrison(u, t, dt) {
    const b = this.ents.get(t.id);
    if (!b || b.dead || !b.done || b.owner !== u.owner) { u.task = { type: 'idle' }; return; }
    if (!u.dest) this.setDest(u, 0, 0, rectOf(b), 0);
    if (this.step(u, dt) || rectDist(u.x, u.y, b) < 0.9) { if (!this.garrisonInto(u, b)) u.task = { type: 'idle' }; }
  }
  tSeekHeal(u, t, dt) {
    const p = this.players[u.owner];
    if (!u.wounded && !u.sick) { u.task = { type: 'idle' }; return; }
    let b = this.ents.get(t.id);
    if (!b || b.dead || b.owner !== u.owner) {
      let best = null, bs = 1e9;
      for (const k of p.blds) { const h = BUILDINGS[k.type].heal; if (!k.done || !h) continue; const s = rectDist(u.x, u.y, k) / Math.sqrt(h); if (s < bs) { bs = s; best = k; } }
      if (!best) { u.hp = Math.min(u.maxHp, u.hp + 0.2 * dt); if (u.hp > u.maxHp * 0.5) { u.wounded = u.sick = false; u.task = { type: 'idle' }; } return; }
      t.id = best.id; b = best; u.dest = null;
    }
    if (!u.dest) this.setDest(u, 0, 0, rectOf(b), 0);
    if (this.step(u, dt) || rectDist(u.x, u.y, b) < 0.9) { b.garrison.push(u.id); u.inside = b.id; u.path = null; }
  }
  tHealer(u, t, dt) {
    const p = this.players[u.owner], st = p.st(u.type);
    t.scan = (t.scan || 0) - dt;
    if (t.scan <= 0) {
      t.scan = 1;
      let best = null, bs = 1e9;
      this.grid.query(u.x, u.y, 14, e => {
        if (e.owner !== u.owner || e.dead || e === u || e.hp >= e.maxHp || e.cls === 'siege') return;
        const s = Math.hypot(e.x - u.x, e.y - u.y) * (e.wounded ? 0.4 : 1) * (e.hp / e.maxHp + 0.3);
        if (s < bs) { bs = s; best = e; }
      });
      t.pid = best ? best.id : 0;
    }
    const e = this.ents.get(t.pid);
    if (!e || e.dead || e.inside) {
      if (t.follow) { const a = this.brains[u.owner].armies.get(t.follow); if (a?.center && Math.hypot(a.center.x - u.x, a.center.y - u.y) > 5) { if (!u.dest || Math.hypot(u.dest.x - a.center.x, u.dest.y - a.center.y) > 4) this.setDest(u, a.center.x - 1, a.center.y - 1); this.step(u, dt); } }
      return;
    }
    const d = Math.hypot(e.x - u.x, e.y - u.y);
    if (d > st.range) { if (!u.dest || Math.hypot(u.dest.x - e.x, u.dest.y - e.y) > 1.5) this.setDest(u, e.x, e.y); this.step(u, dt); return; }
    u.path = null; u.dest = null; u.anim = 'heal'; u.facing = Math.atan2(e.y - u.y, e.x - u.x);
    e.hp = Math.min(e.maxHp, e.hp + st.heal * dt * (u.type === 'medic' && e.wounded ? 1.5 : 1));
    if (u.type === 'priest') e.morale = Math.min(100, e.morale + 2 * dt);
    if (e.wounded && e.hp > e.maxHp * 0.55) { e.wounded = false; e.sick = false; e.task = { type: 'idle' }; p.stats.healed++; }
  }
  tTrade(u, t, dt) {
    const p = this.players[u.owner];
    const home = this.ents.get(t.home);
    const hType = u.naval ? 'dock' : 'market';
    if (!home || home.dead || home.owner !== u.owner) { const m = p.blds.find(b => b.type === hType && b.done); if (!m) { u.task = { type: 'idle' }; return; } t.home = m.id; u.dest = null; return; }
    const dest = this.ents.get(t.dest);
    if (!dest || dest.dead || (dest.owner >= 0 && dest.owner !== u.owner && (this.rel[u.owner][dest.owner] === 'war' || this.embargo.has(dest.owner + '>' + u.owner)))) {
      const nd = this.brains[u.owner].tradeDest(home, u.naval); if (!nd || nd === t.dest) { u.task = { type: 'idle' }; return; } t.dest = nd; u.dest = null; return;
    }
    const goal = t.leg === 'out' ? dest : home;
    if (!u.dest) this.setDest(u, 0, 0, rectOf(goal), u.naval ? 1 : 0);
    // towns along the road collect a toll from foreign carts
    if (!u.naval && (this.tickN + u.id) % 10 === 0) this.buildingsNear(u.x, u.y, 9, b => {
      if (b.owner < 0 || b.owner === u.owner || !b.done || (b.type !== 'town_center' && b.type !== 'castle') || this.rel[u.owner][b.owner] === 'war') return;
      if ((t.tolls ||= []).includes(b.id)) return;
      t.tolls.push(b.id);
      const q = this.players[b.owner], toll = 3 * (q.laws.has('road_tax') ? 2 : 1);
      if (p.res.gold >= toll) { p.res.gold -= toll; q.res.gold += toll; q.stats.tolls = (q.stats.tolls || 0) + toll; }
    });
    if (this.step(u, dt)) {
      u.dest = null;
      if (rectDist(u.x, u.y, goal) > (u.naval ? 2.3 : 1.5)) { // could not get there: try elsewhere, then give up
        u.unreachable = false; t.fails = (t.fails || 0) + 1;
        if (t.fails > 3) { u.task = { type: 'idle' }; return; }
        if (t.leg === 'out' && !u.naval) t.dest = this.bazaar.id; return;
      }
      t.fails = 0;
      if (t.leg === 'out') { t.leg = 'back'; t.cargo = true; t.tolls = []; }
      else {
        if (t.cargo) {
          const d = Math.hypot(dest.x - home.x, dest.y - home.y), other = dest.owner >= 0 && dest.owner !== u.owner ? dest.owner : -1;
          let gold = d * 0.5 * (1 + d / 220) * (1 + p.mod('trade')) * (u.naval ? 1.1 : 1);
          if (other >= 0 && this.pacts.has(pactKey(u.owner, other))) gold *= 1.1;
          if (dest === this.bazaar && this.embargoCount(u.owner) >= 2) gold *= 0.5; // the world refuses the hated
          // luxury goods sell at the bazaar's price, more where they are scarce
          if (t.good) {
            const scarce = other >= 0 && (this.players[other].goods[t.good] || 0) < 5 ? 1.4 : 1;
            const lux = t.goodAmt * this.prices[t.good] * scarce;
            gold += lux; this.prices[t.good] = Math.max(GOODS[t.good].price * 0.4, this.prices[t.good] - t.goodAmt * 0.012);
            p.stats.luxSold = (p.stats.luxSold || 0) + t.goodAmt; t.good = null;
          }
          p.res.gold += gold; p.stats.trade += gold;
          if (other >= 0) this.players[other].res.gold += gold * 0.25;
          this.fx.push({ kind: 'text', x: home.x + 2, y: home.y + 2, text: '+' + Math.round(gold) + ' gold', color: '#ffd76a', t0: this.time, life: 2.5 });
        }
        // load the most valuable good for the next trip
        let best = null, bv = 0; for (const k in GOODS) { const v = (p.goods[k] || 0) >= 5 ? p.goods[k] * this.prices[k] : 0; if (v > bv) { bv = v; best = k; } }
        if (best) { t.good = best; t.goodAmt = Math.min(15, p.goods[best]); p.goods[best] -= t.goodAmt; }
        t.leg = 'out'; t.cargo = false;
      }
    }
  }

  // ---------------------------------------------------------------- buildings
  tickBuilding(b, dt) {
    if (b.owner < 0) return;
    const p = this.players[b.owner], spec = BUILDINGS[b.type];
    if (!b.done) { b.nb = b.nbNow; b.nbNow = 0; return; }
    b.nb = b.nbNow; b.nbNow = 0;
    if (spec.trap) { if ((this.tickN + b.id) % 2 === 0) this.tickTrap(b, spec, p); return; }
    if (spec.gate && (this.tickN + b.id) % 5 === 0) {
      let open = false, foes = 0;
      this.grid.query(b.x + 0.5, b.y + 0.5, 1.6, e => { if (e.dead || e.naval) return; if (e.owner === b.owner || this.rel[e.owner][b.owner] === 'ally') open = true; else if (this.hostile(b.owner, e.owner)) foes++; });
      b.open = open && !foes;
      // boiling oil poured on whoever batters the gate
      if (foes && p.mod('gateOil') && (b.oilT = (b.oilT || 0) - 0.5) <= 0) {
        b.oilT = 2.5;
        this.grid.query(b.x + 0.5, b.y + 0.5, 1.8, e => { if (!e.dead && !e.naval && this.hostile(b.owner, e.owner)) this.damage(e, 14, { owner: b.owner, x: b.x + 0.5, y: b.y + 0.5, kind: 'building' }); });
        this.fx.push({ kind: 'fire', x: b.x + 0.5, y: b.y + 0.5, t0: this.time, life: 1.6 });
      }
    }
    if (b.type === 'plantation' && this.tickN % 10 === 0) {
      const n = this.ents.get(b.lux);
      if (n && !n.dead) { const amt = Math.min(n.amount, 0.14 * p.productivity); p.goods[n.good] = (p.goods[n.good] || 0) + amt; n.amount -= amt; if (n.amount <= 0.01) this.removeNode(n); }
    }
    // production & research
    const q = b.queue[0];
    if (q) {
      if (q.kind === 'unit') {
        const pc = p.popCost(q.key);
        if (p.pop + pc > p.popCap) { b.blocked = true; }
        else {
          b.blocked = false;
          const speed = (1 + p.mod('trainSpeed') * (q.key === 'villager' ? 0 : 1) + (q.key === 'villager' ? p.mod('train.villager') : 0)) * (0.8 + p.productivity * 0.2);
          q.t += dt * speed;
          if (q.t >= q.total) { b.queue.shift(); this.produced(b, q.key); }
        }
      } else {
        q.t += dt * (1 + p.mod('research')) * (0.8 + p.productivity * 0.2);
        if (q.t >= q.total) { b.queue.shift(); this.researched(p, q, b); }
      }
    }
    // defensive fire
    if (spec.attack) {
      b.cool -= dt;
      if (b.cool <= 0) {
        b.cool = spec.attack.rate;
        const arrows = spec.attack.arrows + Math.floor(b.garrison.length / 3);
        const r = spec.attack.range + (p.mod('range.ranged') > 0 ? 1 : 0);
        const cx = b.x + b.size / 2, cy = b.y + b.size / 2;
        const targets = [];
        this.grid.query(cx, cy, r + b.size / 2, e => { if (!e.dead && !e.wounded && this.hostile(b.owner, e.owner) && rectDist(e.x, e.y, b) <= r) targets.push(e); });
        if (targets.length) {
          for (let k = 0; k < arrows; k++) {
            const e = targets[(this.R() * targets.length) | 0];
            const d = Math.hypot(e.x - cx, e.y - cy);
            this.projectiles.push({ kind: spec.attack.shot ? 'stone' : 'arrow', owner: b.owner, src: b.id, fromB: true, atk: spec.attack.atk + p.mod('towerAtk'), sx: cx + (this.R() - 0.5) * b.size * 0.6, sy: cy + (this.R() - 0.5) * b.size * 0.6, sz: b.size * 0.9, x: cx, y: cy, tx: e.x, ty: e.y, tid: e.id, t: k * 0.08, dur: Math.max(0.3, d / 15), h: 0.8 + d * 0.1 });
          }
          this.heatAt(cx, cy, 0.5);
        }
      }
    }
    // healing inside
    if (spec.heal && b.garrison.length) {
      const rate = spec.heal * (1 + p.mod('heal')) * dt;
      for (const id of b.garrison) {
        const u = this.ents.get(id); if (!u) continue;
        if (u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + rate);
        if ((u.wounded || u.sick) && u.hp >= u.maxHp * 0.95) {
          u.wounded = false; u.sick = false; p.stats.healed++;
          this.ungarrison(u, b); u.task = { type: 'idle' };
        }
      }
    }
    if (b.hp < b.maxHp * 0.5 && this.R() < dt * 1.2) this.fx.push({ kind: 'fire', x: b.x + this.R() * b.size, y: b.y + this.R() * b.size, t0: this.time, life: 1.6 });
  }
  produced(b, type) {
    const p = this.players[b.owner];
    const u = this.spawnUnit(b.owner, type, b.x + b.size / 2, b.y + b.size + 0.6);
    this.ejectFrom(u, b);
    p.stats.unitsMade++; if (type === 'villager') p.stats.villagersMade++; if (UNITS[type].cls === 'ship') p.stats.warships = (p.stats.warships || 0) + 1;
    if (type === 'general') this.makeHero(u, p);
    this.brains[b.owner].onUnit(u, b);
  }
  researched(p, q, b) {
    if (q.kind === 'age') {
      p.age++; p.ageResearching = false; p.recalc(); (p.stats.ageTimes ||= {})[p.age] = this.time;
      this.log(`👑 ${p.name} enters the ${AGES[p.age - 1].name}!`, 'age', [p.id], b.x + 2, b.y + 2);
      this.sound('fanfare', b.x + 2, b.y + 2);
      this.fx.push({ kind: 'ring', x: b.x + b.size / 2, y: b.y + b.size / 2, color: p.color, t0: this.time, life: 3 });
      return;
    }
    const T = TECHS[q.key];
    p.techs.add(q.key);
    if (T.upgrade) {
      const [line, tier] = T.upgrade;
      p.lineTier[line] = tier;
      p.recalc();
      const to = LINES[line][tier];
      for (const u of p.units) if (UNITS[u.type].line === line && UNITS[u.type].tier < tier) {
        // veterans keep the population slot they were trained with; new recruits use the new cost
        const ratio = u.hp / u.maxHp;
        u.type = to; const st = p.st(to); u.maxHp = st.hp; u.hp = st.hp * ratio;
      }
      this.log(`⚒ ${p.name} upgrades to ${UNITS[to].name.endsWith('man') ? UNITS[to].name.slice(0, -3) + 'men' : UNITS[to].name + 's'}.`, 'tech', [p.id]);
    } else {
      p.recalc();
      for (const u of p.units) { const mh = this.maxHpOf(u, p); if (mh !== u.maxHp) { u.hp *= mh / u.maxHp; u.maxHp = mh; } }
      if (T.fx?.bldHp || T.fx?.wallHp) for (const k of p.blds) { const nm = this.bldMaxHp(p, k.type); k.hp *= nm / k.maxHp; k.maxHp = nm; }
      if (q.key === 'moat') for (const c of p.blds) if (c.type === 'castle' && c.done) this.digMoat(c, p);
    }
  }

  tickProjectiles(dt) {
    const out = [];
    for (const pr of this.projectiles) {
      pr.t += dt;
      if (pr.t < 0) { out.push(pr); continue; }
      const tg = pr.tid ? this.ents.get(pr.tid) : null;
      if (tg && tg.kind === 'unit' && !tg.dead) { pr.tx = tg.x; pr.ty = tg.y; }
      const k = Math.min(1, pr.t / pr.dur);
      pr.x = pr.sx + (pr.tx - pr.sx) * k; pr.y = pr.sy + (pr.ty - pr.sy) * k;
      if (k < 1) { out.push(pr); continue; }
      // impact
      const srcU = this.ents.get(pr.src);
      if (pr.fromB) {
        if (tg && !tg.dead && !tg.inside && tg.kind === 'unit') {
          const ts = this.players[tg.owner].st(tg.type);
          this.damage(tg, Math.max(1, pr.atk - ts.pa) * (0.9 + this.R() * 0.2), { owner: pr.owner, x: pr.sx, y: pr.sy, kind: 'building' });
        }
      } else {
        const st = this.players[pr.owner].st(pr.srcType);
        const src = srcU && !srcU.dead ? srcU : { owner: pr.owner, x: pr.sx, y: pr.sy, kills: 0, morale: 60, kind: 'unit' };
        if (pr.splash) {
          this.fx.push({ kind: 'impact', x: pr.tx, y: pr.ty, t0: this.time, life: 0.9, big: pr.kind === 'boulder' });
          if (tg && tg.kind === 'building' && !tg.dead) this.damage(tg, this.dmgVs(st, tg, null), src);
          this.grid.query(pr.tx, pr.ty, pr.splash, e => { if (!e.dead && !e.inside && this.hostile(pr.owner, e.owner) && Math.hypot(e.x - pr.tx, e.y - pr.ty) <= pr.splash) this.damage(e, this.dmgVs(st, e, src), src); });
        } else if (tg && !tg.dead && !tg.inside) {
          this.damage(tg, this.dmgVs(st, tg, src), src);
          if (srcU) srcU.moved = 0;
        } else if (pr.kind === 'arrow' || pr.kind === 'bolt') this.fx.push({ kind: 'stuck', x: pr.tx, y: pr.ty, t0: this.time, life: 6, a: Math.atan2(pr.ty - pr.sy, pr.tx - pr.sx) });
      }
    }
    this.projectiles = out;
  }

  // ---------------------------------------------------------------- per second
  perSecond() {
    for (const p of this.players) if (p.alive) { let n = 0; for (const u of p.units) if (!u.dead) n += u.pop; p.pop = n; p.society(); }
    this.moraleTick();
    this.sacredTick();
    for (const k in GOODS) this.prices[k] += (GOODS[k].price - this.prices[k]) * 0.004;
    if (this.tickN % 600 === 0) this.growRoads();
    if (this.tickN % 100 === 0) this.gradeDecisions();
    for (let i = 0; i < this.heat.length; i++) this.heat[i] *= 0.88;
    if (this.tickN % 20 === 0) this.checkVictory();
    if (this.tickN % 300 === 0) for (const p of this.players) {
      let mil = 0, vil = 0, power = 0;
      if (p.alive) for (const u of p.units) { if (u.cls === 'villager') vil++; else if (this.military(u)) { mil += u.pop; power += p.st(u.type).power; } }
      const s = p.stats;
      s.timeline.push({ t: Math.round(this.time), score: p.alive ? p.score() : 0, pop: p.alive ? p.pop : 0, mil, vil, power: Math.round(power), gathered: Math.round(Object.values(s.gathered).reduce((a, b) => a + b, 0)), techs: p.techs.size, age: p.age, kills: s.kills, losses: s.losses, blds: p.alive ? p.blds.filter(b => b.done).length : 0, happy: Math.round(p.happiness) });
    }
    // discovery: each nation learns where others live once its units get close
    if (this.tickN % 30 === 0) for (const p of this.players) {
      if (!p.alive) continue;
      for (const q of this.players) {
        if (q === p || !q.alive || p.knows[q.id]) continue;
        for (const u of p.units) if (Math.abs(u.x - q.home.x) < 22 && Math.abs(u.y - q.home.y) < 22) { p.knows[q.id] = { x: q.home.x, y: q.home.y, t: this.time }; this.brains[p.id].discovered(q); break; }
      }
    }
  }
  moraleTick() {
    for (const u of this.units) {
      if (u.dead || u.inside || !this.military(u) || u.wounded || u.naval) continue;
      const p = this.players[u.owner];
      let base = p.moraleBase();
      if ((u.id + this.tickN / 10) % 2 < 1) { // half the units each second
        let foes = 0, friends = 0, aura = 0;
        this.grid.query(u.x, u.y, 7, e => {
          if (e.dead || e.inside) return;
          if (e.owner === u.owner) { friends += e.pop; const a = e.hero ? 20 + e.hero.level * 6 : UNITS[e.type].aura; if (a && Math.hypot(e.x - u.x, e.y - u.y) < (e.hero ? 12 + e.hero.level * 2 : 6)) aura = Math.max(aura, a); }
          else if (this.hostile(u.owner, e.owner) && !e.wounded) foes += e.pop;
        });
        u.foes = foes; u.aura = aura;
        u.outnumbered = foes > friends * 1.6 + 2;
      }
      base += u.aura || 0;
      const inCombat = this.time - u.lastCombat < 5;
      if (!inCombat) u.morale += (base - u.morale) * 0.12;
      else {
        u.morale += 0.4 + (u.aura || 0) * 0.08;
        if (u.outnumbered) u.morale -= 3;
        if (u.hp < u.maxHp * 0.3) u.morale -= 2;
      }
      u.morale = clamp(u.morale, 0, Math.min(100, base + 15));
      if (u.morale < 14 && !u.routing && inCombat && u.type !== 'general') {
        u.routing = this.time + 8; this.leaveArmy(u); this.order(u, { type: 'rout' });
        if (this.R() < 0.1) this.fx.push({ kind: 'text', x: u.x, y: u.y, text: 'rout!', color: '#ffb0a0', t0: this.time, life: 1.5 });
      }
    }
  }
  sacredTick() {
    for (const s of this.sacred) {
      const present = new Set();
      this.grid.query(s.x, s.y, 4, e => { if (!e.dead && !e.wounded && (this.military(e) || e.type === 'priest') && Math.hypot(e.x - s.x, e.y - s.y) < 4) present.add(e.owner); });
      // allies count as one side
      const sides = [...present].filter(a => ![...present].some(b => b < a && this.rel[a][b] === 'ally'));
      if (sides.length === 1) {
        const pid = sides[0];
        if (s.owner === pid || (s.owner >= 0 && this.rel[pid][s.owner] === 'ally')) { s.progress = Math.max(0, s.progress - 5); continue; }
        if (s.claimant !== pid) { s.claimant = pid; s.progress = 0; }
        s.progress += 4;
        if (s.progress >= 100) {
          const prev = s.owner; s.owner = pid; s.progress = 0; s.claimant = -1;
          this.log(`⛩ ${this.players[pid].name} claims a Sacred Site${prev >= 0 ? ' from ' + this.players[prev].name : ''}.`, 'religion', [pid, prev], s.x, s.y);
        }
      } else if (!sides.length && s.claimant >= 0) s.progress = Math.max(0, s.progress - 2);
      if (s.owner >= 0) this.players[s.owner].res.gold += 0.25;
    }
  }
  checkVictory() {
    if (this.over) return;
    // Wonder victory: a wonder that stands long enough wins the world
    if (this.setup.victory !== 'conquest') for (const p of this.players) {
      const w = p.alive && p.blds.find(b => b.type === 'wonder' && b.done);
      if (!w) { if (p.wonderAt) { p.wonderAt = 0; this.log(`🏛 ${p.name}'s Wonder has fallen!`, 'big', [p.id]); } continue; }
      if (!p.wonderAt) { p.wonderAt = this.time; this.log(`🏛 ${p.name} completes a Wonder! If it stands for 15 minutes, ${p.name} wins.`, 'big', [p.id], w.x + 2.5, w.y + 2.5); for (const br of this.brains) if (br.p !== p && br.p.alive) br.wonderAlarm?.(p, w); }
      if (this.time - p.wonderAt >= 900) {
        const team = this.players.filter(q => q.alive && (q === p || (this.setup.teams && q.team === p.team)));
        this.over = { winners: team.map(q => q.id), time: this.time, how: 'Wonder' };
        this.log(`🏆 ${team.map(q => q.name).join(' & ')} win${team.length > 1 ? '' : 's'} by Wonder after ${Math.round(this.time / 60)} minutes!`, 'big', team.map(q => q.id));
        return;
      }
    }
    // optional time limit: the highest score (or team score) takes the crown
    const lim = (this.setup.timeLimit || 0) * 60;
    if (lim && this.time >= lim) {
      const alive = this.players.filter(p => p.alive && !p.rebel);
      const key = p => (this.setup.teams && p.team != null ? 't' + p.team : 'p' + p.id);
      const tot = {}; for (const p of alive) tot[key(p)] = (tot[key(p)] || 0) + p.score();
      const best = Object.keys(tot).sort((a, b) => tot[b] - tot[a])[0];
      const win = alive.filter(p => key(p) === best);
      this.over = { winners: win.map(p => p.id), time: this.time, how: 'Score' };
      this.log(`🏆 Time is up: ${win.map(p => p.name).join(' & ')} win${win.length > 1 ? '' : 's'} on score after ${Math.round(this.time / 60)} minutes!`, 'big', win.map(p => p.id));
      return;
    }
    this.collapseCheck();
    for (const p of this.players) {
      if (!p.alive) continue;
      if (p.band) { if (!p.units.length) this.eliminate(p); continue; }
      const core = p.blds.some(b => b.type === 'town_center' || b.type === 'castle');
      if (this.setup.defeat !== 'capitals' && !p.rebel) {
        const left = this.assets(p);
        if (!left.blds && !left.units) { this.eliminate(p); continue; }
        if (!core && !p.remnant) { p.remnant = this.time; this.log(`🔍 ${p.name} has lost its last Town Center and Castle. ${left.blds} buildings and ${left.units} people remain; their hiding places are revealed and the hunt begins.`, 'big', [p.id], p.home.x, p.home.y); }
        else if (core && p.remnant) { p.remnant = 0; this.log(`🏗 ${p.name} raises a new seat of power and is no longer hunted.`, 'war', [p.id], p.home.x, p.home.y); }
        continue;
      }
      const anyone = p.units.some(u => u.cls === 'villager');
      if (!core && !(anyone && p.blds.length && this.time - (p.lostCoreAt || (p.lostCoreAt = this.time)) < 120)) this.eliminate(p);
      else if (core) p.lostCoreAt = 0;
    }
    const alive = this.players.filter(p => p.alive && !p.rebel);
    if (alive.length === 0) { this.over = { winners: [], time: this.time }; return; }
    const allAllied = alive.every(a => alive.every(b => a === b || this.rel[a.id][b.id] === 'ally'));
    if (alive.length === 1 || allAllied) {
      if (alive.length > 1 && !this.setup.teams) {
        // an FFA alliance cannot share the crown
        for (const a of alive) for (const b of alive) if (a.id < b.id) this.setRelation(a.id, b.id, 'war', 'only one may rule');
        return;
      }
      this.over = { winners: alive.map(p => p.id), time: this.time, how: 'Conquest' };
      this.log(`🏆 ${alive.map(p => p.name).join(' & ')} ${alive.length > 1 ? 'are' : 'is'} victorious after ${Math.round(this.time / 60)} minutes!`, 'big', alive.map(p => p.id));
    }
  }
  // ---------------------------------------------------------------- analytics records (read-only for the AI)
  talk(pid, text, to = null) { const s = this.players[pid]?.stats; if (!s) return; (s.talk ||= []).push({ t: this.time, text: String(text).slice(0, 140), to }); if (s.talk.length > 200) s.talk.shift(); }
  snap(p) { const others = this.players.filter(q => q !== p && q.alive && !q.rebel); return { score: p.score(), kills: p.stats.kills, losses: p.stats.losses, others: others.length ? others.reduce((a, q) => a + q.score(), 0) / others.length : 0 }; }
  // remember a decision; three minutes later it is graded on how the nation fared against its rivals
  decide(pid, kind, text, source = 'auto', extra = null) {
    const p = this.players[pid]; if (!p || p.rebel || !p.alive) return null;
    const d = { t: this.time, kind, text, source, before: this.snap(p), evalAt: this.time + 180, ...extra };
    const list = p.stats.decisions ||= []; list.push(d); if (list.length > 300) list.shift();
    return d;
  }
  gradeDecisions() {
    for (const p of this.players) {
      if (p.rebel) continue;
      for (const d of p.stats.decisions || []) {
        if (d.grade || this.time < d.evalAt) continue;
        if (d.campaign && !d.campaign.result && this.time < d.t + 600 && p.alive) continue;
        const now = this.snap(p), b = d.before;
        const mine = now.score - b.score, theirs = now.others - b.others;
        let v = clamp(Math.log2(Math.max(1, mine + 150) / Math.max(1, theirs + 150)) * 1.5, -1, 1) * 0.6;
        const k = now.kills - b.kills, l = now.losses - b.losses; v += clamp((k - l) / Math.max(12, k + l), -1, 1) * 0.4;
        if (d.campaign) { const c = d.campaign, cv = c.result === 'victory' ? 0.8 : c.result === 'destroyed' ? -0.8 : c.result === 'retreat' ? clamp((c.ratio - 0.5) * 1.6, -0.8, 0.8) : 0; v = v * 0.4 + cv * 0.6; }
        if (!p.alive) v = Math.min(v, -0.6);
        d.value = clamp(v, -1, 1); d.grade = gradeOf(d.value); d.after = now;
      }
    }
  }

  // ---------------------------------------------------------------- walls, gates, traps, moats
  bldMaxHp(p, type) { const s = BUILDINGS[type]; return Math.round(s.hp * (1 + p.mod('bldHp') + (s.wall ? p.mod('wallHp') : 0))); }
  foreignGate(u, x, y) { const gi = this.map.gate[(y | 0) * this.N + (x | 0)]; if (!gi) return false; const gb = this.ents.get(gi); return !!gb && gb.done && gb.owner !== u.owner && this.rel[u.owner][gb.owner] !== 'ally'; }
  nearOwnWall(u) {
    const m = this.map, x = u.x | 0, y = u.y | 0;
    for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) { if (!m.inside(xx, yy)) continue; const o = this.ents.get(m.occ[m.idx(xx, yy)]); if (o && o.kind === 'building' && o.owner === u.owner && o.done && BUILDINGS[o.type].wall) return true; }
    return false;
  }
  // a siege tower drops its ramp: the wall segment can be crossed while it stays
  openBreach(w, tower) {
    w.breach = tower.id; tower.docked = w.id;
    this.map.block[this.map.idx(w.x, w.y)] &= ~B.BUILDING;
    this.pf.label(); this.pathCache.clear();
    if (!tower.breachLogged) { tower.breachLogged = true; this.log(`🪜 ${this.players[tower.owner].name}'s siege tower reaches ${this.players[w.owner].name}'s walls!`, 'war', [tower.owner, w.owner], w.x, w.y); }
    this.sound('siege', w.x, w.y);
  }
  closeBreach(w, gone = false) {
    const t = this.ents.get(w.breach); if (t) t.docked = 0;
    w.breach = 0;
    if (!gone && !w.dead) this.map.block[this.map.idx(w.x, w.y)] |= B.BUILDING;
    this.pf.label(); this.pathCache.clear();
  }
  tickTrap(b, spec, p) {
    const cx = b.x + 0.5, cy = b.y + 0.5, src = { owner: b.owner, x: cx, y: cy, kind: 'building' };
    if (b.burning) {
      if (this.time > b.burning) { this.removeBuilding(b, -1, true); return; }
      this.grid.query(cx, cy, 1.7, e => { if (!e.dead && !e.naval && this.hostile(b.owner, e.owner)) this.damage(e, 0.7, src); });
      if (this.R() < 0.4) this.fx.push({ kind: 'fire', x: cx + (this.R() - 0.5), y: cy + (this.R() - 0.5), t0: this.time, life: 1.2 });
      return;
    }
    let hit = null;
    this.grid.query(cx, cy, 0.9, e => { if (!hit && !e.dead && !e.inside && !e.naval && this.hostile(b.owner, e.owner) && Math.abs(e.x - cx) < 0.75 && Math.abs(e.y - cy) < 0.75) hit = e; });
    if (!hit) return;
    const first = !b.revealed; b.revealed = true;
    const who = this.players[hit.owner].name;
    switch (spec.trap) {
      case 'spikes': this.damage(hit, 38, src); hit.morale -= 8; this.fx.push({ kind: 'impact', x: cx, y: cy, t0: this.time, life: 0.8 }); this.removeBuilding(b, -1, true); break;
      case 'stakes': if (hit.cls === 'cavalry' || UNITS[hit.type].mounted) { this.damage(hit, 28, src); hit.moved = 0; hit.morale -= 6; b.hp -= 45; } else { hit.slowUntil = this.time + 0.6; b.hp -= 3; } break;
      case 'caltrops': this.grid.query(cx, cy, 1, e => { if (!e.dead && !e.naval && this.hostile(b.owner, e.owner)) { e.slowUntil = this.time + 2; this.damage(e, 1.2, src); b.hp -= 2; } }); break;
      case 'fire': b.burning = this.time + 9; this.sound('collapse', cx, cy); break;
    }
    if (first && spec.trap !== 'caltrops' && this.R() < 0.35) this.log(`🪤 ${who}'s soldiers run into ${p.name}'s ${spec.name.toLowerCase()}.`, 'war', [hit.owner, b.owner], cx, cy);
    if (b.hp <= 0 && !b.dead) this.removeBuilding(b, -1, true);
  }
  // flood a ring of ground around a castle: attackers must wade through under its arrows
  digMoat(c, p) {
    const m = this.map; let n = 0;
    for (let y = c.y - 5; y <= c.y + c.size + 4; y++) for (let x = c.x - 5; x <= c.x + c.size + 4; x++) {
      if (!m.inside(x, y)) continue;
      const ring = Math.max(c.x - x, x - (c.x + c.size - 1), c.y - y, y - (c.y + c.size - 1));
      if (ring !== 4 && ring !== 5) continue;
      const i = m.idx(x, y), t = m.terrain[i];
      if (m.occ[i] || m.tree[i] || m.block[i] || (t !== T.GRASS && t !== T.DRY && t !== T.DIRT && t !== T.SAND && t !== T.FOREST)) continue;
      m.terrain[i] = T.SHALLOW; m.road[i] = 0; m.paint(i); n++;
    }
    c.moat = true;
    if (n) this.log(`🌊 ${p.name} digs a moat around its castle.`, 'build', [p.id], c.x + 2, c.y + 2);
  }
  // busy footpaths become roads; around advanced towns they are paved
  growRoads() {
    const m = this.map, N = this.N;
    for (const i of this.hotTiles) {
      if (m.traffic[i] < 30 || m.road[i] || m.occ[i] || m.tree[i]) { this.hotTiles.delete(i); continue; }
      const t = m.terrain[i]; if (t === T.SHALLOW || t === T.DEEP || t === T.MOUNTAIN || t === T.SNOW) { this.hotTiles.delete(i); continue; }
      const x = i % N, y = (i / N) | 0;
      let lvl = 1; for (const p of this.players) if (p.alive && p.age >= 3 && Math.abs(p.home.x - x) + Math.abs(p.home.y - y) < 34) lvl = 2;
      m.road[i] = lvl; m.paint(i); this.hotTiles.delete(i);
    }
    if (this.tickN % 3000 === 0) { for (let i = 0; i < N * N; i++) m.traffic[i] >>= 1; }
  }
  townName(p) {
    const list = p.civ.towns || ['Haven']; const n = p.townCount = (p.townCount || 0) + 1;
    return n <= list.length ? list[n - 1] : `${list[(n - 1) % list.length]} ${['II', 'III', 'IV', 'V'][Math.min(3, Math.floor((n - 1) / list.length) - 1)]}`;
  }
  // a province gets a governor with a temperament of their own
  appoint(b, p) {
    const keys = Object.keys(GOVERNOR_TRAITS), names = HERO_NAMES[p.civKey] || HERO_NAMES.meridian;
    b.governor = { name: names[(this.R() * names.length) | 0] + ' ' + ['of ' + (b.townName || 'the March'), 'the Elder', 'the Younger', 'Fairhand'][(this.R() * 4) | 0], trait: keys[(this.R() * keys.length) | 0], since: this.time };
  }
  embargoCount(pid) { let n = 0; for (const k of this.embargo) if (k.endsWith('>' + pid)) n++; return n; }

  // ---------------------------------------------------------------- heroes
  makeHero(u, p) {
    const names = HERO_NAMES[p.civKey] || HERO_NAMES.meridian;
    const used = new Set(p.heroes.map(h => h.first));
    const free = names.filter(n => !used.has(n));
    const first = (free.length ? free : names)[(this.R() * (free.length || names.length)) | 0];
    const h = { first, name: `${first} ${HERO_EPITHETS[(this.R() * HERO_EPITHETS.length) | 0]}`, fame: 0, level: 0, kills: 0, born: this.time, died: 0, owner: p.id, battles: 0 };
    u.hero = h; p.heroes.push(h);
    this.log(`⚜ ${p.name} raises a hero: ${h.name} takes command of the army.`, 'war', [p.id], u.x, u.y);
  }
  maxHpOf(u, p) { const st = p.st(u.type); return u.hero ? st.hp * (1 + u.hero.level * 0.15) : st.hp; }
  // fame flows to the hero of the side that won a fight nearby
  heroFame(pid, src, amount) {
    if (!amount) return;
    for (const u of this.players[pid].units) {
      if (!u.hero || u.dead || u.inside) continue;
      const d = Math.hypot(u.x - src.x, u.y - src.y);
      if (d > 16) continue;
      const h = u.hero; h.fame += amount * (u === src ? 3 : 1);
      const next = HERO_LEVELS[h.level + 1];
      if (next && h.fame >= next.fame) {
        h.level++;
        const r = u.hp / u.maxHp; u.maxHp = this.maxHpOf(u, this.players[pid]); u.hp = u.maxHp * Math.max(r, 0.6);
        this.log(`⭐ ${h.name} of ${this.players[pid].name} is hailed as ${HERO_LEVELS[h.level].title}!`, h.level >= 2 ? 'big' : 'war', [pid], u.x, u.y);
        this.fx.push({ kind: 'ring', x: u.x, y: u.y, color: '#ffd76a', t0: this.time, life: 2.5 });
        this.sound('fanfare', u.x, u.y);
      }
    }
  }

  // ---------------------------------------------------------------- capture, transfer, collapse, rebellion
  tryCapture(b, by) {
    const cx = b.x + b.size / 2, cy = b.y + b.size / 2;
    let att = 0, def = b.garrison.length * 0.5;
    this.grid.query(cx, cy, b.size / 2 + 6, e => {
      if (e.dead || e.inside || e.wounded || e.naval || !this.military(e) || e.cls === 'siege') return;
      if (rectDist(e.x, e.y, b) > 5) return;
      if (e.owner === b.owner || this.rel[e.owner][b.owner] === 'ally') def += e.pop;
      else if ((e.owner === by || this.rel[e.owner][by] === 'ally') && this.hostile(e.owner, b.owner)) att += e.pop;
    });
    if (att < 6 || att < def * 3 + 2) return false;
    const loser = this.players[b.owner], winner = this.players[by];
    const wasCapital = loser.tc === b;
    this.transferBuilding(b, by);
    b.hp = Math.max(b.hp, b.maxHp * 0.35); b.lastHit = this.time; b.capturedAt = this.time; b.loyalty = 45;
    winner.stats.captured = (winner.stats.captured || 0) + 1; loser.stats.lost++;
    const big = b.type === 'town_center' || b.type === 'castle';
    this.log(`🚩 ${winner.name} captures ${loser.name}'s ${BUILDINGS[b.type].name}${wasCapital ? ' — the capital has fallen!' : '!'}`, big ? 'big' : 'war', [by, loser.id], cx, cy);
    this.fx.push({ kind: 'ring', x: cx, y: cy, color: winner.color, t0: this.time, life: 2.5 });
    this.sound('capture', cx, cy);
    this.grid.query(cx, cy, 10, e => { if (e.owner === by && !e.dead) e.morale = Math.min(100, e.morale + 10); else if (e.owner === loser.id && !e.dead) e.morale -= 12; });
    if (wasCapital) { loser.capitalLost = this.time; loser.happiness = Math.max(0, loser.happiness - 20); loser.unrest = Math.min(100, (loser.unrest || 0) + 35); }
    if (big) this.heroFame(by, { x: cx, y: cy }, 30);
    return true;
  }
  // remove a unit from the world without a fight (it changed sides, or was dismissed)
  despawn(u) {
    if (u.dead) return;
    const p = this.players[u.owner];
    this.leaveArmy(u);
    if (u.inside) { const b = this.ents.get(u.inside); if (b) b.garrison = b.garrison.filter(id => id !== u.id); }
    if (u.task?.type === 'gather' && u.task.tk === 'farm') { const f = this.ents.get(u.task.ti); if (f && f.farmer === u.id) f.farmer = 0; }
    u.dead = true; this.ents.delete(u.id); p.pop -= u.pop;
  }
  transferUnit(u, to) {
    if (u.dead || u.owner === to) return;
    const from = this.players[u.owner], np = this.players[to];
    this.leaveArmy(u);
    if (u.inside) { const b = this.ents.get(u.inside); this.ungarrison(u, b); }
    if (u.task?.type === 'gather' && u.task.tk === 'farm') { const f = this.ents.get(u.task.ti); if (f && f.farmer === u.id) f.farmer = 0; }
    from.units = from.units.filter(k => k !== u); from.pop -= u.pop;
    u.owner = to; np.units.push(u); np.pop += u.pop;
    if (u.hero) { u.hero.owner = to; np.heroes.push(u.hero); }
    const r = u.hp / u.maxHp; u.maxHp = this.maxHpOf(u, np); u.hp = Math.max(1, u.maxHp * r);
    u.task = { type: 'idle' }; u.path = null; u.dest = null; u.needPath = false; u.routing = 0; u.morale = np.moraleBase();
  }
  transferBuilding(b, to) {
    const from = this.players[b.owner], np = this.players[to];
    for (const q of b.queue) if (q.kind === 'age') from.ageResearching = false;
    b.queue = []; b.blocked = false; b.farmer = 0;
    for (const id of [...b.garrison]) { const u = this.ents.get(id); if (u) { u.inside = 0; this.ejectFrom(u, b); } }
    b.garrison = [];
    from.blds = from.blds.filter(k => k !== b);
    b.owner = to; np.blds.push(b);
    const mh = Math.round(BUILDINGS[b.type].hp * (1 + np.mod('bldHp'))); b.hp = b.hp / b.maxHp * mh; b.maxHp = mh;
    this.recountPop(from); this.recountPop(np);
    if (b.type === 'monument') { from.recalc(); np.recalc(); }
    if ((b.type === 'town_center' || b.type === 'castle') && np.tc && np.tc !== b && !np.rebel) this.appoint(b, np); else if (b.type === 'town_center' || b.type === 'castle') b.governor = null;
    if (from.tc === b) from.tc = from.blds.find(k => k.type === 'town_center' && k.done) || from.blds.find(k => k.type === 'castle' && k.done) || null;
    this.map.markDirty(b.x, b.y);
  }
  cores(p) { return p.blds.filter(b => b.done && (b.type === 'town_center' || b.type === 'castle')); }
  // what keeps a nation alive under total conquest: real buildings (not walls or traps) and people on land
  assets(p) {
    let blds = 0, units = 0;
    for (const b of p.blds) if (!b.dead && !BUILDINGS[b.type].wall && !BUILDINGS[b.type].trap) blds++;
    for (const u of p.units) if (!u.dead && !u.naval) units++;
    return { blds, units };
  }
  // A beaten nation without its capital or an army may surrender: its lands are annexed.
  collapseCheck() {
    if (this.time < 900) return;
    for (const p of this.players) {
      if (!p.alive || p.rebel || this.setup.teams && p.team != null) continue;
      const lostCapital = p.capitalLost || !p.blds.some(b => b.type === 'town_center');
      if (!lostCapital) continue;
      let foe = null, fs = 0;
      for (const q of this.players) if (q !== p && q.alive && !q.rebel && this.rel[p.id][q.id] === 'war' && (p.attackedBy[q.id] || -1e9) > this.time - 240) { const s = q.score(); if (s > fs) { fs = s; foe = q; } }
      if (!foe) continue;
      const mine = this.brains[p.id].strength(p.units.filter(u => this.military(u)));
      const theirs = this.brains[foe.id].strength(foe.units.filter(u => this.military(u)));
      if (mine < theirs * 0.15 && p.score() < fs * 0.4 && this.cores(p).length <= 1) this.capitulate(p, foe);
    }
  }
  capitulate(p, foe) {
    this.log(`🏳 ${p.name} surrenders to ${foe.name}! ${p.civ.name} is annexed.`, 'big', [p.id, foe.id], p.home.x, p.home.y);
    // loot and lands go to the victor; the beaten army is disbanded
    for (const r of RES) { foe.res[r] += p.res[r] * 0.4; p.res[r] = 0; }
    for (const b of [...p.blds]) { if (BUILDINGS[b.type].wall || !b.done) this.removeBuilding(b, -1); else { this.transferBuilding(b, foe.id); b.capturedAt = this.time; b.loyalty = 55; } }
    for (const u of [...p.units]) {
      if (u.dead) continue;
      if (u.cls === 'villager' && foe.pop + 1 <= Math.min(POP_MAX, foe.popCap)) this.transferUnit(u, foe.id); else this.despawn(u);
    }
    p.units = []; p.pop = 0;
    foe.unrest = Math.min(100, (foe.unrest || 0) + 25); // a newly conquered people is restless
    this.eliminate(p);
  }
  // Unrest boils over: a far province breaks away, or the peasants rise in revolt.
  rebellion(p, province = null) {
    p.unrest = province ? p.unrest : 25; p.lastRevolt = this.time;
    const capital = p.tc && !p.tc.dead ? p.tc : this.cores(p)[0];
    const hx = capital ? capital.x + 2 : p.home.x, hy = capital ? capital.y + 2 : p.home.y;
    const seat = province || this.cores(p).filter(b => b !== capital).sort((a, b) => Math.hypot(b.x - hx, b.y - hy) - Math.hypot(a.x - hx, a.y - hy))[0];
    if (seat && Math.hypot(seat.x - hx, seat.y - hy) > 28) {
      const sx = seat.x + seat.size / 2, sy = seat.y + seat.size / 2;
      const r = this.addRebels(p, sx, sy, false);
      const share = 0.35;
      for (const k of RES) { r.res[k] = p.res[k] * share; p.res[k] -= r.res[k]; }
      for (const b of [...p.blds]) if (b === seat || (Math.hypot(b.x - sx, b.y - sy) < 24 && Math.hypot(b.x - sx, b.y - sy) < Math.hypot(b.x - hx, b.y - hy))) { if (b.done) this.transferBuilding(b, r.id); else this.removeBuilding(b, -1); }
      for (const u of [...p.units]) if (!u.dead && !u.hero && !u.naval && Math.hypot(u.x - sx, u.y - sy) < 22 && Math.hypot(u.x - sx, u.y - sy) < Math.hypot(u.x - hx, u.y - hy)) this.transferUnit(u, r.id);
      r.tc = seat; r.home = { x: sx, y: sy }; seat.loyalty = 100; seat.capturedAt = 0;
      this.log(r.name.startsWith('Free Cities') ? `🔥 Revolt! The ${r.name} break away from ${p.name} and crown their own ruler.` : `🔥 Revolt! The ${r.name} breaks away from ${p.name} and crowns its own ruler.`, 'big', [p.id, r.id], sx, sy);
    } else {
      const vills = p.units.filter(u => u.cls === 'villager' && !u.dead && !u.inside);
      if (vills.length < 8) return;
      vills.sort((a, b) => Math.hypot(b.x - hx, b.y - hy) - Math.hypot(a.x - hx, a.y - hy));
      const n = Math.min(24, Math.max(4, Math.round(vills.length * 0.14)));
      const rising = vills.slice(0, n);
      let cx = 0, cy = 0; for (const u of rising) { cx += u.x; cy += u.y; } cx /= n; cy /= n;
      const r = this.addRebels(p, cx, cy, true);
      for (const u of rising) { const x = u.x, y = u.y; this.despawn(u); const m = this.spawnUnit(r.id, 'militia', x, y); m.morale = 70; }
      this.log(`🔥 Peasant revolt in ${p.name}'s lands! ${n} villagers take up arms.`, 'big', [p.id, r.id], cx, cy);
    }
    this.sound('horn', p.home.x, p.home.y);
  }
  addRebels(parent, x, y, band) {
    const id = this.players.length;
    const prof = { ...parent.profile, aggression: 0.9, defense: 0.4, villagers: 60, attackRatio: 0.9, firstAttack: 0, taunts: ['Down with the crown!', 'No more taxes!', 'Freedom or death!'] };
    const names = band ? ['Peasant Revolt', 'Free Folk', 'Red Banner'] : ['Free March', 'Breakaway Duchy', 'Rebel Crown', 'Free Cities'];
    const name = `${names[(this.R() * names.length) | 0]} of ${parent.name}`;
    const cfg = { ai: parent.aiKey, civ: parent.civKey, color: band ? '#7c6a58' : rebelColor(parent.color), name, team: null, profile: prof };
    const r = new Player(this, id, cfg);
    r.rebel = true; r.band = band; r.parent = parent.id; r.home = { x, y };
    r.res = { food: 0, wood: 0, stone: 0, gold: 0, iron: 0 };
    r.age = parent.age; r.techs = new Set(parent.techs); r.lineTier = { ...parent.lineTier }; r.religion = parent.religion ? { ...parent.religion } : null;
    r.happiness = 70; r.knows = { [parent.id]: { x: parent.home.x, y: parent.home.y, t: this.time } };
    r.recalc();
    this.players.push(r);
    for (let i = 0; i < id; i++) this.rel[i].push(i === parent.id ? 'war' : 'peace');
    this.rel.push(this.players.map((q, j) => j === id ? 'self' : j === parent.id ? 'war' : 'peace'));
    r.attackedBy[parent.id] = this.time; parent.attackedBy[id] = this.time;
    const br = new Brain(this, r); br.band = band;
    this.brains.push(br);
    return r;
  }
  checksum() {
    let h = (this.tickN * 2654435761) >>> 0;
    for (const u of this.units) if (!u.dead) h = (Math.imul(h ^ ((u.x * 64) | 0), 16777619) ^ ((u.y * 64) | 0) ^ u.id) >>> 0;
    for (const p of this.players) for (const r of RES) h = (Math.imul(h, 31) + (p.res[r] | 0)) >>> 0;
    return h;
  }
  eliminate(p) {
    p.alive = false; p.eliminatedAt = this.time;
    this.log(p.rebel ? `⚖ The rebellion of ${p.name} is over.` : `💀 ${p.name} has been eliminated.`, p.rebel ? 'war' : 'big', [p.id], p.home.x, p.home.y);
    for (const u of p.units) { if (!u.dead) { u.dead = true; this.ents.delete(u.id); this.fx.push({ kind: 'corpse', x: u.x, y: u.y, type: u.type, owner: u.owner, facing: u.facing, t0: this.time, life: 20 }); } }
    p.units = []; p.pop = 0;
    for (const b of [...p.blds]) this.removeBuilding(b, -1);
    for (const s of this.sacred) if (s.owner === p.id) s.owner = -1;
  }
}

export function pactKey(a, b) { return a < b ? a + ':' + b : b + ':' + a; }
function rebelColor(hex) { const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; const m = v => Math.round(v * 0.55 + 200 * 0.45).toString(16).padStart(2, '0'); return '#' + m(r) + m(g) + m(b); }
export function rectOf(b) { const s = b.size || 1; return { x0: b.x, y0: b.y, x1: b.x + s - 1, y1: b.y + s - 1 }; }
