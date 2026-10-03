# First Customer

A pixel-art RPG-style game about the hardest part of starting a company: getting **one person to pay**.

Pick a product, plan the build, then walk around a town where 600 simulated people each have hidden needs, budgets, favourite channels and pet peeves. Post, do outreach, run ads, interview people, write articles, launch. Get your first paying customer in as few in-game days as you can to earn an award and a place on the leaderboard.

## Run it

No install and no build step:

- **Easiest:** double-click `index.html`.
- **Or serve it** (recommended if your browser blocks local files): `npx serve .` or `python3 -m http.server`, then open the printed URL.

Saves and the leaderboard live in the browser's `localStorage` for now.

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
index.html          entry point (plain <script> tags, works from file://)
css/styles.css      pixel UI (Sweetie-16 palette, Press Start 2P + VT323 fonts)
js/config.js        storage mode switch (local | api)
js/rng.js           seeded, serializable RNG
js/data.js          ALL content & tuning: products, segments, channels, dislikes, voices, badges
js/market.js        generates the townsfolk
js/engine.js        rules & simulation (no DOM; runs in Node too)
js/storage.js       storage adapter (localStorage now, HTTP API later)
js/sprites.js       procedural pixel art (people, buildings, icons)
js/town.js          animated town map
js/ui.js            screens, HUD, dialogs
tools/simulate.js   headless balance tester with bots
docs/schema.sql     suggested DB schema for going live
```

To add a product, segment or channel, edit `js/data.js`. To change difficulty, edit the `KIND` caps and conversion numbers in `js/engine.js`, then run:

```
node tools/simulate.js 20
```

This plays every product with three bots (smart / average / naive) and prints win rates and median days. Current tuning: smart play takes about 2 weeks, typical play 3–5 weeks, and "hype + ads" usually fails.

## Going live (DB + deploy)

1. Host the folder as static files (Netlify, Vercel, S3, GitHub Pages…).
2. Build a small API and set `js/config.js` to `{ storage: 'api', apiBase: 'https://…/api' }`.
3. Implement these endpoints:

| Method | Path | Body / query | Returns |
|---|---|---|---|
| `GET` | `/leaderboard?limit=50&productId=focusflow` | | `Entry[]` sorted by `days` asc, then `realMs` asc |
| `POST` | `/leaderboard` | `Entry` | `{ rank, total }` |

`Entry` = `{ id, founder, productId, productName, days, realMs, actions, adSpend, badge, seed, customerSeg, channel, finishedAt }`

See `docs/schema.sql` for a matching Postgres table.

**Anti-cheat later:** every game is deterministic from its `seed` plus the sequence of actions. If the client also POSTs its action log, the server can re-run `js/engine.js` (it runs in Node) and check that `days` is real before accepting a score.

Game saves stay in localStorage even in API mode. Move them server-side if you want cross-device resume.
# founderville
