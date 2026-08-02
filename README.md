# 🏆 WET — Webgame Evening Tournament

One lobby for your whole game night. WET wraps the web games you already play with
friends (OpenGuessr, Krycí jména, WikiSpeedruns, Dobyvatel, anything with a lobby link)
into a single tournament: one invite link, live round announcements, and a running
scoreboard.

## How a game night works

1. The **host** creates a tournament: names it, builds the **game pool** for the night
   (built-in games plus any number of custom ones — or hits 🎲 Random for a shuffled
   preset pool), picks how games get chosen, and shares one invite link (`/t/ABC123`).
2. Friends open the link, pick a nickname, and they're in.
3. Between rounds, the next game comes out of the pool by **pick mode**:
   - 🎰 **Chance** — the host hits SPIN and a CS:GO-style carousel rolls across every
     player's screen, all landing on the same game (the server draws the winner and
     broadcasts a seed, so the animation is identical everywhere).
   - 🎛 **Host picks** — the host clicks a game tile.
   - 🗳 **Players vote** — everyone votes on the tiles (or lets 🎲 vote for them);
     majority wins, ties go to chance.
   The host can switch modes and add or remove games between rounds.
4. The host creates the lobby in the picked game (one click, as usual), pastes the
   lobby URL into WET — a big **JOIN LOBBY** button instantly appears on every
   player's screen. Each game is played once and then retires from the pool.
5. After the round, the host enters placements. Points are awarded automatically
   (1st of N players gets N points … last gets 1; ties share a placement) and the
   standings update live for everyone.

No accounts, no passwords. The host's browser holds a host token in localStorage;
players hold a player token. Don't clear your browser data mid-tournament. 🙂

## Running it

```bash
npm install
npm start          # http://localhost:3000
```

Everyone needs to reach the server — for a quick test you can tunnel your laptop
(`npx localtunnel --port 3000`), but the real deployment runs on Fly.io.

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

- Node.js + Express — HTTP API and static frontend
- Single JSON file (`wet.json`) for persistence — zero setup, no database to run
- ws — WebSocket fan-out so rounds and scores appear live
- Vanilla HTML/CSS/JS frontend — no build step

## Why paste lobby links instead of auto-creating lobbies?

None of these games expose a public API for lobby creation. Auto-creating lobbies would
mean headless-browser scraping — fragile and against most terms of service. Pasting the
one link the host already has gets 90% of the value with 0% of the breakage. The
built-in games live in `presets.js`; add your own favorites there, or just type them
into the pool as custom games.
