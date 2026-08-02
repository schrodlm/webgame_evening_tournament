# 🏆 WET - Webgame Evening Tournament

One lobby for your whole game night. WET wraps the web games you already play with
friends (OpenGuessr, Skribbl, Code Names, TETR.IO... anything with a lobby link) into a
single tournament: one invite link, live round announcements, a spinning game carousel,
and a running scoreboard that ends the night by crowning a champion.

Live at **https://wet-tournament.fly.dev** - or run your own, see below.

## How a game night works

1. The **host** creates a tournament: names it, builds the **game pool** for the night
   from a categorized menu of 15 built-in games plus any number of custom ones - or
   hits 🎲 Random for a shuffled preset pool - picks how games get chosen, and shares
   one invite link (`/t/ABC123`).
2. Friends open the link, pick a nickname, and they're in. No accounts, no passwords.
3. Between rounds, the next game comes out of the pool by **pick mode** (switchable
   any time):
   - 🎰 **Chance** - the host hits SPIN and a CS:GO-style carousel rolls across every
     player's screen, all landing on the same game (the server draws the winner and
     broadcasts a seed, so the animation is identical everywhere).
   - 🎛️ **Host picks** - the host taps a game tile.
   - 🗳️ **Players vote** - everyone votes on the tiles (or lets 🎲 vote for them);
     majority wins, ties go to chance, and stragglers get called out by name.
4. The host creates the lobby in the picked game (one click, as usual) and pastes the
   lobby URL into WET - a big **JOIN LOBBY** button instantly appears on every
   player's screen. Each game is played once and then retires from the pool.
5. After the round, the host **taps players in the order they finished** - medals
   appear as they tap, a small `=` marks ties, untapped players sit out. Points are
   automatic (1st of N players gets N points ... last gets 1; ties share a placement),
   standings update live, and every screen acknowledges the round winner.
6. When the pool runs dry, the night ends with a golden card crowning the champion.

## The games

Fifteen presets, grouped in the create form:

| | |
| --- | --- |
| 🌍 Geo & trivia | OpenGuessr, Dobyvatel |
| 🎨 Drawing | Skribbl *or* Gartic Phone |
| 🕵️ Social deduction | Code Names, Spyfall |
| 📖 Wiki racing | WikiRace *or* WikiSpeedruns |
| ⚡ Action & sport | BombParty, Haxball, Curve Fever, Smash Karts, TETR.IO, TypeRacer |
| 🌾 Strategy | Colonist |

The *or* pairs are two sites for the same game concept - only one is checked by
default and 🎲 Random never draws both. Custom games can be added at creation or
mid-tournament, and ones without a shareable lobby (charades, anyone?) can be marked
link-free so their rounds start without a URL.

## Running it

```bash
npm install
npm start          # http://localhost:3000
npm test           # unit tests for the ranking logic
```

Everyone needs to reach the server - for a quick test you can tunnel your laptop
(`npx localtunnel --port 3000`), but the real deployment runs on Fly.io.

All user-facing text lives in `public/strings.js`, so rewording the whole app is a
one-file edit.

## Deploying (Fly.io)

One-time setup:

```bash
# 1. Account at https://fly.io (needs a payment card), then:
curl -L https://fly.io/install.sh | sh
fly auth login
fly apps create wet-tournament          # pick another name if taken → update fly.toml
fly volumes create wet_data --region fra --size 1 --app wet-tournament
fly deploy --ha=false                   # first deploy, from the repo root

# 2. Let GitHub Actions deploy from now on:
fly tokens create deploy --app wet-tournament
gh secret set FLY_API_TOKEN            # paste the token
```

After that, deploying = publishing a GitHub release (or the manual **Run
workflow** button in the Actions tab). The tournament data lives on the
`wet_data` volume in `/data/wet.json` and survives deploys and restarts. The
machine sleeps when nobody is connected and wakes on the first visit, so an
idle month costs cents.

## Stack

- Node.js + Express - HTTP API and static frontend
- Single JSON file (`wet.json`) for persistence - zero setup, no database to run
- ws - WebSocket fan-out so rounds, votes, and scores appear live everywhere
- Vanilla HTML/CSS/JS frontend - no build step, no framework, no dependencies

## Why paste lobby links instead of auto-creating lobbies?

None of these games expose a public API for lobby creation. Auto-creating lobbies would
mean headless-browser scraping - fragile and against most terms of service. Pasting the
one link the host already has gets 90% of the value with 0% of the breakage (and the
📋 Paste button makes it one tap). The built-in games live in `presets.js`; add your
own favorites there, or just type them into the pool as custom games.
