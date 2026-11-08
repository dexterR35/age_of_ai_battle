// Age of AI: Dominion — local server.
// Serves the game and proxies optional live-LLM strategy calls so API keys never hit a third-party page.
// Zero dependencies: `node server.mjs`, then open http://localhost:8080
import http from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

// OpenAI-compatible chat endpoints. Anthropic uses its own Messages API below.
const CHAT = {
  openai: 'https://api.openai.com/v1/chat/completions',
  xai: 'https://api.x.ai/v1/chat/completions',
  google: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  deepseek: 'https://api.deepseek.com/chat/completions',
  mistral: 'https://api.mistral.ai/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
};
const ENV_KEYS = { openai: 'OPENAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY', xai: 'XAI_API_KEY', google: 'GEMINI_API_KEY', deepseek: 'DEEPSEEK_API_KEY', mistral: 'MISTRAL_API_KEY', openrouter: 'OPENROUTER_API_KEY', groq: 'GROQ_API_KEY' };

async function callLLM({ provider, model, key, system, user, baseUrl }) {
  key = key || process.env[ENV_KEYS[provider]] || '';
  if (!key) throw new Error(`No API key for ${provider}`);
  const signal = AbortSignal.timeout(90000);
  if (provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01' },
      // the system prompt never changes between calls, so it is cached (5 minutes, renewed by every call)
      body: JSON.stringify({ model: model || 'claude-opus-5-5', max_tokens: 16000, system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }], output_config: { effort: 'low' }, fallbacks: 'default', messages: [{ role: 'user', content: user }] }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}: ${data?.error?.message || ''}`.slice(0, 300));
    if (data.stop_reason === 'refusal') throw new Error('Anthropic declined the request');
    const u = data.usage || {};
    return { text: (data.content || []).filter(b => b.type === 'text').map(b => b.text).join(''), model: data.model || model, usage: { in: u.input_tokens || 0, out: u.output_tokens || 0, cached: u.cache_read_input_tokens || 0, cacheWrite: u.cache_creation_input_tokens || 0 } };
  }
  const url = provider === 'custom' ? (baseUrl || '').replace(/\/$/, '') + '/chat/completions' : CHAT[provider];
  if (!url) throw new Error(`Unknown provider ${provider}`);
  const res = await fetch(url, {
    method: 'POST', signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    // OpenAI reasoning models take max_completion_tokens; the others accept max_tokens.
    body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], ...(provider === 'openai' ? { max_completion_tokens: 6000 } : { max_tokens: 1500 }) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${provider} HTTP ${res.status}: ${data?.error?.message || ''}`.slice(0, 300));
  const u = data.usage || {};
  const cached = u.prompt_tokens_details?.cached_tokens || 0;
  return { text: data.choices?.[0]?.message?.content || '', model: data.model || model, usage: { in: (u.prompt_tokens || u.input_tokens || 0) - cached, out: u.completion_tokens || u.output_tokens || 0, reasoning: u.completion_tokens_details?.reasoning_tokens || 0, cached } };
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/api/llm') {
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 400000) throw new Error('Request too large'); }
      const out = await callLLM(JSON.parse(body));
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(out));
    }
    // Analytics API: the browser posts finished-match analytics; any tool can read them back.
    //   GET  /api/analytics        -> { matches: [...], records: [...] }
    //   POST /api/analytics        <- { match, records }
    if (req.url === '/api/analytics') {
      const file = join(ROOT, 'data', 'analytics.json');
      const cur = JSON.parse(await readFile(file, 'utf8').catch(() => '{"matches":[],"records":[]}'));
      if (req.method === 'POST') {
        let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 4e6) throw new Error('Request too large'); }
        const add = JSON.parse(body);
        if (add.match) cur.matches = [add.match, ...cur.matches].slice(0, 200);
        if (Array.isArray(add.records)) cur.records = [...add.records, ...cur.records].slice(0, 5000);
        await mkdir(join(ROOT, 'data'), { recursive: true });
        await writeFile(file, JSON.stringify(cur));
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(req.method === 'POST' ? { ok: true, matches: cur.matches.length, records: cur.records.length } : cur));
    }
    if (req.method === 'GET' && req.url === '/api/env-keys') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(Object.fromEntries(Object.entries(ENV_KEYS).map(([p, k]) => [p, !!process.env[k]]))));
    }
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path === '/') path = '/index.html';
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(normalize(ROOT))) { res.writeHead(403); return res.end(); }
    const info = await stat(file).catch(() => null);
    if (!info || !info.isFile()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(await readFile(file));
  } catch (err) {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: String(err.message || err) }));
  }
});
server.listen(PORT, () => console.log(`Age of AI: Dominion → http://localhost:${PORT}`));
