// A nation: resources, technology, population, government, religion, society.
import { GOV_CHANGE, UNITS, BUILDINGS, TECHS, AGES, CIVS, GOVERNMENTS, DEPARTMENTS, DEPT_UPKEEP, TAX, DOCTRINES, RITES, LINES, POP_MAX, RES, AI, FOUND_FAITH, LAWS, LAW_CHANGE_COST, GOVERNOR_TRAITS, RULER_TRAITS, PARTIES, GOODS, TOWN_RANKS, RULER_TITLES, HERO_NAMES, HERO_EPITHETS } from './config.js';

const START_RES = { low: { food: 150, wood: 150, stone: 100, gold: 50, iron: 0 }, standard: { food: 250, wood: 250, stone: 150, gold: 100, iron: 0 }, high: { food: 800, wood: 800, stone: 500, gold: 400, iron: 100 } };

export class Player {
  constructor(game, id, cfg) {
    this.g = game; this.id = id; this.cfg = cfg;
    this.aiKey = cfg.ai; this.profile = cfg.profile || AI[cfg.ai];
    this.name = cfg.name || this.profile.name;
    this.color = cfg.color; this.team = cfg.team ?? null;
    this.civKey = cfg.civ; this.civ = CIVS[cfg.civ];
    this.alive = true; this.eliminatedAt = 0;
    this.res = { ...(START_RES[game.setup.resources] || START_RES.standard) };
    this.faith = 0;
    this.age = 1; this.techs = new Set(); this.lineTier = { sword: 0, spear: 0, archer: 0, cav: 0, gun: 0 };
    this.government = 'chiefdom'; this.govChangedAt = -1e9; this.anarchyUntil = 0;
    this.departments = Object.fromEntries(Object.keys(DEPARTMENTS).map(k => [k, 0]));
    this.tax = 1; this.religion = null; this.rites = {};
    this.laws = new Set(); this.lawChangedAt = -1e9;
    this.goods = Object.fromEntries(Object.keys(GOODS).map(k => [k, 0]));
    this.townRank = 0; this.corruption = 0; this.party = null; this.nextElection = 1500; this.rulerNames = {};
    this.ruler = this.makeRuler(false);
    this.heroes = []; this.unrest = 0; this.lastRevolt = -1e9; this.rebel = false; this.band = false;
    this.happiness = 62; this.productivity = 1; this.starving = false; this.diseaseUntil = 0; this.nextDisease = 120;
    this.pop = 0; this.popCap = 0;
    this.units = []; this.blds = [];
    this.stats = { kills: 0, losses: 0, unitsMade: 0, villagersMade: 0, gathered: Object.fromEntries(RES.map(r => [r, 0])), built: 0, lost: 0, razed: 0, wounded: 0, healed: 0, trade: 0, deathsRecent: 0, timeline: [] };
    this.mods = {}; this.cache = {};
    this.home = { x: 0, y: 0 };
    this.threatDir = { x: 0, y: 1 };
    this.lastAttacked = -1e9; this.attackedBy = {};
    this.knows = {}; // pid -> {x,y,t}: known location of that nation's town
    this.bell = false;
    this.thoughts = []; this.llm = { status: cfg.llm?.enabled ? 'waiting' : 'off', last: null, calls: 0, errors: 0 };
    this.recalc();
  }
  log(text) { this.thoughts.unshift({ t: this.g.time, text }); if (this.thoughts.length > 40) this.thoughts.pop(); }
  mod(k) { return this.mods[k] || 0; }
  recalc() {
    const m = {};
    const add = fx => { for (const k in fx) m[k] = (m[k] || 0) + fx[k]; };
    const addScaled = (fx, s) => { for (const k in fx) m[k] = (m[k] || 0) + fx[k] * s; };
    add(this.civ.fx);
    for (const t of this.techs) if (TECHS[t]?.fx) add(TECHS[t].fx);
    add(GOVERNMENTS[this.government].fx);
    if (this.religion) add(DOCTRINES[this.religion.doctrine].fx);
    for (const [k, lv] of Object.entries(this.departments)) if (lv) addScaled(DEPARTMENTS[k].fx, lv);
    for (const [k, until] of Object.entries(this.rites)) if (until > this.g.time) add(RITES[k].fx);
    for (const k of this.laws) add(LAWS[k].fx);
    if (this.ruler) add(RULER_TRAITS[this.ruler.trait].fx);
    if (this.party) add(PARTIES[this.party].fx);
    add(TOWN_RANKS[this.townRank].fx);
    if (this.civ.monument && this.blds.some(b => b.type === 'monument' && b.done)) add(this.civ.monument.fx);
    if (m['gather.all']) for (const r of RES) m['gather.' + r] = (m['gather.' + r] || 0) + m['gather.all'];
    this.mods = m; this.cache = {};
  }
  // Effective stats of a unit type for this nation.
  st(type) {
    let s = this.cache[type]; if (s) return s;
    const U = UNITS[type], c = U.cls;
    const pierce = U.dmg === 'pierce';
    s = {
      type, cls: c, name: U.name, dmg: U.dmg,
      hp: U.hp + this.mod('hp.' + c),
      atk: U.atk + (pierce ? this.mod('atk.ranged') : this.mod('atk.' + c)),
      atkMul: c === 'villager' ? 0 : this.mod('atkMul'),
      ma: U.ma + this.mod('ma.' + c), pa: U.pa + this.mod('pa.' + c),
      range: U.range + (c === 'ranged' ? this.mod('range.ranged') : 0),
      minRange: U.minRange || 0,
      rate: U.rate / (1 + this.mod('rate.' + c)),
      speed: U.speed * (1 + this.mod('speed.' + c) + (c === 'villager' ? this.mod('vilSpeed') : 0)),
      sight: U.sight, pop: this.popCost(type), bonus: U.bonus || {}, charge: (U.charge || 0) * (1 + this.mod('charge')),
      splash: U.splash || 0, bldOnly: !!U.bldOnly, heal: (U.heal || 0) * (1 + this.mod('heal')), aura: U.aura || 0, mounted: !!U.mounted || c === 'cavalry',
      accuracy: Math.min(0.98, 0.82 + this.mod('accuracy')),
    };
    s.power = Math.sqrt(s.hp * (s.atk + 2 + Object.values(s.bonus).reduce((a, b) => a + b, 0) * 0.15) / s.rate) * (U.range > 2 ? 1.15 : 1);
    this.cache[type] = s; return s;
  }
  popCost(type) { return this.civ.pop[type] ?? UNITS[type].pop; }
  cost(type, isBuilding) {
    const spec = isBuilding ? BUILDINGS[type] : UNITS[type];
    const k = isBuilding ? (spec.wall ? this.mod('cost.wall') : 0) : this.mod('cost.' + spec.cls);
    if (!k) return spec.cost;
    return Object.fromEntries(Object.entries(spec.cost).map(([r, v]) => [r, Math.round(v * (1 + k))]));
  }
  canAfford(c) { for (const r in c) if ((this.res[r] || 0) < c[r]) return false; return true; }
  pay(c) { if (!this.canAfford(c)) return false; for (const r in c) this.res[r] -= c[r]; return true; }
  refund(c, k = 1) { for (const r in c) this.res[r] += c[r] * k; }
  count(type, done = true) { let n = 0; for (const b of this.blds) if (b.type === type && (!done || b.done)) n++; return n; }
  has(type) { for (const b of this.blds) if (b.type === type && b.done) return true; return false; }
  unitCount(type) { let n = 0; for (const u of this.units) if (u.type === type) n++; return n; }
  get military() { return this.units.filter(u => u.cls !== 'villager' && u.cls !== 'trade'); }
  villagers() { return this.units.filter(u => u.cls === 'villager'); }
  lineType(line) { return LINES[line][this.lineTier[line]]; }

  ageReady(n) {
    const A = AGES[n - 1]; if (!A || this.age !== n - 1) return { ok: false, have: [] };
    const have = A.from.filter(t => this.has(t));
    return { ok: have.length >= A.need, have, need: A.need };
  }
  canBuild(type) {
    const B = BUILDINGS[type]; if (!B || B.age > this.age) return false;
    if (B.max && this.count(type, false) >= B.max) return false;
    if (B.rank && this.townRank < B.rank) return false;
    for (const r of B.requires || []) if (!this.has(r)) return false;
    return true;
  }
  canTrain(type) {
    const U = UNITS[type]; if (!U || U.age > this.age) return false;
    if (U.line && LINES[U.line][this.lineTier[U.line]] !== type) return false;
    if (U.max && this.unitCount(type) + this.queued(type) >= U.max) return false;
    return this.has(U.building);
  }
  queued(type) { let n = 0; for (const b of this.blds) for (const q of b.queue) if (q.key === type) n++; return n; }
  canResearch(key) {
    const T = TECHS[key]; if (!T || this.techs.has(key) || T.age > this.age || !this.has(T.building)) return false;
    if (T.upgrade && this.lineTier[T.upgrade[0]] !== T.upgrade[1] - 1) return false;
    for (const b of this.blds) for (const q of b.queue) if (q.key === key) return false;
    return true;
  }
  moraleBase() { return Math.min(95, 45 + this.happiness * 0.35 + this.mod('morale')); }
  woundChance() { return Math.min(0.72, 0.22 + this.mod('wound') + (this.has('infirmary') ? 0.08 : 0) + (this.has('hospital') ? 0.1 : 0)); }

  // ------------------------------------------------------------ society, once per game second
  society() {
    const g = this.g;
    let vill = 0, mil = 0, cav = 0, priests = 0;
    for (const u of this.units) { if (u.cls === 'villager') vill++; else { mil += u.pop; if (u.cls === 'cavalry') cav += u.pop; if (u.type === 'priest') priests++; } }
    const eat = vill * 0.011 + mil * 0.016 + cav * 0.01;
    this.res.food -= eat;
    this.starving = this.res.food <= 0;
    if (this.starving) { this.res.food = 0; if (g.R() < 0.25 && this.units.length) { const u = this.units[(g.R() * this.units.length) | 0]; if (!u.inside) g.damage(u, 2, null); } }
    const anarchy = g.time < this.anarchyUntil;
    // taxes
    const taxIncome = vill * 0.009 * TAX[this.tax].mult * (1 + this.mod('tax')) * (anarchy ? 0.3 : 1) * (1 - this.corruption / 100);
    this.res.gold += taxIncome; this.taxIncome = taxIncome;
    // ministries
    const levels = Object.values(this.departments).reduce((a, b) => a + b, 0);
    if (levels) {
      const up = levels * DEPT_UPKEEP * (1 + this.mod('deptCost'));
      if (this.res.gold >= up) this.res.gold -= up;
      else { const k = Object.keys(this.departments).filter(d => this.departments[d] > 0); const d = k[(g.R() * k.length) | 0]; this.departments[d]--; this.recalc(); g.log(`${this.name} cannot fund the ${DEPARTMENTS[d].name}; it is cut back.`, 'civic', [this.id]); }
      this.deptUpkeep = up;
    } else this.deptUpkeep = 0;
    // faith
    let faith = priests * 0.12;
    for (const b of this.blds) if (b.done && BUILDINGS[b.type].faith) faith += BUILDINGS[b.type].faith;
    for (const s of g.sacred) if (s.owner === this.id) faith += 0.6;
    for (const b of this.blds) if (b.governor?.trait === 'zealot') faith += 0.25;
    this.faithRate = faith * (1 + this.mod('faith'));
    this.faith += this.faithRate; this.stats.faithEarned = (this.stats.faithEarned || 0) + this.faithRate;
    // expire rites
    let ritesChanged = false;
    for (const [k, until] of Object.entries(this.rites)) if (until <= g.time) { delete this.rites[k]; ritesChanged = true; }
    if (ritesChanged) this.recalc();
    // happiness
    const housing = this.popCap - this.pop;
    let target = 55 + TAX[this.tax].happy + this.mod('happy');
    target += this.starving ? -35 : this.res.food > 300 ? 6 : 0;
    target += housing >= 6 || this.popCap >= POP_MAX ? 4 : -6;
    if (this.religion) target += 4 + Math.min(8, (this.count('temple') + this.count('cathedral') * 2) * 2);
    target -= Math.min(25, this.stats.deathsRecent * 0.6 * (1 + this.mod('warWeary')));
    if (g.time < this.diseaseUntil) target -= 12;
    if (this.has('wonder')) target += 10;
    if (anarchy) target -= 15;
    // a sprawling empire is hard to rule: every extra town or castle breeds discontent
    const cores = this.blds.filter(b => b.done && (b.type === 'town_center' || b.type === 'castle')).length;
    target -= Math.max(0, cores - 2) * 5;
    if (this.capitalLost && g.time - this.capitalLost < 300) target -= 15;
    target += g.sacred.filter(s => s.owner === this.id).length * 2;
    // luxuries on the table: every kind of good in store cheers the people
    let kinds = 0; for (const k in this.goods) if (this.goods[k] >= 5) { kinds++; this.goods[k] = Math.max(0, this.goods[k] - this.pop / 6000); }
    target += Math.min(8, kinds * 2);
    if (this.laws.has('public_feasts')) { if (this.res.food > 1) this.res.food = Math.max(0, this.res.food - LAWS.public_feasts.food); else target -= 8; }
    this.happyTarget = Math.max(0, Math.min(100, target));
    this.happiness += (this.happyTarget - this.happiness) * 0.04;
    this.stats.deathsRecent *= 0.985;
    // provinces: every town or castle away from the capital has its own loyalty to the crown
    if (!this.rebel && this.tc && g.tickN % 20 === 0) {
      const cap = this.tc, cx = cap.x + cap.size / 2, cy = cap.y + cap.size / 2;
      for (const b of this.blds) {
        if (b === cap || !b.done || (b.type !== 'town_center' && b.type !== 'castle')) continue;
        const bx = b.x + b.size / 2, by = b.y + b.size / 2, d = Math.hypot(bx - cx, by - cy);
        if (b.loyalty == null) b.loyalty = 100;
        if (d < 35 && !b.capturedAt) { b.loyalty = Math.min(100, b.loyalty + 2); continue; }
        let dl = 0.04 + d / 200 * 0.12;                                   // far from the crown
        if (g.time - (b.capturedAt || -1e9) < 900) dl += 0.12;           // freshly conquered
        dl += Math.max(0, 55 - this.happiness) * 0.008 + this.tax * 0.03;
        const gv = b.governor && GOVERNOR_TRAITS[b.governor.trait];
        dl += (gv?.loyalty || 0) + (RULER_TRAITS[this.ruler?.trait]?.loyalty || 0);
        if (dl > 0) dl *= gv?.loyaltyMul || 1;
        let troops = 0; g.grid.query(bx, by, 14, e => { if (e.owner === this.id && !e.dead && g.military(e)) troops += e.pop; });
        dl -= Math.min(0.22 * (gv?.troopsMul || 1) ** 0.5, troops * 0.012 * (gv?.troopsMul || 1));
        if (this.blds.some(k => (k.type === 'temple' || k.type === 'cathedral') && k.done && Math.abs(k.x - bx) + Math.abs(k.y - by) < 20)) dl -= 0.05;
        if (this.blds.some(k => k.type === 'courthouse' && k.done && Math.abs(k.x - bx) + Math.abs(k.y - by) < 26)) dl -= 0.05;
        if (this.laws.has('martial_law')) dl -= LAWS.martial_law.loyalty;
        if (gv?.skim && this.res.gold > 2) { this.res.gold -= gv.skim * 2; this.stats.skimmed = (this.stats.skimmed || 0) + gv.skim * 2; }
        b.loyalty = Math.max(0, Math.min(100, b.loyalty - dl * 2)); // checked every 2 s
        if (b.loyalty <= 0 && g.time - this.lastRevolt > 240) { g.rebellion(this, b); break; }
      }
    }
    // unrest grows while the people are miserable; past 100 it boils over into rebellion
    if (!this.rebel) {
      const d = (this.happiness < 30 ? (30 - this.happiness) * 0.09 : -0.5) + (this.laws.has('curfew') ? LAWS.curfew.unrest : 0);
      this.unrest = Math.max(0, Math.min(100, this.unrest + d + Math.max(0, cores - 2) * 0.05));
      if (this.unrest >= 100 && g.time - this.lastRevolt > 420 && g.time > 600) g.rebellion(this);
    }
    this.productivity = Math.min(1.2, 0.7 + this.happiness / 200) * (anarchy ? 0.75 : 1) * (this.starving ? 0.8 : 1) * (1 - this.corruption / 250);
    if (g.tickN % 100 === 0) this.governance();
    // disease outbreaks in crowded towns
    if (g.time > this.nextDisease) {
      this.nextDisease = g.time + 40 + g.R() * 40;
      const p = Math.max(0, (this.pop - 70) / 700) * Math.max(0.1, 1 + this.mod('disease')) * (this.has('hospital') ? 0.35 : 1) * (this.has('infirmary') ? 0.7 : 1);
      if (g.R() < p) {
        const sick = this.villagers().filter(u => !u.inside && !u.wounded).sort(() => g.R() - 0.5).slice(0, Math.max(2, Math.round(vill * (0.04 + g.R() * 0.05))));
        for (const u of sick) { u.sick = true; u.hp = Math.max(1, u.hp * 0.5); u.task = { type: 'seekHeal' }; u.path = null; }
        this.diseaseUntil = g.time + 60;
        g.log(`🦠 Plague strikes ${this.name}: ${sick.length} villagers fall sick.`, 'disease', [this.id], this.home.x, this.home.y);
      }
    }
    // religion founding
    if (!this.religion && this.faith >= FOUND_FAITH && this.has('shrine')) this.g.brains[this.id]?.chooseReligion();
  }
  // ------------------------------------------------------------ rulers, laws, corruption, the capital's growth (every 10 s)
  makeRuler(elected) {
    const g = this.g, names = HERO_NAMES[this.civKey] || HERO_NAMES.meridian, traits = Object.keys(RULER_TRAITS);
    const first = names[(g.R() * names.length) | 0], n = this.rulerNames[first] = (this.rulerNames[first] || 0) + 1;
    const num = n > 1 ? ' ' + ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][Math.min(7, n)] : '';
    return { name: first + num, trait: traits[(g.R() * traits.length) | 0], since: g.time, age0: elected ? 40 + g.R() * 15 : 20 + g.R() * 18, lifespan: 54 + g.R() * 26 };
  }
  rulerAge() { return this.ruler.age0 + (this.g.time - this.ruler.since) / 120; } // a year passes every two game minutes
  rulerTitle() { return `${RULER_TITLES[this.government] || 'Ruler'} ${this.ruler.name} ${RULER_TRAITS[this.ruler.trait].name}`; }
  governance() {
    const g = this.g;
    // the capital's rank
    const blds = this.blds.filter(b => b.done).length;
    // a capital climbs at the full threshold and only falls well below it
    let rank = 0; for (let r = 1; r < TOWN_RANKS.length; r++) { const R = TOWN_RANKS[r], k = r <= this.townRank ? 0.75 : 1; if (this.pop >= R.pop * k && this.age >= R.age && blds >= R.blds * k) rank = r; }
    if (rank !== this.townRank) {
      const up = rank > this.townRank; this.townRank = rank; this.recalc(); if (up && rank > (this.bestRank || 0)) { if (this.tc) g.log(`🏙 ${this.tc.townName || 'The capital'}, capital of ${this.name}, grows into a ${TOWN_RANKS[rank].name}.`, rank >= 2 ? 'big' : 'civic', [this.id], this.home.x, this.home.y); this.bestRank = rank; }
    }
    // corruption: distant provinces and many towns leak gold; courthouses and just rulers stop it
    let c = 0, cores = 0;
    const cx = this.home.x, cy = this.home.y;
    for (const b of this.blds) {
      if (!b.done || (b.type !== 'town_center' && b.type !== 'castle')) continue;
      cores++; if (b === this.tc) continue;
      c += Math.min(8, Math.hypot(b.x - cx, b.y - cy) / 30) * (b.governor?.trait === 'honest' ? 0.5 : 1);
    }
    c += Math.max(0, cores - 1) * 2 - this.count('courthouse') * 6 + (RULER_TRAITS[this.ruler.trait].corruption || 0);
    this.corruption = Math.max(0, Math.min(40, c));
    // the ruler grows old; republics vote
    if (this.rulerAge() >= this.ruler.lifespan) this.succession();
    else if ((this.government === 'republic' || this.government === 'oligarchy') && g.time >= this.nextElection) this.election('the end of a term');
  }
  succession() {
    const g = this.g, old = this.ruler, oldTitle = this.rulerTitle(), age = Math.round(this.rulerAge());
    const elected = this.government === 'republic' || this.government === 'oligarchy';
    this.ruler = this.makeRuler(elected);
    if (elected) { g.log(`⚱ ${oldTitle} of ${this.name} dies at ${age}.`, 'civic', [this.id], this.home.x, this.home.y); this.election('the death of ' + old.name); return; }
    this.recalc();
    g.log(`⚱ ${oldTitle} of ${this.name} dies at ${age}. ${this.rulerTitle()} takes the throne.`, 'civic', [this.id], this.home.x, this.home.y);
    const crisis = 0.2 + this.unrest / 250 + (this.government === 'junta' ? 0.25 : this.government === 'chiefdom' ? 0.1 : 0) - (this.has('castle') ? 0.1 : 0);
    if (g.R() < crisis) {
      this.anarchyUntil = g.time + 40; this.unrest = Math.min(100, this.unrest + 30);
      g.log(`⚔ Succession crisis in ${this.name}! A pretender disputes the crown of ${this.ruler.name}.`, 'big', [this.id], this.home.x, this.home.y);
      const prov = this.blds.filter(b => b.done && b !== this.tc && (b.type === 'town_center' || b.type === 'castle') && (b.loyalty ?? 100) < 85).sort((a, b) => (a.loyalty ?? 100) - (b.loyalty ?? 100))[0];
      if (prov && g.time - this.lastRevolt > 120) g.rebellion(this, prov);
    }
  }
  election(reason) {
    const g = this.g, br = g.brains[this.id];
    const party = g.time - this.lastAttacked < 240 || (br && br.aggression() > 0.65) ? 'war' : this.happiness < 45 ? 'peace' : this.stats.trade > 400 ? 'merchant' : (g.R() < 0.5 ? 'peace' : 'merchant');
    const changed = party !== this.party; this.party = party; this.nextElection = g.time + 1200;
    if (reason.startsWith('the end')) this.ruler = this.makeRuler(true);
    this.happiness = Math.min(100, this.happiness + 3); this.recalc();
    g.log(`🗳 ${this.name} holds elections after ${reason}: the ${PARTIES[party].name} ${changed ? 'takes power' : 'stays in power'}; ${this.rulerTitle()} takes office.`, 'civic', [this.id], this.home.x, this.home.y);
  }
  maxLaws() { return this.age < 2 ? 0 : 1 + (this.has('council_hall') ? 1 : 0) + (this.age >= 3 ? 1 : 0); }
  setLaw(key, on) {
    const g = this.g; if (!LAWS[key] || this.laws.has(key) === on) return false;
    if (on && this.laws.size >= this.maxLaws()) return false;
    if (g.time - this.lawChangedAt < 90 || !this.pay(LAW_CHANGE_COST)) return false;
    if (on) { this.laws.add(key); this.stats.lawsDecreed = (this.stats.lawsDecreed || 0) + 1; g.decide(this.id, 'law', `decrees ${LAWS[key].name}`); } else this.laws.delete(key);
    this.lawChangedAt = g.time; this.recalc();
    g.log(`📜 ${this.name} ${on ? 'decrees' : 'repeals'} ${LAWS[key].name}.`, 'civic', [this.id]);
    return true;
  }
  foundReligion(doctrine) {
    const D = DOCTRINES[doctrine];
    this.religion = { doctrine, name: D.name, deity: D.deity, founded: this.g.time };
    this.faith -= FOUND_FAITH; this.recalc();
    this.g.log(`✨ ${this.name} founds the ${D.name}, worshipping ${D.deity}.`, 'religion', [this.id], this.home.x, this.home.y);
  }
  performRite(key) {
    const R = RITES[key]; if (!this.religion || this.faith < R.faith || this.rites[key] > this.g.time) return false;
    this.faith -= R.faith; this.stats.rites = (this.stats.rites || 0) + 1;
    if (R.dur) { this.rites[key] = this.g.time + R.dur; this.recalc(); }
    if (key === 'healing') for (const u of this.units) { if (u.wounded || u.sick) { u.hp = Math.max(u.hp, u.maxHp * 0.6); u.wounded = false; u.sick = false; if (u.task?.type === 'seekHeal') u.task = { type: 'idle' }; this.stats.healed++; } else u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.3); }
    this.g.log(`🙏 ${this.name} performs the rite of ${R.name}.`, 'religion', [this.id], this.home.x, this.home.y);
    return true;
  }
  setGovernment(key) {
    const G = GOVERNMENTS[key], g = this.g;
    if (!G || key === this.government || G.age > this.age || (G.needs && !this.has(G.needs)) || !this.has('council_hall')) return false;
    if (g.time - this.govChangedAt < GOV_CHANGE.cooldown) return false;
    if (!this.pay(GOV_CHANGE.cost)) return false;
    g.decide(this.id, 'government', `becomes a ${G.name}`);
    this.government = key; this.govChangedAt = g.time; this.anarchyUntil = g.time + GOV_CHANGE.anarchy; this.recalc();
    g.log(`🏛 ${this.name} proclaims a ${G.name}.`, 'civic', [this.id], this.home.x, this.home.y);
    return true;
  }
  setDepartment(key, lv) {
    if (!this.has('council_hall') || !(key in this.departments)) return false;
    lv = Math.max(0, Math.min(this.age >= 3 ? 3 : 2, lv | 0));
    if (this.departments[key] === lv) return false;
    this.departments[key] = lv; this.recalc(); return true;
  }
  score() {
    let s = this.stats.razed * 20 + this.stats.kills * 4 + this.age * 150 + this.techs.size * 12;
    for (const u of this.units) s += u.cls === 'villager' ? 3 : u.pop * 6;
    for (const b of this.blds) if (b.done) s += (BUILDINGS[b.type].hp / 120) | 0;
    for (const r of RES) s += (this.stats.gathered[r] || 0) / 120;
    return Math.round(s);
  }
}
