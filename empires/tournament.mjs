// Command-line tournament: plays many headless battles in parallel and prints an Elo ladder.
//   node tournament.mjs --games 16 --format duel --size 256 --minutes 60 --threads 4
// Formats: duel (1v1), ffa4, ffa8. Results are written to tournament-results.json.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync } from 'node:fs';
import { cpus } from 'node:os';

if (!isMainThread) {
  const { Game } = await import('./src/game.js');
  const { runMatch } = await import('./src/tourney.js');
  parentPort.postMessage(runMatch(Game, workerData));
} else {
  const { schedule, applyElo, ELO_START } = await import('./src/tourney.js');
  const { AI } = await import('./src/config.js');
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
  const opts = { games: +arg('games', 12), format: arg('format', 'duel'), size: +arg('size', 256), timeLimit: +arg('minutes', 60), seed: +arg('seed', Date.now() % 1e6), mapType: arg('map', 'random') };
  const threads = Math.max(1, Math.min(+arg('threads', Math.max(1, cpus().length - 1)), 8));
  const list = schedule(opts);
  console.log(`Tournament: ${list.length} ${opts.format} games on ${opts.size}x${opts.size} maps, ${opts.timeLimit} min limit, ${threads} threads`);
  const table = {}, results = [];
  let next = 0, done = 0; const t0 = Date.now();
  await new Promise(resolve => {
    const launch = () => {
      if (next >= list.length) { if (done === list.length) resolve(); return; }
      const idx = next++, setup = list[idx];
      const w = new Worker(new URL(import.meta.url), { workerData: setup });
      w.once('message', r => {
        done++; results.push({ setup, result: r }); applyElo(table, r);
        const win = r.winners.map(i => r.players.find(p => p.id === i)?.name).join(' & ') || 'nobody';
        console.log(`[${done}/${list.length}] ${setup.mapName.padEnd(15)} ${setup.players.map(p => p.name).join(' vs ').padEnd(40)} -> ${win} (${r.how}, ${Math.round(r.time / 60)} min)`);
        w.terminate(); launch();
      });
      w.once('error', e => { done++; console.error('game failed', e); launch(); });
    };
    for (let i = 0; i < threads; i++) launch();
  });
  console.log(`\nElo ladder after ${list.length} games (${Math.round((Date.now() - t0) / 1000)} s):`);
  const rows = Object.entries(table).sort((a, b) => b[1].elo - a[1].elo);
  rows.forEach(([k, t], i) => console.log(`${String(i + 1).padStart(2)}. ${AI[k].name.padEnd(10)} ${Math.round(t.elo).toString().padStart(5)}  ${t.wins}/${t.games} wins  (${AI[k].style})`));
  writeFileSync('tournament-results.json', JSON.stringify({ opts, start: ELO_START, table, results }, null, 1));
  // add the nations' records to the analytics file the game reads (GET /api/analytics)
  const { readFileSync, mkdirSync } = await import('node:fs');
  const dbFile = new URL('./data/analytics.json', import.meta.url), dbDir = new URL('./data/', import.meta.url);
  let db = { matches: [], records: [] }; try { db = JSON.parse(readFileSync(dbFile, 'utf8')); } catch { /* new file */ }
  db.records = [...results.flatMap(x => x.result.records || []), ...db.records].slice(0, 5000);
  mkdirSync(dbDir, { recursive: true }); writeFileSync(dbFile, JSON.stringify(db));
  console.log(`Added ${results.reduce((a, x) => a + (x.result.records?.length || 0), 0)} records to data/analytics.json (open Analytics → What wins).`);
  console.log('Saved tournament-results.json');
}
