# Age of AI: Dominion — SaaS plan

A plan to sell the game as an online service: free to watch, paid credits and subscriptions for battles played by real AI models, with Supabase accounts and Stripe payments. Numbers marked *estimate* must be checked with a real API key before launch.

---

## 1. The product in one sentence

**"Watch the world's AIs wage medieval war — or command your own."** Real language models (Claude, GPT, Grok, Gemini…) rule rival nations in a 512×512 strategy war. Anyone can watch for free; people pay to start matches with real models, to enter their own prompted general in a ranked ladder, and for deep analytics.

### Who buys it

| Audience | What they want | What they pay for |
|---|---|---|
| AI enthusiasts and tech Twitter/YouTube | "Which AI is the best general?" | Commissioning matches with real models, analytics |
| Strategy-game fans who like watching (AoE, Total War viewers) | A battle that is always on | Pro subscription, custom matches |
| Prompt engineers | Beat other people's prompts | **Prompt Wars** ranked ladder entries |
| Streamers and content creators | Endless, unpredictable content | Streamer kit, private matches |
| AI teams and researchers | A strategy benchmark for models | Research plan: batch runs, exports, private leaderboards |

### Why it can sell (the hooks)

1. **Model Wars leaderboard** — a public Elo ranking of real AI models as generals, updated every week. This is free marketing: every week there is a story ("Claude conquers GPT in 63 minutes").
2. **Prompt Wars** *(the strongest paid feature)* — each player writes the strategy prompt of their own nation ("rush early, wall the east, betray allies at minute 40…"). Their prompted general fights other players' generals in ranked matches. Competitive, social, no fast clicking needed, and every match spends credits.
3. **Commission and share** — start a match, send the link, friends watch live for free.
4. **Always-on Arena** — a 24/7 channel of built-in AI battles (costs nothing to run, see §3).
5. **Predictions with points** — viewers predict the winner for points and badges (never money, see §8).
6. **Deep analytics** — already built: tokens, cost, decision grades A–F, play styles, regression of what wins, an AI analyst.

---

## 2. What it costs to run a battle

### AI model cost (the only real variable cost)

Measured in this project with smart calls and prompt caching (fake replies, Anthropic prices per million tokens: Opus 5.5 $4 in / $20 out, Sonnet 5.5 $2 / $10, Haiku 5.5 $0.10 / $0.50; cached input 5–10% of the input price). About 25 calls per nation per game hour, ~2,500 input tokens (a third cached) and ~350 output tokens per call. *Estimate — real models may write longer answers.*

| Model | Per live nation per game hour | Duel, 2 live nations, 1.5 h | 8 live nations, 1.5 h |
|---|---:|---:|---:|
| Claude Opus 5.5 | $0.34 | $1.03 | $4.13 |
| Claude Sonnet 5.5 | $0.17 | $0.52 | $2.06 |
| Claude Haiku 5.5 | $0.01 | $0.03 | $0.10 |
| Other providers | measure first | | |

### Why the margin is safe: the budget cap

The game already has a **budget per live nation**: when it is spent, the built-in general takes over and no more calls are made. So **the cost of a match can never exceed its budget**. Pricing rule:

> **price of a live nation = 3 × its budget cap** → AI cost is at most 33% of the price, whatever happens in the match.

### Other costs

| Cost | Amount | Note |
|---|---|---|
| Stripe | 2.9% + $0.30 per payment | fees eat small packs; minimum pack $5 |
| Vercel (website) | ~$20 / month (Pro) | *check current price* |
| Supabase (accounts, database, realtime) | ~$25 / month (Pro) | free tier is enough for testing |
| Match runner server | ~$5–20 / month | one small VM runs ~20–40 live matches at once (the simulation uses ~3% of a CPU core at normal speed) |
| Domain, email | ~$2 / month | |
| **Fixed total** | **~$50–70 / month** | |

**Watching costs almost nothing.** The simulation is deterministic (replays are already exact). A live broadcast only sends the match setup and the model orders — a few kilobytes — and every viewer's browser plays the same battle. A thousand viewers cost about the same as one. Matches with only built-in AIs run entirely in the viewer's browser: zero server cost.

---

## 3. Pricing

### Credits

**1 credit = $0.01.** Credits buy live-AI matches; watching is always free.

| Pack | Price | Credits | Bonus | Your net after Stripe |
|---|---:|---:|---:|---:|
| Starter | $5 | 500 | — | $4.55 |
| Standard | $10 | 1,050 | +5% | $9.41 |
| Big | $20 | 2,200 | +10% | $19.12 |
| War chest | $50 | 5,750 | +15% | $48.25 |

### What a match costs in credits

| Item | Credits | Budget cap (max AI cost) | Your minimum margin |
|---|---:|---:|---:|
| Match fee (server, storage, replay) | 25 | — | ~100% |
| Live nation on Haiku | 10 | $0.033 | 67% |
| Live nation on Sonnet | 75 | $0.25 | 67% |
| Live nation on Opus | 150 | $0.50 | 67% |
| AI analyst report (one call) | 20 | $0.07 | 67% |

Examples: a Sonnet duel = 25 + 2×75 = **175 credits ($1.75)**, AI cost ≤ $0.50. Eight Opus nations = 25 + 8×150 = **1,225 credits ($12.25)**, AI cost ≤ $4.00. On average real cost is below the cap (smart calls), so the real margin is higher — and unused credits (people rarely spend everything) add more.

**Compared with your idea** ("$20 → $10 for AI, $10 for me", a 50% margin): this design keeps **at least 67%** before Stripe, and is easier to understand because people buy matches, not dollars of tokens.

### Subscriptions

| Plan | Price / month | Included | For |
|---|---:|---|---|
| **Free** | $0 | Watch everything, Arena 24/7, replays, built-in AI matches in the browser, **1 free Haiku match per day**, basic analytics | everyone |
| **Pro** | $9.99 | 700 credits / month, private matches, full analytics + AI analyst, 1 Prompt Wars general, cloud replays, priority start | fans |
| **Commander** | $24.99 | 2,000 credits / month, 3 Prompt Wars generals, private tournaments, custom maps and rules, exports | power users, streamers |
| **Bring your own key** | $4.99 | Unlimited live matches using **your own** API keys (you pay the AI company), all Pro features except included credits | developers |
| **Research** | from $99 | Batch benchmark runs, private leaderboards, CSV/JSON exports, priority runner | AI teams |

Margins on subscriptions (if every included credit is spent at the 33% cap): Pro ≥ 71%, Commander ≥ 69%, Bring-your-own-key ~95% (only server cost).

### Example months *(illustration, not a forecast)*

| | Small | Growing |
|---|---:|---:|
| Free users | 500 | 5,000 |
| Pro / Commander / Own key | 25 / 5 / 10 | 250 / 50 / 100 |
| Credit packs sold | $150 | $1,500 |
| **Revenue** | **$575** | **$5,746** |
| AI cost (worst case) | ~$130 | ~$1,300 |
| Stripe fees | ~$30 | ~$250 |
| Fixed costs | ~$60 | ~$120 |
| **Profit** | **~$355** | **~$4,000** |

Break-even is about **8–10 Pro subscribers**.

---

## 4. How it works (architecture)

```
 Browser (static site on Vercel)                     Supabase
 ┌──────────────────────────────┐     login     ┌──────────────────────┐
 │ game, menus, analytics        │──────────────▶│ Auth (email, Google, │
 │ Watch page: plays the battle  │◀── realtime ──│ Discord)             │
 │ from setup + order stream     │   channel     │ Postgres + RLS       │
 └──────────────┬───────────────┘               │ Realtime broadcast   │
                │ buy credits                     └─────────▲────────────┘
                ▼                                            │ orders, checksums,
         Stripe Checkout / Billing ── webhook ──▶ Vercel     │ results, costs
                                         function ─ credits ─┤
                                                             │
                                   Match runner (Node, small VM)
                                   runs the simulation headless,
                                   calls the models with YOUR keys,
                                   enforces each nation's budget
```

**Match flow**

1. A logged-in user picks AIs, map and rules → the site shows the price in credits.
2. **Reserve** the credits (a ledger row), create the match row, put it in the runner queue.
3. The runner starts the battle (built-in simulation, same code as today), calls the live models through the existing smart-call logic, and **publishes every model order** with its tick to the match's realtime channel, plus a checksum every game minute.
4. Viewers open the match link: they download the setup and the orders so far, fast-forward to the present, then follow live. The checksums prove every viewer sees the same battle.
5. At the end: winner, replay, analytics and the real model cost are saved; if the match failed (provider down), credits are refunded.

**What already exists in this project**: deterministic simulation and exact replays, smart calls, prompt caching, budget per nation, cost and token analytics, tournaments with Elo, an analytics API. **What must be built**: the runner (move the live-AI caller from the browser to a server), the watch page with the realtime stream, accounts, payments, credits, a dashboard, and quick catch-up for late viewers (a saved game snapshot every few minutes so nobody re-simulates an hour).

### Supabase tables (sketch)

| Table | Contents | Who can read / write (row level security) |
|---|---|---|
| `profiles` | display name, plan, Stripe customer id | owner reads; server writes plan |
| `credit_ledger` | +/− credits, reason (pack, subscription, match, refund), reference | owner reads; **only the server writes** (append-only; balance = sum) |
| `purchases`, `subscriptions` | mirrored from Stripe webhooks | owner reads; server writes |
| `matches` | setup, owner, status, visibility, price, budget, real cost, winner | public matches readable by all |
| `match_orders` | match id, tick, nation, order (JSON) | readable with the match; runner writes |
| `llm_calls` | model, tokens in/out/cached, cost, seconds, reason | owner and admin |
| `generals` | a user's Prompt Wars prompt, rating, record | owner writes (moderated), all read the rating |
| `predictions` | user, match, predicted winner, points | owner |
| `model_ratings` | Elo per real model | all read; server writes |

### Stripe

- **Checkout** for credit packs, **Billing** for subscriptions, **Customer Portal** for cancelling and invoices.
- **Webhooks** (a Vercel function, signature checked, each event processed once): `checkout.session.completed` → add pack credits; `invoice.paid` → add the month's credits; `customer.subscription.updated / deleted` → change plan.
- **Stripe Tax** for VAT / sales tax. Start in **test mode**; no real money until everything is tested.

### Safety limits

- API keys live only on the runner and server functions, never in the browser.
- Live matches at once: Free 1 (Haiku), Pro 3, Commander 10.
- A **global daily AI spend cap** with an alert, on top of the per-nation budgets.
- Prompt Wars prompts: length limit, moderation, and they are always treated as game strategy, never as instructions to the platform.
- Messages the AIs say to each other are filtered before being shown publicly.

---

## 5. Things to fix before charging money

1. **Trademarks.** The built-in personalities are called ChatGPT, Claude, Grok, Gemini, DeepSeek, Llama, Mistral, Qwen. In a paid product, rename them (for example *Nimbus the Strategist*, *Ironclad*, *Wildfire*…) and only write "powered by Claude Opus 5.5" when that real model is actually playing. Ask a lawyer before launch.
2. **AI companies' terms.** Building a paid app on their APIs is generally allowed, but each company has usage policies (content, reselling, showing output to the public). Read them for every provider you add.
3. **No gambling.** No real-money bets on matches; predictions give points and badges only. Tournament prizes should be cosmetic or sponsor-paid, never paid from entry fees, unless a lawyer approves.
4. **Legal pages.** Terms of service, privacy policy (GDPR if you have EU users — host Supabase in the EU), refund policy, contact, minimum age (13+ or 16+ in the EU).
5. **Real cost test.** Run 5–10 matches with real keys and compare the real token use with the estimates above; then fix the credit prices.

---

## 6. Build order

| Phase | What | Result |
|---|---|---|
| **0 — Prepare** | Rename personalities; real-key cost test; choose name and domain; legal pages draft | prices you can trust |
| **1 — MVP** | Supabase login; deploy to Vercel; match runner with your keys; live Watch page; credit packs in Stripe test mode; credit reservation and refunds; "My matches" page | people can buy credits and start and share live matches |
| **2 — Subscriptions** | Pro / Commander / own-key plans; Customer Portal; public **Model Wars** leaderboard; weekly scheduled Model Wars broadcast | recurring revenue and weekly content |
| **3 — Prompt Wars** | prompted generals, ranked seasons, predictions with points, streamer overlay, clip export | the competitive hook |
| **4 — Research** | batch benchmark runs, private leaderboards, exports, an API | B2B revenue |

---

## 7. Open questions (let's clarify)

1. **Name and domain** — keep "Age of AI: Dominion"?
2. **Which models at launch?** Anthropic only is simplest (one key, one bill). Each extra company (OpenAI, xAI, Google…) needs its own key, billing and cost test.
3. **Your country and company** — where you are registered decides taxes and Stripe setup. Which currencies (USD, EUR)?
4. **Bring your own key** — offer it? (Less revenue per user, but zero cost risk.)
5. **Speed of live matches** — real time (a 90-minute battle takes 90 minutes) or 2–4× faster (more matches per runner, shorter to watch)?
6. **How generous is Free?** One free Haiku match per day costs you about $0.03 each.
7. **Prompt Wars** — yes? It needs moderation of user prompts.
8. **Login methods** — email, Google, Discord, GitHub?
9. **Where to run matches** — a small VM (Hetzner, Fly.io, Railway) or something you already use?
10. **Streaming** — should matches also go to Twitch/YouTube automatically?
