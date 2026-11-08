// Tournament mode: many headless battles between the built-in AI personalities, with an Elo ladder.
// Shared by the browser (Web Workers) and the command line (tournament.mjs).
import { AI, AI_KEYS, CIVS, MAP_TYPES, PLAYER_COLORS } from './config.js';
import { rng } from './util.js';
import { matchRecords } from './analytics.js';

export const ELO_START = 1200;

// placement: winners first, then those who survived longest, then score
export function rankResult(r) {
  const win = new Set(r.winners);
  return [...r.players].sort((a, b) => (win.has(b.id) - win.has(a.id)) || (b.alive - a.alive) || ((b.eliminatedAt || 1e9) - (a.eliminatedAt || 1e9)) || (b.score - a.score));
}
// multiplayer Elo: every pair of players is a small duel decided by their placement
export function applyElo(table, r) {
  const order = rankResult(r), n = order.length, K = 32 / Math.max(1, n - 1);
  const win = new Set(r.winners);
  const delta = {};
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = order[i], b = order[j];
    const ra = (table[a.ai] ||= { elo: ELO_START, games: 0, wins: 0 }).elo, rb = (table[b.ai] ||= { elo: ELO_START, games: 0, wins: 0 }).elo;
    const ea = 1 / (1 + Math.pow(10, (rb - ra) / 400));
    const sa = win.has(a.id) && win.has(b.id) ? 0.5 : 1; // allies who won together tie
    delta[a.ai] = (delta[a.ai] || 0) + K * (sa - ea);
    delta[b.ai] = (delta[b.ai] || 0) - K * (sa - ea);
  }
  for (const p of order) { const t = table[p.ai]; t.elo += delta[p.ai] || 0; t.games++; if (win.has(p.id)) t.wins++; }
  return delta;
}

// build the list of match setups for a tournament
export function schedule({ ais = AI_KEYS, games = 8, format = 'duel', size = 256, timeLimit = 60, seed = 1, mapType = 'random' }) {
  const R = rng(seed), list = [];
  const per = format === 'ffa8' ? Math.min(8, ais.length) : format === 'ffa4' ? Math.min(4, ais.length) : 2;
  const maps = Object.keys(MAP_TYPES);
  // round-robin pairs for duels, random draws for free-for-alls, balanced by games played
  const played = Object.fromEntries(ais.map(k => [k, 0]));
  for (let gi = 0; gi < games; gi++) {
    const pool = [...ais].sort((a, b) => (played[a] - played[b]) || (R() - 0.5));
    const pick = pool.slice(0, per).sort(() => R() - 0.5);
    for (const k of pick) played[k]++;
    const mt = mapType === 'random' ? maps[(R() * maps.length) | 0] : mapType;
    list.push({
      seed: (R() * 1e9) >>> 0, size, mapType: mt, mapName: MAP_TYPES[mt].name, resources: 'standard', victory: 'wonder', defeat: 'capitals', timeLimit, teams: false, peace: 0,
      players: pick.map((k, i) => ({ ai: k, name: AI[k].name, civ: AI[k].civ, color: PLAYER_COLORS[i].hex, team: null, llm: { enabled: false } })),
    });
  }
  return list;
}

// run one battle to its end (used inside a worker or by node)
export function runMatch(Game, setup, onProgress) {
  const g = new Game(setup);
  const lim = (setup.timeLimit || 90) * 600 + 50;
  for (let i = 0; i < lim && !g.over; i++) { g.tick(); if (onProgress && i % 3000 === 0) onProgress(g.time); }
  return {
    winners: g.over?.winners || [], how: g.over?.how || 'Score', time: Math.round(g.time),
    players: g.players.filter(p => !p.rebel).map(p => ({ id: p.id, ai: p.aiKey, name: p.name, civ: p.civKey, alive: p.alive, score: p.score(), eliminatedAt: p.eliminatedAt, kills: p.stats.kills })),
    checks: g.checks, records: matchRecords(g),
  };
}
export { CIVS };
