// Main menu: battle setup, API keys and models, codex.
import { AI, AI_KEYS, CIVS, PLAYER_COLORS, MAP_TYPES, PROVIDERS, UNITS, BUILDINGS, GOVERNMENTS, DOCTRINES, DEPARTMENTS, AGES, RITES } from '../config.js';
import { listReplays, deleteReplay, importReplay, downloadJSON } from '../replay.js';
import { schedule, applyElo, rankResult, ELO_START } from '../tourney.js';
import { addRecords, loadPrices, savePrices } from '../records.js';
import { DEFAULT_PRICES } from '../analytics.js';
const fmtMin = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const escH = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ELO_LS = 'aoai-elo';

const $ = s => document.querySelector(s);
const el = (tag, attrs = {}, html = '') => { const e = document.createElement(tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (html) e.innerHTML = html; return e; };
const LS = 'aoai-dominion';
const load = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch { return {}; } };
const save = d => { try { localStorage.setItem(LS, JSON.stringify(d)); } catch { /* private mode */ } };
const MAP_SW = { continental: 'linear-gradient(90deg,#2a5a8a,#5a8a3c 30%,#6a9a46 60%,#2a5a8a)', steppe: 'linear-gradient(90deg,#a89a56,#8aa04a,#b0a05a)', highlands: 'linear-gradient(90deg,#6a7a4a,#8a8070,#e8ecef 70%,#7a8a5a)', rivers: 'repeating-linear-gradient(90deg,#5a8a3c 0 22px,#3a7ab0 22px 28px)', forest: 'linear-gradient(90deg,#2c5530,#3c6a36,#2c5530)' };

export class Menu {
  constructor(onStart, onReplay) {
    this.onStart = onStart; this.onReplay = onReplay;
    const saved = load();
    this.keys = saved.keys || {};
    this.remember = !!saved.remember;
    this.models = saved.models || {};
    this.setup = saved.setup || null;
    this.mapType = this.setup?.mapType || 'continental';
    this.players = this.setup?.players || this.defaultPlayers(4);
    this.bind();
    this.renderMaps(); this.renderPlayers(); this.renderKeys(); this.renderCodex(); this.renderReplays(); this.initTourney();
    $('#opt-seed').value = (Math.random() * 1e6) | 0;
    if (this.setup) for (const [id, k] of [['#opt-budget', 'budget'], ['#opt-smart', 'smart'], ['#opt-defeat', 'defeat'], ['#opt-llm', 'llmInterval'], ['#opt-victory', 'victory'], ['#opt-size', 'size'], ['#opt-mode', 'mode'], ['#opt-res', 'resources'], ['#opt-peace', 'peace'], ['#opt-speed', 'speed']]) if (this.setup[k] != null) $(id).value = this.setup[k];
    fetch('/api/env-keys').then(r => r.json()).then(e => { this.envKeys = e; this.renderKeys(); }).catch(() => {});
  }
  defaultPlayers(n) { return AI_KEYS.slice(0, n).map((k, i) => ({ ai: k, civ: AI[k].civ, color: i, team: i % 2, live: false })); }
  show(which = 'home') {
    $('#menu').classList.remove('hidden');
    for (const p of ['home', 'setup', 'keys', 'codex', 'replays', 'tourney']) $('#menu-' + p).classList.toggle('hidden', p !== which);
    if (which === 'replays') this.renderReplays();
  }
  hide() { $('#menu').classList.add('hidden'); }
  bind() {
    document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => this.show(b.dataset.go));
    $('#reseed').onclick = () => { $('#opt-seed').value = (Math.random() * 1e6) | 0; };
    $('#addp').onclick = () => { if (this.players.length >= 8) return; const used = new Set(this.players.map(p => p.ai)); const k = AI_KEYS.find(a => !used.has(a)) || AI_KEYS[this.players.length % 8]; const usedC = new Set(this.players.map(p => p.color)); this.players.push({ ai: k, civ: AI[k].civ, color: [...Array(8).keys()].find(c => !usedC.has(c)), team: this.players.length % 2, live: false }); this.renderPlayers(); };
    $('#all8').onclick = () => { this.players = this.defaultPlayers(8); this.renderPlayers(); };
    $('#duel').onclick = () => { this.players = [{ ai: 'claude', civ: AI.claude.civ, color: 0, team: 0, live: false }, { ai: 'chatgpt', civ: AI.chatgpt.civ, color: 1, team: 1, live: false }]; $('#opt-size').value = '256'; this.renderPlayers(); };
    $('#opt-mode').onchange = () => this.renderPlayers();
    $('#start').onclick = () => this.start();
    $('#quick8').onclick = () => { this.players = this.defaultPlayers(8); this.mapType = 'continental'; $('#opt-size').value = '512'; $('#opt-mode').value = 'ffa'; this.renderPlayers(); this.renderMaps(); this.start(); };
    $('#remember').checked = this.remember;
    $('#remember').onchange = () => { this.remember = $('#remember').checked; this.persist(); };
  }
  persist() { save({ remember: this.remember, keys: this.remember ? this.keys : {}, models: this.models, setup: this.setup }); }
  renderMaps() {
    const box = $('#map-types'); box.innerHTML = '';
    for (const [k, m] of Object.entries(MAP_TYPES)) {
      const d = el('div', { class: 'map-card' + (k === this.mapType ? ' on' : '') }, `<div class="swatch" style="background:${MAP_SW[k]}"></div><b>${m.name}</b><span>${m.desc}</span>`);
      d.onclick = () => { this.mapType = k; this.renderMaps(); };
      box.appendChild(d);
    }
  }
  renderPlayers() {
    const box = $('#players'); box.innerHTML = '';
    const teams = $('#opt-mode').value === 'teams';
    $('#pcount').textContent = `· ${this.players.length} / 8`;
    this.players.forEach((p, i) => {
      const prof = AI[p.ai];
      const row = el('div', { class: 'prow' });
      const sw = el('div', { class: 'sw', title: 'Change colour', style: `background:${PLAYER_COLORS[p.color].hex}` });
      sw.onclick = () => { const used = new Set(this.players.map(q => q.color)); let c = p.color; do { c = (c + 1) % 8; } while (used.has(c) && c !== p.color); p.color = c; this.renderPlayers(); };
      const ai = el('select'); for (const k of AI_KEYS) ai.appendChild(el('option', { value: k, ...(k === p.ai ? { selected: '' } : {}) }, `${AI[k].name} — ${AI[k].style}`));
      ai.onchange = () => { p.ai = ai.value; p.civ = AI[p.ai].civ; this.renderPlayers(); };
      const civ = el('select'); civ.appendChild(el('option', { value: 'random' }, '🎲 Random nation'));
      for (const [k, c] of Object.entries(CIVS)) civ.appendChild(el('option', { value: k, ...(k === p.civ ? { selected: '' } : {}) }, `${c.name} (${c.kind})`));
      civ.onchange = () => { p.civ = civ.value; this.renderPlayers(); };
      const team = el('select', { class: 'teamsel' }); for (let t = 0; t < 4; t++) team.appendChild(el('option', { value: t, ...(t === p.team ? { selected: '' } : {}) }, `Team ${t + 1}`));
      team.onchange = () => { p.team = +team.value; };
      if (!teams) team.disabled = true;
      const live = el('label', { class: 'live', title: `Use the real ${prof.name} API (${this.models[p.ai] || prof.model})` }, `<input type="checkbox" ${p.live ? 'checked' : ''}/> Live`);
      live.querySelector('input').onchange = e => { p.live = e.target.checked; };
      const x = el('button', { class: 'x', title: 'Remove' }, '✕'); x.onclick = () => { if (this.players.length > 2) { this.players.splice(i, 1); this.renderPlayers(); } };
      row.append(sw, ai, civ, team, live, x);
      const C = CIVS[p.civ];
      row.appendChild(el('div', { class: 'civd' }, C ? `<b>${C.name}</b>: ${C.desc}` : 'A random nation is drawn at the start.'));
      box.appendChild(row);
    });
  }
  renderKeys() {
    const box = $('#keys'); box.innerHTML = '';
    for (const [k, name] of Object.entries(PROVIDERS)) {
      const row = el('div', { class: 'krow' });
      const env = this.envKeys?.[k];
      row.appendChild(el('div', {}, `<b>${name}</b>`));
      const inp = el('input', { type: 'password', placeholder: k === 'custom' ? 'API key for your OpenAI-compatible server' : env ? 'Using server environment key' : 'API key', value: this.keys[k] || '', autocomplete: 'off' });
      inp.oninput = () => { this.keys[k] = inp.value.trim(); this.persist(); this.renderBadges(); };
      row.appendChild(inp);
      row.appendChild(el('span', { class: 'badge', 'data-badge': k }));
      box.appendChild(row);
      if (k === 'custom') { const r2 = el('div', { class: 'krow' }); r2.appendChild(el('div', {}, 'Custom base URL')); const u = el('input', { type: 'text', placeholder: 'http://localhost:11434/v1', value: this.keys.customUrl || '' }); u.oninput = () => { this.keys.customUrl = u.value.trim(); this.persist(); }; r2.append(u, el('span')); box.appendChild(r2); }
    }
    this.renderBadges();
    const mb = $('#models'); mb.innerHTML = '';
    for (const k of AI_KEYS) {
      const a = AI[k], row = el('div', { class: 'mrow' });
      row.appendChild(el('b', {}, a.name));
      const prov = el('select'); for (const [pk, pn] of Object.entries(PROVIDERS)) prov.appendChild(el('option', { value: pk, ...((this.models[k + ':p'] || a.provider) === pk ? { selected: '' } : {}) }, pn));
      prov.onchange = () => { this.models[k + ':p'] = prov.value; this.persist(); };
      const mi = el('input', { type: 'text', value: this.models[k] || a.model });
      // price per million tokens (input / output), used by the analytics to show cost
      const prices = loadPrices(), cur = () => this.models[k] || a.model;
      const pin = el('input', { type: 'number', class: 'price', step: '0.01', min: '0', title: '$ per million input tokens', placeholder: '$ in' }), pout = el('input', { type: 'number', class: 'price', step: '0.01', min: '0', title: '$ per million output tokens', placeholder: '$ out' });
      const fill = () => { const pr = loadPrices()[cur()] || DEFAULT_PRICES[cur()]; pin.value = pr ? pr[0] : ''; pout.value = pr ? pr[1] : ''; };
      const store = () => { const all = loadPrices(); if (pin.value !== '' && pout.value !== '') all[cur()] = [+pin.value, +pout.value]; else delete all[cur()]; savePrices(all); };
      pin.oninput = pout.oninput = store; fill(); void prices;
      mi.oninput = () => { this.models[k] = mi.value.trim(); this.persist(); fill(); };
      row.append(prov, mi, pin, pout); mb.appendChild(row);
    }
  }
  renderBadges() { document.querySelectorAll('[data-badge]').forEach(b => { const k = b.dataset.badge; const ok = this.keys[k] || this.envKeys?.[k]; b.className = 'badge' + (ok ? ' ok' : ''); b.textContent = ok ? (this.keys[k] ? 'key set' : 'env key') : 'no key'; }); }
  renderCodex() {
    const box = $('#codex');
    const t = rows => `<table>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;
    const cost = c => Object.entries(c).map(([r, v]) => `${v} ${r}`).join(', ');
    box.innerHTML = [
      `<div class="cx"><h4>How a battle works</h4><p class="hint">Every nation is played by an AI. Villagers gather food, wood, stone, gold and iron, build towns and feed everyone. Ages are a pyramid: each new age needs two different buildings from the age before. Armies march in formation, fight with flanking, charges, high ground and morale, and can rout. Fallen soldiers may survive as wounded and walk to an infirmary or hospital to heal. Under total conquest a nation falls only when every building and every person it has is destroyed; once its last Town Center and Castle are gone its remnants are revealed and hunted. With the faster rule, losing all Town Centers and Castles is enough. Villagers repair damaged buildings and rebuild destroyed ones on their ruins. Last nation (or team) standing wins, or a Wonder that stands for 15 minutes, or the best score when the optional time limit runs out.</p></div>`,
      `<div class="cx"><h4>Ages</h4>${t(AGES.map(a => [a.name, a.cost ? `${cost(a.cost)} · needs ${a.need} of: ${a.from.join(', ').replaceAll('_', ' ')}` : 'start']))}</div>`,
      `<div class="cx"><h4>Nations</h4>${t(Object.values(CIVS).map(c => [`${c.name}<br><small>${c.kind}</small>`, c.desc]))}</div>`,
      `<div class="cx"><h4>Units · population</h4>${t(Object.values(UNITS).map(u => [u.name, `${u.pop} pop · ${u.hp} hp · ${u.atk} atk · ${cost(u.cost)}`]))}</div>`,
      `<div class="cx"><h4>Buildings</h4>${t(Object.values(BUILDINGS).map(b => [b.name, `Age ${b.age} · ${cost(b.cost)}${b.requires ? ' · needs ' + b.requires.join(', ').replaceAll('_', ' ') : ''}`]))}</div>`,
      `<div class="cx"><h4>Governments</h4>${t(Object.values(GOVERNMENTS).map(g => [g.name, `Age ${g.age} · ${g.desc}`]))}</div>`,
      `<div class="cx"><h4>Ministries (Council Hall)</h4>${t(Object.values(DEPARTMENTS).map(d => [d.name, Object.entries(d.fx).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(', ') + ' per level']))}</div>`,
      `<div class="cx"><h4>Invented religions</h4>${t(Object.values(DOCTRINES).map(d => [d.name, `${d.deity}. ${d.desc}`]))}<p class="hint">Rites: ${Object.values(RITES).map(r => `${r.name} (${r.faith} faith)`).join(', ')}.</p></div>`,
      `<div class="cx"><h4>AI personalities</h4>${t(AI_KEYS.map(k => [AI[k].name, `${AI[k].style} · prefers ${CIVS[AI[k].civ].name}, ${GOVERNMENTS[AI[k].gov].name}`]))}</div>`,
    ].join('');
  }
  // ------------------------------------------------------------ replays
  renderReplays() {
    const box = $('#replays'); if (!box) return;
    const list = listReplays();
    box.innerHTML = list.length ? '' : '<p class="hint">No replays yet. Watch a battle; it is saved when it ends or when you return to the menu.</p>';
    for (const r of list) {
      const s = r.summary || {};
      const row = el('div', { class: 'reprow' }, `<div><b>${(s.players || []).map(p => `<span style="color:${p.color}">${escH(p.name)}${p.live ? ' 🧠' : ''}</span>`).join(' · ')}</b>
        <div class="hint">${new Date(r.date).toLocaleString()} · ${escH(s.map || '')} ${s.size || ''} · ${fmtMin(s.time || 0)} · ${s.winners?.length ? '🏆 ' + escH(s.winners.join(' & ')) + ' (' + escH(s.how) + ')' : escH(s.how || 'unfinished')}</div></div>`);
      const watch = el('button', { class: 'btn primary small' }, '▶ Watch'); watch.onclick = () => this.onReplay(r);
      const dl = el('button', { class: 'btn small' }, '💾'); dl.title = 'Download file'; dl.onclick = () => downloadJSON(r, `dominion-replay-${r.setup.seed}.json`);
      const del = el('button', { class: 'btn ghost small' }, '✕'); del.title = 'Delete'; del.onclick = () => { deleteReplay(r.id); this.renderReplays(); };
      const acts = el('div', { class: 'acts' }); acts.append(watch, dl, del); row.appendChild(acts);
      box.appendChild(row);
    }
    const f = $('#rep-file');
    if (f && !f.onchange) f.onchange = () => { const file = f.files[0]; if (!file) return; file.text().then(t => { try { importReplay(t); this.renderReplays(); } catch (e) { alert('Could not open this replay: ' + e.message); } f.value = ''; }); };
  }

  // ------------------------------------------------------------ tournament
  initTourney() {
    const box = $('#t-ais'); if (!box) return;
    box.innerHTML = AI_KEYS.map(k => `<label class="check"><input type="checkbox" value="${k}" checked /> ${AI[k].name} <small>${AI[k].style}</small></label>`).join('');
    const wsel = $('#t-workers'), cores = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);
    for (let i = 1; i <= Math.min(8, cores); i++) wsel.appendChild(el('option', { value: i, ...(i === Math.min(4, cores) ? { selected: '' } : {}) }, String(i)));
    $('#t-run').onclick = () => this.running ? this.stopTourney() : this.runTourney();
    $('#t-reset').onclick = () => { try { localStorage.removeItem(ELO_LS); } catch { /* ignore */ } this.renderLadder(); };
    this.renderLadder();
  }
  ladder() { try { return JSON.parse(localStorage.getItem(ELO_LS) || '{}'); } catch { return {}; } }
  renderLadder(live) {
    const t = this.ladder(), rows = Object.entries(t).sort((a, b) => b[1].elo - a[1].elo);
    $('#t-ladder').innerHTML = rows.length ? `<table class="ladder"><tr><th>#</th><th>AI</th><th>Elo</th><th>Wins</th><th>Games</th><th>Win %</th></tr>${rows.map(([k, r], i) => `<tr><td>${i + 1}</td><td><b>${AI[k]?.name || k}</b> <small>${AI[k]?.style || ''}</small></td><td>${Math.round(r.elo)}${live?.[k] ? ` <small class="${live[k] > 0 ? 'up' : 'down'}">${live[k] > 0 ? '+' : ''}${Math.round(live[k])}</small>` : ''}</td><td>${r.wins}</td><td>${r.games}</td><td>${r.games ? Math.round(r.wins / r.games * 100) : 0}%</td></tr>`).join('')}</table>` : `<p class="hint">No rated games yet. Everyone starts at ${ELO_START}.</p>`;
  }
  runTourney() {
    const ais = [...document.querySelectorAll('#t-ais input:checked')].map(i => i.value);
    const format = $('#t-format').value;
    if (ais.length < 2) { alert('Pick at least two AIs.'); return; }
    const list = schedule({ ais, games: +$('#t-games').value, format, size: +$('#t-size').value, timeLimit: +$('#t-min').value, seed: (Math.random() * 1e9) | 0 });
    const nW = +$('#t-workers').value;
    this.running = { list, next: 0, done: 0, workers: [], log: [] };
    $('#t-run').textContent = '■ Stop';
    const logBox = $('#t-log'); logBox.innerHTML = '';
    const line = (i, html) => { let d = document.getElementById('tg-' + i); if (!d) { d = el('div', { class: 'tg', id: 'tg-' + i }); logBox.prepend(d); } d.innerHTML = html; };
    const names = s => s.players.map(p => escH(p.name)).join(' vs ');
    const launch = w => {
      const R = this.running; if (!R || R.next >= R.list.length) return;
      const i = R.next++, setup = R.list[i];
      line(i, `<span class="hint">#${i + 1} ${escH(setup.mapName)} ${setup.size}</span> ${names(setup)} <span class="hint">· starting…</span>`);
      w.onmessage = e => {
        const m = e.data; if (!this.running) return;
        if (!m.done) { line(i, `<span class="hint">#${i + 1} ${escH(setup.mapName)} ${setup.size}</span> ${names(setup)} <span class="hint">· ${Math.floor(m.progress / 60)} min</span>`); return; }
        R.done++;
        if (m.error) line(i, `#${i + 1} failed: ${escH(m.error.slice(0, 200))}`);
        else {
          const r = m.result, t = this.ladder(), delta = applyElo(t, r);
          addRecords(r.records);
          try { localStorage.setItem(ELO_LS, JSON.stringify(t)); } catch { /* ignore */ }
          const order = rankResult(r);
          line(i, `<span class="hint">#${i + 1} ${escH(setup.mapName)} ${setup.size} · ${fmtMin(r.time)} · ${escH(r.how)}</span><br>${order.map((p, k) => `${k === 0 && r.winners.includes(p.id) ? '🏆 ' : ''}${escH(p.name)} <small class="${delta[p.ai] > 0 ? 'up' : 'down'}">${delta[p.ai] > 0 ? '+' : ''}${Math.round(delta[p.ai] || 0)}</small>`).join(' · ')} <button class="btn ghost small" data-w="${i}">▶ watch</button>`);
          const b = document.querySelector(`[data-w="${i}"]`); if (b) b.onclick = () => { this.stopTourney(); this.onReplay({ setup, directives: [], summary: {} }); };
          this.renderLadder(delta);
        }
        if (R.done >= R.list.length) { this.stopTourney(); return; }
        launch(w);
      };
      w.postMessage({ id: i, setup });
    };
    for (let k = 0; k < Math.min(nW, list.length); k++) { const w = new Worker(new URL('../tourney-worker.js', import.meta.url), { type: 'module' }); this.running.workers.push(w); launch(w); }
  }
  stopTourney() { if (!this.running) return; for (const w of this.running.workers) w.terminate(); this.running = null; $('#t-run').textContent = 'Run tournament'; }

  start() {
    const mode = $('#opt-mode').value, civKeys = Object.keys(CIVS);
    const seed = (+$('#opt-seed').value || (Math.random() * 1e6) | 0) >>> 0;
    const players = this.players.map((p, i) => {
      const prof = AI[p.ai];
      const civ = p.civ === 'random' ? civKeys[(seed + i * 7) % civKeys.length] : p.civ;
      const dup = this.players.filter((q, j) => j < i && q.ai === p.ai).length;
      const provider = this.models[p.ai + ':p'] || prof.provider;
      return { ai: p.ai, name: prof.name + (dup ? ' ' + ['II', 'III', 'IV', 'V'][dup - 1] : ''), civ, color: PLAYER_COLORS[p.color].hex, team: mode === 'teams' ? p.team : null,
        llm: { enabled: !!p.live, provider, model: this.models[p.ai] || prof.model, baseUrl: this.keys.customUrl, interval: +$('#opt-llm').value || 90, smart: $('#opt-smart').value !== 'fixed', budget: +$('#opt-budget').value } };
    });
    this.setup = { mapType: this.mapType, budget: $('#opt-budget').value, smart: $('#opt-smart').value, defeat: $('#opt-defeat').value, llmInterval: $('#opt-llm').value, victory: $('#opt-victory').value, size: $('#opt-size').value, mode, resources: $('#opt-res').value, peace: $('#opt-peace').value, speed: $('#opt-speed').value, players: this.players };
    this.persist();
    const vic = $('#opt-victory').value;
    this.onStart({ seed, defeat: $('#opt-defeat').value, victory: vic === 'conquest' ? 'conquest' : 'wonder', timeLimit: vic === 'wonder180' ? 180 : vic === 'wonder120' ? 120 : 0, size: +$('#opt-size').value, mapType: this.mapType, mapName: MAP_TYPES[this.mapType].name, players, teams: mode === 'teams', resources: $('#opt-res').value, peace: +$('#opt-peace').value, speed: +$('#opt-speed').value }, this.keys);
  }
}
