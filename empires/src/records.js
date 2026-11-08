// Cross-match records for the regression: one row per nation per finished match.
// Kept in the browser and, when the local server runs, also in data/analytics.json (GET /api/analytics).
const LS = 'aoai-records', MAX = 3000;
export function loadRecords() { try { return JSON.parse(localStorage.getItem(LS) || '[]'); } catch { return []; } }
export function addRecords(rows, match = null) {
  if (!rows?.length) return;
  const all = [...rows, ...loadRecords()].slice(0, MAX);
  try { localStorage.setItem(LS, JSON.stringify(all)); } catch { /* storage full: keep the newest half */ try { localStorage.setItem(LS, JSON.stringify(all.slice(0, MAX / 2))); } catch { /* ignore */ } }
  fetch('/api/analytics', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ records: rows, match }) }).catch(() => {});
}
export function clearRecords() { try { localStorage.removeItem(LS); } catch { /* ignore */ } }
// merge the server's copy (records from the command-line tournament land there)
export async function syncRecords() {
  try {
    const r = await fetch('/api/analytics'); if (!r.ok) return loadRecords();
    const srv = (await r.json()).records || [], mine = loadRecords(), seen = new Set(mine.map(x => x.date + x.name));
    const merged = [...mine, ...srv.filter(x => !seen.has(x.date + x.name))].slice(0, MAX);
    try { localStorage.setItem(LS, JSON.stringify(merged)); } catch { /* ignore */ }
    return merged;
  } catch { return loadRecords(); }
}
const PLS = 'aoai-prices';
export function loadPrices() { try { return JSON.parse(localStorage.getItem(PLS) || '{}'); } catch { return {}; } }
export function savePrices(p) { try { localStorage.setItem(PLS, JSON.stringify(p)); } catch { /* ignore */ } }
