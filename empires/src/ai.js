// Built-in strategic AI. One Brain per nation; personality comes from config.AI.
// A live LLM (llm.js) can override the high-level directive; this brain carries it out.
import { UNITS, BUILDINGS, TECHS, AGES, GOVERNMENTS, DEPARTMENTS, DOCTRINES, RITES, POP_MAX, RES, PARTIES, LAWS, GOVERNOR_TRAITS } from './config.js';
import { rectDist, rectOf, pactKey } from './game.js';
import { clamp } from './util.js';

const BASE_SPLIT = [null,
  { food: 0.56, wood: 0.36, gold: 0.05, stone: 0.03, iron: 0 },
  { food: 0.43, wood: 0.3, gold: 0.17, stone: 0.06, iron: 0.04 },
  { food: 0.37, wood: 0.25, gold: 0.21, stone: 0.09, iron: 0.08 },
  { food: 0.34, wood: 0.22, gold: 0.24, stone: 0.1, iron: 0.1 },
  { food: 0.32, wood: 0.2, gold: 0.26, stone: 0.1, iron: 0.12 }];
const ECO_TECHS = ['double_axe', 'gold_mining', 'loom', 'horse_collar', 'wheelbarrow', 'bow_saw', 'stone_mining', 'iron_smelting', 'heavy_plow', 'two_man_saw', 'hand_cart', 'shaft_mine', 'crop_rotation'];
const MIL_TECHS = ['forging', 'scale_mail', 'fletching', 'bloodlines', 'up_swordsman', 'up_pikeman', 'iron_casting', 'chain_mail', 'bodkin', 'up_crossbow', 'up_knight', 'barding', 'husbandry', 'thumb_ring', 'up_champion', 'up_halberdier', 'blast_furnace', 'plate_mail', 'bracer', 'up_arbalest', 'up_paladin', 'plate_barding', 'chemistry', 'conscription'];
const CIV_TECHS = ['moat', 'boiling_oil', 'fortified_walls', 'spy_network', 'printing', 'ballistic_gunnery', 'herbalism', 'theology', 'bureaucracy', 'caravan', 'masonry', 'murder_holes', 'scholarship', 'crane', 'ballistics', 'guilds', 'field_surgery', 'sanitation', 'zealotry', 'fervor', 'propaganda', 'hoardings', 'architecture', 'banking', 'anatomy'];

// does this building sit on the shore of water region `comp`?
function m_shore(g, b, comp) { return g.map.shoreWater(b.x, b.y, b.size).some(i => g.pfW.comp[i] === comp); }

export class Brain {
  constructor(g, p) {
    this.g = g; this.p = p; this.P = p.profile;
    this.armies = new Map(); this.nextArmy = 1;
    this.defense = this.newArmy('defense');
    this.directive = null;
    this.enemySeen = { infantry: 0, spear: 0, ranged: 0, cavalry: 0, siege: 0 };
    this.t = 0; this.lastAttackEnd = -1e9; this.target = -1; this.bellUntil = 0;
    this.scoutPlan = null; this.nextDiplo = 60 + g.R() * 40; this.wall = null;
    this.needCamp = {}; this.opinion = {};
    this.jitter = 0.9 + g.R() * 0.2; // personal variation between matches
    this.buildReq = []; this.forceAttackUntil = 0; this.lostSites = []; this.intel = {}; this.castleQ = []; this.lastTribute = {}; this.wantSiege = 0;
    this.findCoast();
  }
  // ---------------------------------------------------------------- orders from a live model
  onDirective(d) {
    const g = this.g;
    if (Array.isArray(d.build) && d.build.length) this.buildReq = d.build.slice(0, 3);
    if (d.attack === 'now') { this.forceAttackUntil = g.time + 150; this.say('📜 Orders: attack now.'); }
    if (d.attack === 'hold') { for (const a of this.armies.values()) if (a.kind === 'attack' && a.state !== 'retreat') a.state = 'retreat'; this.say('📜 Orders: hold. Field armies pull back.'); }
    if (d.research?.length) this.say(`📜 Orders: research ${d.research.join(', ')}.`);
    if (d.build?.length) this.say(`📜 Orders: build ${d.build.join(', ')}.`);
    if (d.target != null && g.players[d.target]) this.say(`📜 Orders: make ${g.players[d.target].name} the main target.`);
    for (const o of d.armies || []) {
      const a = this.armies.get(o.id); if (!a || a.kind === 'defense' || a.kind === 'province') continue;
      const name = a.kind === 'raid' ? 'raiders' : 'field army';
      if (o.order === 'retreat' && a.state !== 'retreat') { a.state = 'retreat'; this.say(`📜 Orders: the ${name} falls back home.`); }
      else if (o.order === 'hold' && a.targetPid >= 0 && a.kind !== 'hunt') { a.state = 'camp'; a.camped = true; a.campUntil = g.time + 90; this.say(`📜 Orders: the ${name} holds its ground.`); }
      else if (o.order === 'attack' && o.target != null && g.players[o.target]?.alive && g.rel[this.p.id][o.target] === 'war') {
        const q = g.players[o.target]; a.kind = a.kind === 'hunt' ? 'attack' : a.kind; a.targetPid = q.id; a.camped = false;
        if (this.planMarch(a, q.home.x, q.home.y)) this.say(`📜 Orders: the ${name} marches on ${q.name}.`);
      } else if (o.order === 'reinforce' && a.center) {
        const pool = [...this.defense.units].map(id => g.ents.get(id)).filter(u => u && !u.dead && !u.wounded && u.type !== 'general' && !u.naval);
        const go = pool.slice(0, Math.floor(pool.length / 2));
        for (const u of go) { this.defense.units.delete(u.id); a.units.add(u.id); u.army = a.id; a.start += this.p.st(u.type).power * 0.6; u.task = { type: 'amove', x: a.center.x, y: a.center.y }; }
        if (go.length) this.say(`📜 Orders: ${go.length} soldiers of the home guard reinforce the ${name}.`);
      }
    }
  }
  newArmy(kind) { const a = { id: this.nextArmy++, kind, units: new Set(), state: 'idle', target: null, wps: null, wi: 0, center: null, strength: 0, start: 0, born: this.g.time }; this.armies.set(a.id, a); return a; }
  say(text) { this.p.log(text); }

  // directive helpers (LLM or default personality)
  get posture() { return this.directive?.posture || (this.p.party ? PARTIES[this.p.party].posture : 'balanced'); }
  aggression() { const a = this.P.aggression * this.jitter; const p = this.posture; return clamp(p === 'rush' || p === 'all_in' ? a + 0.3 : p === 'turtle' ? a - 0.3 : p === 'boom' ? a - 0.15 : a, 0, 1) * (1 + Math.min(0.6, this.g.time / 3600)); }
  villagerTarget() { let v = this.directive?.villagers || this.P.villagers; const p = this.posture; if (p === 'boom') v += 20; if (p === 'rush') v -= 20; if (this.p.age === 1) v = Math.min(v, 30 + (this.P.eco * 10 | 0)); else if (this.p.age === 2) v = Math.min(v, 65); return clamp(Math.round(v * this.jitter), 18, 150); }
  mix() { return this.directive?.mix || this.P.mix; }

  // ---------------------------------------------------------------- main loop (1 Hz)
  think() {
    const g = this.g, p = this.p;
    this.t++;
    if (this.band) { this.bandThink(); return; }
    this.updateHome();
    if (this.t % 10 === 1) this.updateThreatDir();
    this.economy();
    if (this.t % 2 === 0) this.construct();
    this.research();
    this.produce();
    if (this.t % 2 === 1) this.operations();
    if (this.t % 10 === 3) this.civics();
    if (this.t % 4 === 2) this.scouting();
    if (this.t % 5 === 0) this.observeEnemies();
    if (this.t % 4 === 1) this.fleet();
    if (g.time > this.nextDiplo) { this.nextDiplo = g.time + 40 + g.R() * 30; this.diplomacy(); }
  }
  updateHome() {
    const p = this.p;
    const core = p.blds.find(b => b.type === 'town_center' && !b.dead) || p.blds.find(b => b.type === 'castle' && !b.dead);
    if (core) { p.tc = core; p.home = { x: core.x + core.size / 2, y: core.y + core.size / 2 }; }
  }
  updateThreatDir() {
    const p = this.p, g = this.g;
    let vx = 0, vy = 0;
    for (const q of g.players) {
      if (q === p || !q.alive || g.rel[p.id][q.id] === 'ally') continue;
      const dx = q.home.x - p.home.x, dy = q.home.y - p.home.y, d = Math.hypot(dx, dy) || 1;
      const w = (g.rel[p.id][q.id] === 'war' ? 1 : 0.4) / (d * d) * (p.attackedBy[q.id] > g.time - 120 ? 3 : 1);
      vx += dx / d * w; vy += dy / d * w;
    }
    if (p.threatAt && g.time - p.threatAt.t < 60) { const dx = p.threatAt.x - p.home.x, dy = p.threatAt.y - p.home.y, d = Math.hypot(dx, dy) || 1; vx += dx / d * 1e-3; vy += dy / d * 1e-3; }
    const l = Math.hypot(vx, vy);
    if (l > 0) p.threatDir = { x: vx / l, y: vy / l };
    else { const cx = g.N / 2 - p.home.x, cy = g.N / 2 - p.home.y, d = Math.hypot(cx, cy) || 1; p.threatDir = { x: cx / d, y: cy / d }; }
  }

  // ---------------------------------------------------------------- economy
  economy() {
    const g = this.g, p = this.p;
    const vills = p.units.filter(u => u.cls === 'villager' && !u.dead);
    const vt = this.villagerTarget();
    // keep the town center producing villagers, except while the town is fighting for its life: then every
    // spare bit of food goes to soldiers (unless so few villagers are left that the economy would die)
    const tcs = p.blds.filter(b => b.type === 'town_center' && b.done);
    const war = this.underSiege() && vills.length >= 15;
    if (war && g.time - (this.siegeSaid || 0) > 60) { this.siegeSaid = g.time; this.say('The town is under attack: training soldiers instead of villagers.'); }
    for (const tc of tcs) {
      const queued = tc.queue.filter(q => q.key === 'villager').length;
      if (war) { if (queued) for (let i = tc.queue.length - 1; i >= 0; i--) if (tc.queue[i].key === 'villager' && i > 0) { p.refund(tc.queue[i].cost); tc.queue.splice(i, 1); } continue; }
      if (vills.length + queued < vt && queued < 2 && p.pop + 1 <= p.popCap && !tc.queue.some(q => q.kind === 'age' && tc.queue[0] === q)) g.queueUnit(tc, 'villager');
    }
    if (this.t % 3 !== 0) return;
    // town bell: hide villagers from raiders, release them afterwards
    if (this.bellUntil && g.time > this.bellUntil) {
      this.bellUntil = 0; this.say('The danger has passed; villagers return to work.');
      for (const b of p.blds) if (b.garrison.length) for (const id of [...b.garrison]) { const u = g.ents.get(id); if (u && u.cls === 'villager' && !u.wounded && !u.sick) { g.ungarrison(u, b); u.task = { type: 'idle' }; } }
    }
    // count jobs
    const cnt = { food: 0, wood: 0, gold: 0, stone: 0, iron: 0 }, idle = [];
    let builders = 0;
    for (const u of vills) {
      if (u.inside || u.wounded || u.sick) continue;
      const t = u.task;
      if (t.type === 'gather') cnt[t.res]++;
      else if (t.type === 'build' || t.type === 'repair') builders++;
      else if (t.type === 'idle' || t.type === 'move') idle.push(u);
    }
    // builders for sites
    const sites = p.blds.filter(b => !b.done);
    for (const s of sites) {
      const want = s.type === 'wonder' ? 12 : s.type === 'house' || s.type === 'farm' || BUILDINGS[s.type].wall ? 1 : s.size >= 4 ? 4 : 2;
      let have = vills.filter(u => (u.task.type === 'build') && u.task.id === s.id).length;
      while (have < want) {
        // builders come from nearby: a villager from a far-off captured town would walk for minutes
        let pick = null, bd = 45;
        for (const u of idle) { if (u.task.type !== 'idle') continue; const d = rectDist(u.x, u.y, s); if (d < bd) { bd = d; pick = u; } }
        if (pick) idle.splice(idle.indexOf(pick), 1);
        else { pick = this.nearestVillager(vills, s, u => u.task.type === 'gather' && !u.carry && (u.task.res === 'wood' || cnt[u.task.res] > 2)); if (pick && rectDist(pick.x, pick.y, s) > 60) pick = null; }
        if (!pick) break;
        if (pick.task.type === 'gather') cnt[pick.task.res]--;
        g.order(pick, { type: 'build', id: s.id }); have++; builders++;
      }
    }
    // repairs: villagers mend every damaged building once the fighting around it stops; the most important first
    if (this.t % 4 === 0) {
      const busy = vills.filter(u => u.task.type === 'repair').length, maxR = this.underSiege() ? 2 + p.age : 4 + p.age * 3;
      if (busy < maxR) {
        const prio = b => { const B = BUILDINGS[b.type]; return b.type === 'town_center' || b.type === 'castle' || b.type === 'star_fort' || b.type === 'wonder' ? 0 : B.gate || b.type === 'wall_tower' || b.type === 'watch_tower' ? 1 : B.wall ? 2 : B.trains ? 3 : 4; };
        const hurt = p.blds.filter(b => b.done && !b.dead && !BUILDINGS[b.type].trap && b.hp < b.maxHp * (BUILDINGS[b.type].wall ? 0.85 : 0.75) && g.time - b.lastHit > 6
          && Math.abs(b.x - p.home.x) + Math.abs(b.y - p.home.y) < 100 && !vills.some(u => u.task.type === 'repair' && u.task.id === b.id))
          .sort((a, b) => prio(a) - prio(b) || a.hp / a.maxHp - b.hp / b.maxHp).slice(0, maxR - busy);
        for (const b of hurt) {
          const mat = (BUILDINGS[b.type].cost.stone || 0) > (BUILDINGS[b.type].cost.wood || 0) ? 'stone' : 'wood';
          if (p.res[mat] < 40) continue;
          const v = this.nearestVillager(vills, b, u => (u.task.type === 'gather' || u.task.type === 'idle') && rectDist(u.x, u.y, b) < 45);
          if (v) { if (v.task.type === 'gather') cnt[v.task.res]--; g.order(v, { type: 'repair', id: b.id }); }
        }
        if (hurt.length && g.time - (this.repairSaid || 0) > 90) { this.repairSaid = g.time; this.say(`Villagers repair the ${BUILDINGS[hurt[0].type].name.toLowerCase()} and ${hurt.length - 1} other damaged buildings.`); }
      }
    }
    // desired split
    const split = { ...BASE_SPLIT[p.age] };
    const need = this.nextNeeds();
    for (const r of RES) {
      const stock = p.res[r];
      const short = Math.max(0, (need[r] || 0) - stock);
      split[r] *= 1 + Math.min(2, short / 500);
      if (stock > 2500) split[r] *= 0.25; else if (stock > 1400) split[r] *= 0.55;
      if (r !== 'food' && !this.resAvailable(r)) split[r] = 0;
    }
    if (this.p.res.food < 100) split.food *= 1.6;
    if (p.age >= 2 && (p.has('market') || this.P.trade > 0.8)) split.gold *= 1 - this.P.trade * 0.25;
    const tot = Object.values(split).reduce((a, b) => a + b, 0) || 1;
    const workers = vills.length - builders;
    const want = {}; for (const r of RES) want[r] = split[r] / tot * workers;
    // assign idle
    for (const u of idle) {
      if (u.task.type === 'move') continue;
      let best = null, bd = -1e9;
      for (const r of RES) { if (u.task.starved === r && this.t % 15) continue; const d = want[r] - cnt[r]; if (d > bd) { bd = d; best = r; } }
      if (best && this.assign(u, best)) cnt[best]++;
      else if (best !== 'food' && this.assign(u, 'food')) cnt.food++;
      else if (this.assign(u, 'wood')) cnt.wood++;
    }
    // rebalance a little each cycle
    let over = null, under = null, od = 1.5, ud = 1.5;
    for (const r of RES) { const d = cnt[r] - want[r]; if (d > od) { od = d; over = r; } if (-d > ud) { ud = -d; under = r; } }
    if (over && under) {
      const moves = Math.min(3, Math.floor(Math.min(od, ud)));
      for (let k = 0; k < moves; k++) {
        const v = vills.find(u => u.task.type === 'gather' && u.task.res === over && !u.carry && !u.inside);
        if (!v) break;
        if (this.assign(v, under)) { cnt[over]--; cnt[under]++; } else break;
      }
    }
    this.jobCounts = cnt; this.jobWant = want;
  }
  resAvailable(r) { if (r === 'wood' || r === 'food') return true; if (!this.availCache || this.t % 30 === 0) this.availCache = {}; if (this.availCache[r] != null) return this.availCache[r]; const n = this.g.nearestNode(r, this.p.home.x, this.p.home.y, 90); return (this.availCache[r] = !!n); }
  nearestVillager(vills, b, filter) { let best = null, bd = 1e9; for (const u of vills) { if (u.inside || u.wounded || u.sick || !filter(u)) continue; const d = rectDist(u.x, u.y, b); if (d < bd) { bd = d; best = u; } } return best; }
  nextNeeds() {
    const p = this.p, n = {};
    const A = AGES[p.age]; if (A) for (const r in A.cost) n[r] = (n[r] || 0) + A.cost[r];
    if (p.age >= 3 && !p.has('castle')) n.stone = (n.stone || 0) + 650;
    n.food = (n.food || 0) + 150; n.wood = (n.wood || 0) + 200;
    if (this.saveFor) { const c = p.cost(this.saveFor, true); for (const r in c) n[r] = (n[r] || 0) + c[r]; }
    if (this.wonderSaving) { const c = p.cost('wonder', true); for (const r in c) n[r] = (n[r] || 0) + c[r]; }
    if (this.rebuildSave) { const c = p.cost(this.rebuildSave, true); for (const r in c) n[r] = (n[r] || 0) + c[r]; }
    if (p.age >= 2) n.gold = (n.gold || 0) + 200;
    if (p.age >= 3) n.iron = (n.iron || 0) + 120;
    return n;
  }
  assign(u, res) {
    const g = this.g, p = this.p, m = g.map;
    if (res === 'food') {
      const farmerOk = b => { const f = b.farmer && g.ents.get(b.farmer); return f && !f.dead && f.task?.type === 'gather' && f.task.ti === b.id; };
      let farm = null, fd = 1e9;
      for (const b of p.blds) if (b.type === 'farm' && b.done && !farmerOk(b)) { const d = Math.abs(b.x - u.x) + Math.abs(b.y - u.y); if (d < fd) { fd = d; farm = b; } }
      if (farm) { farm.farmer = u.id; g.order(u, { type: 'gather', res, tk: 'farm', ti: farm.id, phase: 'go' }); return true; }
      const drops = p.blds.filter(b => b.done && BUILDINGS[b.type].drop?.includes('food'));
      let best = null, bd = 1e9;
      for (const n of g.nodes) { if (n.res !== 'food' || n.fish) continue; for (const d of drops) { const dd = rectDist(n.x, n.y, d); if (dd < 14 && dd < bd) { bd = dd; best = n; } } }
      if (best) { g.order(u, { type: 'gather', res, tk: 'node', ti: best.id, phase: 'go' }); return true; }
      this.wantFarm = true;
      const far = g.nearestNode('food', p.home.x, p.home.y, 30);
      if (far) { this.needCamp.mill = { x: far.x, y: far.y }; }
      return false;
    }
    if (res === 'wood') {
      const drops = p.blds.filter(b => b.done && (b.type === 'lumber_camp' || b.type === 'town_center'));
      drops.sort((a, b) => rectDist(u.x, u.y, a) - rectDist(u.x, u.y, b));
      for (const d of drops.slice(0, 3)) {
        const i = m.findTree(d.x + d.size / 2, d.y + d.size / 2, d.type === 'lumber_camp' ? 12 : 10);
        if (i >= 0) { g.order(u, { type: 'gather', res, tk: 'tree', ti: i, phase: 'go' }); return true; }
      }
      const i = m.findTree(p.home.x, p.home.y, 45);
      if (i >= 0) { this.needCamp.lumber_camp = { x: i % m.size, y: (i / m.size) | 0 }; g.order(u, { type: 'gather', res, tk: 'tree', ti: i, phase: 'go' }); return true; }
      return false;
    }
    // minerals
    const drops = p.blds.filter(b => b.done && BUILDINGS[b.type].drop?.includes(res));
    let best = null, bd = 1e9;
    for (const n of g.nodes) {
      if (n.res !== res) continue;
      let dd = 1e9; for (const d of drops) dd = Math.min(dd, rectDist(n.x, n.y, d));
      const s = dd + Math.hypot(n.x - p.home.x, n.y - p.home.y) * 0.15;
      if (s < bd) { bd = s; best = n; }
    }
    if (!best) return false;
    let dd = 1e9; for (const d of drops) dd = Math.min(dd, rectDist(best.x, best.y, d));
    if (dd > 9) this.needCamp.mining_camp = { x: best.x, y: best.y };
    if (dd > 60) return false;
    g.order(u, { type: 'gather', res, tk: 'node', ti: best.id, phase: 'go' });
    return true;
  }

  // ---------------------------------------------------------------- town planner
  findSpot(type, cx, cy, rMin, rMax, dir = null, dirW = 0, scoreFn = null) {
    const m = this.g.map, s = BUILDINGS[type].size, margin = type === 'farm' ? 0 : BUILDINGS[type].wall ? 0 : 1;
    let best = null, bs = 1e9, found = 0;
    for (let r = rMin; r <= rMax; r++) {
      const steps = Math.max(8, Math.round(r * 2.2));
      for (let k = 0; k < steps; k++) {
        const a = k / steps * Math.PI * 2 + r * 0.37;
        const x = Math.round(cx + Math.cos(a) * r - s / 2), y = Math.round(cy + Math.sin(a) * r - s / 2);
        if (!m.areaBuildable(x, y, s, margin)) continue;
        if (type !== 'farm' && !BUILDINGS[type].wall && this.blocksResources(x, y, s)) continue;
        if (!this.spotLinked(x, y, s)) continue;
        let sc = r;
        if (dir) sc -= (Math.cos(a) * dir.x + Math.sin(a) * dir.y) * dirW * r;
        if (scoreFn) sc += scoreFn(x, y);
        if (sc < bs) { bs = sc; best = { x, y }; }
        found++;
      }
      if (found > 24) break;
    }
    return best;
  }
  // the land region the town stands in (region ids change when the map is relabelled)
  homeRegion() {
    const g = this.g, m = g.map, h = this.p.home, N = g.N;
    if (this._hrGen === g.pf.labelGen) return this._hr;
    this._hrGen = g.pf.labelGen; this._hr = 0;
    for (let r = 3; r < 12 && !this._hr; r++) for (let k = 0; k < 20 && !this._hr; k++) { const x = (h.x + Math.cos(k / 20 * 6.283) * r) | 0, y = (h.y + Math.sin(k / 20 * 6.283) * r) | 0; if (m.passable(x, y)) this._hr = g.pf.comp[y * N + x]; }
    return this._hr;
  }
  // can villagers walk up to a building placed here?
  spotLinked(x, y, s) {
    const g = this.g, m = g.map, hr = this.homeRegion(); if (!hr) return true;
    for (let yy = y - 1; yy <= y + s; yy++) for (let xx = x - 1; xx <= x + s; xx++) {
      if (xx >= x && yy >= y && xx < x + s && yy < y + s) continue;
      if (!m.passable(xx, yy)) continue;
      const c = g.pf.comp[yy * g.N + xx]; if (c === hr || c === 0) return true;
    }
    return false;
  }
  blocksResources(x, y, s) {
    const m = this.g.map;
    for (let yy = y - 2; yy < y + s + 2; yy++) for (let xx = x - 2; xx < x + s + 2; xx++) if (m.inside(xx, yy) && (m.block[m.idx(xx, yy)] & 8)) return true;
    return false;
  }
  build(type, spot) {
    if (!spot) return null;
    const b = this.g.startBuilding(this.p, type, spot.x, spot.y, []);
    return b;
  }
  construct() {
    const g = this.g, p = this.p, h = p.home, td = p.threatDir, back = { x: -td.x, y: -td.y };
    const sites = p.blds.filter(b => !b.done && !BUILDINGS[b.type].wall);
    const maxSites = 1 + p.age + (p.units.length > 120 ? 2 : 0);
    const reserve = this.reserve();
    const civic = { house: 0, farm: 0, council_hall: 0.3, market: 0.5, mill: 0.3, lumber_camp: 0.3, mining_camp: 0.3, town_center: 0 };
    const afford = (type) => { const c = p.cost(type, true), k = civic[type] ?? 1; for (const r in c) if (p.res[r] - (reserve[r] || 0) * k < c[r]) return false; return true; };
    const tryB = (type, spotFn) => { if (!p.canBuild(type) || !afford(type)) return null; const b = this.build(type, spotFn()); if (b) this.say(`Building a ${BUILDINGS[type].name}.`); return b; };
    // emergency: rebuild a town center
    if (!p.blds.some(b => b.type === 'town_center')) {
      if (p.canAfford(p.cost('town_center', true))) tryB('town_center', () => this.findSpot('town_center', h.x, h.y, 0, 20));
      return;
    }
    // houses first
    const houseSites = sites.filter(b => b.type === 'house').length;
    const room = p.popCap - p.pop;
    if (p.popCap < POP_MAX && houseSites < (p.age >= 3 ? 3 : 2) && room < 5 + p.age * 3 + houseSites * 10) {
      if (tryB('house', () => this.findSpot('house', h.x, h.y, 6, 30, back, 0.6) || this.findSpot('house', h.x, h.y, 30, 48))) return;
    }
    if (sites.length >= maxSites) return;
    const count = t => p.count(t, false);
    // drop sites requested by villagers
    for (const type of ['lumber_camp', 'mining_camp', 'mill']) {
      const nc = this.needCamp[type]; if (!nc) continue;
      const near = p.blds.some(b => (b.type === type || b.type === 'town_center') && Math.hypot(b.x - nc.x, b.y - nc.y) < (type === 'mining_camp' ? 7 : 9));
      if (near) { delete this.needCamp[type]; continue; }
      if (sites.some(b => b.type === type)) continue;
      const fn = type === 'lumber_camp' ? (x, y) => -g.map.countTrees(x + 1, y + 1, 6) * 0.35 : null;
      if (tryB(type, () => this.findSpot(type, nc.x, nc.y, 2, 7, null, 0, fn))) { delete this.needCamp[type]; return; }
    }
    if (!count('lumber_camp')) { const i = g.map.findTree(h.x, h.y, 30); if (i >= 0 && tryB('lumber_camp', () => this.findSpot('lumber_camp', i % g.N, (i / g.N) | 0, 2, 7, null, 0, (x, y) => -g.map.countTrees(x + 1, y + 1, 6) * 0.35))) return; }
    if (!count('mill')) { const n = g.nearestNode('food', h.x, h.y, 16); if (tryB('mill', () => n ? this.findSpot('mill', n.x, n.y, 2, 5) : this.findSpot('mill', h.x, h.y, 5, 10, back, 0.4))) return; }
    // farms when berries run out
    const farms = p.blds.filter(b => b.type === 'farm');
    const freeFarms = farms.filter(b => !b.done || !b.farmer || g.ents.get(b.farmer)?.task?.ti !== b.id).length;
    if (this.wantFarm && freeFarms < 2 && p.has('mill')) {
      const anchors = p.blds.filter(b => b.done && (b.type === 'mill' || b.type === 'town_center'));
      for (const a of anchors) { const spot = this.findSpot('farm', a.x + a.size / 2, a.y + a.size / 2, a.size / 2 + 2, a.size / 2 + 9); if (spot && tryB('farm', () => spot)) { this.wantFarm = false; return; } }
      // new mill for a new farm ring
      if (farms.length >= count('mill') * 8 && !sites.some(b => b.type === 'mill')) tryB('mill', () => this.findSpot('mill', h.x, h.y, 10, 22, back, 0.5));
    }
    // next age requirements (the pyramid)
    const A = AGES[p.age];
    if (A) {
      const ready = p.ageReady(p.age + 1);
      if (!ready.ok) {
        const pref = this.agePref(A.from).filter(t => !p.has(t) && !sites.some(s => s.type === t) && p.canBuild(t));
        for (const t of pref.slice(0, A.need - ready.have.length)) if (tryB(t, () => this.placeFor(t))) return;
      }
    }
    // the Wonder comes first: as soon as the workers have the resources, it is started (and saved for when close)
    if (g.setup.victory !== 'conquest' && this.directive?.wonder !== false && p.canBuild('wonder') && !p.blds.some(b => b.type === 'wonder')) {
      const c = p.cost('wonder', true);
      if (p.canAfford(c)) { const w = tryB('wonder', () => this.placeFor('wonder')); if (w) { g.decide(p.id, 'wonder', 'starts a Wonder'); g.log(`🏛 ${p.name} begins building a Wonder!`, 'big', [p.id], w.x + 2.5, w.y + 2.5); return; } }
      else if (Object.keys(c).every(r => p.res[r] >= c[r] * 0.6)) this.wonderSaving = true;
    } else this.wonderSaving = false;
    // raise destroyed buildings again where they stood, once the enemy has gone
    if (this.rebuild()) return;
    // the rest of the town, by personality. Key buildings are saved for instead of skipped.
    const KEY = { market: 1, council_hall: 1, blacksmith: 1, castle: 1, university: 1, siege_workshop: 1, hospital: 1 };
    this.saveFor = null;
    while (this.buildReq.length) {
      const type = this.buildReq[0];
      if (!BUILDINGS[type] || !p.canBuild(type) || type === 'dock' && !this.coast) { this.buildReq.shift(); continue; }
      const b = type === 'dock' ? this.buildDock() : tryB(type, () => this.placeFor(type));
      if (b) { this.buildReq.shift(); this.say(`📜 ${BUILDINGS[type].name} started as ordered.`); return; }
      if (!afford(type)) { this.saveFor = type; return; }
      this.buildReq.shift(); break;
    }
    for (const [type, want] of this.wishList()) {
      if (count(type) >= want) continue;
      if (sites.some(s => s.type === type) && type !== 'watch_tower') continue;
      if (tryB(type, () => this.placeFor(type))) return;
      if (KEY[type] && p.canBuild(type) && !afford(type)) { this.saveFor = type; break; }
    }
    // walls, gates, towers and traps
    const walls = this.directive?.walls;
    if (walls !== 'none' && (walls === 'ring' || p.age >= 2 && this.P.aggression < 0.88 || p.age === 1 && this.P.defense > 0.9 && g.time > 400)) this.planWalls();
    if (this.t % 30 === 8 && this.directive?.traps !== false) this.planTraps();
    if (this.t % 20 === 12) this.upgradeWalls();
    // luxuries: a plantation on every free deposit near our towns
    if (p.age >= 2 && p.has('market') && p.count('plantation', false) < 2 + p.age && this.t % 10 === 6) this.plantLux();
  }
  // the home town is being fought over right now
  underSiege() { const g = this.g, p = this.p; return g.time - p.lastAttacked < 25 && this.defense.state === 'defend'; }
  rebuild() {
    const g = this.g, p = this.p;
    if (!this.lostSites.length) { this.rebuildSave = null; return false; }
    if (this.t % 4) return false;
    this.rebuildSave = null;
    const order = t => t === 'town_center' || t === 'castle' || t === 'star_fort' ? 0 : BUILDINGS[t].gate || t === 'wall_tower' ? 1 : BUILDINGS[t].wall ? 2 : t === 'house' ? 3 : BUILDINGS[t].trains ? 4 : 5;
    this.lostSites.sort((a, b) => order(a.type) - order(b.type) || a.t - b.t);
    let placed = 0, walls = 0;
    for (const s of [...this.lostSites]) {
      if (placed >= 2 && walls >= 6) break;
      const B = BUILDINGS[s.type];
      if (g.time - s.t < 15) continue;
      let foes = false; g.grid.query(s.x + B.size / 2, s.y + B.size / 2, 14, e => { if (!foes && !e.dead && g.hostile(p.id, e.owner) && g.military(e)) foes = true; });
      if (foes) continue;
      const drop = () => this.lostSites.splice(this.lostSites.indexOf(s), 1);
      if (s.tries > 6 || g.time - s.t > 2400 || !p.canBuild(s.type)) { drop(); continue; }
      if (!p.canAfford(p.cost(s.type, true))) { if (!B.wall && order(s.type) <= 4 && !this.rebuildSave) this.rebuildSave = s.type; continue; } // wait for the resources, do not give up
      s.tries++;
      if (B.wall ? walls >= 6 : placed >= 2) continue;
      if (!g.map.areaBuildable(s.x, s.y, B.size, B.wall || B.passable || B.coastal ? 0 : 1)) { if (s.tries > 3) drop(); continue; }
      const b = g.startBuilding(p, s.type, s.x, s.y, []);
      if (b) { drop(); if (B.wall) walls++; else { placed++; this.say(`Rebuilding the ${B.name} on its ruins.`); } }
    }
    return placed > 0;
  }
  // total conquest: when a rival has lost its last town, riders hunt down every building and person it has left
  hunt() {
    const g = this.g, p = this.p;
    if (g.setup.defeat === 'capitals') return;
    for (const q of g.players) {
      if (q === p || !q.alive || !q.remnant || g.rel[p.id][q.id] !== 'war') continue;
      if ([...this.armies.values()].some(a => a.kind === 'hunt' && a.targetPid === q.id)) continue;
      const pool = [...this.defense.units].map(id => g.ents.get(id)).filter(u => u && !u.dead && !u.wounded && u.type !== 'general' && u.cls !== 'siege' && !u.naval);
      if (pool.length < 4) return;
      pool.sort((a, b) => (b.cls === 'cavalry') - (a.cls === 'cavalry') || Math.hypot(a.x - q.home.x, a.y - q.home.y) - Math.hypot(b.x - q.home.x, b.y - q.home.y));
      const go = pool.slice(0, Math.min(14, Math.max(4, Math.floor(pool.length * 0.35))));
      const a = this.newArmy('hunt'); a.targetPid = q.id; a.state = 'hunt';
      for (const u of go) { this.defense.units.delete(u.id); a.units.add(u.id); u.army = a.id; }
      a.start = this.strength(go);
      this.say(`Sending ${go.length} hunters after the last of ${q.name}.`);
      g.log(`🏹 ${p.name} sends ${go.length} hunters after the remnants of ${q.name}.`, 'war', [p.id, q.id]);
      return;
    }
  }
  // the nearest thing a hunted nation still owns
  nearestAsset(q, x, y) {
    let best = null, bd = 1e9;
    for (const b of q.blds) { const B = BUILDINGS[b.type]; if (b.dead || B.wall || B.trap) continue; const d = Math.hypot(b.x - x, b.y - y); if (d < bd) { bd = d; best = { x: b.x + b.size / 2, y: b.y + b.size / 2, id: b.id }; } }
    for (const u of q.units) { if (u.dead || u.naval || u.inside) continue; const d = Math.hypot(u.x - x, u.y - y) * 1.1; if (d < bd) { bd = d; best = { x: u.x, y: u.y, id: u.id }; } }
    return best;
  }
  tickHunt(a, units) {
    const g = this.g, q = g.players[a.targetPid];
    if (!q?.alive || !q.remnant) { for (const u of units) { a.units.delete(u.id); this.defense.units.add(u.id); u.army = this.defense.id; const m = this.muster(); u.task = { type: 'amove', x: m.x, y: m.y }; } this.armies.delete(a.id); return; }
    const goal = g.ents.get(a.goal?.id);
    if (!a.goal || !goal || goal.dead || goal.owner !== q.id || g.time - (a.goalT || 0) > 40) {
      a.goal = this.nearestAsset(q, a.center.x, a.center.y); a.goalT = g.time;
      if (!a.goal) return;
    }
    const gx = goal && !goal.dead && goal.kind === 'unit' ? goal.x : a.goal.x, gy = goal && !goal.dead && goal.kind === 'unit' ? goal.y : a.goal.y;
    for (const u of units) if (u.task.type !== 'attack' && (u.task.type === 'idle' || !u.dest || Math.hypot(u.task.x - gx, u.task.y - gy) > 6)) u.task = { type: 'amove', x: gx + (g.R() - 0.5) * 3, y: gy + (g.R() - 0.5) * 3, prefer: 'villager' };
  }
  agePref(list) {
    const P = this.P, w = t => ({ barracks: 1 - P.aggression, mill: 0.2, lumber_camp: 0.3, mining_camp: 0.4, shrine: 1.2 - P.faith,
      market: 1.2 - P.trade, blacksmith: 1.1 - P.aggression, archery_range: 1.1 - (this.mix().ranged || 0), stable: 1.1 - (this.mix().cavalry || 0), temple: 1.3 - P.faith, infirmary: 1.0, council_hall: 1.2 - P.tech * 0.3,
      castle: 1.4 - P.defense * 0.5, siege_workshop: 1.1 - (this.mix().siege || 0) * 2, university: 1.3 - P.tech, hospital: 1.2, cathedral: 1.5 - P.faith }[t] ?? 1);
    return [...list].sort((a, b) => w(a) - w(b));
  }
  wishList() {
    const p = this.p, P = this.P, mix = this.mix(), age = p.age, v = p.units.filter(u => u.cls === 'villager').length;
    const bank = p.res.food + p.res.gold + p.res.wood;
    const prodScale = Math.max(1, Math.round(v / 26 + bank / 4000));
    const W = [];
    // military production first: a realm without soldiers does not survive
    W.push(['barracks', age >= 2 || P.aggression > 0.7 || v >= 18 ? Math.min(5, Math.ceil(prodScale * (mix.infantry + mix.spear) * 1.6)) : 0]);
    if (age >= 2) {
      W.push(['archery_range', mix.ranged > 0.12 ? 1 : 0], ['stable', mix.cavalry > 0.1 ? 1 : 0]);
      W.push(['market', 1], ['council_hall', v > 22 ? 1 : 0], ['blacksmith', 1]);
      W.push(['archery_range', mix.ranged > 0.12 ? Math.min(5, Math.ceil(prodScale * mix.ranged * 2)) : 0]);
      W.push(['stable', mix.cavalry > 0.1 ? Math.min(5, Math.ceil(prodScale * mix.cavalry * 2)) : 0]);
      W.push(['infirmary', v > 30 ? 1 : 0]);
      const provinces = p.blds.filter(b => b.done && b !== p.tc && (b.type === 'town_center' || b.type === 'castle')).length;
      if (provinces || p.corruption > 6) W.push(['courthouse', Math.min(3, 1 + Math.floor(provinces / 2))]);
      if (P.faith > 0.4) W.push(['temple', 1]);
      W.push(['watch_tower', p.has('council_hall') ? Math.round(P.defense * 4 + (p.lastAttacked > this.g.time - 300 ? 2 : 0)) : 1]);
      W.push(['mining_camp', 1], ['lumber_camp', Math.min(3, 1 + Math.floor(v / 40))]);
    }
    if (v > 14 + (1 - P.faith) * 22) W.push(['shrine', 1]); // every people finds a faith, the devout sooner
    if (age >= 3) {
      W.push(['siege_workshop', 1], ['castle', P.defense > 0.6 || P.aggression > 0.5 ? 1 : 0], ['university', P.tech > 0.5 ? 1 : 0], ['hospital', 1]);
      if (P.faith > 0.55) W.push(['cathedral', 1]);
      W.push(['watch_tower', Math.round(P.defense * 6 + 2)]);
      W.push(['monument', 1]);
    }
    if (age >= 4) {
      // a rich realm turns its hoard into more strongholds
      const rich = p.res.food + p.res.wood + p.res.gold > 12000;
      W.push(['castle', rich ? 3 : 1], ['university', 1]);
      if (rich && age >= 5) W.push(['star_fort', 2]);
      W.push(['printing_press', P.tech > 0.5 || p.townRank >= 2 ? 1 : 0], ['bank', P.trade > 0.45 || P.eco > 0.8 ? 1 : 0], ['foundry', P.aggression > 0.45 || P.tech > 0.7 ? 1 : 0]);
      if (age >= 5) W.push(['foundry', 1], ['star_fort', P.defense > 0.45 ? 1 : 0]);
      if (this.g.setup.victory !== 'conquest' && (P.eco > 0.8 || P.defense > 0.85 || this.directive?.wonder) && p.res.stone > 1100 && p.res.gold > 1100 && p.res.wood > 1100) W.push(['wonder', 1]);
    }
    return W.filter(w => w[1] > 0);
  }
  placeFor(type) {
    const h = this.p.home, td = this.p.threatDir, back = { x: -td.x, y: -td.y }, g = this.g;
    switch (type) {
      case 'barracks': case 'archery_range': case 'stable': case 'siege_workshop': return this.findSpot(type, h.x, h.y, 9, 26, td, 0.55) || this.findSpot(type, h.x, h.y, 26, 40);
      case 'castle': return this.findSpot(type, h.x + td.x * 10, h.y + td.y * 10, 0, 10) || this.findSpot(type, h.x, h.y, 8, 34, td, 0.3) || this.findSpot(type, h.x, h.y, 34, 50);
      case 'watch_tower': {
        // the gate side first, then the camps
        const n = this.p.count('watch_tower', false);
        if (n % 3 === 2) { const camp = this.p.blds.find(b => (b.type === 'mining_camp' || b.type === 'lumber_camp') && !this.p.blds.some(t => t.type === 'watch_tower' && Math.hypot(t.x - b.x, t.y - b.y) < 7)); if (camp) return this.findSpot(type, camp.x + 1, camp.y + 1, 2, 5, td, 0.5); }
        const side = (n % 2 ? 1 : -1) * (2 + (n >> 1) * 4), px = -td.y, py = td.x, r = 15 + (n % 3) * 2;
        return this.findSpot(type, h.x + td.x * r + px * side, h.y + td.y * r + py * side, 0, 5);
      }
      case 'shrine': case 'temple': case 'cathedral': case 'hospital': case 'infirmary': return this.findSpot(type, h.x, h.y, 7, 20, back, 0.25) || this.findSpot(type, h.x, h.y, 20, 45);
      case 'market': return this.findSpot(type, h.x, h.y, 10, 26, { x: g.N / 2 - h.x, y: g.N / 2 - h.y }, 0.002) || this.findSpot(type, h.x, h.y, 26, 50);
      case 'mining_camp': { const n = g.nearestNode(this.resLow(), h.x, h.y, 40) || g.nearestNode('gold', h.x, h.y, 60); return n ? this.findSpot(type, n.x, n.y, 2, 5) : null; }
      case 'lumber_camp': { const i = g.map.findTree(h.x + td.x * -8, h.y + td.y * -8, 35); return i >= 0 ? this.findSpot(type, i % g.N, (i / g.N) | 0, 2, 7, null, 0, (x, y) => -g.map.countTrees(x + 1, y + 1, 6) * 0.35) : null; }
      case 'wonder': return this.findSpot(type, h.x, h.y, 10, 26, back, 0.4) || this.findSpot(type, h.x, h.y, 26, 48, back, 0.3);
      case 'star_fort': return this.findSpot(type, h.x + td.x * 12, h.y + td.y * 12, 0, 12) || this.findSpot(type, h.x, h.y, 10, 30);
      case 'courthouse': { const prov = this.p.blds.filter(b => b.done && b !== this.p.tc && (b.type === 'town_center' || b.type === 'castle')).sort((a, b) => (a.loyalty ?? 100) - (b.loyalty ?? 100))[0]; const c = prov || { x: h.x, y: h.y, size: 0 }; return this.findSpot(type, c.x + c.size / 2, c.y + c.size / 2, 5, 18) || this.findSpot(type, h.x, h.y, 8, 30); }
      default: return this.findSpot(type, h.x, h.y, 8, 26) || this.findSpot(type, h.x, h.y, 26, 42);
    }
  }
  resLow() { const p = this.p; return ['gold', 'stone', 'iron'].sort((a, b) => p.res[a] - p.res[b])[0]; }
  // A ring of walls around the town (or the side facing the enemy), with gates toward the enemy and the
  // camps, and towers along it. Castles get their own curtain wall.
  planWalls() {
    const g = this.g, p = this.p, h = p.home;
    const full = this.P.defense * this.jitter > 0.55 || this.directive?.walls === 'ring' || p.age >= 3 && this.P.defense > 0.4;
    const stoneNow = p.has('blacksmith') && p.age >= 2;
    if (!this.wall || g.time - this.wall.t > 900 || (full && !this.wall.full) || (stoneNow && !this.wall.stone)) {
      const R = 24 + Math.round(this.P.defense * 4) + (p.age >= 3 ? 2 : 0), a0 = Math.atan2(p.threatDir.y, p.threatDir.x), tiles = [];
      const span = full ? Math.PI : 1.15, steps = Math.round(R * span * 2 * 1.45);
      for (let k = 0; k <= steps; k++) {
        const a = a0 - span + k / steps * span * 2;
        const x = Math.round(h.x + Math.cos(a) * R), y = Math.round(h.y + Math.sin(a) * R);
        if (tiles.some(t => t.x === x && t.y === y)) continue;
        tiles.push({ x, y, a });
      }
      const dA = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
      tiles.forEach((t, i) => { t.kind = i % 14 === 7 ? 'gate' : i % 9 === 4 ? 'tower' : 'wall'; });
      // a gate straight at the enemy, and one toward each camp so the workers are not walled out
      const gateAt = ang => { let bi = -1, bd = 9; tiles.forEach((t, i) => { const d = dA(t.a, ang); if (d < bd) { bd = d; bi = i; } }); if (bi >= 0 && bd < 0.2) tiles[bi].kind = 'gate'; };
      gateAt(a0);
      for (const b of p.blds) if (b.type === 'mining_camp' || b.type === 'lumber_camp' || b.type === 'mill' || b.type === 'dock' || b.type === 'market') gateAt(Math.atan2(b.y - h.y, b.x - h.x));
      this.wall = { t: g.time, tiles, full, stone: stoneNow };
      this.say(full ? 'Raising a ring of walls around the town.' : 'Raising walls toward the enemy.');
    }
    const stone = p.has('blacksmith') && p.age >= 2;
    const typeOf = k => k === 'gate' ? (stone ? 'stone_gate' : 'palisade_gate') : k === 'tower' && stone && p.canBuild('wall_tower') ? 'wall_tower' : stone ? 'stone_wall' : 'palisade';
    let placed = 0;
    const q = this.castleQ.length ? this.castleQ : this.wall.tiles;
    while (q.length && placed < 6) {
      const t = q.shift(), type = typeOf(t.kind);
      // a tower spot still holding a plain wall segment gets its tower now
      if (type === 'wall_tower' && g.map.inside(t.x, t.y)) { const o = g.ents.get(g.map.occ[g.map.idx(t.x, t.y)]); if (o && o.owner === p.id && o.done && (o.type === 'palisade' || o.type === 'stone_wall') && p.canAfford(p.cost(type, true))) { g.removeBuilding(o, -1, true); if (g.startBuilding(p, type, t.x, t.y, [])) placed++; continue; } }
      if (!p.canBuild(type) || !g.map.areaBuildable(t.x, t.y, 1, 0) || !this.spotLinked(t.x, t.y, 1)) continue;
      if (!p.canAfford(p.cost(type, true))) { q.unshift(t); break; }
      if (g.startBuilding(p, type, t.x, t.y, [])) placed++;
    }
  }
  castleWalls(c) {
    const p = this.p, h = p.home, td = p.threatDir, x0 = c.x - 2, y0 = c.y - 2, x1 = c.x + c.size + 1, y1 = c.y + c.size + 1;
    const mx = (x0 + x1) >> 1, my = (y0 + y1) >> 1;
    const tiles = [];
    for (let x = x0; x <= x1; x++) for (const y of [y0, y1]) tiles.push({ x, y });
    for (let y = y0 + 1; y < y1; y++) for (const x of [x0, x1]) tiles.push({ x, y });
    for (const t of tiles) {
      const corner = (t.x === x0 || t.x === x1) && (t.y === y0 || t.y === y1);
      const homeSide = (t.x === mx && (t.y === (h.y > my ? y1 : y0))) || (t.y === my && (t.x === (h.x > mx ? x1 : x0)));
      const foeSide = (t.x === mx && (t.y === (td.y > 0 ? y1 : y0))) || (t.y === my && (t.x === (td.x > 0 ? x1 : x0)));
      t.kind = corner ? 'tower' : homeSide || foeSide ? 'gate' : 'wall';
    }
    this.castleQ.push(...tiles);
    this.say('Walling the castle: a curtain wall with corner towers.');
  }
  // palisades are rebuilt in stone once the realm is rich
  upgradeWalls() {
    const g = this.g, p = this.p;
    if (p.age < 3 || p.res.stone < 400 || !p.canBuild('stone_wall')) return;
    let n = 0;
    for (const b of [...p.blds]) {
      if (n >= 4 || (b.type !== 'palisade' && b.type !== 'palisade_gate') || !b.done || g.time - b.lastHit < 30) continue;
      const x = b.x, y = b.y, type = b.type === 'palisade' ? 'stone_wall' : 'stone_gate';
      g.removeBuilding(b, -1, true);
      if (g.startBuilding(p, type, x, y, [])) n++;
    }
    if (n) this.say('Rebuilding the palisade in stone.');
  }
  // traps outside the walls, mostly in front of the gates and toward the enemy
  planTraps() {
    const g = this.g, p = this.p, h = p.home, td = p.threatDir;
    const have = p.blds.filter(b => BUILDINGS[b.type].trap).length, budget = Math.round((4 + this.P.defense * 8) + p.age * 3);
    if (have >= budget || p.res.wood < 150) return;
    const R = (this.wall ? 24 + Math.round(this.P.defense * 4) + (p.age >= 3 ? 2 : 0) : 20) + 3;
    const gates = p.blds.filter(b => BUILDINGS[b.type].gate && b.done);
    const cav = this.enemySeen.cavalry / Math.max(1, Object.values(this.enemySeen).reduce((a, b) => a + b, 0));
    const pick = () => p.age >= 3 && g.R() < 0.25 ? 'fire_trench' : cav > 0.3 && g.R() < 0.6 ? 'stakes' : p.age >= 2 ? (g.R() < 0.55 ? 'spike_pit' : 'caltrops') : 'stakes';
    let placed = 0;
    for (let k = 0; k < 12 && placed < 3; k++) {
      let x, y;
      const gt = gates.length && g.R() < 0.65 ? gates[(g.R() * gates.length) | 0] : null;
      if (gt) { const ox = gt.x - h.x, oy = gt.y - h.y, l = Math.hypot(ox, oy) || 1, d = 2 + g.R() * 3; x = Math.round(gt.x + ox / l * d + (g.R() - 0.5) * 3); y = Math.round(gt.y + oy / l * d + (g.R() - 0.5) * 3); }
      else { const a = Math.atan2(td.y, td.x) + (g.R() - 0.5) * 1.6; x = Math.round(h.x + Math.cos(a) * R); y = Math.round(h.y + Math.sin(a) * R); }
      const type = pick();
      if (!p.canBuild(type) || !p.canAfford(p.cost(type, true)) || !g.map.areaBuildable(x, y, 1, 0) || !this.spotLinked(x, y, 1)) continue;
      if (g.startBuilding(p, type, x, y, [])) placed++;
    }
  }
  plantLux() {
    const g = this.g, p = this.p;
    const cores = p.blds.filter(b => b.done && (b.type === 'town_center' || b.type === 'castle'));
    for (const n of g.nodes) {
      if (n.res !== 'lux' || n.dead) continue;
      if (!cores.some(c => Math.hypot(c.x - n.x, c.y - n.y) < 48)) continue;
      if (g.buildings.some(b => b.type === 'plantation' && !b.dead && Math.abs(b.x - n.x) + Math.abs(b.y - n.y) < 6)) continue;
      const spot = this.findSpot('plantation', n.x, n.y, 2, 4); if (!spot || !p.canAfford(p.cost('plantation', true))) return;
      const b = this.build('plantation', spot); if (b) { b.lux = n.id; this.say(`Planting a ${n.good} plantation.`); }
      return;
    }
  }
  reserve() {
    // save resources for the next age when we are almost ready
    const p = this.p, A = AGES[p.age];
    if (!A || p.ageResearching) return {};
    if (!p.ageReady(p.age + 1).ok) return {};
    const vt = [0, 18, 34, 55, 75][p.age];
    if (p.units.filter(u => u.cls === 'villager').length < vt) return {};
    return A.cost;
  }

  // ---------------------------------------------------------------- research
  research() {
    const g = this.g, p = this.p;
    const vills = p.units.filter(u => u.cls === 'villager').length;
    const vt = [0, 18 + (this.posture === 'rush' ? -3 : 0), 34, 55, 75][p.age];
    if (AGES[p.age] && vills >= vt && this.directive?.age_up !== false && g.queueAge(p)) { this.say(`Advancing to the ${AGES[p.age].name}.`); g.decide(p.id, 'age', `advances to the ${AGES[p.age].name} with ${vills} villagers`); return; }
    if (this.t % 3) return;
    const reserve = this.reserve();
    const ok = c => { for (const r in c) if (p.res[r] - (reserve[r] || 0) < c[r] + 50) return false; return true; };
    for (const k of this.directive?.research || []) {
      const T = TECHS[k]; if (!T || !p.canResearch(k) || !p.canAfford(T.cost)) continue;
      const b = p.blds.find(x => x.type === T.building && x.done && x.queue.length < 3);
      if (b && g.queueTech(b, k)) { this.say(`📜 Researching ${T.name} as ordered.`); this.directive.research = this.directive.research.filter(x => x !== k); return; }
    }
    const military = p.units.filter(u => g.military(u)).length;
    const lists = [ECO_TECHS, military > 10 || p.age >= 3 ? MIL_TECHS : [], CIV_TECHS];
    const tech = this.P.tech;
    for (const list of lists) for (const k of list) {
      const T = TECHS[k];
      if (!p.canResearch(k) || !ok(T.cost)) continue;
      if (list === CIV_TECHS && g.R() > tech) continue;
      if (T.upgrade) { const line = T.upgrade[0]; const used = p.units.some(u => UNITS[u.type].line === line); if (!used && T.upgrade[1] > 1) continue; }
      const b = p.blds.find(x => x.type === T.building && x.done && x.queue.length < 2);
      if (b && g.queueTech(b, k)) return;
    }
  }

  // ---------------------------------------------------------------- military production
  produce() {
    const g = this.g, p = this.p;
    if (this.t % 2) return;
    const reserve = this.reserve();
    const mil = p.units.filter(u => g.military(u));
    const cls = { infantry: 0, spear: 0, ranged: 0, cavalry: 0, siege: 0 };
    for (const u of mil) if (cls[u.cls] != null) cls[u.cls] += u.pop;
    const milPop = mil.reduce((a, u) => a + u.pop, 0);
    const vills = p.units.filter(u => u.cls === 'villager').length;
    const room = p.popCap - p.pop;
    if (room <= 0) return;
    // early game: don't starve the economy unless aggressive
    const agg = this.aggression();
    const siege = this.underSiege();
    if (p.age === 1 && vills < 16 + (1 - agg) * 10 && milPop > 2 && !siege) return;
    const milCap = POP_MAX - Math.min(this.villagerTarget(), vills + 10);
    if (milPop >= milCap) return;
    // counters to what we have seen
    const mix = { ...this.mix() };
    const seen = this.enemySeen, st = Object.values(seen).reduce((a, b) => a + b, 0);
    if (st > 8) {
      mix.spear += seen.cavalry / st * 0.5; mix.cavalry += seen.ranged / st * 0.4 + seen.siege / st * 0.4;
      mix.ranged += (seen.infantry + seen.spear) / st * 0.3; mix.infantry += seen.spear / st * 0.3;
    }
    if (p.age < 3) mix.siege = 0; else mix.siege = Math.max(mix.siege, g.time < this.wantSiege ? 0.35 : 0.08);
    const tot = Object.values(mix).reduce((a, b) => a + b, 0);
    // a standing army that grows with time; aggressive minds care less about saving for the next age
    const wantArmy = g.time / 60 * (0.25 + agg * 1.1);
    const kRes = milPop < wantArmy || siege ? 0 : clamp(1.15 - agg, 0.15, 1);
    const vilShort = vills < this.villagerTarget() * 0.7 && !(g.time - p.lastAttacked < 30) && !siege;
    const ok = c => {
      for (const r in c) if (p.res[r] - (reserve[r] || 0) * kRes < c[r]) return false;
      if (vilShort && c.food && p.res.food - c.food < 110) return false; // keep bread for new villagers
      return true;
    };
    let trained = 0;
    const order = Object.keys(mix).sort((a, b) => (cls[a] / Math.max(1, milPop) - mix[a] / tot) - (cls[b] / Math.max(1, milPop) - mix[b] / tot));
    for (const c of order) {
      if (trained >= (siege ? 8 : 3)) break;
      const type = this.unitFor(c);
      if (!type || !p.canTrain(type)) continue;
      const cost = p.cost(type);
      if (!ok(cost)) continue;
      const blds = p.blds.filter(b => b.done && b.type === UNITS[type].building).sort((a, b) => a.queue.length - b.queue.length);
      if (siege) { for (const b of blds) if (b.queue.length < 3 && g.queueUnit(b, type)) trained++; } // every barracks at once
      else if (blds[0] && blds[0].queue.length < 2 && g.queueUnit(blds[0], type)) trained++;
    }
    // support & specials
    if (p.canTrain('general') && p.unitCount('general') + p.queued('general') === 0 && milPop > 18 && ok(p.cost('general'))) { const c = p.blds.find(b => b.type === UNITS.general.building && b.done && b.queue.length < 2); if (c) g.queueUnit(c, 'general'); }
    const healers = p.unitCount('priest') + p.unitCount('medic') + p.queued('priest') + p.queued('medic');
    if (healers < Math.min(8, Math.floor(milPop / 14))) {
      const t = this.P.faith > 0.5 && p.canTrain('priest') ? 'priest' : p.canTrain('medic') ? 'medic' : p.canTrain('priest') ? 'priest' : null;
      if (t && ok(p.cost(t))) { const b = p.blds.find(x => x.done && x.type === UNITS[t].building && x.queue.length < 2); if (b) g.queueUnit(b, t); }
    }
    const carts = p.unitCount('trade_cart') + p.queued('trade_cart');
    if (p.canTrain('trade_cart') && carts < Math.round(this.P.trade * 6 + (p.age - 2) * 2) && ok(p.cost('trade_cart')) && vills > 30) { const m = p.blds.find(b => b.type === 'market' && b.done && b.queue.length < 2); if (m) g.queueUnit(m, 'trade_cart'); }
    if (p.unitCount('scout') + p.queued('scout') === 0 && p.age <= 2 && g.time < 900 && ok({ food: 120 })) { const tc = p.blds.find(b => b.type === 'town_center' && b.done && b.queue.length < 2); if (tc) g.queueUnit(tc, 'scout'); }
  }
  unitFor(c) {
    const p = this.p;
    switch (c) {
      case 'infantry': return p.lineType('sword');
      case 'spear': return p.lineType('spear');
      case 'ranged': if (p.canTrain('musketeer') && this.g.R() < 0.6) return 'musketeer'; return p.age >= 3 && (this.P.mix.cavalry > 0.35 || p.civKey === 'khanate') && this.g.R() < 0.5 ? 'horse_archer' : p.age >= 2 ? p.lineType('archer') : null;
      case 'cavalry': return p.age >= 2 ? p.lineType('cav') : (this.aggression() > 0.75 && p.unitCount('scout') < 4 ? 'scout' : null);
      case 'siege': {
        if (p.age < 3 || !p.has('siege_workshop')) return null;
        const rams = p.unitCount('ram'), man = p.unitCount('mangonel'), tre = p.unitCount('trebuchet'), tow = p.unitCount('siege_tower'), can = p.unitCount('cannon');
        if (this.enemyWalls > 8 && tow * 2 <= rams && tow < 3) return 'siege_tower';
        if (p.canTrain('cannon') && can <= rams + tre) return 'cannon';
        if (p.age >= 4 && tre <= rams) return 'trebuchet'; return rams <= man ? 'ram' : 'mangonel';
      }
    }
    return null;
  }
  onUnit(u, b) {
    const g = this.g;
    if (u.cls === 'villager') return;
    if (u.type === 'trade_cart' || u.type === 'trade_cog') { const d = this.tradeDest(b, u.naval); u.task = d ? { type: 'trade', home: b.id, dest: d, leg: 'out' } : { type: 'idle' }; return; }
    if (u.type === 'scout' || u.naval) return;
    const camp = [...this.armies.values()].find(a => a.state === 'camp');
    if (camp && u.cls === 'siege') { camp.units.add(u.id); u.army = camp.id; camp.start += this.p.st(u.type).power * 0.6; u.task = { type: 'amove', x: camp.center.x, y: camp.center.y }; return; }
    if (u.cls === 'support') { u.task = { type: 'heal', follow: this.defense.id }; return; }
    // reinforce a field army that is already fighting, once the home guard is healthy
    const field = [...this.armies.values()].find(a => a.kind === 'attack' && (a.state === 'march' || a.state === 'assault' || a.state === 'camp'));
    if (field && this.defense.units.size >= 10 + this.P.defense * 12 && u.type !== 'general') {
      field.units.add(u.id); u.army = field.id; field.start += this.p.st(u.type).power * 0.6;
      const c = field.center || this.p.home; u.task = { type: 'amove', x: c.x, y: c.y };
      return;
    }
    this.defense.units.add(u.id); u.army = this.defense.id;
    const m = this.muster(); u.task = { type: 'amove', ...this.near(m, 6) };
  }
  // caravans go to the Bazaar or a friend's market; cogs sail to the farthest friendly harbour on the same sea
  tradeDest(home, naval = false) {
    const g = this.g, p = this.p;
    const friend = q => q === p || g.rel[p.id][q.id] === 'ally' || g.pacts.has(pactKey(p.id, q.id)) && g.rel[p.id][q.id] !== 'war';
    const open = q => q === p || !g.embargo.has(q.id + '>' + p.id) && !g.embargo.has(p.id + '>' + q.id);
    if (naval) {
      const comp = g.map.shoreWater(home.x, home.y, home.size).map(i => g.pfW.comp[i])[0];
      let best = null, bd = 40;
      for (const q of g.players) { if (!q.alive || !friend(q) || !open(q)) continue; for (const b of q.blds) { if (b.type !== 'dock' || !b.done || b === home) continue; if (!g.map.shoreWater(b.x, b.y, b.size).some(i => g.pfW.comp[i] === comp)) continue; const d = Math.hypot(b.x - home.x, b.y - home.y); if (d > bd) { bd = d; best = b; } } }
      return best ? best.id : null;
    }
    let best = g.bazaar, bd = Math.hypot(g.bazaar.x - home.x, g.bazaar.y - home.y);
    for (const q of g.players) { if (q === p || !q.alive || !friend(q) || !open(q)) continue; const m = q.blds.find(b => b.type === 'market' && b.done); if (m) { const d = Math.hypot(m.x - home.x, m.y - home.y); if (d > bd) { bd = d; best = m; } } }
    return best.id;
  }
  onBuilt(b) {
    const g = this.g, p = this.p;
    if (b.type === 'farm') return;
    if (b.type === 'castle' && this.P.aggression < 0.88) this.castleWalls(b);
    if (b.type === 'market') for (const u of p.units) if (u.type === 'trade_cart' && u.task.type !== 'trade') u.task = { type: 'trade', home: b.id, dest: this.tradeDest(b), leg: 'out' };
  }
  near(pt, spread) { const g = this.g; for (let k = 0; k < 6; k++) { const x = pt.x + (g.R() - 0.5) * spread, y = pt.y + (g.R() - 0.5) * spread; if (g.map.passable(x | 0, y | 0) && g.map.lineClear(pt.x, pt.y, x, y)) return { x, y }; } return { x: pt.x, y: pt.y }; }
  muster() { const h = this.p.home, td = this.p.threatDir; return { x: h.x + td.x * 9, y: h.y + td.y * 9 }; }

  // ---------------------------------------------------------------- intelligence
  observeEnemies() {
    const g = this.g, p = this.p, seen = { infantry: 0, spear: 0, ranged: 0, cavalry: 0, siege: 0 };
    for (const u of p.units) {
      if (u.dead || u.inside || (u.id & 3)) continue;
      g.grid.query(u.x, u.y, 8, e => { if (e.owner !== p.id && !e.dead && g.hostile(p.id, e.owner) && seen[e.cls] != null) seen[e.cls] += e.pop; });
    }
    for (const k in seen) this.enemySeen[k] = this.enemySeen[k] * 0.85 + seen[k] * 0.3;
    // what each rival's armies look like, as far as our soldiers and towers can see
    const ids = new Set(), pw = {};
    const look = (x, y, r) => g.grid.query(x, y, r, e => { if (e.owner === p.id || e.dead || ids.has(e.id) || !g.military(e)) return; ids.add(e.id); pw[e.owner] = (pw[e.owner] || 0) + g.players[e.owner].st(e.type).power; });
    for (const u of p.units) if (!u.dead && !u.inside && (g.military(u) || u.type === 'scout')) look(u.x, u.y, 8);
    for (const b of p.blds) if (b.done && BUILDINGS[b.type].attack) look(b.x + b.size / 2, b.y + b.size / 2, 9);
    for (const q of g.players) {
      if (q === p) continue;
      const it = this.intel[q.id], now = pw[q.id] || 0;
      if (now > 0) this.intel[q.id] = { power: Math.max(now, it && g.time - it.at < 120 ? it.power * 0.9 : 0), at: g.time };
    }
  }
  discovered(q) { this.say(`Scouts found ${q.name}'s town (${q.civ.name}).`); }
  scouting() {
    const g = this.g, p = this.p;
    for (const u of p.units) {
      if (u.type !== 'scout' || u.army) continue;
      if (u.task.type === 'move' || u.task.type === 'attack') continue;
      if (!this.scoutPlan || !this.scoutPlan.length) {
        const pts = g.map.starts.map((s, i) => ({ x: s.x, y: s.y, i })).filter(s => s.i !== p.id && !p.knows[s.i]);
        pts.sort((a, b) => Math.hypot(a.x - p.home.x, a.y - p.home.y) - Math.hypot(b.x - p.home.x, b.y - p.home.y));
        this.scoutPlan = pts.length ? pts.map(s => ({ x: s.x + (g.R() - 0.5) * 30, y: s.y + (g.R() - 0.5) * 30 })) : g.sacred.map(s => ({ x: s.x, y: s.y }));
        if (!pts.length) this.scoutPlan.push({ x: g.R() * g.N, y: g.R() * g.N });
      }
      const w = this.scoutPlan.shift();
      if (w) u.task = { type: 'move', x: clamp(w.x, 3, g.N - 4), y: clamp(w.y, 3, g.N - 4), then: { type: 'idle' } };
    }
  }
  strength(units) { let s = 0; for (const u of units) if (!u.dead && !u.wounded) s += this.p.st(u.type).power * (u.hp / u.maxHp * 0.6 + 0.4); return s; }
  // Fog of war: we only know what we have seen (plus a guess at how it has grown). Spies tell the truth.
  enemyPower(q) {
    const g = this.g, p = this.p;
    const towers = p.knows[q.id] || p.mod('spies') ? q.blds.filter(b => (b.type === 'watch_tower' || b.type === 'wall_tower' || b.type === 'castle' || b.type === 'town_center' || b.type === 'star_fort') && b.done).length : 3;
    if (p.mod('spies')) { let s = 0; for (const u of q.units) if (g.military(u)) s += q.st(u.type).power; return s * 0.65 + towers * 8; }
    const it = this.intel[q.id];
    const est = it ? it.power + (g.time - it.at) / 60 * (3 + q.age * 2) : q.score() * 0.05;
    return est * 0.65 + towers * 8;
  }

  // ---------------------------------------------------------------- armies
  operations() {
    const g = this.g, p = this.p;
    // threat at home?
    const threat = this.homeThreat();
    const def = this.defense;
    if (threat) {
      if (g.time - (this.lastThreatSay || 0) > 30) { this.say(`Enemy forces near our town (${Math.round(threat.power)} strength). Defending!`); this.lastThreatSay = g.time; }
      for (const id of def.units) { const u = g.ents.get(id); if (u && !u.dead && u.task.type !== 'attack') u.task = { type: 'amove', x: threat.x, y: threat.y, leash: 25 }; }
      def.state = 'defend'; def.target = threat;
      // call field armies back if overwhelmed
      if (threat.power > this.strength([...def.units].map(id => g.ents.get(id)).filter(Boolean)) * 1.2) for (const a of this.armies.values()) if (a.kind === 'attack' && a.state !== 'retreat' && a.center && Math.hypot(a.center.x - p.home.x, a.center.y - p.home.y) < 90) { a.state = 'retreat'; this.say('Recalling the army to defend the capital!'); }
      this.manWalls(threat);
      if (threat.siege) for (const id of def.units) { const u = g.ents.get(id); if (u && !u.dead && u.cls === 'cavalry' && u.task.type !== 'attack') u.task = { type: 'amove', x: threat.sx, y: threat.sy, prefer: 'siege', leash: 30 }; }
      if (threat.siege && g.time - (this.sallySaid || 0) > 60) { this.sallySaid = g.time; this.say('Sally out! Riders, burn their siege engines!'); }
      // ring the bell when raiders are among the villagers
      if (threat.power > 15 && !this.bellUntil) { this.bellUntil = g.time + 25; this.say('Ringing the town bell!'); g.sound('bell', p.home.x, p.home.y); for (const u of p.units) if (u.cls === 'villager' && !u.inside && Math.hypot(u.x - threat.x, u.y - threat.y) < 16) g.fleeHome(u); }
      if (this.bellUntil) this.bellUntil = Math.max(this.bellUntil, g.time + 12);
    } else if (def.state === 'defend') {
      def.state = 'idle'; const m = this.muster();
      for (const id of def.units) { const u = g.ents.get(id); if (u && !u.dead) u.task = { type: 'amove', ...this.near(m, 8) }; }
    }
    // pull routed/idle units back into the home army
    for (const u of p.units) if (g.military(u) && !u.army && !u.routing && !u.wounded && !u.naval && u.type !== 'scout' && u.task.type === 'idle') { def.units.add(u.id); u.army = def.id; }
    // launch an attack?
    const attacking = [...this.armies.values()].some(a => a.kind === 'attack');
    if (!attacking && !threat && this.directive?.attack !== 'hold') this.considerAttack();
    if (this.t % 9 === 4 && !threat) this.holdProvinces();
    if (this.t % 11 === 5 && !threat) this.escortCaravans();
    if (this.t % 10 === 7) this.hunt();
    if (this.t % 13 === 9) this.offerTribute();
    // raids & sacred sites
    if (this.t % 7 === 1 && !threat) { if (this.directive?.raids !== false) this.considerRaid(); if (this.directive?.sites !== false) this.considerSites(); }
    // rites in battle
    const a = [...this.armies.values()].find(x => x.kind === 'attack' && x.state === 'assault');
    if (a && p.religion && p.faith > RITES.holy_war.faith + 30 && !(p.rites.holy_war > g.time)) p.performRite('holy_war');
  }
  homeThreat() {
    const g = this.g, p = this.p;
    let x = 0, y = 0, n = 0, power = 0, siege = 0, sx = 0, sy = 0;
    const seen = new Set();
    const pts = [p.home, ...p.blds.filter(b => b.done && (b.id % 3 === this.t % 3 || b.type === 'town_center' || b.type === 'castle') && Math.abs(b.x - p.home.x) + Math.abs(b.y - p.home.y) < 60).slice(0, 40).map(b => ({ x: b.x + b.size / 2, y: b.y + b.size / 2 }))];
    for (const pt of pts) g.grid.query(pt.x, pt.y, pt === p.home ? 22 : 10, e => {
      if (seen.has(e.id) || e.dead || e.wounded || e.naval || !g.hostile(p.id, e.owner) || e.cls === 'trade') return;
      seen.add(e.id); x += e.x; y += e.y; n++; power += e.cls === 'villager' ? 0.5 : g.players[e.owner].st(e.type).power;
      if (e.cls === 'siege') { siege++; sx += e.x; sy += e.y; }
    });
    if (!n || (n < 2 && power < 6)) return null;
    return { x: x / n, y: y / n, n, power, siege, sx: siege ? sx / siege : 0, sy: siege ? sy / siege : 0 };
  }
  pickTarget() {
    const g = this.g, p = this.p;
    if (this.directive?.target != null && g.players[this.directive.target]?.alive && g.rel[p.id][this.directive.target] === 'war') return this.directive.target;
    const wonder = g.players.find(q => q !== p && q.alive && q.wonderAt && g.rel[p.id][q.id] !== 'ally');
    if (wonder) { if (g.rel[p.id][wonder.id] !== 'war') g.setRelation(p.id, wonder.id, 'war', `${wonder.name}'s Wonder must fall`); return wonder.id; }
    let best = -1, bs = 1e9;
    const myScore = p.score();
    for (const q of g.players) {
      if (q === p || !q.alive || g.rel[p.id][q.id] !== 'war') continue;
      const d = Math.hypot(q.home.x - p.home.x, q.home.y - p.home.y) / g.N;
      let s = d * 3 + this.enemyPower(q) / Math.max(1, this.strength(p.units.filter(u => g.military(u)))) * 1.2;
      if (p.attackedBy[q.id] > g.time - 300) s -= 0.8 * (1 + this.P.defense); // grudge
      if (q.score() > myScore * 1.3 && g.players.filter(z => z.alive).length > 2) s -= 0.5; // stop the leader
      if (q.capitalLost || !q.blds.some(b => b.type === 'town_center')) s -= 0.6; // finish the wounded
      if (q.rebel) s += q.parent === p.id ? -0.8 : 1.5; // crush our own rebels, leave others' alone
      if (this.P.aggression > 0.85) s = d * 4; // reckless: nearest
      if (s < bs) { bs = s; best = q.id; }
    }
    return best;
  }
  considerAttack() {
    const g = this.g, p = this.p;
    const agg = this.aggression();
    const first = (this.directive?.posture === 'all_in' ? 0 : this.P.firstAttack) * (1.4 - agg * 0.6) * this.jitter;
    const rest = (90 + (1 - agg) * 150) / (g.time > 2400 ? 2 : 1);
    const wonderRace = g.players.some(q => q !== p && q.alive && q.wonderAt);
    const forced = g.time < this.forceAttackUntil && g.time >= g.peaceUntil;
    if (!wonderRace && !forced && (g.time < Math.max(first, g.peaceUntil) || g.time - this.lastAttackEnd < rest)) return;
    const def = [...this.defense.units].map(id => g.ents.get(id)).filter(u => u && !u.dead && !u.wounded);
    if (def.length < (forced ? 6 : 8)) return;
    const tid = this.pickTarget(); if (tid < 0) return;
    const q = g.players[tid];
    this.enemyWalls = q.blds.filter(b => BUILDINGS[b.type].wall && Math.abs(b.x - q.home.x) + Math.abs(b.y - q.home.y) < 45).length;
    const mine = this.strength(def);
    let ratio = this.P.attackRatio * (this.posture === 'boom' ? 1.3 : this.posture === 'rush' ? 0.85 : this.posture === 'turtle' ? 1.8 : 1);
    if (this.posture === 'all_in') ratio = 0.5;
    const milPop = def.reduce((a, u) => a + u.pop, 0);
    const maxed = p.pop >= Math.min(p.popCap, POP_MAX) - 12 && milPop > 50;
    if (maxed) ratio = Math.min(ratio, 0.6);
    ratio /= 1 + Math.min(0.9, g.time / 3200); // wars grow bolder as the ages pass
    if (mine < this.enemyPower(q) * ratio * 0.85 && !maxed && !wonderRace && !forced) return;
    if (forced) this.forceAttackUntil = 0;
    // form the host, keeping a home guard
    const keep = Math.round(def.length * clamp(0.45 - agg * 0.35 + this.P.defense * 0.15, 0.08, 0.5) * (g.time > 2400 ? 0.5 : 1));
    def.sort((a, b) => Math.hypot(a.x - p.home.x, a.y - p.home.y) - Math.hypot(b.x - p.home.x, b.y - p.home.y));
    const go = def.slice(keep);
    if (go.length < 6) return;
    const army = this.newArmy('attack');
    for (const u of go) { this.defense.units.delete(u.id); army.units.add(u.id); u.army = army.id; }
    for (const u of p.units) if (u.cls === 'support' && u.task.type === 'heal' && !u.task.follow2 && g.R() < 0.6) u.task = { type: 'heal', follow: army.id, follow2: true };
    const gen = p.units.find(u => u.type === 'general'); if (gen) { this.defense.units.delete(gen.id); army.units.add(gen.id); gen.army = army.id; }
    army.targetPid = tid; army.start = this.strength(go);
    army.campaign = { t0: g.time, target: tid, soldiers: go.length, start: Math.round(army.start) };
    (p.stats.campaigns ||= []).push(army.campaign);
    g.decide(p.id, 'attack', `attacks ${q.name} with ${go.length} soldiers (${Math.round(army.start)} vs est. ${Math.round(this.enemyPower(q))})`, 'auto', { campaign: army.campaign });
    this.planMarch(army, q.home.x, q.home.y);
    this.target = tid;
    const pw = this.enemyPower(q);
    this.say(`Marching ${go.length} soldiers on ${q.name} (our ${Math.round(army.start)} vs est. ${Math.round(pw)}).`);
    g.log(`⚔ ${p.name} marches ${go.length} soldiers against ${q.name}!`, 'war', [p.id, tid], army.center?.x, army.center?.y);
    if (army.center) g.sound('horn', army.center.x, army.center.y);
    if (g.R() < 0.5) this.taunt(q);
  }
  taunt(q) { const t = this.P.taunts; if (t?.length) { const m = t[(this.g.R() * t.length) | 0]; this.g.talk(this.p.id, m, q.id); this.g.log(`💬 ${this.p.name} → ${q.name}: "${m}"`, 'chat', [this.p.id, q.id]); } }
  tauntOld(q) { const t = this.P.taunts; if (t?.length) this.g.log(`💬 ${this.p.name} → ${q.name}: "${t[(this.g.R() * t.length) | 0]}"`, 'chat', [this.p.id, q.id]); }
  planMarch(army, tx, ty) {
    const g = this.g, units = [...army.units].map(id => g.ents.get(id)).filter(u => u && !u.dead);
    if (!units.length) return false;
    let cx = 0, cy = 0; for (const u of units) { cx += u.x; cy += u.y; } cx /= units.length; cy /= units.length;
    army.center = { x: cx, y: cy };
    // start from real soldiers near the middle (the average point may sit inside a wood)
    // prefer soldiers standing in the same connected region as the target
    const N = g.N, comps = new Set();
    for (let y = (ty | 0) - 8; y <= (ty | 0) + 8; y++) for (let x = (tx | 0) - 8; x <= (tx | 0) + 8; x++) if (g.map.passable(x, y)) comps.add(g.pf.comp[y * N + x]);
    const linked = u => comps.has(g.pf.comp[(u.y | 0) * N + (u.x | 0)]);
    const starts = units.filter(u => g.map.passable(u.x | 0, u.y | 0)).sort((a, b) => (linked(b) - linked(a)) || Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy)).slice(0, 3);
    let pts = null;
    for (const s of starts) {
      const res = g.pf.find(s.x, s.y, { x0: tx | 0, y0: ty | 0, x1: tx | 0, y1: ty | 0 }, 8, 320000, 1.35);
      if (res.pts.length && (res.ok || !pts || res.pts.length > pts.length)) pts = res.pts;
      if (res.ok) break;
    }
    if (!pts || !pts.length) { army.state = 'retreat'; this.say('No route to the enemy; the army stands down.'); return false; }
    const wps = []; let acc = 0, last = { x: cx, y: cy };
    for (const pt of pts) { acc += Math.hypot(pt.x - last.x, pt.y - last.y); last = pt; if (acc >= 11) { wps.push(pt); acc = 0; } }
    wps.push(pts[pts.length - 1]);
    // stop short of the town to regroup, then assault
    army.wps = wps; army.wi = 0; army.stageAt = Math.max(0, wps.length - 3); army.state = 'march'; army.goal = { x: tx, y: ty }; army.wpT = g.time;
    this.formUp(army, units);
    return true;
  }
  formUp(army, units) {
    const g = this.g;
    const wp = army.wps[army.wi]; if (!wp) return;
    const from = army.center || wp;
    let fx = wp.x - from.x, fy = wp.y - from.y; const l = Math.hypot(fx, fy) || 1; fx /= l; fy /= l;
    const rx = -fy, ry = fx;
    const rank = u => u.cls === 'infantry' || u.cls === 'spear' ? 0 : u.cls === 'cavalry' ? 1 : u.cls === 'ranged' ? 2 : 3;
    const sorted = units.filter(u => !u.dead && !u.routing && !u.wounded).sort((a, b) => rank(a) - rank(b));
    const cols = Math.max(4, Math.ceil(Math.sqrt(sorted.length) * 1.7));
    sorted.forEach((u, i) => {
      const row = Math.floor(i / cols), col = i % cols - (cols - 1) / 2;
      const sp = u.cls === 'cavalry' || u.cls === 'siege' ? 1.3 : 1.0;
      let x = wp.x + rx * col * sp - fx * row * 1.1, y = wp.y + ry * col * sp - fy * row * 1.1;
      // a slot behind trees or water would send the soldier on a long detour: fall back near the waypoint
      if (!g.map.passable(x | 0, y | 0) || !g.map.lineClear(wp.x, wp.y, x, y)) { x = wp.x + (g.R() - 0.5) * 2; y = wp.y + (g.R() - 0.5) * 2; if (!g.map.passable(x | 0, y | 0)) { x = wp.x; y = wp.y; } }
      if (u.task.type === 'attack') { u.task.then = { type: 'amove', x, y }; return; }
      u.task = { type: 'amove', x, y, prefer: army.kind === 'raid' ? 'villager' : undefined };
      if (u.cls === 'siege' && army.state === 'assault') u.task = { type: 'amove', x, y };
    });
  }
  tickArmies() {
    const g = this.g, p = this.p;
    for (const a of this.armies.values()) {
      const units = [];
      for (const id of a.units) { const u = g.ents.get(id); if (u && !u.dead && !u.wounded && u.army === a.id) units.push(u); else a.units.delete(id); }
      if (!units.length) { if (a.kind !== 'defense') { this.armies.delete(a.id); if (a.campaign && !a.campaign.result) { a.campaign.result = 'destroyed'; a.campaign.t1 = g.time; a.campaign.ratio = 0; } if (a.kind === 'attack') { this.lastAttackEnd = g.time; this.say('Our field army has been destroyed.'); } } continue; }
      let cx = 0, cy = 0, mor = 0; for (const u of units) { cx += u.x; cy += u.y; mor += u.morale; }
      a.center = { x: cx / units.length, y: cy / units.length }; a.morale = mor / units.length;
      a.strength = this.strength(units);
      if (a.kind === 'defense') continue;
      const target = g.players[a.targetPid];
      // retreat conditions
      const late = g.time > 2100; // long wars harden armies: they fight on longer before breaking
      if (a.kind === 'province') { this.tickProvince(a, units); continue; }
      if (a.kind === 'escort' && a.state !== 'retreat') continue;
      if (a.kind === 'hunt') { this.tickHunt(a, units); continue; }
      if (a.state !== 'retreat' && (a.strength < a.start * (late ? 0.2 : 0.33) || a.morale < (late ? 16 : 28) || !target?.alive && a.kind !== 'site')) {
        if (!target?.alive && a.kind === 'attack' && a.campaign && !a.campaign.result) { a.campaign.result = 'victory'; a.campaign.ratio = a.strength / Math.max(1, a.start); a.campaign.t1 = g.time; }
        if (!target?.alive && a.kind === 'attack') { const nt = this.pickTarget(); if (nt >= 0 && a.strength > a.start * 0.6) { a.targetPid = nt; this.say(`${target?.name || 'The enemy'} has fallen. Onward to ${g.players[nt].name}!`); this.planMarch(a, g.players[nt].home.x, g.players[nt].home.y); continue; } }
        a.state = 'retreat'; this.say(a.kind === 'raid' ? 'Raiders withdraw.' : `Retreat! The army is broken (${Math.round(a.strength)}/${Math.round(a.start)}).`);
        if (a.campaign && !a.campaign.result) { a.campaign.result = target?.alive ? 'retreat' : 'victory'; a.campaign.ratio = a.strength / Math.max(1, a.start); a.campaign.t1 = g.time; }
        if (a.kind === 'attack') g.log(`🏳 ${p.name}'s army retreats from ${target?.name || 'the field'}.`, 'war', [p.id, a.targetPid], a.center.x, a.center.y);
        for (const u of units) u.task = { type: 'move', x: p.home.x + (g.R() - 0.5) * 10, y: p.home.y + (g.R() - 0.5) * 10, force: true };
      }
      if (a.state === 'retreat') {
        if (Math.hypot(a.center.x - p.home.x, a.center.y - p.home.y) < 18 || g.time - a.born > 1200) {
          for (const u of units) { this.defense.units.add(u.id); u.army = this.defense.id; u.task = { type: 'idle' }; }
          this.armies.delete(a.id); this.lastAttackEnd = g.time;
        } else for (const u of units) if (u.task.type !== 'move') u.task = { type: 'move', x: p.home.x + (g.R() - 0.5) * 10, y: p.home.y + (g.R() - 0.5) * 10, force: true };
        continue;
      }
      if (a.kind === 'site') { this.tickSite(a, units); continue; }
      if (a.state === 'march') {
        const wp = a.wps[a.wi];
        const near = units.filter(u => Math.hypot(u.x - wp.x, u.y - wp.y) < 8).length;
        const fighting = units.filter(u => u.task.type === 'attack').length;
        if (fighting > units.length * 0.3) { a.wpT = g.time; this.flank(a, units); continue; } // battle in progress: hold the line
        if (near >= units.length * 0.6 || g.time - a.wpT > 30) {
          a.wi++; a.wpT = g.time;
          if (a.wi >= a.wps.length || a.wi > a.stageAt) {
            const far = Math.hypot(a.center.x - a.goal.x, a.center.y - a.goal.y) > 45;
            if (far && a.kind !== 'raid') { a.replans = (a.replans || 0) + 1; if (a.replans > 4) { a.state = 'retreat'; this.say('The march is lost; the army turns home.'); } else this.planMarch(a, a.goal.x, a.goal.y); }
            else if (a.kind === 'raid' && a.ambush) { a.state = 'ambush'; a.until = g.time + 150; this.say('The riders lie in wait for enemy caravans.'); }
            else if (!a.camped && a.kind === 'attack' && this.wallsNear(target, a.center) > 8 && units.filter(u => u.cls === 'siege').length < 2 && p.has('siege_workshop')) {
              a.camped = true; a.state = 'camp'; a.campUntil = g.time + 80; this.wantSiege = g.time + 90;
              g.fx.push({ kind: 'camp', x: a.center.x, y: a.center.y, owner: p.id, t0: g.time, life: 100 });
              this.say(`${target.name} hides behind walls. We make a siege camp and wait for the engines.`);
              g.log(`⛺ ${p.name} besieges ${target.name}: a siege camp rises outside the walls.`, 'war', [p.id, target.id], a.center.x, a.center.y);
              g.decide(p.id, 'siege', `lays siege to ${target.name} and waits for engines`);
            }
            else { a.state = 'assault'; a.assaultT = 0; this.say(`Assaulting ${target.name}!`); g.sound('horn', a.center.x, a.center.y); g.log(`⚔ ${p.name} storms ${target.name}'s town!`, 'war', [p.id, target.id], a.center.x, a.center.y); }
          }
          else this.formUp(a, units);
        }
      }
      if (a.state === 'camp') {
        if (g.time > a.campUntil || units.filter(u => u.cls === 'siege').length >= 2) { a.state = 'assault'; a.assaultT = 0; this.say(`The siege engines are ready. Storm ${target.name}!`); g.log(`⚔ ${p.name} storms ${target.name}'s walls!`, 'war', [p.id, target.id], a.center.x, a.center.y); g.sound('horn', a.center.x, a.center.y); }
        else for (const u of units) if (u.task.type === 'idle' && Math.hypot(u.x - a.center.x, u.y - a.center.y) > 7) u.task = { type: 'amove', ...this.near(a.center, 6) };
        continue;
      }
      if (a.state === 'ambush') {
        if (g.time > a.until) { a.state = 'retreat'; continue; }
        const bz = g.bazaar;
        for (const u of units) if (u.task.type === 'idle') u.task = { type: 'amove', x: bz.x + 2.5 + (g.R() - 0.5) * 22, y: bz.y + 2.5 + (g.R() - 0.5) * 22, prefer: 'trade', leash: 14 };
        continue;
      }
      if (a.state === 'assault') {
        a.assaultT -= 0.5;
        if ((this.t + a.id) % 4 === 0) this.flank(a, units);
        if (a.assaultT <= 0) {
          a.assaultT = 4;
          const tgt = this.assaultTarget(a, target);
          if (!tgt) { if (target?.alive && g.setup.defeat !== 'capitals' && target.units.some(u => !u.dead && !u.naval)) { a.kind = 'hunt'; a.state = 'hunt'; this.say(`Nothing of ${target.name} is left standing. Hunt down the survivors!`); } else a.state = 'retreat'; continue; }
          if (Math.hypot(a.center.x - tgt.x, a.center.y - tgt.y) > 40) { this.planMarch(a, tgt.x + tgt.size / 2, tgt.y + tgt.size / 2); a.stageAt = a.wps?.length || 0; continue; }
          // siege engines go for the heart of the town
          let siegeCore = null, sd = 45;
          for (const b of target.blds) if (!b.dead && (b.type === 'town_center' || b.type === 'castle' || b.type === 'wonder' || b.type === 'watch_tower')) { const d = Math.hypot(b.x - a.center.x, b.y - a.center.y) * (b.type === 'watch_tower' ? 1.4 : 1); if (d < sd) { sd = d; siegeCore = b; } }
          for (const u of units) {
            if (u.task.type === 'attack' && g.ents.get(u.task.id)?.kind === 'unit') continue;
            if (Math.hypot(u.x - a.center.x, u.y - a.center.y) > 40) { u.task = { type: 'amove', ...this.near(a.center, 4) }; continue; }
            const st = p.st(u.type);
            if (UNITS[u.type].wallOnly) { if (u.docked) continue; const w = this.nearestWall(target, u); if (w) u.task = { type: 'attack', id: w.id, then: { type: 'idle' } }; continue; }
            if (st.bldOnly || u.cls === 'siege') { const core = siegeCore || tgt; u.task = { type: 'attack', id: core.id, then: { type: 'amove', x: core.x + core.size / 2, y: core.y + core.size / 2 } }; }
            else u.task = { type: 'amove', x: tgt.x + tgt.size / 2 + (g.R() - 0.5) * 4, y: tgt.y + tgt.size / 2 + (g.R() - 0.5) * 4, prefer: a.kind === 'raid' ? 'villager' : undefined };
          }
        }
      }
    }
  }
  assaultTarget(a, q) {
    if (!q) return null;
    let best = null, bs = 1e9;
    const isRaid = a.kind === 'raid';
    for (const b of q.blds) {
      if (b.dead) continue;
      const d = Math.hypot(b.x - a.center.x, b.y - a.center.y);
      if (isRaid && d > 45) continue;
      let s = d;
      if (isRaid) s *= b.type === 'mining_camp' || b.type === 'lumber_camp' || b.type === 'mill' || b.type === 'farm' ? 0.4 : 3;
      else {
        const f = this.directive?.focus;
        if (f === 'economy' && (b.type === 'farm' || b.type === 'mill' || b.type === 'lumber_camp' || b.type === 'mining_camp' || b.type === 'market')) s *= 0.4;
        if (f === 'military' && (b.type === 'barracks' || b.type === 'archery_range' || b.type === 'stable' || b.type === 'siege_workshop' || b.type === 'watch_tower')) s *= 0.4;
        if (f === 'capital' && (b.type === 'town_center' || b.type === 'castle')) s *= 0.5;
        if (b.type === 'town_center' || b.type === 'castle') s *= a.strength > a.start * 0.6 ? 0.45 : 0.75;
        if (b.type === 'watch_tower') s *= 0.6;
        if (b.type === 'wonder') s *= 0.3; // a rising Wonder is everyone's first target
        if (b.type === 'stone_wall' || b.type === 'palisade') s *= 3;
        if (b.type === 'barracks' || b.type === 'archery_range' || b.type === 'stable') s *= 0.85;
      }
      if (s < bs) { bs = s; best = b; }
    }
    return best;
  }
  considerRaid() {
    const g = this.g, p = this.p;
    if ([...this.armies.values()].some(a => a.kind === 'raid')) return;
    if (this.P.mix.cavalry < 0.25 && this.aggression() < 0.75) return;
    if (g.time < Math.max(500, g.peaceUntil)) return;
    const cav = [...this.defense.units].map(id => g.ents.get(id)).filter(u => u && !u.dead && u.cls === 'cavalry' && u.type !== 'general' && u.hp > u.maxHp * 0.7);
    if (cav.length < 5) return;
    const tid = this.pickTarget(); if (tid < 0) return;
    const go = cav.slice(0, Math.min(12, cav.length - 1));
    const a = this.newArmy('raid'); a.targetPid = tid;
    for (const u of go) { this.defense.units.delete(u.id); a.units.add(u.id); u.army = a.id; }
    a.start = this.strength(go);
    const q = g.players[tid];
    if (q.units.some(u => u.type === 'trade_cart') && g.R() < 0.4) {
      a.ambush = true; const bz = g.bazaar;
      if (this.planMarch(a, bz.x + 2.5, bz.y + 2.5)) a.stageAt = a.wps.length;
      this.say(`Sending ${go.length} riders to ambush ${q.name}'s caravans near the Bazaar.`); return;
    }
    const camp = q.blds.find(b => b.type === 'mining_camp' || b.type === 'lumber_camp') || q.blds[0];
    if (!camp) return;
    if (this.planMarch(a, camp.x, camp.y)) a.stageAt = a.wps.length; // raids go straight in
    this.say(`Sending ${go.length} riders to raid ${q.name}'s workers.`);
    g.decide(p.id, 'raid', `raids ${q.name} with ${go.length} riders`);
  }
  // cavalry swings around the side of the enemy line and hits its archers from behind
  flank(a, units) {
    const g = this.g, p = this.p;
    if (g.time - (a.flankT || 0) < 8) return; a.flankT = g.time;
    let ex = 0, ey = 0, n = 0;
    g.grid.query(a.center.x, a.center.y, 14, e => { if (!e.dead && !e.inside && !e.naval && g.hostile(p.id, e.owner) && g.military(e)) { ex += e.x; ey += e.y; n++; } });
    if (n < 6) return; ex /= n; ey /= n;
    let dx = ex - a.center.x, dy = ey - a.center.y; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const cav = units.filter(u => u.cls === 'cavalry' && u.type !== 'general' && u.task.type !== 'attack');
    if (cav.length < 3) return;
    cav.forEach((u, i) => { const side = i % 2 ? 1 : -1, x = ex - dy * side * 7 + dx * 4, y = ey + dx * side * 7 + dy * 4; if (g.map.passable(x | 0, y | 0)) u.task = { type: 'amove', x, y, prefer: 'ranged' }; });
    if (g.time - (this.flankSaid || 0) > 90) { this.flankSaid = g.time; this.say(`${cav.length} riders sweep around the enemy flanks.`); }
  }
  // archers climb the walls on the side the enemy comes from
  manWalls(threat) {
    const g = this.g, p = this.p, h = p.home;
    const archers = [...this.defense.units].map(id => g.ents.get(id)).filter(u => u && !u.dead && u.cls === 'ranged' && u.task.type !== 'attack' && !u.onWall);
    if (!archers.length) return;
    const slots = [];
    for (const b of p.blds) {
      if (!b.done || !BUILDINGS[b.type].wall || BUILDINGS[b.type].gate || Math.hypot(b.x - threat.x, b.y - threat.y) > 26) continue;
      const ix = Math.sign(h.x - b.x), iy = Math.sign(h.y - b.y);
      for (const [dx, dy] of [[ix, iy], [ix, 0], [0, iy]]) { const x = b.x + dx, y = b.y + dy; if ((dx || dy) && g.map.passable(x, y)) { slots.push({ x: x + 0.5, y: y + 0.5 }); break; } }
      if (slots.length > 24) break;
    }
    if (!slots.length) return;
    for (const u of archers) {
      let bi = -1, bd = 1e9; slots.forEach((s, i) => { if (s.used) return; const d = Math.hypot(s.x - u.x, s.y - u.y); if (d < bd) { bd = d; bi = i; } });
      if (bi < 0) break;
      slots[bi].used = true; u.task = { type: 'amove', x: slots[bi].x, y: slots[bi].y, leash: 6 };
    }
    if (g.time - (this.wallSaid || 0) > 60) { this.wallSaid = g.time; this.say('Archers to the walls!'); }
  }
  wallsNear(q, pt) { let n = 0; for (const b of q.blds) if (BUILDINGS[b.type].wall && Math.abs(b.x - pt.x) + Math.abs(b.y - pt.y) < 40) n++; return n; }
  nearestWall(q, u) { let best = null, bd = 36; for (const b of q.blds) { const B = BUILDINGS[b.type]; if (!B.wall || B.gate || b.dead || b.breach && b.breach !== u.id) continue; const d = Math.hypot(b.x - u.x, b.y - u.y); if (d < bd) { bd = d; best = b; } } return best; }
  // riders guard the caravan road after carts have been lost
  escortCaravans() {
    const g = this.g, p = this.p;
    const esc = [...this.armies.values()].find(a => a.kind === 'escort');
    if (esc) {
      if (g.time - esc.born > 420) { esc.state = 'retreat'; return; }
      const carts = p.units.filter(u => u.type === 'trade_cart' && !u.dead);
      if (!carts.length) { esc.state = 'retreat'; return; }
      for (const id of esc.units) { const u = g.ents.get(id); if (!u || u.task.type === 'attack') continue; const c = carts[(id + this.t) % carts.length]; u.task = { type: 'amove', x: c.x + (g.R() - 0.5) * 3, y: c.y + (g.R() - 0.5) * 3, prefer: 'cavalry', leash: 12 }; }
      return;
    }
    if (!(p.lastCartLost > g.time - 300)) return;
    const cav = [...this.defense.units].map(id => g.ents.get(id)).filter(u => u && !u.dead && u.cls === 'cavalry' && u.type !== 'general');
    if (cav.length < 5) return;
    const a = this.newArmy('escort'); a.targetPid = -1; a.state = 'hold';
    for (const u of cav.slice(0, 4)) { this.defense.units.delete(u.id); a.units.add(u.id); u.army = a.id; }
    a.start = this.strength(cav.slice(0, 4));
    this.say('Caravans were lost on the road. Riders will escort them.');
  }
  // a nation about to be overrun offers gold for peace
  offerTribute() {
    const g = this.g, p = this.p;
    if (p.res.gold < 250 || g.setup.teams) return;
    for (const br of g.brains) {
      if (br === this || !br.p.alive) continue;
      const a = [...br.armies.values()].find(x => x.kind === 'attack' && x.targetPid === p.id && (x.state === 'march' || x.state === 'assault' || x.state === 'camp'));
      if (!a || g.time - (this.lastTribute[br.p.id] || -1e9) < 480) continue;
      const mine = this.strength(p.units.filter(u => g.military(u)));
      if (mine > a.strength * 0.6) continue;
      this.lastTribute[br.p.id] = g.time;
      const amt = Math.round(Math.min(600, Math.max(200, p.res.gold * 0.45)));
      if (g.R() < 1 - br.P.aggression * 0.6) {
        p.res.gold -= amt; br.p.res.gold += amt; br.lastTribute[p.id] = g.time;
        g.setRelation(p.id, br.p.id, 'peace', `${p.name} buys peace`); (this.peaceAt ||= {})[br.p.id] = g.time; (br.peaceAt ||= {})[p.id] = g.time;
        for (const x of br.armies.values()) if (x.kind !== 'defense' && x.targetPid === p.id) x.state = 'retreat';
        g.log(`💰 ${p.name} pays ${br.p.name} ${amt} gold in tribute, and the armies turn back.`, 'diplo', [p.id, br.p.id]);
        p.stats.tributes = (p.stats.tributes || 0) + 1; br.p.stats.tributes = (br.p.stats.tributes || 0) + 1; g.decide(p.id, 'diplomacy', `buys peace from ${br.p.name} for ${amt} gold`);
      } else g.log(`✉ ${br.p.name} spurns ${p.name}'s offer of ${amt} gold. The siege goes on.`, 'diplo', [p.id, br.p.id]);
      return;
    }
  }
  demandTribute(q) {
    const g = this.g, p = this.p, other = g.brains[q.id];
    if (g.time - (this.lastTribute[q.id] || -1e9) < 600) return;
    this.lastTribute[q.id] = g.time;
    const amt = Math.round(Math.min(600, Math.max(150, q.res.gold * 0.4)));
    const theirs = other.strength(q.units.filter(u => g.military(u))), mine = this.strength(p.units.filter(u => g.military(u)));
    if (q.res.gold >= amt && theirs < mine * 0.5 && !other.directive?.refuse?.includes(p.id)) {
      q.res.gold -= amt; p.res.gold += amt;
      if (g.rel[p.id][q.id] === 'war') { g.setRelation(p.id, q.id, 'peace', 'tribute paid'); (this.peaceAt ||= {})[q.id] = g.time; (other.peaceAt ||= {})[p.id] = g.time; }
      g.log(`💰 ${q.name} bows to ${p.name}'s demand and pays ${amt} gold in tribute.`, 'diplo', [p.id, q.id]);
      p.stats.tributes = (p.stats.tributes || 0) + 1; g.decide(p.id, 'diplomacy', `extorts ${amt} gold from ${q.name}`);
    } else {
      if (g.rel[p.id][q.id] !== 'war') g.setRelation(p.id, q.id, 'war', `${q.name} refused tribute`);
      g.log(`✉ ${q.name} refuses to pay ${p.name} tribute.`, 'diplo', [p.id, q.id]);
    }
  }
  // decrees chosen for the moment: calm the streets, hold the provinces, feed the war machine, enrich the merchants
  chooseLaws() {
    const g = this.g, p = this.p, P = this.P;
    let want = [];
    if (this.directive?.laws) want = this.directive.laws.filter(k => LAWS[k]);
    else {
      const restless = p.blds.some(b => b.loyalty != null && b.loyalty < 50 && b !== p.tc);
      if (p.unrest > 45 || p.happiness < 35) want.push(p.res.food > 900 ? 'public_feasts' : 'curfew');
      if (restless) want.push('martial_law');
      if (P.aggression > 0.7 || g.time - p.lastAttacked < 120 && P.aggression > 0.45) want.push('conscription');
      if (P.trade > 0.65 && p.has('market')) want.push('free_markets');
      if (p.townRank >= 1 && p.stats.tolls > 30) want.push('road_tax');
      if (P.faith < 0.45 && p.happiness < 55) want.push('tolerance');
      if (p.happiness > 70 && p.res.food > 1500) want.push('public_feasts');
    }
    want = [...new Set(want)].slice(0, p.maxLaws());
    // a decree stands at least five minutes before it is reconsidered
    if (!this.directive?.laws && g.time - p.lawChangedAt < 300) return;
    for (const k of p.laws) if (!want.includes(k)) { if (p.setLaw(k, false)) this.say(`Repealing ${LAWS[k].name}.`); return; }
    for (const k of want) if (!p.laws.has(k)) { if (p.setLaw(k, true)) this.say(`Decreeing ${LAWS[k].name}: ${LAWS[k].desc}`); return; }
  }
  // bad governors are dismissed before their province slips away
  reviewGovernors() {
    const g = this.g, p = this.p;
    for (const b of p.blds) {
      const gv = b.governor; if (!gv || b.dead) continue;
      const bad = gv.trait === 'greedy' || gv.trait === 'ambitious' || gv.trait === 'zealot' && (b.loyalty ?? 100) < 50;
      if (!bad || g.time - gv.since < 300 || (b.loyalty ?? 100) > 75 && gv.trait !== 'greedy' || p.res.gold < 250) continue;
      p.res.gold -= 100;
      const old = gv; g.appoint(b, p);
      g.log(`🏛 ${p.name} dismisses ${old.name} (${GOVERNOR_TRAITS[old.trait].name}) and names ${b.governor.name} (${GOVERNOR_TRAITS[b.governor.trait].name}) governor of ${b.townName || 'the province'}.`, 'civic', [p.id], b.x + 2, b.y + 2);
      return;
    }
  }
  // a rival finished a Wonder: every field army turns on it, and the home guard marches too
  wonderAlarm(q, w) {
    const g = this.g, p = this.p;
    if (g.rel[p.id][q.id] === 'ally' || p.rebel) return;
    if (g.rel[p.id][q.id] !== 'war') g.setRelation(p.id, q.id, 'war', `${q.name}'s Wonder must fall`);
    for (const a of this.armies.values()) if ((a.kind === 'attack' || a.kind === 'raid') && a.state !== 'retreat') { a.targetPid = q.id; a.kind = 'attack'; this.planMarch(a, w.x + 2.5, w.y + 2.5); }
    this.forceAttackUntil = g.time + 400; this.lastAttackEnd = -1e9;
    this.say(`${q.name} has raised a Wonder. All armies march on it!`);
  }
  // a restless far town gets a garrison before it breaks away
  holdProvinces() {
    const g = this.g, p = this.p;
    for (const b of p.blds) {
      if (b.loyalty == null || b.loyalty > 60 || b.dead || b === p.tc) continue;
      if ([...this.armies.values()].some(a => a.kind === 'province' && a.post === b.id)) continue;
      const pool = [...this.defense.units].map(id => g.ents.get(id)).filter(u => u && !u.dead && !u.wounded && u.type !== 'general' && u.cls !== 'siege');
      if (pool.length < 10) return;
      const go = pool.slice(0, Math.min(12, Math.floor(pool.length * 0.3)));
      const a = this.newArmy('province'); a.post = b.id; a.targetPid = -1; a.state = 'hold';
      for (const u of go) { this.defense.units.delete(u.id); a.units.add(u.id); u.army = a.id; u.task = { type: 'amove', x: b.x + b.size / 2 + (g.R() - 0.5) * 6, y: b.y + b.size + 1 + g.R() * 3 }; }
      a.start = this.strength(go);
      this.say(`Sending ${go.length} soldiers to keep order in a restless province (loyalty ${b.loyalty | 0}%).`);
      return;
    }
  }
  tickProvince(a, units) {
    const g = this.g, b = g.ents.get(a.post);
    if (!b || b.dead || b.owner !== this.p.id) { for (const u of units) { a.units.delete(u.id); this.defense.units.add(u.id); u.army = this.defense.id; const m = this.muster(); u.task = { type: 'amove', x: m.x, y: m.y }; } this.armies.delete(a.id); return; }
    for (const u of units) if (u.task.type === 'idle' && Math.hypot(u.x - b.x, u.y - b.y) > 8) u.task = { type: 'amove', x: b.x + b.size / 2 + (g.R() - 0.5) * 6, y: b.y + b.size + 1 + g.R() * 3 };
  }
  considerSites() {
    const g = this.g, p = this.p;
    if ([...this.armies.values()].some(a => a.kind === 'site')) return;
    if (p.age < 2 || this.P.faith < 0.35 && g.R() > 0.4) return;
    const free = g.sacred.filter(s => s.owner !== p.id && (s.owner < 0 || g.rel[p.id][s.owner] === 'war'));
    if (!free.length) return;
    free.sort((a, b) => Math.hypot(a.x - p.home.x, a.y - p.home.y) - Math.hypot(b.x - p.home.x, b.y - p.home.y));
    const s = free[0];
    if (Math.hypot(s.x - p.home.x, s.y - p.home.y) > g.N * 0.5) return;
    const pool = [...this.defense.units].map(id => g.ents.get(id)).filter(u => u && !u.dead && u.type !== 'general' && u.cls !== 'siege');
    if (pool.length < 12) return;
    const go = pool.slice(0, Math.min(8, Math.floor(pool.length * 0.25)));
    const a = this.newArmy('site'); a.site = s.id; a.targetPid = -1;
    for (const u of go) { this.defense.units.delete(u.id); a.units.add(u.id); u.army = a.id; }
    a.start = this.strength(go); a.state = 'hold';
    const pr = p.units.find(u => u.type === 'priest' && u.task.type === 'heal' && !u.task.follow2);
    if (pr) pr.task = { type: 'heal', follow: a.id, follow2: true };
    this.say('Sending a warband to claim a Sacred Site.');
    for (const u of go) u.task = { type: 'amove', x: s.x + (g.R() - 0.5) * 4, y: s.y + (g.R() - 0.5) * 4 };
  }
  tickSite(a, units) {
    const g = this.g, s = g.sacred[a.site];
    if (!s) return;
    if (s.owner === this.p.id && g.time - a.born > 240) { // claimed: leave a few, rest go home
      for (const u of units.slice(3)) { a.units.delete(u.id); this.defense.units.add(u.id); u.army = this.defense.id; const m = this.muster(); u.task = { type: 'amove', x: m.x, y: m.y }; }
    }
    // a warband that cannot find a way to the site gives up
    if (g.time - a.born > 120 && s.owner !== this.p.id && !units.some(u => Math.hypot(u.x - s.x, u.y - s.y) < 10)) { a.state = 'retreat'; this.say('The warband cannot reach the Sacred Site and turns back.'); return; }
    for (const u of units) if (u.task.type === 'idle' && Math.hypot(u.x - s.x, u.y - s.y) > 4) u.task = { type: 'amove', x: s.x + (g.R() - 0.5) * 4, y: s.y + (g.R() - 0.5) * 4 };
  }

  // ---------------------------------------------------------------- navy
  // Find a shore near home on a sea big enough to matter.
  findCoast() {
    const g = this.g, m = g.map, h = this.p.home, N = g.N;
    this.coast = null;
    let best = null, bd = 1e9;
    // the land region of home: a dock must be reachable on foot
    let homeComp = 0; for (let r = 3; r < 10 && !homeComp; r++) for (let k = 0; k < 16 && !homeComp; k++) { const x = (h.x + Math.cos(k / 16 * 6.283) * r) | 0, y = (h.y + Math.sin(k / 16 * 6.283) * r) | 0; if (m.passable(x, y)) homeComp = g.pf.comp[y * N + x]; }
    this.homeComp = homeComp;
    for (let y = Math.max(1, (h.y | 0) - 56); y < Math.min(N - 1, (h.y | 0) + 56); y++) for (let x = Math.max(1, (h.x | 0) - 56); x < Math.min(N - 1, (h.x | 0) + 56); x++) {
      const i = y * N + x; if (m.water[i]) continue;
      const c = g.pfW.comp[i]; if (!c || (g.waterSize.get(c) || 0) < 500) continue;
      const d = Math.hypot(x - h.x, y - h.y); if (d < 16 || d > 56) continue;
      // a land neighbour where a dock could stand, on our side of any river
      let land = false; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const lx = x + dx * 2, ly = y + dy * 2; if (m.buildable(lx, ly) && (!homeComp || g.pf.comp[ly * N + lx] === homeComp)) land = true; }
      if (land && d < bd) { bd = d; best = { x, y, comp: c }; }
    }
    if (!best) return;
    this.coast = best;
    let fish = 0; for (const n of g.nodes) if (n.fish && Math.hypot(n.x - best.x, n.y - best.y) < 30 && g.pfW.comp[n.y * N + n.x] === best.comp) fish++;
    this.fishNear = fish;
  }
  dockSpot() {
    const g = this.g, m = g.map, c = this.coast, h = this.p.home;
    let best = null, bs = 1e9;
    for (let y = c.y - 9; y <= c.y + 9; y++) for (let x = c.x - 9; x <= c.x + 9; x++) {
      if (!m.areaBuildable(x, y, 3, 0)) continue;
      const shore = m.shoreWater(x, y, 3).filter(i => g.pfW.comp[i] === c.comp);
      if (shore.length < 3) continue;
      let open = 0; for (let yy = y - 1; yy <= y + 3; yy++) for (let xx = x - 1; xx <= x + 3; xx++) if ((xx < x || yy < y || xx > x + 2 || yy > y + 2) && m.passable(xx, yy)) open++;
      if (open < 3) continue;
      if (this.homeComp && ![[x - 1, y + 1], [x + 3, y + 1], [x + 1, y - 1], [x + 1, y + 3]].some(([xx, yy]) => m.passable(xx, yy) && g.pf.comp[yy * g.N + xx] === this.homeComp)) continue;
      const s = Math.hypot(x - h.x, y - h.y) - shore.length * 0.5;
      if (s < bs) { bs = s; best = { x, y }; }
    }
    return best;
  }
  buildDock() { if (!this.coast || !this.p.canBuild('dock') || !this.p.canAfford(this.p.cost('dock', true))) return null; const b = this.build('dock', this.dockSpot()); if (b) this.say('Building a Dock on the shore.'); return b; }
  navalRivals() {
    const g = this.g, p = this.p, c = this.coast?.comp; if (!c) return [];
    // rivals whose own shore lies on our sea, or who already float a harbour on it
    return g.players.filter(q => q !== p && q.alive && g.rel[p.id][q.id] === 'war' && (g.brains[q.id]?.coast?.comp === c || q.blds.some(b => b.type === 'dock' && m_shore(g, b, c))));
  }
  fleet() {
    const g = this.g, p = this.p; if (!this.coast) return;
    const docks = p.blds.filter(b => b.type === 'dock'), ready = docks.filter(b => b.done && !b.dead);
    const vills = p.units.filter(u => u.cls === 'villager').length;
    const rivals = this.t % 20 === 1 || !this.rivalCache ? (this.rivalCache = this.navalRivals()) : this.rivalCache;
    if (!docks.length && vills >= 16 && (this.fishNear >= 3 || (p.age >= 2 && rivals.length)) && p.res.wood > 260) this.buildDock();
    if (!ready.length) return;
    const boats = p.units.filter(u => u.type === 'fishing_boat'), ships = p.units.filter(u => u.cls === 'ship');
    const reserve = this.reserve();
    const ok = c => { for (const r in c) if (p.res[r] - (reserve[r] || 0) < c[r]) return false; return true; };
    const dock = ready.sort((a, b) => a.queue.length - b.queue.length)[0];
    // fishermen
    const wantBoats = Math.min(10, Math.round(this.fishNear * 0.8));
    if (boats.length + p.queued('fishing_boat') < wantBoats && p.pop < p.popCap - 2 && ok(p.cost('fishing_boat')) && dock.queue.length < 2) g.queueUnit(dock, 'fishing_boat');
    for (const u of boats) if (u.task.type === 'idle') { const n = g.nearestNode('food', u.x, u.y, 40, true); if (n) g.order(u, { type: 'gather', res: 'food', tk: 'node', ti: n.id, phase: 'go' }); }
    // merchant cogs when there is a friendly harbour to sail to
    const cogs = p.unitCount('trade_cog') + p.queued('trade_cog');
    if (p.canTrain('trade_cog') && cogs < Math.round(1 + this.P.trade * 3) && dock.queue.length < 2 && ok(p.cost('trade_cog')) && this.t % 8 === 1 && this.tradeDest(dock, true)) g.queueUnit(dock, 'trade_cog');
    for (const u of p.units) if (u.type === 'trade_cog' && u.task.type === 'idle' && this.t % 8 === 5) { const d = this.tradeDest(dock, true); if (d) u.task = { type: 'trade', home: dock.id, dest: d, leg: 'out' }; }
    // warships when rivals share the water
    let want = 0;
    if (p.age >= 2 && rivals.length) want = Math.round((3 + p.age * 2) * (0.6 + this.P.aggression * 0.6));
    if (this.directive?.fleet != null) want = p.age >= 2 ? this.directive.fleet : 0;
    if (ships.length + p.queued('galley') + p.queued('fire_ship') + p.queued('dromon') < want && dock.queue.length < 2 && p.pop < p.popCap - 3) {
      const type = p.canTrain('dromon') && ships.filter(s => s.type === 'dromon').length < ships.length / 3 ? 'dromon' : ships.filter(s => s.type === 'fire_ship').length < ships.length / 3 ? 'fire_ship' : 'galley';
      if (p.canTrain(type) && ok(p.cost(type))) g.queueUnit(dock, type);
    }
    if (!ships.length) return;
    // enemy ships near our docks: everyone defends
    let threat = null;
    for (const d of ready) { g.grid.query(d.x + 1.5, d.y + 1.5, 26, e => { if (!threat && e.naval && !e.dead && g.hostile(p.id, e.owner)) threat = e; }); if (threat) break; }
    const idle = ships.filter(s => s.task.type === 'idle' || s.task.type === 'amove' && !s.dest);
    if (threat) { for (const s of ships) if (s.task.type !== 'attack') s.task = { type: 'amove', x: threat.x, y: threat.y, leash: 20 }; this.fleetMission = null; return; }
    // with a real fleet, sail against the nearest rival harbour
    if (!this.fleetMission && ships.length >= 5 && rivals.length) {
      let best = null, bd = 1e9;
      for (const q of rivals) for (const b of q.blds) { if (b.type !== 'dock' || !m_shore(g, b, this.coast.comp)) continue; const d = Math.hypot(b.x - dock.x, b.y - dock.y); if (d < bd) { bd = d; best = b; } }
      if (best) { const w = g.map.shoreWater(best.x, best.y, 3).find(i => g.pfW.comp[i] === this.coast.comp); if (w != null) { this.fleetMission = { x: w % g.N + 0.5, y: ((w / g.N) | 0) + 0.5, t: g.time, target: best.owner }; this.say(`Our fleet of ${ships.length} sails against ${g.players[best.owner].name}'s harbour.`); g.log(`⚓ ${p.name} sends ${ships.length} warships against ${g.players[best.owner].name}.`, 'war', [p.id, best.owner], dock.x, dock.y); } }
    }
    const fm = this.fleetMission;
    if (fm && (g.time - fm.t > 240 || ships.length < 3)) this.fleetMission = null;
    const dest = this.fleetMission || (() => { const w = g.map.shoreWater(dock.x, dock.y, 3).find(i => g.pfW.comp[i] === this.coast.comp); return w != null ? { x: w % g.N + 0.5, y: ((w / g.N) | 0) + 0.5 } : null; })();
    if (dest) for (const s of idle) if (Math.hypot(s.x - dest.x, s.y - dest.y) > 6) s.task = { type: 'amove', x: dest.x + (g.R() - 0.5) * 4, y: dest.y + (g.R() - 0.5) * 4 };
  }

  // ---------------------------------------------------------------- rebel bands: no town, only anger
  bandThink() {
    const g = this.g, p = this.p, parent = g.players[p.parent];
    const units = p.units.filter(u => !u.dead);
    if (!parent?.alive || this.t > 360) {
      // the revolt fades: survivors go home with concessions
      if (parent?.alive) {
        parent.unrest = 0; parent.happiness = Math.min(100, parent.happiness + 12); if (parent.tax > 0) parent.tax--;
        g.log(`🕊 The ${p.name} lays down its arms after winning concessions.`, 'civic', [parent.id, p.id], p.home.x, p.home.y);
        for (const u of units) { const x = u.x, y = u.y; g.despawn(u); if (parent.pop < parent.popCap) { const v = g.spawnUnit(parent.id, 'villager', x, y); v.task = { type: 'idle' }; } }
      } else for (const u of units) g.despawn(u);
      p.units = [];
      return;
    }
    if (this.t % 3) return;
    for (const u of units) {
      if (u.task.type === 'attack' || u.task.type === 'rout') continue;
      if (u.task.type === 'amove' && u.dest) continue;
      let best = null, bd = 70;
      for (const b of parent.blds) { const d = Math.hypot(b.x - u.x, b.y - u.y) * (b.type === 'house' || b.type === 'farm' || b.type === 'mill' || b.type === 'market' ? 0.7 : b.type === 'town_center' || b.type === 'castle' || b.type === 'watch_tower' ? 1.6 : 1); if (d < bd) { bd = d; best = b; } }
      if (best) u.task = { type: 'attack', id: best.id, then: { type: 'amove', x: best.x + 1, y: best.y + 1 } };
      else u.task = { type: 'amove', x: parent.home.x, y: parent.home.y };
    }
  }

  // ---------------------------------------------------------------- civics: government, ministries, taxes, religion
  chooseReligion() {
    const g = this.g, p = this.p;
    let d = this.directive?.doctrine && DOCTRINES[this.directive.doctrine] ? this.directive.doctrine : this.P.doctrine;
    const taken = new Set(g.players.filter(q => q.religion).map(q => q.religion.doctrine));
    if (taken.has(d)) { const free = Object.keys(DOCTRINES).filter(k => !taken.has(k)); if (free.length) d = free[(g.R() * free.length) | 0]; }
    p.foundReligion(d);
    this.say(`We found the ${DOCTRINES[d].name}.`); g.decide(p.id, 'religion', `founds the ${DOCTRINES[d].name}`);
  }
  civics() {
    const g = this.g, p = this.p, P = this.P;
    // taxes
    const wantTax = this.directive?.tax ?? (p.happiness < 38 || p.unrest > 45 ? 0 : p.happiness > 68 && p.res.gold < 300 + P.aggression * 300 ? 2 : 1);
    if (wantTax !== p.tax) { p.tax = wantTax; this.say(`Setting taxes to ${['low', 'normal', 'high'][wantTax]}.`); }
    // government
    if (p.has('council_hall')) {
      let want = this.directive?.government && GOVERNMENTS[this.directive.government] ? this.directive.government : P.gov;
      const G = GOVERNMENTS[want];
      if (G.age > p.age || (G.needs && !p.has(G.needs))) want = p.age >= 2 ? (P.aggression > 0.75 ? 'junta' : P.faith > 0.65 && p.has('temple') ? 'theocracy' : 'monarchy') : 'chiefdom';
      const G2 = GOVERNMENTS[want];
      if (want !== p.government && G2.age <= p.age && (!G2.needs || p.has(G2.needs)) && p.res.gold > 140 && p.res.food > 180) {
        if (p.setGovernment(want)) this.say(`Reforming the state into a ${G2.name}.`);
      }
      // ministries
      const w = this.directive?.departments;
      const max = p.age >= 3 ? 3 : 2;
      const income = (p.taxIncome || 0) + (p.stats.trade / Math.max(60, g.time)) + 0.3;
      let budget = clamp(Math.floor(income / 0.12 * 0.6 + p.res.gold / 900), 0, 14);
      const pr = w ? Object.entries(w).sort((a, b) => b[1] - a[1]).map(e => e[0]) : this.deptPriority();
      const lv = Object.fromEntries(Object.keys(DEPARTMENTS).map(k => [k, 0]));
      for (let round = 0; round < max && budget > 0; round++) for (const k of pr.slice(0, round === 0 ? 6 : 3)) { if (budget <= 0) break; if (w && w[k] != null && lv[k] >= w[k]) continue; lv[k]++; budget--; }
      let changed = false;
      for (const k in lv) if (p.departments[k] !== lv[k]) { p.departments[k] = Math.min(max, lv[k]); changed = true; }
      if (changed) p.recalc();
    }
    // rites
    if (p.religion) {
      const wounded = p.units.filter(u => u.wounded || u.sick).length;
      const rite = this.directive?.rite;
      if (rite && RITES[rite] && p.faith >= RITES[rite].faith) p.performRite(rite) && (this.directive.rite = null);
      else if (wounded >= 10 && p.faith >= RITES.healing.faith) p.performRite('healing');
      else if ((p.happiness < 32 || p.unrest > 60) && p.faith >= RITES.rest.faith) p.performRite('rest');
      else if (p.res.food < 200 && p.faith >= RITES.harvest.faith + 50) p.performRite('harvest');
      else if (p.unitCount('trade_cart') >= 4 && p.faith >= RITES.pilgrim.faith + 100) p.performRite('pilgrim');
    }
    // market trading to fix shortages
    if (p.has('market') && this.t % 20 === 3) this.marketTrade();
    if (this.t % 20 === 13) this.chooseLaws();
    if (this.t % 30 === 23 && this.directive?.governors !== 'keep') this.reviewGovernors();
  }
  deptPriority() {
    const P = this.P, p = this.p;
    const sc = { war: P.aggression, treasury: 0.75, agriculture: P.eco * 0.8, health: 0.4 + (p.stats.wounded > 20 ? 0.3 : 0) + (this.g.time < p.diseaseUntil ? 0.4 : 0), faith: P.faith * 0.8, trade: P.trade * 0.85, works: P.eco * 0.5 + P.defense * 0.2, defense: P.defense * 0.85, science: P.tech * 0.8 };
    return Object.keys(sc).sort((a, b) => sc[b] - sc[a]);
  }
  marketTrade() {
    const p = this.p, g = this.g;
    const surplus = RES.filter(r => r !== 'gold' && p.res[r] > 1800).sort((a, b) => p.res[b] - p.res[a])[0];
    const need = this.nextNeeds();
    const short = RES.filter(r => r !== 'gold' && (need[r] || 0) > p.res[r] + 100).sort((a, b) => (need[b] - p.res[b]) - (need[a] - p.res[a]))[0];
    // a hoard of stone-less riches buys the stone that castles, walls and the Wonder need
    const rich = p.res.gold > 3000, stoneWant = p.age >= 3 && p.res.stone < (p.age >= 4 ? 1600 : 700);
    if (rich && (short || stoneWant)) { const r = short || 'stone', price = 1 / g.market[r] * 1.3, amt = Math.min(800, Math.floor((p.res.gold - 1500) / price)); if (amt > 100) { p.res.gold -= amt * price; p.res[r] += amt; g.market[r] = Math.min(2, g.market[r] + 0.05); this.say(`Buying ${amt} ${r} at the market.`); return; } }
    if (surplus && (p.res.gold < 2000 || p.res[surplus] > 6000)) { const k = p.res[surplus] > 6000 ? 1000 : 300; p.res[surplus] -= k; p.res.gold += k * g.market[surplus]; g.market[surplus] = Math.max(0.3, g.market[surplus] - 0.04); this.say(`Selling ${k} ${surplus} at the market.`); return; }
    if (false) { p.res[surplus] -= 300; p.res.gold += 300 * g.market[surplus]; g.market[surplus] = Math.max(0.3, g.market[surplus] - 0.04); this.say(`Selling 300 ${surplus} at the market.`); }
    else if (short && p.res.gold > 500) { const price = 1 / g.market[short] * 1.3; const amt = Math.min(300, Math.floor((p.res.gold - 300) / price)); if (amt > 50) { p.res.gold -= amt * price; p.res[short] += amt; g.market[short] = Math.min(2, g.market[short] + 0.03); this.say(`Buying ${amt} ${short} at the market.`); } }
  }

  // ---------------------------------------------------------------- diplomacy
  diplomacy() {
    const g = this.g, p = this.p, P = this.P;
    if (g.setup.teams) { this.allyTrade(); return; }
    const alive = g.players.filter(q => q.alive && q !== p);
    if (alive.length < 2) return;
    const my = p.score();
    const leader = alive.reduce((a, b) => (b.score() > a.score() ? b : a));
    // LLM-requested moves
    if (this.directive?.diplomacy) {
      for (const d of this.directive.diplomacy) {
        const q = g.players[d.to]; if (!q || !q.alive || q === p) continue;
        if (d.action === 'war' && g.rel[p.id][q.id] !== 'war') g.setRelation(p.id, q.id, 'war', `${p.name}'s decision`);
        else if ((d.action === 'peace' || d.action === 'ally') && g.rel[p.id][q.id] !== 'ally') this.propose(q, d.action);
        else if (d.action === 'tribute') this.demandTribute(q);
        else if (d.action === 'embargo' && !g.embargo.has(p.id + '>' + q.id)) { g.embargo.add(p.id + '>' + q.id); g.log(`🚫 ${p.name} places an embargo on ${q.name}.`, 'diplo', [p.id, q.id]); }
        else if (d.action === 'lift_embargo' && g.embargo.delete(p.id + '>' + q.id)) g.log(`✅ ${p.name} lifts its embargo on ${q.name}.`, 'diplo', [p.id, q.id]);
        else if (d.action === 'trade_pact') this.propose(q, 'pact');
      }
      this.directive.diplomacy = null;
    }
    for (const q of alive) {
      const rel = g.rel[p.id][q.id];
      const grudge = p.attackedBy[q.id] > g.time - 240;
      // band together against a runaway leader
      if (rel === 'war' && leader !== q && leader.score() > Math.max(my, q.score()) * 1.35 && !grudge && g.R() < 0.6 - P.aggression * 0.4) this.propose(q, 'peace');
      else if (rel === 'peace' && !grudge && g.R() < 0.25 * (1 - P.aggression) && g.time - (this.peaceAt?.[q.id] || 0) > 300) this.propose(q, 'ally');
      // the ambitious break treaties when they smell weakness
      else if (rel !== 'war' && g.R() < P.aggression * 0.18 && q.score() < my * 0.7 && g.time > 1200 && g.time - (this.peaceAt?.[q.id] || 0) > 420) g.setRelation(p.id, q.id, 'war', `${p.name} sees weakness`);
      else if (rel !== 'war' && grudge) g.setRelation(p.id, q.id, 'war', 'border clash');
    }
    // trade agreements, embargoes on the runaway leader, tribute from the weak
    for (const q of alive) {
      const rel = g.rel[p.id][q.id], key = pactKey(p.id, q.id);
      if (rel !== 'war' && !g.pacts.has(key) && p.has('market') && q.has('market') && g.R() < 0.2 + P.trade * 0.3) this.propose(q, 'pact');
      if (rel === 'war' && g.pacts.has(key)) { g.pacts.delete(key); g.log(`📉 The trade agreement between ${p.name} and ${q.name} is torn up.`, 'diplo', [p.id, q.id]); }
      const ek = p.id + '>' + q.id;
      if (q === leader && rel === 'war' && leader.score() > my * 1.4 && !g.embargo.has(ek) && g.R() < 0.5) { g.embargo.add(ek); g.log(`🚫 ${p.name} places an embargo on ${q.name}.${g.embargoCount(q.id) >= 2 ? ` The Bazaar now pays ${q.name} half price.` : ''}`, 'diplo', [p.id, q.id]); }
      else if (g.embargo.has(ek) && (q !== leader || rel !== 'war')) { g.embargo.delete(ek); g.log(`✅ ${p.name} lifts its embargo on ${q.name}.`, 'diplo', [p.id, q.id]); }
      if (p.knows[q.id] && P.aggression > 0.45 && !q.rebel && g.R() < 0.12 && this.strength(p.units.filter(u => g.military(u))) > this.enemyPower(q) * 2.2) this.demandTribute(q);
    }
    this.allyTrade();
  }
  propose(q, kind) {
    const g = this.g, p = this.p, other = g.brains[q.id];
    if (kind === 'pact') {
      if (g.R() < 0.5 + q.profile.trade * 0.4 && !other.directive?.refuse?.includes(p.id)) { g.pacts.add(pactKey(p.id, q.id)); p.stats.pacts = (p.stats.pacts || 0) + 1; q.stats.pacts = (q.stats.pacts || 0) + 1; g.decide(p.id, 'diplomacy', `signs a trade agreement with ${q.name}`); g.log(`📜 ${p.name} and ${q.name} sign a trade agreement: caravans welcome in each other's markets.`, 'diplo', [p.id, q.id]); }
      return;
    }
    if (other.accepts(p, kind)) {
      g.setRelation(p.id, q.id, kind);
      (this.peaceAt ||= {})[q.id] = g.time; (other.peaceAt ||= {})[p.id] = g.time;
      // cancel field armies aimed at the new friend
      for (const br of [this, other]) for (const a of br.armies.values()) if (a.kind !== 'defense' && (a.targetPid === q.id || a.targetPid === p.id)) a.state = 'retreat';
    } else if (g.R() < 0.4) g.log(`✉ ${q.name} rejects ${p.name}'s offer of ${kind === 'ally' ? 'alliance' : 'peace'}.`, 'diplo', [p.id, q.id]);
  }
  accepts(from, kind) {
    const g = this.g, p = this.p, P = this.P;
    if (this.directive?.refuse?.includes(from.id)) return false;
    if ([...this.armies.values()].some(a => a.kind === 'attack' && a.targetPid === from.id && a.state !== 'retreat') && P.aggression > 0.5) return false;
    const grudge = p.attackedBy[from.id] > g.time - 300;
    let chance = (1 - P.aggression) * 0.8 + (from.score() > p.score() * 1.3 ? 0.25 : 0) - (grudge ? 0.4 : 0) - (kind === 'ally' ? 0.15 : 0);
    if (from.religion && p.religion && from.religion.doctrine === p.religion.doctrine) chance += 0.15;
    return g.R() < chance;
  }
  allyTrade() {
    const g = this.g, p = this.p;
    for (const q of g.players) {
      if (q === p || !q.alive || g.rel[p.id][q.id] === 'war') continue;
      const give = RES.filter(r => p.res[r] > 1500).sort((a, b) => p.res[b] - p.res[a])[0];
      const get = RES.filter(r => q.res[r] > 1500 && p.res[r] < 400 && r !== give)[0];
      if (give && get && g.R() < 0.5) {
        const a = 250, b = 200;
        if (p.res[give] >= a && q.res[get] >= b) { p.res[give] -= a; q.res[give] += a; q.res[get] -= b; p.res[get] += b; g.log(`⚖ Trade deal: ${p.name} sends ${a} ${give} to ${q.name} for ${b} ${get}.`, 'trade', [p.id, q.id]); }
      }
    }
  }
}
