// Spectator HUD. The viewer can watch and inspect, never command.
import { AGES, UNITS, BUILDINGS, GOVERNMENTS, DEPARTMENTS, TAX, DOCTRINES, RES, RES_ICON, TECHS, HERO_LEVELS, LAWS, GOVERNOR_TRAITS, RULER_TRAITS, PARTIES, GOODS, TOWN_RANKS } from '../config.js';
import { pactKey } from '../game.js';
import { callsSaved } from '../llm.js';
import { replayOf, downloadJSON } from '../replay.js';
import { fmtTime } from '../util.js';
import { HW, HH } from '../render/sprites.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n0 = v => Math.round(v).toLocaleString('en-US');
const SPEEDS = [0, 1, 2, 4, 8, 16, 32];

export class Hud {
  constructor(app) {
    this.app = app; this.g = app.game; this.r = app.renderer;
    this.sel = null; this.tab = 'overview'; this.logFilter = 'all'; this.lastEv = null; this.toastAt = 0;
    $('#hud').classList.remove('hidden');
    $('#victory').classList.add('hidden');
    this.mini = $('#minimap'); this.miniBase = this.r.terrain.minimap(256);
    this.buildSpeed(); this.buildLogTabs();
    $('#t-director').onclick = e => { app.director = !app.director; e.currentTarget.classList.toggle('on', app.director); };
    $('#t-labels').onclick = e => { this.r.showLabels = !this.r.showLabels; e.currentTarget.classList.toggle('on', this.r.showLabels); };
    $('#t-overview').onclick = () => app.overview();
    $('#t-exit').onclick = () => this.askAbandon();
    $('#t-director').classList.toggle('on', app.director);
    $('#t-stats').onclick = () => this.toggleStats();
    $('#t-analytics').onclick = () => app.analytics.openNow ? app.analytics.close() : app.analytics.open();
    $('#t-gfx').onclick = () => { app.cycleQuality(); };
    $('#t-gfx-l').textContent = ' ' + app.qualityName();
    $('#t-sfx').onclick = () => { app.audio.unlock(); app.audio.setSfx(!app.audio.sfxOn); this.markAudio(); };
    $('#t-music').onclick = () => { app.audio.unlock(); app.audio.setMusic(!app.audio.musicOn); this.markAudio(); };
    $('#t-atmo').onclick = e => { this.r.atmosphere = !this.r.atmosphere; e.currentTarget.classList.toggle('on', this.r.atmosphere); };
    $('#t-atmo').classList.toggle('on', this.r.atmosphere);
    $('#replay-ctl').classList.toggle('hidden', !app.replay);
    $('#r-skip').onclick = () => app.skip(5);
    this.markAudio(); this.statsTab = 'score';
    $('#stats').classList.add('hidden');
    const jump = e => { const rc = this.mini.getBoundingClientRect(); const X = ((e.clientX - rc.left) / rc.width - 0.5) * 2, Y = (e.clientY - rc.top) / rc.height * 2; const N = this.g.N; this.r.focus((X + Y) / 2 * N, (Y - X) / 2 * N); app.director = false; $('#t-director').classList.remove('on'); };
    this.mini.onmousedown = e => { jump(e); this.mini.onmousemove = ev => ev.buttons && jump(ev); };
    this.nationsEl = $('#nations'); this.detailEl = $('#detail');
    this.update(true);
  }
  buildSpeed() {
    const box = $('#speed'); box.innerHTML = '';
    for (const s of SPEEDS) { const b = document.createElement('button'); b.textContent = s ? s + '×' : '⏸'; b.onclick = () => { this.app.setSpeed(s); this.markSpeed(); }; box.appendChild(b); }
    this.markSpeed();
  }
  // stopping a battle asks first; the simulation pauses while the question is open
  askAbandon() {
    const box = $('#confirm'); if (!box.classList.contains('hidden')) return;
    const was = this.app.speed; this.app.setSpeed(0); this.markSpeed(); box.classList.remove('hidden');
    const close = () => { box.classList.add('hidden'); window.removeEventListener('keydown', key, true); };
    const key = e => { if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); this.app.setSpeed(was); this.markSpeed(); } else if (e.key === 'Enter') { e.stopImmediatePropagation(); close(); this.app.exit(); } };
    window.addEventListener('keydown', key, true);
    $('#cf-no').onclick = () => { close(); this.app.setSpeed(was); this.markSpeed(); };
    $('#cf-yes').onclick = () => { close(); this.app.exit(); };
  }
  markAudio() { $('#t-sfx').classList.toggle('on', this.app.audio.sfxOn); $('#t-music').classList.toggle('on', this.app.audio.musicOn); }
  destroy() { $('#stats').classList.add('hidden'); $('#victory').classList.add('hidden'); $('#detail').classList.add('hidden'); }
  markSpeed() { [...$('#speed').children].forEach((b, i) => b.classList.toggle('on', SPEEDS[i] === this.app.speed)); }
  buildLogTabs() {
    const box = $('#log-tabs'); box.innerHTML = '';
    for (const [k, n] of [['all', 'All'], ['war', '⚔ War'], ['diplo', '🤝 Diplomacy'], ['civic', '🏛 Civic'], ['chat', '💬 AI talk']]) {
      const b = document.createElement('button'); b.textContent = n; b.className = k === this.logFilter ? 'on' : '';
      b.onclick = () => { this.logFilter = k; this.lastEv = null; this.buildLogTabs(); this.renderLog(); };
      box.appendChild(b);
    }
  }
  select(o) {
    this.sel = o; this.r.selected = o && o.kind !== 'player' ? o : null;
    this.detailEl.classList.toggle('hidden', !o);
    this.renderDetail();
  }
  selectPlayer(p) { this.select({ kind: 'player', p }); this.r.focus(p.home.x, p.home.y, Math.max(this.r.cam.zoom, 0.7)); }

  update(force) {
    const g = this.g;
    $('#clock').textContent = fmtTime(g.time);
    $('#realspeed').textContent = (this.app.speed ? `running ${this.app.effSpeed.toFixed(1)}×` : 'paused') + ` · ${Math.round(this.app.fps)} fps`;
    if ((this.anT = (this.anT || 0) + 1) % 8 === 0) this.app.analytics.refresh();
    if (!$('#stats').classList.contains('hidden') && (force || (this.statsAt = (this.statsAt || 0) + 1) % 8 === 0)) this.renderStats();
    this.renderNations();
    this.renderLog();
    this.renderDetail();
    this.drawMini();
    this.toasts();
    if (g.over && !this.victoryShown) this.victory();
  }
  renderNations() {
    const g = this.g;
    const list = [...g.players].sort((a, b) => (b.alive - a.alive) || b.score() - a.score());
    const html = list.map(p => {
      const mil = p.units.reduce((a, u) => a + (g.military(u) ? u.pop : 0), 0), vil = p.units.filter(u => u.cls === 'villager').length;
      const wars = g.players.filter(q => q !== p && q.alive && g.rel[p.id][q.id] === 'war').length;
      const allies = g.players.filter(q => q !== p && q.alive && g.rel[p.id][q.id] === 'ally').map(q => q.name);
      const tags = [];
      if (p.cfg.llm?.enabled) tags.push(`<span class="tagp llm">🧠 ${esc(p.cfg.llm.model)} ${p.llm.status === 'error' ? '⚠' : p.llm.status === 'thinking' ? '…' : ''}</span>`);
      tags.push(`<span class="tagp">${GOVERNMENTS[p.government].name}</span>`);
      if (p.religion) tags.push(`<span class="tagp">✨ ${esc(p.religion.name.split(' of the ').pop())}</span>`);
      if (wars) tags.push(`<span class="tagp war">⚔ ${wars}</span>`);
      if (allies.length) tags.push(`<span class="tagp ally">🤝 ${esc(allies.join(', '))}</span>`);
      if (p.starving) tags.push(`<span class="tagp warn">famine</span>`);
      if (g.time < p.diseaseUntil) tags.push(`<span class="tagp warn">plague</span>`);
      if (g.time - p.lastAttacked < 15 && p.alive) tags.push(`<span class="tagp war">under attack</span>`);
      if (p.remnant && p.alive) { const left = g.assets(p); tags.push(`<span class="tagp war">🔍 hunted · ${left.blds} bld · ${left.units} people</span>`); }
      if (p.rebel) tags.push(`<span class="tagp warn">${p.band ? 'revolt' : 'rebels'} of ${esc(g.players[p.parent]?.name || '')}</span>`);
      if (p.unrest > 40 && p.alive) tags.push(`<span class="tagp warn">unrest ${p.unrest | 0}%</span>`);
      const ships = p.units.filter(u => u.cls === 'ship').length; if (ships) tags.push(`<span class="tagp">⚓ ${ships}</span>`);
      const hero = p.units.find(u => u.hero); if (hero) tags.push(`<span class="tagp hero">⭐ ${esc(hero.hero.first)} · ${HERO_LEVELS[hero.hero.level].title}</span>`);
      return `<div class="nation ${p.alive ? '' : 'dead'} ${this.sel?.p === p ? 'sel' : ''}" style="--c:${p.color}" data-pid="${p.id}">
        <div class="n-top"><span class="n-name">${esc(p.name)}</span><span class="tagp">${esc(p.profile.style)}</span><span class="n-age">${p.alive ? AGES[p.age - 1].short + (p.ageResearching ? '↑' : '') : '☠'}</span></div>
        <div class="n-sub">${esc(p.civ.name)} · ${p.civ.kind}${p.alive ? '' : ' · eliminated at ' + fmtTime(p.eliminatedAt)}</div>
        ${p.alive ? `<div class="n-stats"><span>Pop</span><b>${p.pop}/${p.popCap}</b><span>Army</span><b>${mil}</b><span>Vill.</span><b>${vil}</b><span>Score</span><b>${n0(p.score())}</b></div>
        <div class="n-bar" title="Happiness ${p.happiness | 0}"><i style="width:${p.happiness}%"></i>${p.unrest > 5 ? `<u style="width:${p.unrest}%" title="Unrest ${p.unrest | 0}"></u>` : ''}</div>` : ''}
        <div class="n-tags">${tags.join('')}</div></div>`;
    }).join('');
    if (html !== this._nh) { this.nationsEl.innerHTML = html; this._nh = html; this.nationsEl.querySelectorAll('.nation').forEach(d => d.onclick = () => this.selectPlayer(g.players[+d.dataset.pid])); }
  }
  renderDetail() {
    const o = this.sel, g = this.g;
    if (!o) return;
    let h = '';
    if (o.kind === 'player') h = this.playerDetail(o.p);
    else if (o.kind === 'unit') {
      if (o.dead) { this.select(null); return; }
      const p = g.players[o.owner], st = p.st(o.type), t = o.task;
      h = `<h3 style="color:${p.color}">${o.hero ? '⭐ ' + esc(o.hero.name) : esc(UNITS[o.type].name)}<button class="close">✕</button></h3><div class="hint">${esc(p.name)} · ${esc(p.civ.name)}${o.hero ? ` · ${HERO_LEVELS[o.hero.level].title}, fame ${o.hero.fame | 0}${HERO_LEVELS[o.hero.level + 1] ? ' / ' + HERO_LEVELS[o.hero.level + 1].fame : ''}` : ''}</div>
        <h4>Status</h4><div class="kv"><span>Health</span><b>${o.hp.toFixed(0)} / ${o.maxHp.toFixed(0)}</b><span>Morale</span><b>${o.morale.toFixed(0)}${o.routing ? ' (routing!)' : ''}</b><span>Population</span><b>${o.pop}</b>
        <span>Task</span><b>${esc(t.type)}${t.res ? ' ' + t.res : ''}</b><span>Kills</span><b>${o.kills}</b><span>Condition</span><b>${o.wounded ? 'wounded' : o.sick ? 'sick' : o.inside ? 'inside' : 'fit'}</b></div>
        <h4>Combat</h4><div class="kv"><span>Attack</span><b>${st.atk.toFixed(0)} ${st.dmg}</b><span>Armor</span><b>${st.ma} / ${st.pa}</b><span>Range</span><b>${st.range.toFixed(1)}</b><span>Speed</span><b>${st.speed.toFixed(2)}</b>${Object.keys(st.bonus).length ? `<span>Bonus</span><b>${Object.entries(st.bonus).map(([k, v]) => `+${v} vs ${k}`).join(', ')}</b>` : ''}</div>`;
    } else if (o.kind === 'building') {
      if (o.dead) { this.select(null); return; }
      const p = g.players[o.owner], B = BUILDINGS[o.type];
      const title = o.type === 'bazaar' ? 'Great Bazaar' : o.type === 'monument' && p ? esc(p.civ.monument.name) : o.townName ? `${esc(o.townName)} · ${esc(B.name)}` : esc(B.name);
      const gv = o.governor, extra = [o.type === 'monument' && p ? p.civ.monument.desc : '', gv ? `Governor ${esc(gv.name)} (${GOVERNOR_TRAITS[gv.trait].name}: ${GOVERNOR_TRAITS[gv.trait].desc})` : '', o === p?.tc ? `Capital · ${TOWN_RANKS[p.townRank].name}` : '', B?.gate ? (o.open ? 'Gate open' : 'Gate shut to strangers') : '', B?.trap ? (o.revealed ? 'Sprung and seen' : 'Hidden from enemies') : '', o.breach ? '⚠ A siege tower has breached this wall' : '', o.moat ? 'Ringed by a moat' : ''].filter(Boolean).join(' · ');
      h = `<h3 style="color:${p?.color || '#e3c26a'}">${title}<button class="close">✕</button></h3><div class="hint">${p ? esc(p.name) : 'Neutral trade hub. Caravans earn gold here.'}${extra ? ' · ' + extra : ''}</div>
        ${p ? `<div class="kv"><span>Health</span><b>${n0(o.hp)} / ${n0(o.maxHp)}</b>${o.done ? '' : `<span>Construction</span><b>${(o.progress * 100).toFixed(0)}% · ${o.nb} builders</b>`}${o.garrison.length ? `<span>Inside</span><b>${o.garrison.length}</b>` : ''}${o.loyalty != null && o.loyalty < 100 ? `<span>Loyalty</span><b>${o.loyalty | 0}%${o.loyalty < 30 ? ' ⚠ may rebel' : ''}</b>` : ''}${o.type === 'farm' ? `<span>Fertility</span><b>${o.food.toFixed(0)}</b>` : ''}</div>
        ${o.queue.length ? `<h4>Queue</h4>${o.queue.map(q => `<div class="kv"><span>${q.kind === 'unit' ? UNITS[q.key].name : q.kind === 'age' ? AGES[+q.key.slice(3) - 1].name : TECHS[q.key].name}</span><b>${(q.t / q.total * 100).toFixed(0)}%</b></div>`).join('')}` : ''}${o.blocked ? '<div class="hint">⚠ Waiting for housing</div>' : ''}` : ''}`;
    } else if (o.kind === 'node') {
      if (o.dead) { this.select(null); return; }
      h = `<h3>${o.res === 'lux' ? GOODS[o.good].icon + ' ' + GOODS[o.good].name + ' deposit' : o.fish ? 'Fish shoal' : ({ food: 'Berry bushes', gold: 'Gold mine', stone: 'Stone quarry', iron: 'Iron deposit' })[o.res]}<button class="close">✕</button></h3><div class="kv"><span>Remaining</span><b>${n0(o.amount)} ${o.res === 'lux' ? o.good : o.res}</b>${o.res === 'lux' ? `<span>Bazaar price</span><b>${g.prices[o.good].toFixed(1)} gold</b>` : ''}</div>${o.res === 'lux' ? '<div class="hint">A Plantation next to it grows luxury goods. Caravans sell them; people love them.</div>' : ''}`;
    } else if (o.kind === 'sacred') {
      const s = o.ref, p = g.players[s.owner];
      h = `<h3>Sacred Site<button class="close">✕</button></h3><div class="hint">Holding it gives +0.6 faith/s, gold and happiness.</div><div class="kv"><span>Held by</span><b>${p ? esc(p.name) : 'nobody'}</b>${s.claimant >= 0 ? `<span>Being claimed</span><b>${esc(g.players[s.claimant].name)} ${s.progress | 0}%</b>` : ''}</div>`;
    }
    if (h !== this._dh) {
      this.detailEl.innerHTML = h; this._dh = h;
      this.detailEl.querySelector('.close')?.addEventListener('click', () => this.select(null));
      this.detailEl.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { this.tab = b.dataset.tab; this.renderDetail(); });
    }
  }
  playerDetail(p) {
    const g = this.g, br = g.brains[p.id];
    const tabs = `<div class="tabs">${[['overview', 'Realm'], ['state', 'State & Faith'], ['army', 'Army'], ['mind', 'AI Mind']].map(([k, n]) => `<button data-tab="${k}" class="${this.tab === k ? 'on' : ''}">${n}</button>`).join('')}</div>`;
    let body = '';
    if (this.tab === 'overview') {
      const vil = p.units.filter(u => u.cls === 'villager'), jobs = br.jobCounts || {};
      body = `<h4>Treasury</h4><div class="res">${RES.map(r => `<div>${RES_ICON[r]}<br><b>${n0(p.res[r])}</b><small>${jobs[r] || 0} work</small></div>`).join('')}</div>
        <h4>Society</h4><div class="kv"><span>Population</span><b>${p.pop} / ${p.popCap} (max 400)</b><span>Villagers</span><b>${vil.length}</b><span>Happiness</span><b>${p.happiness.toFixed(0)} → ${(p.happyTarget || 0).toFixed(0)}</b><span>Unrest</span><b>${p.unrest.toFixed(0)}%${p.unrest > 70 ? ' ⚠ rebellion near' : ''}</b><span>Productivity</span><b>${(p.productivity * 100).toFixed(0)}%</b>
        <span>Food</span><b>${p.starving ? '⚠ FAMINE' : 'fed'}</b><span>Health</span><b>${g.time < p.diseaseUntil ? '🦠 plague' : 'healthy'}</b><span>Wounded / sick now</span><b>${p.units.filter(u => u.wounded || u.sick).length}</b><span>Healed so far</span><b>${p.stats.healed}</b></div>
        <h4>Capital &amp; luxuries</h4><div class="kv"><span>Capital</span><b>${esc(p.tc?.townName || '—')} · ${TOWN_RANKS[p.townRank].name}</b><span>Provinces</span><b>${p.blds.filter(b => b.done && b !== p.tc && (b.type === 'town_center' || b.type === 'castle')).length}</b>${Object.entries(GOODS).map(([k, G]) => `<span>${G.icon} ${G.name}</span><b>${n0(p.goods[k])} · ${g.prices[k].toFixed(1)} g</b>`).join('')}<span>Tolls earned</span><b>${n0(p.stats.tolls || 0)}</b></div>
        <h4>Progress</h4><div class="kv"><span>Age</span><b>${AGES[p.age - 1].name}${p.ageResearching ? ' (advancing)' : ''}</b><span>Technologies</span><b>${p.techs.size}</b><span>Buildings</span><b>${p.blds.filter(b => b.done).length} (+${p.blds.filter(b => !b.done).length} building)</b><span>Trade income</span><b>${n0(p.stats.trade)} gold</b><span>Sacred sites</span><b>${g.sacred.filter(s => s.owner === p.id).length}</b></div>`;
    } else if (this.tab === 'state') {
      const G = GOVERNMENTS[p.government];
      const provs = p.blds.filter(b => b.done && b !== p.tc && (b.type === 'town_center' || b.type === 'castle'));
      body = `<h4>Ruler</h4><div class="kv"><span>Ruler</span><b>${esc(p.rulerTitle())}</b><span>Age</span><b>${Math.round(p.rulerAge())} years</b>${p.party ? `<span>In power</span><b>${PARTIES[p.party].name}</b>` : ''}<span>Corruption</span><b>${p.corruption.toFixed(0)}%</b></div>
        <h4>Laws (${p.laws.size}/${p.maxLaws()})</h4>${p.laws.size ? [...p.laws].map(k => `<div class="thought"><b>${LAWS[k].name}</b> — ${LAWS[k].desc}</div>`).join('') : '<div class="hint">No laws decreed.</div>'}
        ${provs.length ? `<h4>Provinces</h4>${provs.map(b => `<div class="kv"><span>${esc(b.townName || BUILDINGS[b.type].name)}</span><b>loyalty ${(b.loyalty ?? 100) | 0}%${b.governor ? ' · ' + esc(b.governor.name) + ' (' + GOVERNOR_TRAITS[b.governor.trait].name + ')' : ''}</b></div>`).join('')}` : ''}
        <h4>Government</h4><div class="kv"><span>Form</span><b>${G.name}</b><span>Taxes</span><b>${TAX[p.tax].name} (+${(p.taxIncome || 0).toFixed(2)}/s)</b><span>Ministry upkeep</span><b>${(p.deptUpkeep || 0).toFixed(2)} gold/s</b></div><div class="hint">${G.desc}${g.time < p.anarchyUntil ? ' · ⚠ transition anarchy' : ''}</div>
        <h4>Ministries</h4>${p.has('council_hall') ? `<div class="dept">${Object.entries(DEPARTMENTS).map(([k, d]) => `<span>${d.name}</span><span class="pips">${[1, 2, 3].map(i => `<i class="${p.departments[k] >= i ? 'on' : ''}"></i>`).join('')}</span>`).join('')}</div>` : '<div class="hint">Needs a Council Hall.</div>'}
        <h4>Religion</h4>${p.religion ? `<div class="kv"><span>Faith</span><b>${p.religion.name}</b><span>Deity</span><b>${p.religion.deity}</b><span>Faith points</span><b>${n0(p.faith)} (+${(p.faithRate || 0).toFixed(1)}/s)</b></div><div class="hint">${DOCTRINES[p.religion.doctrine].desc}</div>${Object.keys(p.rites).length ? `<div class="hint">Active rites: ${Object.keys(p.rites).join(', ')}</div>` : ''}` : `<div class="hint">No religion yet (${n0(p.faith)} / 100 faith, needs a Shrine).</div>`}
        <h4>Relations</h4><div class="kv">${g.players.filter(q => q !== p).map(q => `<span style="color:${q.color}">${esc(q.name)}${q.alive ? '' : ' ☠'}</span><b>${g.rel[p.id][q.id]}${g.pacts.has(pactKey(p.id, q.id)) ? ' · 📜 trade pact' : ''}${g.embargo.has(p.id + '>' + q.id) ? ' · 🚫 we embargo' : ''}${g.embargo.has(q.id + '>' + p.id) ? ' · 🚫 embargoes us' : ''}${p.knows[q.id] ? '' : ' · unscouted'}</b>`).join('')}</div>`;
    } else if (this.tab === 'army') {
      const comp = {}; for (const u of p.units) if (g.military(u) || u.cls === 'support') comp[u.type] = (comp[u.type] || 0) + 1;
      const armies = [...br.armies.values()];
      body = `<h4>Forces</h4><div class="comp">${Object.entries(comp).map(([t, n]) => `<span>${n} ${UNITS[t].name}</span>`).join('') || '<span>none</span>'}</div>
        <h4>Armies</h4>${armies.map(a => `<div class="kv"><span>${a.kind === 'defense' ? '🛡 Home guard' : a.kind === 'attack' ? '⚔ Field army' : a.kind === 'raid' ? '🐎 Raiders' : '⛩ Warband'}${a.targetPid >= 0 && a.kind !== 'defense' ? ' → ' + esc(g.players[a.targetPid]?.name || '') : ''}</span><b>${a.units.size} · ${a.state} · str ${n0(a.strength || 0)}${a.morale ? ' · morale ' + (a.morale | 0) : ''}</b></div>`).join('')}
        <h4>Heroes</h4>${p.heroes.length ? p.heroes.slice(-6).reverse().map(hh => `<div class="kv"><span>${hh.died ? '☠' : '⭐'} ${esc(hh.name)}</span><b>${HERO_LEVELS[hh.level].title} · fame ${hh.fame | 0}${hh.died ? ' · fell at ' + fmtTime(hh.died) : ''}</b></div>`).join('') : '<div class="hint">No hero yet (trained at a Barracks from the Feudal Age).</div>'}
        <h4>Navy</h4><div class="hint">${br.coast ? `${p.units.filter(u => u.type === 'fishing_boat').length} fishing boats · ${p.units.filter(u => u.cls === 'ship').length} warships · ${p.blds.filter(b => b.type === 'dock' && b.done).length} docks${br.fleetMission ? ' · fleet at sea against ' + esc(g.players[br.fleetMission.target]?.name || '') : ''}` : 'Landlocked: no sea near the capital.'}</div>
        <h4>Record</h4><div class="kv"><span>Kills</span><b>${p.stats.kills}</b><span>Captured</span><b>${p.stats.captured || 0}</b><span>Losses</span><b>${p.stats.losses}</b><span>Wounded (survived)</span><b>${p.stats.wounded}</b><span>Buildings razed</span><b>${p.stats.razed}</b><span>Buildings lost</span><b>${p.stats.lost}</b><span>Units trained</span><b>${p.stats.unitsMade}</b></div>
        ${armies.find(a => a.kind !== 'defense' && a.center) ? `<button class="btn small" id="go-army">👁 Watch the field army</button>` : ''}`;
    } else {
      const d = br.directive;
      body = `<h4>Personality</h4><div class="hint">${esc(p.profile.style)} · aggression ${(p.profile.aggression * 100) | 0}% · economy ${(p.profile.eco * 100) | 0}% · defense ${(p.profile.defense * 100) | 0}% · faith ${(p.profile.faith * 100) | 0}%</div>
        <h4>Strategist</h4><div class="kv"><span>Mode</span><b>${p.cfg.llm?.enabled ? `Live: ${esc(p.cfg.llm.model)}` : this.app.replay && d ? 'Recorded orders (replay)' : 'Built-in personality'}</b>${p.cfg.llm?.enabled ? `<span>Status</span><b>${p.llm.status === 'thinking' ? `🧠 thinking… ${((Date.now() - p.llm.since) / 1000).toFixed(0)} s` : p.llm.status} · ${p.llm.calls} calls${p.llm.ms ? ' · last ' + (p.llm.ms / 1000).toFixed(1) + ' s' : ''}${p.llm.errors ? ' · ' + p.llm.errors + ' errors' : ''}</b><span>Calls</span><b>${p.cfg.llm.smart === false ? 'fixed schedule' : `smart · ${callsSaved(g, p)} calls saved`}${p.llm.why ? ' · last asked because ' + esc(p.llm.why) : ''}</b><span>Budget</span><b>$${(p.llm.spent || 0).toFixed(2)} of ${p.cfg.llm.budget ? '$' + p.cfg.llm.budget.toFixed(2) : 'no limit'}${p.llm.status === 'budget' ? ' · used up, the general rules alone' : ''}${p.llm.wakeAt && p.llm.wakeAt > g.time ? ' · next check-in ' + fmtTime(p.llm.wakeAt) + ' (its choice)' : ''}</b>` : ''}${d ? `<span>Posture</span><b>${d.posture || '—'}${d.attack ? ' · attack ' + d.attack : ''}${d.target != null && g.players[d.target] ? ' · target ' + esc(g.players[d.target].name) : ''}${d.focus ? ' · focus ' + d.focus : ''}</b>` : ''}</div>${p.llm.error && p.llm.status === 'error' ? `<div class="hint">⚠ ${esc(p.llm.error)}</div>` : ''}${d?.plan ? `<div class="thought plan"><b>Plan:</b> ${esc(d.plan)}</div>` : ''}${d?.reason ? `<div class="thought"><b>Reason:</b> ${esc(d.reason)}</div>` : ''}
        ${p.llm.history?.length ? `<h4>Orders from the model</h4>${p.llm.history.slice(0, 6).map(hh => `<div class="thought"><b>${fmtTime(hh.t)}</b> ${esc([hh.d.posture, hh.d.attack && 'attack ' + hh.d.attack, hh.d.target != null && g.players[hh.d.target] && '→ ' + g.players[hh.d.target].name, hh.d.research?.length && 'research ' + hh.d.research.join(', '), hh.d.build?.length && 'build ' + hh.d.build.join(', '), hh.d.government, hh.d.fleet != null && 'fleet ' + hh.d.fleet].filter(Boolean).join(' · '))}${hh.d.reason ? `<br><i>${esc(hh.d.reason)}</i>` : ''}</div>`).join('')}` : ''}
        <h4>Recent thoughts</h4>${p.thoughts.slice(0, 18).map(t => `<div class="thought"><b>${fmtTime(t.t)}</b> ${esc(t.text)}</div>`).join('') || '<div class="hint">…</div>'}`;
    }
    setTimeout(() => { const b = document.getElementById('go-army'); if (b) b.onclick = () => { const a = [...br.armies.values()].find(a => a.kind !== 'defense' && a.center); if (a) { this.r.focus(a.center.x, a.center.y, 0.9); this.app.director = false; $('#t-director').classList.remove('on'); } }; }, 0);
    return `<h3 style="color:${p.color}">${esc(p.name)}<button class="close">✕</button></h3><div class="hint">${esc(p.civ.name)} — ${esc(p.civ.desc)}</div>${tabs}${body}`;
  }
  renderLog() {
    const g = this.g;
    if (g.events[0] === this.lastEv) return;
    this.lastEv = g.events[0];
    const f = this.logFilter, map = { war: ['war', 'big'], diplo: ['diplo', 'trade'], civic: ['civic', 'religion', 'age', 'tech', 'disease', 'build'], chat: ['chat'] };
    const evs = g.events.filter(e => f === 'all' || map[f].includes(e.kind)).slice(0, 80);
    const box = $('#log-list');
    box.innerHTML = evs.map((e, i) => `<div class="ev ${e.kind} ${e.x != null ? 'loc' : ''}" data-i="${i}"><time>${fmtTime(e.t)}</time>${esc(e.text)}</div>`).join('');
    box.querySelectorAll('.ev.loc').forEach(d => d.onclick = () => { const e = evs[+d.dataset.i]; this.r.focus(e.x, e.y, Math.max(0.8, this.r.cam.zoom)); this.app.director = false; $('#t-director').classList.remove('on'); });
  }
  drawMini() {
    const c = this.mini.getContext('2d'), g = this.g, W = this.mini.width = 600, H = this.mini.height = 300, N = g.N;
    c.drawImage(this.miniBase, 0, 0, W, H);
    const P = (x, y) => [((x - y) / N / 2 + 0.5) * W, (x + y) / N / 2 * H];
    for (const b of g.buildings) { if (b.owner < 0 || b.dead) continue; const [x, y] = P(b.x + b.size / 2, b.y + b.size / 2); c.fillStyle = g.players[b.owner].color; const s = b.type === 'town_center' || b.type === 'castle' ? 7 : b.type === 'farm' ? 2.5 : 3.5; c.fillRect(x - s / 2, y - s / 2, s, s); }
    for (const u of g.units) { if (u.dead || u.inside || u.cls === 'villager') continue; const [x, y] = P(u.x, u.y); c.fillStyle = g.players[u.owner].color; c.fillRect(x - 1, y - 1, 2, 2); }
    for (const s of g.sacred) { const [x, y] = P(s.x, s.y); c.fillStyle = s.owner >= 0 ? g.players[s.owner].color : '#fff'; c.beginPath(); c.arc(x, y, 4, 0, 7); c.fill(); c.strokeStyle = '#000'; c.stroke(); }
    { const [x, y] = P(g.bazaar.x + 2.5, g.bazaar.y + 2.5); c.fillStyle = '#e3c26a'; c.beginPath(); c.moveTo(x, y - 6); c.lineTo(x + 6, y); c.lineTo(x, y + 6); c.lineTo(x - 6, y); c.fill(); }
    // battles
    const cols = Math.ceil(N / 16);
    for (let i = 0; i < g.heat.length; i++) if (g.heat[i] > 6) { const [x, y] = P((i % cols) * 16 + 8, ((i / cols) | 0) * 16 + 8); c.strokeStyle = `rgba(255,80,60,${Math.min(1, g.heat[i] / 40)})`; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 6 + Math.min(10, g.heat[i] / 8), 0, 7); c.stroke(); }
    // camera
    const r = this.r, pts = [r.toWorld(0, 0), r.toWorld(r.w, 0), r.toWorld(r.w, r.h), r.toWorld(0, r.h)].map(([x, y]) => P(x, y));
    c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.stroke();
  }
  toasts() {
    const g = this.g, box = $('#toasts');
    const fresh = g.events.filter(e => e.kind === 'big' && e.t > this.toastAt);
    if (fresh.length) {
      this.toastAt = g.time;
      for (const e of fresh.slice(0, 2)) {
        const t = document.createElement('div'); t.className = 'toast' + (e.text.includes('🏆') || e.text.includes('Wonder') ? ' gold' : ''); t.textContent = e.text;
        if (e.x != null) t.onclick = () => this.r.focus(e.x, e.y, 0.9);
        box.appendChild(t); setTimeout(() => t.remove(), 7000);
      }
    }
  }
  // ------------------------------------------------------------ stats screen
  toggleStats(force) {
    const el = $('#stats'), show = force ?? el.classList.contains('hidden');
    el.classList.toggle('hidden', !show);
    if (show) this.renderStats(true);
  }
  closeStats() { $('#stats').classList.add('hidden'); }
  renderStats(full) {
    const g = this.g, el = $('#stats');
    const tabs = [['score', 'Score'], ['power', 'Army strength'], ['mil', 'Army population'], ['vil', 'Villagers'], ['gathered', 'Resources gathered'], ['kills', 'Kills'], ['blds', 'Buildings'], ['happy', 'Happiness']];
    const main = g.players.filter(p => !p.rebel || p.alive);
    if (full || !el.querySelector('canvas')) {
      el.innerHTML = `<div class="st-wrap"><header><h2>📊 Battle statistics · ${fmtTime(g.time)}</h2><span class="grow"></span><button class="btn small" id="st-rep">💾 Replay file</button><button class="btn small ghost" id="st-close">✕</button></header>
        <div class="tabs st-tabs">${tabs.map(([k, n]) => `<button data-k="${k}" class="${this.statsTab === k ? 'on' : ''}">${n}</button>`).join('')}</div>
        <div class="st-body"><div class="st-chart"><canvas id="st-cv" width="1400" height="560"></canvas><div class="st-legend">${main.map(p => `<span style="--c:${p.color}">${esc(p.name)}${p.alive ? '' : ' ☠'}</span>`).join('')}</div></div>
        <div class="st-side"><h4>Key moments</h4><div id="st-moments"></div><h4>Heroes</h4><div id="st-heroes"></div></div></div>
        <table class="st-table" id="st-table"></table></div>`;
      el.querySelectorAll('.st-tabs button').forEach(b => b.onclick = () => { this.statsTab = b.dataset.k; this.renderStats(true); });
      $('#st-close').onclick = () => this.closeStats();
      $('#st-rep').onclick = () => downloadJSON(this.app.replay || replayOf(g), `dominion-replay-${g.seed}.json`);
    }
    // chart
    const cv = $('#st-cv'), c = cv.getContext('2d'), W = cv.width, H = cv.height, k = this.statsTab;
    const L = 70, B = 40, T = 20, Rr = 20;
    c.clearRect(0, 0, W, H);
    const series = main.map(p => ({ p, pts: p.stats.timeline.map(s => [s.t, s[k] ?? 0]) }));
    const maxT = Math.max(60, ...series.flatMap(s => s.pts.map(q => q[0]))), maxV = Math.max(1, ...series.flatMap(s => s.pts.map(q => q[1])));
    const X = t => L + t / maxT * (W - L - Rr), Y = v => H - B - v / maxV * (H - B - T);
    c.font = '20px system-ui'; c.fillStyle = '#9a9384'; c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { const v = maxV * i / 4, y = Y(v); c.beginPath(); c.moveTo(L, y); c.lineTo(W - Rr, y); c.stroke(); c.textAlign = 'right'; c.fillText(v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'k' : Math.round(v), L - 10, y + 7); }
    c.textAlign = 'center'; const step = maxT > 7200 ? 1800 : maxT > 3600 ? 900 : 600;
    for (let t = 0; t <= maxT; t += step) c.fillText(Math.round(t / 60) + ' min', X(t), H - 10);
    // key moments as faint markers
    for (const m of g.moments) if (/captures|eliminated|surrenders|Revolt|revolt|Wonder/.test(m.text)) { c.strokeStyle = 'rgba(255,215,106,0.18)'; c.beginPath(); c.moveTo(X(m.t), T); c.lineTo(X(m.t), H - B); c.stroke(); }
    for (const s of series) {
      if (!s.pts.length) continue;
      c.strokeStyle = s.p.color; c.lineWidth = s.p.alive ? 3.5 : 2; c.globalAlpha = s.p.alive ? 1 : 0.55; c.lineJoin = 'round';
      c.beginPath(); s.pts.forEach(([t, v], i) => i ? c.lineTo(X(t), Y(v)) : c.moveTo(X(t), Y(v))); c.stroke();
      const [lt, lv] = s.pts[s.pts.length - 1]; c.fillStyle = s.p.color; c.beginPath(); c.arc(X(lt), Y(lv), 5, 0, 7); c.fill();
      c.globalAlpha = 1;
    }
    // moments list & heroes (rebuilt only when changed)
    const mk = g.moments.length + ':' + g.players.reduce((a, p) => a + p.heroes.length, 0);
    if (mk !== this._stMk || full) {
      this._stMk = mk;
      const ms = g.moments.slice(-60).reverse();
      $('#st-moments').innerHTML = ms.map((m, i) => `<div class="ev ${m.x != null ? 'loc' : ''}" data-i="${i}"><time>${fmtTime(m.t)}</time>${esc(m.text)}</div>`).join('') || '<div class="hint">Nothing yet.</div>';
      $('#st-moments').querySelectorAll('.ev.loc').forEach(d => d.onclick = () => { const m = ms[+d.dataset.i]; this.r.focus(m.x, m.y, 0.95); this.app.director = false; $('#t-director').classList.remove('on'); this.closeStats(); });
      const heroes = g.players.flatMap(p => p.heroes.map(h => ({ h, p }))).sort((a, b) => b.h.fame - a.h.fame).slice(0, 12);
      $('#st-heroes').innerHTML = heroes.map(({ h, p }) => `<div class="kv"><span style="color:${p.color}">${h.died ? '☠' : '⭐'} ${esc(h.name)}</span><b>${HERO_LEVELS[h.level].title} · fame ${h.fame | 0}</b></div>`).join('') || '<div class="hint">No heroes yet.</div>';
    }
    $('#st-table').innerHTML = `<tr><th>Nation</th><th>Score</th><th>Pop</th><th>Kills</th><th>Losses</th><th>Captured</th><th>Razed</th><th>Healed</th><th>Gathered</th><th>Trade</th><th>Unrest</th></tr>` + main.map(p => `<tr><td style="color:${p.color}">${esc(p.name)}${p.alive ? '' : ' ☠'}</td><td>${n0(p.score())}</td><td>${p.alive ? p.pop : '—'}</td><td>${p.stats.kills}</td><td>${p.stats.losses}</td><td>${p.stats.captured || 0}</td><td>${p.stats.razed}</td><td>${p.stats.healed}</td><td>${n0(Object.values(p.stats.gathered).reduce((a, b) => a + b, 0))}</td><td>${n0(p.stats.trade)}</td><td>${p.alive ? (p.unrest | 0) + '%' : '—'}</td></tr>`).join('');
  }
  victory() {
    this.victoryShown = true;
    const g = this.g, o = g.over, w = o.winners.map(i => g.players[i]);
    const box = $('#victory'); box.classList.remove('hidden');
    const rows = [...g.players].sort((a, b) => b.score() - a.score()).map(p => `<tr><td style="color:${p.color}">${esc(p.name)} <small>${esc(p.civ.name)}</small></td><td>${p.alive ? '👑' : fmtTime(p.eliminatedAt)}</td><td>${AGES[p.age - 1].short}</td><td>${p.stats.kills}</td><td>${p.stats.losses}</td><td>${p.stats.razed}</td><td>${p.stats.unitsMade}</td><td>${n0(Object.values(p.stats.gathered).reduce((a, b) => a + b, 0))}</td><td>${GOVERNMENTS[p.government].name}</td><td>${p.religion ? esc(p.religion.name) : '—'}</td></tr>`).join('');
    box.innerHTML = `<div class="vic"><h2>🏆 ${w.length ? w.map(p => esc(p.name)).join(' & ') + (w.length > 1 ? ' win' : ' wins') : 'No one survives'}</h2><div class="sub">${w.map(p => esc(p.civ.name)).join(', ')} · ${(o.how || 'Conquest').toLowerCase()} victory after ${fmtTime(o.time)}</div>
      <canvas id="vic-chart" width="1700" height="400"></canvas>
      <table><tr><th>Nation</th><th>Fate</th><th>Age</th><th>Kills</th><th>Losses</th><th>Razed</th><th>Trained</th><th>Gathered</th><th>Government</th><th>Religion</th></tr>${rows}</table>
      <div class="acts"><button class="btn" id="v-watch">Keep watching</button><button class="btn" id="v-stats">📊 Full stats</button><button class="btn" id="v-rep">💾 Download replay</button><button class="btn primary" id="v-new">New battle</button></div></div>`;
    $('#v-watch').onclick = () => box.classList.add('hidden');
    $('#v-stats').onclick = () => { box.classList.add('hidden'); this.toggleStats(true); };
    $('#v-rep').onclick = () => downloadJSON(this.app.replay || replayOf(g), `dominion-replay-${g.seed}.json`);
    $('#v-new').onclick = () => this.app.exit(); // the battle is already over: no need to ask
    const cv = $('#vic-chart'), c = cv.getContext('2d');
    const maxT = Math.max(1, ...g.players.flatMap(p => p.stats.timeline.map(s => s.t))), maxS = Math.max(1, ...g.players.flatMap(p => p.stats.timeline.map(s => s.score)));
    c.strokeStyle = 'rgba(255,255,255,.1)'; for (let k = 1; k < 5; k++) { c.beginPath(); c.moveTo(0, 400 * k / 5); c.lineTo(1700, 400 * k / 5); c.stroke(); }
    for (const p of g.players) { c.strokeStyle = p.color; c.lineWidth = 4; c.beginPath(); p.stats.timeline.forEach((s, i) => { const x = s.t / maxT * 1680 + 10, y = 390 - s.score / maxS * 370; i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke(); }
    c.fillStyle = '#a39d8e'; c.font = '24px system-ui'; c.fillText('Score over time', 16, 34);
  }
}
