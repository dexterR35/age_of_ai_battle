// Analytics screen: model calls, tokens and cost; graded decisions; play styles and build orders; talk;
// score trends with regression lines; what wins across all recorded matches; and an analyst.
import { AI, PROVIDERS, AGES } from '../config.js';
import { trends, styles, STYLE_AXES, buildOrders, BUILD_KEYS, llmStats, decisionStats, talkStats, insights, ridge, FEATURES, FEATURE_LABELS, analystBrief, ANALYST_SYSTEM, costOf, DEFAULT_PRICES, tokensIn } from '../analytics.js';
import { loadRecords, syncRecords, clearRecords, loadPrices } from '../records.js';
import { fmtTime } from '../util.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n0 = v => Math.round(v).toLocaleString('en-US');
const money = v => v == null ? '—' : v < 0.01 ? '$' + v.toFixed(4) : '$' + v.toFixed(v < 1 ? 3 : 2);
const tok = v => v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'k' : String(v | 0);
const gradeCls = l => l ? 'g' + l : '';
const TABS = [['overview', 'Overview'], ['ai', 'AI calls & cost'], ['decisions', 'Decisions'], ['style', 'Style & build'], ['talk', 'Talk'], ['wins', 'What wins'], ['analyst', 'AI Analyst']];

export class AnalyticsView {
  constructor(el, app) { this.el = el; this.app = app; this.tab = 'overview'; this.analyst = null; }
  get g() { return this.app.inBattle ? this.app.game : null; }
  open(tab) { if (tab) this.tab = tab; this.el.classList.remove('hidden'); this.records = loadRecords(); syncRecords().then(r => { this.records = r; this.render(); }); this.render(); }
  close() { this.el.classList.add('hidden'); }
  get openNow() { return !this.el.classList.contains('hidden'); }
  render() {
    const g = this.g, tabs = g ? TABS : TABS.filter(([k]) => k === 'wins');
    if (!g) this.tab = 'wins';
    const body = this[this.tab]?.() ?? '';
    this.el.innerHTML = `<div class="an-wrap"><header><h2>📈 Analytics${g ? ' · ' + fmtTime(g.time) : ''}</h2><span class="grow"></span>${g ? `<button class="btn small" id="an-export">⬇ Export JSON</button>` : ''}<button class="btn small ghost" id="an-close">✕</button></header>
      <div class="tabs an-tabs">${tabs.map(([k, n]) => `<button data-k="${k}" class="${this.tab === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div class="an-body">${body}</div></div>`;
    this.el.querySelectorAll('.an-tabs button').forEach(b => b.onclick = () => { this.tab = b.dataset.k; this.render(); });
    this.el.querySelector('#an-close').onclick = () => this.close();
    const ex = this.el.querySelector('#an-export'); if (ex) ex.onclick = () => this.export();
    this.after?.(); this.after = null;
  }
  refresh() { if (this.openNow && this.tab !== 'analyst') this.render(); }
  prices() { return loadPrices(); }
  export() {
    const g = this.g, data = { brief: analystBrief(g, this.prices()), llm: llmStats(g, this.prices()).map(l => ({ nation: l.p.name, model: l.model, calls: l.calls, fails: l.fails, tokensIn: l.tin, tokensOut: l.tout, cost: l.cost, log: l.log })), decisions: decisionStats(g).all.map(d => ({ nation: d.p.name, t: d.t, kind: d.kind, source: d.source, text: d.text, grade: d.grade || null })) };
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })); a.download = `dominion-analytics-${g.seed}.json`; document.body.appendChild(a); a.click(); a.remove();
  }

  // ------------------------------------------------------------ overview
  overview() {
    const g = this.g, tr = trends(g);
    const list = insights(g, this.records || []);
    this.after = () => this.drawTrendChart(tr);
    return `<div class="an-grid"><div><h4>The analyst's notes (built in, no API needed)</h4><ul class="an-ins">${list.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>
      <div><h4>Score with regression trend lines</h4><canvas id="an-trend" width="900" height="380"></canvas>
      <table class="an-t"><tr><th>Nation</th><th>Score</th><th>Growth/min</th><th>R²</th><th>Momentum</th><th>Forecast +20 min</th></tr>${[...tr].sort((a, b) => b.forecast - a.forecast).map(t => `<tr><td style="color:${t.p.color}">${esc(t.p.name)}${t.p.alive ? '' : ' ☠'}</td><td>${n0(t.score)}</td><td>${n0(t.slope)}</td><td>${t.r2.toFixed(2)}</td><td class="${t.momentum > t.slope ? 'up' : 'down'}">${n0(t.momentum)}</td><td>${t.p.alive ? n0(t.forecast) : '—'}</td></tr>`).join('')}</table></div></div>`;
  }
  drawTrendChart(tr) {
    const cv = this.el.querySelector('#an-trend'); if (!cv) return;
    const c = cv.getContext('2d'), W = cv.width, H = cv.height, L = 60, B = 30, g = this.g;
    const maxT = Math.max(60, g.time) / 60, maxV = Math.max(1, ...tr.flatMap(t => t.p.stats.timeline.map(s => s.score)), ...tr.map(t => t.forecast));
    const X = t => L + t / (maxT + 20) * (W - L - 10), Y = v => H - B - v / maxV * (H - B - 12);
    c.fillStyle = '#9a9384'; c.font = '16px system-ui'; c.strokeStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i <= 4; i++) { const v = maxV * i / 4; c.beginPath(); c.moveTo(L, Y(v)); c.lineTo(W, Y(v)); c.stroke(); c.textAlign = 'right'; c.fillText(v >= 1000 ? (v / 1000).toFixed(0) + 'k' : Math.round(v), L - 6, Y(v) + 5); }
    c.textAlign = 'center'; for (let m = 0; m <= maxT + 20; m += maxT > 90 ? 30 : 15) c.fillText(m + 'm', X(m), H - 8);
    c.setLineDash([]); c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(X(maxT), 0, W - X(maxT), H - B);
    for (const t of tr) {
      const tl = t.p.stats.timeline; if (!tl.length) continue;
      c.strokeStyle = t.p.color; c.lineWidth = 2.5; c.globalAlpha = t.p.alive ? 1 : 0.4;
      c.beginPath(); tl.forEach((s, i) => i ? c.lineTo(X(s.t / 60), Y(s.score)) : c.moveTo(X(s.t / 60), Y(s.score))); c.stroke();
      if (t.p.alive) { // recent trend projected 20 minutes ahead
        const last = tl[tl.length - 1]; c.setLineDash([6, 5]); c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(X(last.t / 60), Y(last.score)); c.lineTo(X(maxT + 20), Y(t.forecast)); c.stroke(); c.setLineDash([]);
      }
      c.globalAlpha = 1;
    }
  }

  // ------------------------------------------------------------ AI calls & cost
  ai() {
    const g = this.g, pr = this.prices(), ll = llmStats(g, pr);
    if (!ll.length) return `<p class="hint">No nation is played by a live model in this battle. Tick <b>Live</b> for a nation in the setup screen and add its API key under <b>AI Keys &amp; Models</b>. Every call is then measured here: tokens, seconds, failures, cost and how good its decisions were.</p>`;
    const tot = ll.reduce((a, l) => ({ calls: a.calls + l.calls, tin: a.tin + l.tin, tout: a.tout + l.tout, cached: a.cached + l.cached, saved: a.saved + l.saved, cost: l.cost == null || a.cost == null ? null : a.cost + l.cost }), { calls: 0, tin: 0, tout: 0, cached: 0, saved: 0, cost: 0 });
    // what the skipped calls would have cost at this battle's average call
    const savedCost = tot.cost != null && tot.calls ? tot.cost / tot.calls * tot.saved : null;
    const why = {}; for (const l of ll) for (const [k, v] of Object.entries(l.why)) why[k] = (why[k] || 0) + v;
    const rows = ll.map(l => `<tr><td style="color:${l.p.color}">${esc(l.p.name)}</td><td>${esc(l.model)}</td><td>${l.calls}</td><td>${l.fails ? `<span class="down">${l.fails}</span>` : 0}</td><td>${(l.avgMs / 1000).toFixed(1)} s</td><td>${tok(l.tin)}</td><td>${tok(l.tout)}</td><td>${money(l.cost)}</td><td>${money(l.perCall)}</td><td>${money(l.perKScore)}</td><td class="${gradeCls(l.grade?.letter)}">${l.grade ? l.grade.letter + ' (' + l.grade.n + ')' : '—'}</td><td>${l.p.cfg.llm?.budget ? `${Math.round((l.p.llm.spent || 0) / l.p.cfg.llm.budget * 100)}% of $${l.p.cfg.llm.budget}` : 'no limit'}</td></tr>`).join('');
    const calls = ll.flatMap(l => l.log.map(c => ({ ...c, p: l.p }))).sort((a, b) => b.t - a.t).slice(0, 40);
    const missing = [...new Set(ll.filter(l => l.cost == null).map(l => l.model))];
    return `<div class="an-kpis"><div><b>${tot.calls}</b><span>model calls</span></div><div><b>${tok(tot.tin)}</b><span>tokens in</span></div><div><b>${tok(tot.tout)}</b><span>tokens out</span></div><div><b>${money(tot.cost)}</b><span>cost so far</span></div><div><b>${money(tot.cost != null && g.time > 60 ? tot.cost / (g.time / 3600) : null)}</b><span>per game hour</span></div><div><b>${tot.saved}</b><span>calls saved by smart calls</span></div><div><b>${money(savedCost)}</b><span>money saved (est.)</span></div><div><b>${tot.tin ? Math.round(tot.cached / tot.tin * 100) : 0}%</b><span>input read from cache</span></div></div>
      ${Object.keys(why).length ? `<h4>Why the models were asked</h4><div class="comp">${Object.entries(why).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span>${esc(k)} · ${v}</span>`).join('')}</div>` : ''}
      <table class="an-t"><tr><th>Nation</th><th>Model</th><th>Calls</th><th>Failed</th><th>Avg time</th><th>Tokens in</th><th>Tokens out</th><th>Cost</th><th>Per call</th><th>Per 1k score</th><th>Decision grade</th><th>Budget</th></tr>${rows}</table>
      ${missing.length ? `<p class="hint">No price known for ${missing.map(esc).join(', ')}. Enter its price per million tokens under <b>AI Keys &amp; Models</b> to see its cost.</p>` : ''}
      <h4>Every call</h4><table class="an-t small"><tr><th>Game time</th><th>Nation</th><th>Asked because</th><th>Model</th><th>Result</th><th>Seconds</th><th>In</th><th>From cache</th><th>Out</th><th>Cost</th><th>Orders given</th></tr>${calls.map(c => `<tr><td>${fmtTime(c.t)}</td><td style="color:${c.p.color}">${esc(c.p.name)}</td><td>${esc(c.why || '')}</td><td>${esc(c.model || '')}</td><td>${c.ok ? '✓' : `<span class="down">✗ ${esc(c.err || '')}</span>`}</td><td>${(c.ms / 1000).toFixed(1)}</td><td>${tok(tokensIn(c))}${c.estimated ? '*' : ''}</td><td>${tok(c.cached || 0)}</td><td>${tok(c.out || 0)}</td><td>${money(costOf(c.model, c, pr))}</td><td>${c.fields ?? ''}</td></tr>`).join('')}</table>
      <p class="hint">* estimated from the text length when the provider did not report tokens. Default Claude prices per million tokens: ${Object.entries(DEFAULT_PRICES).map(([m, [i, o]]) => `${m} $${i}/$${o}`).join(', ')}.</p>`;
  }

  // ------------------------------------------------------------ decisions
  decisions() {
    const g = this.g, ds = decisionStats(g);
    const kinds = ['attack', 'raid', 'siege', 'age', 'orders', 'government', 'law', 'religion', 'diplomacy'];
    const cell = a => a ? `<td class="${gradeCls(a.letter)}">${a.letter}<small> ${a.n}</small></td>` : '<td>—</td>';
    const item = d => `<div class="an-dec"><span class="gr ${gradeCls(d.grade)}">${d.grade || '…'}</span><b style="color:${d.p.color}">${esc(d.p.name)}</b> <time>${fmtTime(d.t)}</time> ${esc(d.text)}${d.source === 'llm' ? ' <span class="tagp llm">model</span>' : ''}${d.after ? ` <small>score ${d.after.score - d.before.score >= 0 ? '+' : ''}${n0(d.after.score - d.before.score)} vs rivals ${d.after.others - d.before.others >= 0 ? '+' : ''}${n0(d.after.others - d.before.others)}</small>` : ''}</div>`;
    return `<p class="hint">Every important decision is graded three minutes later (attacks when the campaign ends): how the nation's score grew against its rivals, kills against losses, and how the campaign ended. A is excellent, F a disaster.</p>
      <table class="an-t"><tr><th>Nation</th><th>Overall</th>${kinds.map(k => `<th>${k}</th>`).join('')}</tr>${ds.by.map(b => `<tr><td style="color:${b.p.color}">${esc(b.p.name)}</td>${cell(b.all)}${kinds.map(k => cell(b.kinds[k])).join('')}</tr>`).join('')}</table>
      <div class="an-grid"><div><h4>Best decisions</h4>${ds.best.map(item).join('') || '<div class="hint">None graded yet.</div>'}<h4>Worst decisions</h4>${ds.worst.map(item).join('') || '<div class="hint">None graded yet.</div>'}</div>
      <div><h4>Latest decisions</h4>${[...ds.all].sort((a, b) => b.t - a.t).slice(0, 30).map(item).join('')}</div></div>`;
  }

  // ------------------------------------------------------------ style & build order
  style() {
    const g = this.g, st = styles(g), bo = buildOrders(g);
    this.after = () => st.forEach((s, i) => this.radar(this.el.querySelector('#an-radar' + i), s));
    const m = v => v == null ? '—' : (v / 60).toFixed(1);
    return `<p class="hint">Each axis is scaled to the strongest nation in this battle (100). The label is the nation's dominant way of playing.</p>
      <div class="an-radars">${st.map((s, i) => `<div><canvas id="an-radar${i}" width="260" height="240"></canvas><b style="color:${s.p.color}">${esc(s.p.name)}</b><span>${esc(s.label)} · ${esc(s.p.cfg.llm?.enabled ? s.p.cfg.llm.model : s.p.profile.style)}</span></div>`).join('')}</div>
      <h4>Build order (minute each first appeared)</h4><table class="an-t small"><tr><th>Nation</th>${AGES.slice(1).map(a => `<th>${a.name.split(' ')[0]}</th>`).join('')}${BUILD_KEYS.map(k => `<th>${k.replace('_', ' ')}</th>`).join('')}</tr>${bo.map(b => `<tr><td style="color:${b.p.color}">${esc(b.p.name)}</td>${b.ages.map(x => `<td>${m(x)}</td>`).join('')}${BUILD_KEYS.map(k => `<td>${m(b.firsts[k])}</td>`).join('')}</tr>`).join('')}</table>`;
  }
  radar(cv, s) {
    if (!cv) return; const c = cv.getContext('2d'), cx = 130, cy = 122, R = 86, n = STYLE_AXES.length;
    c.strokeStyle = 'rgba(255,255,255,0.12)'; c.fillStyle = '#9a9384'; c.font = '11px system-ui'; c.textAlign = 'center';
    for (const k of [0.33, 0.66, 1]) { c.beginPath(); for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2 - Math.PI / 2; const x = cx + Math.cos(a) * R * k, y = cy + Math.sin(a) * R * k; i ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); }
    STYLE_AXES.forEach((ax, i) => { const a = i / n * Math.PI * 2 - Math.PI / 2; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); c.stroke(); c.fillText(ax, cx + Math.cos(a) * (R + 16), cy + Math.sin(a) * (R + 12) + 4); });
    c.beginPath(); STYLE_AXES.forEach((ax, i) => { const a = i / n * Math.PI * 2 - Math.PI / 2, r = R * Math.max(0.04, s.v[ax] / 100); const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath();
    c.globalAlpha = 0.3; c.fillStyle = s.p.color; c.fill(); c.globalAlpha = 1; c.strokeStyle = s.p.color; c.lineWidth = 2; c.stroke();
  }

  // ------------------------------------------------------------ talk
  talk() {
    const ts = talkStats(this.g);
    return `<table class="an-t"><tr><th>Nation</th><th>Messages</th><th>Avg length</th><th>Threats</th><th>Friendly</th><th>Tone</th></tr>${ts.map(t => `<tr><td style="color:${t.p.color}">${esc(t.p.name)}</td><td>${t.count}</td><td>${t.avgLen.toFixed(0)}</td><td>${t.threats}</td><td>${t.friendly}</td><td class="${t.tone > 0.1 ? 'up' : t.tone < -0.1 ? 'down' : ''}">${t.tone > 0.1 ? 'friendly' : t.tone < -0.1 ? 'hostile' : 'mixed'}</td></tr>`).join('')}</table>
      <h4>Latest words</h4>${ts.flatMap(t => t.last.map(m => ({ ...m, p: t.p }))).sort((a, b) => b.t - a.t).slice(0, 24).map(m => `<div class="thought"><b style="color:${m.p.color}">${esc(m.p.name)}</b>${m.to != null && this.g.players[m.to] ? ' → ' + esc(this.g.players[m.to].name) : ''} <time>${fmtTime(m.t)}</time>: “${esc(m.text)}”</div>`).join('') || '<div class="hint">Nobody has spoken yet.</div>'}`;
  }

  // ------------------------------------------------------------ what wins (across matches)
  wins() {
    const rows = this.records || [];
    const reg = ridge(rows, FEATURES, 'place'), regW = ridge(rows, FEATURES, 'win');
    this.after = () => { if (reg) this.bars(this.el.querySelector('#an-coef'), reg.coef); const b = this.el.querySelector('#an-clear'); if (b) b.onclick = () => { if (confirm('Delete all recorded matches from this browser?')) { clearRecords(); this.records = []; this.render(); } }; };
    const byAI = {}; for (const r of rows) { const k = r.ai; const a = byAI[k] ||= { n: 0, win: 0, place: 0, live: 0, tin: 0, tout: 0 }; a.n++; a.win += r.win; a.place += r.place; if (r.live) a.live++; a.tin += r.tokensIn || 0; a.tout += r.tokensOut || 0; }
    const byModel = {}; for (const r of rows.filter(x => x.live)) { const a = byModel[r.model] ||= { n: 0, win: 0, place: 0, calls: 0, tin: 0, tout: 0 }; a.n++; a.win += r.win; a.place += r.place; a.calls += r.calls; a.tin += r.tokensIn; a.tout += r.tokensOut; }
    const pr = this.prices();
    return `<p class="hint">Every finished battle and tournament game adds one row per nation: what it did (villagers at 20 minutes, army at 30, ages, walls, attacks, trade…) and where it finished. A ridge regression on standardised features shows which habits go with finishing high. <b>${rows.length}</b> nations recorded. ${rows.length ? `<button class="btn ghost small" id="an-clear">Clear records</button>` : ''}</p>
      ${reg ? `<div class="an-grid"><div><h4>What predicts a high finish (effect per standard deviation)</h4><canvas id="an-coef" width="640" height="${Math.max(260, reg.coef.length * 26 + 30)}"></canvas><p class="hint">R² ${reg.r2.toFixed(2)} for placement${regW ? ` · ${regW.r2.toFixed(2)} for winning` : ''}. Correlation, not proof: strong nations also do many things at once.</p></div>
        <div><h4>Biggest factors</h4><table class="an-t small"><tr><th>Feature</th><th>Effect</th><th>Average</th></tr>${reg.coef.map(c => `<tr><td>${FEATURE_LABELS[c.feature]}</td><td class="${c.beta > 0 ? 'up' : 'down'}">${c.beta > 0 ? '+' : ''}${c.beta.toFixed(3)}</td><td>${c.mean.toFixed(1)}</td></tr>`).join('')}</table></div></div>` : `<p class="hint">At least ${FEATURES.length + 3} recorded nations are needed. A tournament of 8-nation games fills this quickly.</p>`}
      <h4>By AI personality</h4><table class="an-t"><tr><th>AI</th><th>Nations</th><th>Win rate</th><th>Avg placement</th><th>Played live</th></tr>${Object.entries(byAI).sort((a, b) => b[1].place / b[1].n - a[1].place / a[1].n).map(([k, a]) => `<tr><td>${esc(AI[k]?.name || k)}</td><td>${a.n}</td><td>${Math.round(a.win / a.n * 100)}%</td><td>${(a.place / a.n * 100).toFixed(0)}</td><td>${a.live}</td></tr>`).join('')}</table>
      ${Object.keys(byModel).length ? `<h4>Live models</h4><table class="an-t"><tr><th>Model</th><th>Games</th><th>Win rate</th><th>Avg placement</th><th>Calls</th><th>Tokens</th><th>Cost</th></tr>${Object.entries(byModel).map(([m, a]) => `<tr><td>${esc(m)}</td><td>${a.n}</td><td>${Math.round(a.win / a.n * 100)}%</td><td>${(a.place / a.n * 100).toFixed(0)}</td><td>${a.calls}</td><td>${tok(a.tin + a.tout)}</td><td>${money(costOf(m, { in: a.tin, out: a.tout }, pr))}</td></tr>`).join('')}</table>` : ''}`;
  }
  bars(cv, coef) {
    if (!cv) return; const c = cv.getContext('2d'), W = cv.width, mid = 330, max = Math.max(0.01, ...coef.map(x => Math.abs(x.beta)));
    c.font = '13px system-ui'; c.textBaseline = 'middle';
    coef.forEach((x, i) => {
      const y = 20 + i * 26, w = Math.abs(x.beta) / max * (W - mid - 20);
      c.fillStyle = '#c8c1b0'; c.textAlign = 'right'; c.fillText(FEATURE_LABELS[x.feature], mid - 10, y);
      c.fillStyle = x.beta > 0 ? '#6cc483' : '#e0605a'; c.fillRect(mid, y - 8, Math.max(2, w), 16);
    });
  }

  // ------------------------------------------------------------ the AI analyst (a real model, through the local server)
  analyst() {
    const keys = this.app.menu.keys || {}, env = this.app.menu.envKeys || {}, models = this.app.menu.models || {};
    const provs = Object.keys(PROVIDERS).filter(k => keys[k] || env[k]);
    const defModel = pv => { const a = Object.keys(AI).find(k => (models[k + ':p'] || AI[k].provider) === pv); return a ? (models[a] || AI[a].model) : pv === 'anthropic' ? 'claude-opus-5-5' : ''; };
    this.after = () => {
      const sel = this.el.querySelector('#an-prov'), mi = this.el.querySelector('#an-model'), go = this.el.querySelector('#an-go');
      if (!sel) return;
      sel.onchange = () => { mi.value = defModel(sel.value); };
      go.onclick = () => this.ask(sel.value, mi.value.trim());
    };
    const a = this.analyst;
    return `<p class="hint">The built-in analyst (Overview tab) needs no API. Here a real model reads this battle's numbers and writes a full analysis: each AI's logic, mistakes, best and worst decisions and a prediction. It is one call, typically a few thousand tokens.</p>
      ${provs.length ? `<div class="an-ask"><label>Provider<select id="an-prov">${provs.map(k => `<option value="${k}">${PROVIDERS[k]}</option>`).join('')}</select></label><label>Model<input id="an-model" type="text" value="${esc(defModel(provs[0]))}" /></label><button class="btn primary" id="an-go" ${a?.busy ? 'disabled' : ''}>${a?.busy ? '🧠 Thinking…' : '🧠 Analyse this battle'}</button></div>` : `<p class="hint">Add an API key under <b>AI Keys &amp; Models</b> (main menu) to use a live analyst.</p>`}
      ${a?.text ? `<div class="an-out">${esc(a.text).replace(/\n/g, '<br>')}</div><p class="hint">${esc(a.model)} · ${(a.ms / 1000).toFixed(1)} s · ${tok(a.in)} in / ${tok(a.out)} out · ${money(costOf(a.model, a, this.prices()))} · at ${fmtTime(a.t)}</p>` : ''}${a?.error ? `<p class="hint down">⚠ ${esc(a.error)}</p>` : ''}`;
  }
  async ask(provider, model) {
    const g = this.g, t0 = Date.now(), keys = this.app.menu.keys || {};
    this.analyst = { busy: true }; this.render();
    try {
      const user = JSON.stringify(analystBrief(g, this.prices()));
      const res = await fetch('/api/llm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider, model, key: keys[provider] || '', baseUrl: keys.customUrl, system: ANALYST_SYSTEM, user }) });
      const d = await res.json(); if (!res.ok || d.error) throw new Error(d.error || 'HTTP ' + res.status);
      this.analyst = { text: d.text, model: d.model || model, ms: Date.now() - t0, in: d.usage?.in || Math.round((ANALYST_SYSTEM.length + user.length) / 3.4), out: d.usage?.out || Math.round(d.text.length / 3.4), t: g.time };
    } catch (e) { this.analyst = { error: String(e.message || e) }; }
    if (this.tab === 'analyst') this.render();
  }
}
