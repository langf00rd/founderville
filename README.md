# founderville

A pixel-art RPG-style game about the hardest part of starting a company: getting **one person to pay**.

Pick a product, plan the build, then walk around a town where 600 simulated people each have hidden needs, budgets, favourite channels and pet peeves. Post, do outreach, run ads, interview people, write articles, launch. Get your first paying customer in as few in-game days as you can to earn an award and a place on the leaderboard.

## Run it

No install and no build step. Sign-in needs a real web address, so serve the folder:

```
npx serve .
```

Then open the printed URL. Scores and saves go to Supabase, so they follow you between devices and browsers.

## How the game works

| Phase | What happens |
|---|---|
| **Plan** | Choose scope (MVP / v1 / polished), up to 3 features, pricing model and price, trial, signup flow. Bigger builds take more days, and **days are your score**. |
| **Build** | You have 3h/day to market while you code. Interested people join a waitlist, and they're emailed on launch day. |
| **Market** | 8h/day. Click buildings to act. End the day to advance time, trials run out, and search traffic grows. |
| **Win** | First paying customer → award tier by days, leaderboard entry, and a debrief of what worked and what didn't. |
| **Lose** | Cash hits $0 (you burn $15/day plus ads) or day 120 passes. |

**Buildings:** Garage (improve, pricing, onboard trial users, referrals), Cafe (interviews), Library (SEO articles), Post Office (cold outreach), Ad Agency (paid ads), Town Square (meetups), Launch Pad (Product Hunt), plus one building per channel (Reddit, X, LinkedIn, TikTok, Instagram, Facebook Groups, WhatsApp, Hacker News, YouTube, Discord) where you can post or hang out to build reputation.

**What the simulation models:**

- **Product–segment fit** is hidden. The "hunch" shown when you pick a product is only a hint.
- **Channels:** each segment uses different ones. Communities remove promo from people with no reputation.
- **Message angle:** problem-first, humor, founder story, etc. Each segment reacts differently.
- **Your actual words:** people respond to their own vocabulary and react badly to hype, jargon, "AI-powered", and emoji spam.
- **Dislikes:** cold DMs, ads, subscriptions, signing up before trying, and more. These can permanently annoy people.
- **Pricing vs. willingness to pay**, trials, freemium, product quality and bugs (churn).
- **Fatigue, word of mouth, testimonials and social proof, random events** (algorithm changes, outages, press).
- **Feedback:** you learn through townsfolk quotes and interviews, which fill in your Journal.

## Project structure

```
index.html          entry point (plain <script> tags, no build step)
css/styles.css      pixel UI (Sweetie-16 palette, Press Start 2P + VT323 fonts)
js/config.js        Supabase URL + anon key, provider list, authRequired switch
js/supabase.js      zero-dependency Supabase client (OAuth PKCE, PostgREST, token refresh)
js/rng.js           seeded, serializable RNG
js/data.js          ALL content & tuning: products, segments, channels, dislikes, voices, badges
js/market.js        generates the townsfolk
js/engine.js        rules & simulation (no DOM; runs in Node too)
js/storage.js       storage adapter: auth, leaderboard, saves
js/sprites.js       procedural pixel art (people, buildings, icons)
js/town.js          animated town map
js/ui.js            screens, HUD, dialogs
tools/simulate.js   headless balance tester with bots
tools/check-client.js  offline test of the Supabase client against a fake server
docs/schema.sql     the actual Postgres schema (runs, saves, RLS, submit_run)
```

There is deliberately **no `supabase-js` dependency**. The client in `js/supabase.js` is
about 200 lines of `fetch` against the documented GoTrue and PostgREST endpoints, which
keeps the game buildless and keeps a ~100KB SDK off the critical path.

To add a product, segment or channel, edit `js/data.js`. To change difficulty, edit the `KIND` caps and conversion numbers in `js/engine.js`, then run:

```
node tools/simulate.js 20
```

This plays every product with three bots (smart / average / naive) and prints win rates and median days. Current tuning: smart play takes about 2 weeks, typical play 3–5 weeks, and "hype + ads" usually fails.

## Tests

```
node tools/check-client.js
```

Covers the parts that are easy to get quietly wrong, with no network and no deps: PKCE
URL construction, the OAuth callback including a mismatched-`state` CSRF rejection,
access-token refresh and retry, the gzip save round-trip (asserts the reloaded run is
byte-identical to the saved one, all 600 townsfolk included), leaderboard row mapping,
idempotent score submission, per-account isolation of saves and founder name, and
offline fallback to the local mirror.

## Setup (Supabase)

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste `docs/schema.sql`, run it. It creates `runs`, `saves`, the
   indexes, the RLS policies and the `submit_run` function. Safe to re-run.
3. **Project Settings → API**: copy the project URL and the `anon` / publishable key
   into `js/config.js`.
4. **Authentication → Providers**: turn on Google and GitHub. Each needs a client ID
   and secret from that provider's console, plus the callback URL Supabase prints.
5. **Authentication → URL Configuration**: set **Site URL** to your deployed domain and
   add the same URL (and `localhost`) to **Redirect URLs**.
6. Deploy the folder as static files (Netlify, Vercel, Cloudflare Pages, GitHub Pages).
   Any static host works; there is nothing to build.

### How access control works

| Table | Who can read | Who can write |
|---|---|---|
| `runs` | anyone, including signed out — it's a public leaderboard | insert only your own row |
| `saves` | only the owner | only the owner |

There are no `update` or `delete` policies on `runs`, so scores are append-only: a
signed-in player cannot edit their days or remove a rival's entry. `user_id` comes from
`auth.uid()` inside the `submit_run` function and is never read from the request, so
posting a score under someone else's id is not possible. `finished_at` is stamped by the
database clock, which stops backdating to win a tie on play time.

### Saves

A save is the full game state, and the 600 townsfolk make that about 190KB of JSON. The
client gzips it with the native `CompressionStream` and stores base64, which lands
around 23KB, so writes stay cheap. The browser's `localStorage` is written first on
every autosave and the server copy is flushed every 30s, so a dropped connection or a
closed tab never loses a run in progress. `js/engine.js` was deliberately left alone —
regenerating the townsfolk from the seed and diffing only the seven fields that mutate
would be smaller still, but it silently breaks if a new per-persona field is ever added.

Saves and founder names are namespaced by user id, so two accounts sharing a browser
don't see each other's run.

### Known gap: score cheating

`days` and `real_ms` arrive from the client, so a determined player can post a fake
score, and the schema's `verified` column is currently always `false`. The engine is
deterministic from the seed, so the real fix is to also POST the action log, replay it
with `js/engine.js` (it runs in Node), and only write `verified = true` when the
recomputed day matches. Worth doing before the leaderboard starts mattering to anyone.
