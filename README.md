# 🏆 WET — Webgame Evening Tournament

One lobby for your whole game night. WET wraps the web games you already play with
friends (OpenGuessr, Krycí jména, WikiSpeedruns, Dobyvatel, anything with a lobby link)
into a single tournament: one invite link, live round announcements, and a running
scoreboard.

## How a game night works

1. The **host** creates a tournament and shares one invite link (`/t/ABC123`).
2. Friends open the link, pick a nickname, and they're in.
3. To start a round, the host creates a lobby in the actual game (one click, as usual),
   pastes the lobby URL into WET, and hits **Start round** — a big **JOIN LOBBY** button
   instantly appears on every player's screen.
4. After the round, the host enters placements. Points are awarded automatically
   (1st of N players gets N points … last gets 1; ties share a placement) and the
   standings update live for everyone.

No accounts, no passwords. The host's browser holds a host token in localStorage;
players hold a player token. Don't clear your browser data mid-tournament. 🙂

## Running it

```bash
npm install
npm start          # http://localhost:3000
```

Everyone needs to reach the server, so either run it on a VPS / free tier
(Fly.io, Render, Railway…) or expose your laptop with a tunnel for the evening:

```bash
npx localtunnel --port 3000   # or: cloudflared tunnel --url http://localhost:3000
```

## Stack

- Node.js + Express — HTTP API and static frontend
- Single JSON file (`wet.json`) for persistence — zero setup, no database to run
- ws — WebSocket fan-out so rounds and scores appear live
- Vanilla HTML/CSS/JS frontend — no build step

## Why paste lobby links instead of auto-creating lobbies?

None of these games expose a public API for lobby creation. Auto-creating lobbies would
mean headless-browser scraping — fragile and against most terms of service. Pasting the
one link the host already has gets 90% of the value with 0% of the breakage. Each game
is just an entry in `GAMES` in `public/app.js`; add your own favorites there.
