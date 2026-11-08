# Autonomous cloud deployment

The Site facade can host the viewer and a free scripted exhibition. A real API battle needs the included autonomous runner. Refreshing a page is not the runner: the production Worker uses persistent Durable Object alarms and the Docker alternative uses a server timer.

The current client is React + Vite (JavaScript/JSX and CSS). `npm run dev` starts Vite on 5173 and the API on 8899. `npm run build` compiles `dist/client` and packages the hashed assets into the Sites Worker. The Docker build compiles React in a separate build stage; the production Node process serves the compiled client. The old `public/` frontend is removed. New matches have no default time limit and run until conquest.

## Cloudflare Worker

From `arena/`:

```text
npm install
npm test
npx wrangler login
npx wrangler secret put BATTLE_ADMIN_TOKEN
npx wrangler secret put KEY_ENCRYPTION_SECRET
npm run cloud:deploy
```

Enter **independent, random** values when Wrangler asks: at least 24 characters for the admin token, and at least 32 for the encryption secret. Keep them in your password manager or cloud secret store, not Git or a chat. Do not rotate the encryption secret while matches are active; their stored keys require the existing secret.

The Worker configuration defines the `ARENA` binding to the SQLite-backed `BattleArena` Durable Object. The build packs all spectator assets into the Worker. Production storage is separate from local Wrangler state. Alarms tick the simulation and persist it even with no viewers. Do not use an expiring temporary preview account for production games or provider keys.

Open the deployed Worker URL. Connection → enter its admin token for the current tab. The token is kept in memory. In New match, choose Real API models, enter exact provider model IDs and each player's API key, then set budgets and optional per-million-token prices. Unsupported IDs and missing credits are reported as failed model turns; there is no automatic model substitution.

The runner serves spectator reads without an admin token, so its URL permits observing matches and reports. It does not expose saved API keys. Keep the runner URL within your intended audience or put it behind your own Cloudflare Access policy if spectator records must be private. Mutations always require the admin token. This documentation does not change the published private Site's sharing settings.

## Connect the private Sites viewer

After deploying the runner, configure these **server runtime variables** on the existing Site, then redeploy its saved source:

```text
BATTLE_RUNNER_URL=https://your-worker.workers.dev
BATTLE_RUNNER_TOKEN=<same BATTLE_ADMIN_TOKEN>
```

No provider API keys belong in those variables: players supply their own keys per match. The Sites facade forwards API requests over HTTPS and injects its runner token server-side. Its code accepts no arbitrary user-controlled provider URL or proxy destination. Without these variables, it returns an honest preview status and the UI blocks sending provider keys.

## Docker / persistent Node hosting

The Docker image is another deployment choice for a service with a persistent disk:

```text
docker build -t ageofai-battle .
docker run --env-file .env -p 8787:8787 -v ageofai-data:/app/runtime ageofai-battle
```

Create an untracked `.env` from `.env.example`, set independent admin/encryption secrets, and configure your cloud platform's HTTPS endpoint. Bind `HOST=0.0.0.0` only with the required admin token. Use exactly one Node instance per persistent volume; this JSON-backed runtime has no multi-replica database locking. A process restart resumes saved matches. Durable Objects are the recommended implementation when multiple viewers or persistent cloud alarms are desired.

## Verification and operations

- `GET /api/health` must return `runner: autonomous` and `encryptionReady: true` before using real keys.
- `GET /api/matches` lists persisted matches. `GET /api/matches/:id` reads a spectator snapshot; `?pov=p1` redacts rival state for that viewer.
- `GET /api/matches/:id/report` exports a complete report excluding keys.
- `POST /api/matches` creates a match; the admin token goes in `x-admin-key` on a standalone runner.
- `POST /api/matches/:id/control` with `{"action":"stop"}` stops a match, deletes its encrypted keys and awards no progression.
- Provider calls are limited to 25 seconds and are not retried invisibly. Interrupted requests consume a conservatively estimated reservation rather than being replayed after restart.
- Back up persistent runtime data if you need long-term match archives. There is no automatic deletion policy for completed cloud matches.

Development checked the engine, provider adapters with mocked replies, UI flows, Worker packaging and local durable execution. A live provider-funded cloud battle still requires your own authenticated hosting account and API keys.
