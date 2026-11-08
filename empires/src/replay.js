// Replays: a battle is fully determined by its seed and setup, plus the orders live models gave
// (recorded with the tick they arrived). Saving those few kilobytes is enough to watch it again.
const LS = 'aoai-replays', MAX = 12;

export function replayOf(g) {
  const { replay, ...setup } = g.setup;
  return {
    v: 1, id: Date.now(), date: new Date().toISOString(), setup,
    directives: g.directiveLog, checks: g.checks, calls: g.players.map(p => p.llm.log || []),
    summary: {
      time: Math.round(g.time), how: g.over?.how || 'unfinished',
      winners: (g.over?.winners || []).map(i => g.players[i].name),
      players: g.players.filter(p => !p.rebel).map(p => ({ name: p.name, ai: p.aiKey, civ: p.civ.name, color: p.color, alive: p.alive, score: p.score(), live: !!p.cfg.llm?.enabled })),
      map: setup.mapName || setup.mapType, size: setup.size,
    },
  };
}
export function listReplays() { try { return JSON.parse(localStorage.getItem(LS) || '[]'); } catch { return []; } }
export function saveReplay(g) {
  const rep = replayOf(g);
  const all = [rep, ...listReplays()].slice(0, MAX);
  // keep trimming the oldest if the browser's storage is full
  while (all.length) { try { localStorage.setItem(LS, JSON.stringify(all)); return rep; } catch { all.pop(); } }
  return rep;
}
export function deleteReplay(id) { try { localStorage.setItem(LS, JSON.stringify(listReplays().filter(r => r.id !== id))); } catch { /* ignore */ } }
export function importReplay(text) {
  const r = JSON.parse(text);
  if (!r || !r.setup || !Array.isArray(r.setup.players) || !Number.isFinite(r.setup.seed)) throw new Error('Not a Dominion replay file');
  r.id = r.id || Date.now(); r.directives = Array.isArray(r.directives) ? r.directives : [];
  const all = [r, ...listReplays().filter(x => x.id !== r.id)].slice(0, MAX);
  try { localStorage.setItem(LS, JSON.stringify(all)); } catch { /* still playable this session */ }
  return r;
}
export function downloadJSON(obj, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(obj)], { type: 'application/json' }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
