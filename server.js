const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { data, persist } = require('./store');
const PRESETS = require('./presets');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- helpers ----------

// Unambiguous alphabet: no 0/O, 1/I/L — codes get read out loud over voice chat
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function makeCode(len = 6) {
  return Array.from(crypto.randomBytes(len))
    .map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length])
    .join('');
}
const makeToken = () => crypto.randomBytes(24).toString('hex');
const makeId = () => crypto.randomBytes(8).toString('hex');
const now = () => new Date().toISOString();

const getTournament = (code) => data.tournaments[String(code || '').toUpperCase()] || null;
const activeRound = (t) => t.rounds.find((r) => r.status === 'active') || null;
const pendingGames = (t) => (t.games || []).filter((g) => g.status === 'pending');

// ---------- game pool ----------

const PICK_MODES = ['chance', 'host', 'vote'];
const CUSTOM_COLORS = ['#16897a', '#b13b73', '#5a7d2a', '#8a4f2d', '#3f6bbf', '#946bd6'];

function colorFor(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return CUSTOM_COLORS[h % CUSTOM_COLORS.length];
}

function poolEntry(spec) {
  if (spec.preset) {
    const p = PRESETS.find((x) => x.key === spec.preset);
    if (!p) throw badRequest(`Unknown preset: ${spec.preset}`);
    return {
      id: makeId(), key: p.key, name: p.name, site: p.site, hint: p.hint,
      emoji: p.emoji, color: p.color, custom: false, status: 'pending',
    };
  }
  const name = String(spec.name || '').trim();
  if (!name) throw badRequest('Custom game needs a name');
  if (name.length > 48) throw badRequest('Game name too long (max 48)');
  const site = String(spec.site || '').trim();
  if (site) {
    try { new URL(site); } catch { throw badRequest('Game site must be a valid URL'); }
  }
  return {
    id: makeId(), key: null, name, site,
    hint: 'Create a lobby in the game and copy the invite link.',
    emoji: '🎮', color: colorFor(name), custom: true, status: 'pending',
  };
}

// `random: true` fills the pool from presets only, shuffled — custom games are
// never auto-added. No games given at all → all presets in catalog order.
function buildPool(games, random) {
  if (random) {
    const deck = [...PRESETS];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck.map((p) => poolEntry({ preset: p.key }));
  }
  if (!Array.isArray(games) || games.length === 0) {
    return PRESETS.map((p) => poolEntry({ preset: p.key }));
  }
  const pool = [];
  const seen = new Set();
  for (const spec of games) {
    const entry = poolEntry(spec);
    const k = entry.name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    pool.push(entry);
  }
  return pool;
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

// Public view of a tournament: everything except tokens
function getState(code) {
  const t = getTournament(code);
  if (!t) return null;

  const totals = new Map(t.players.map((p) => [p.id, 0]));
  for (const round of t.rounds)
    for (const r of round.results)
      totals.set(r.playerId, (totals.get(r.playerId) || 0) + r.points);

  return {
    code: t.code,
    name: t.name,
    createdAt: t.createdAt,
    pickMode: t.pickMode || 'chance',
    games: t.games || [],
    pendingPick: t.pendingPick || null,
    pendingVote: t.pendingVote || null,
    players: t.players.map((p) => ({ id: p.id, name: p.name, isHost: p.isHost })),
    rounds: t.rounds,
    standings: t.players
      .map((p) => ({ playerId: p.id, name: p.name, total: totals.get(p.id) || 0 }))
      .sort((a, b) => b.total - a.total),
  };
}

function requireHost(req, res) {
  const t = getTournament(req.params.code);
  if (!t) {
    res.status(404).json({ error: 'Tournament not found' });
    return null;
  }
  if (req.get('X-Host-Token') !== t.hostToken) {
    res.status(403).json({ error: 'Host token required' });
    return null;
  }
  return t;
}

// ---------- websocket fan-out ----------

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const rooms = new Map(); // tournament code -> Set<socket>

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://x');
  const code = (url.searchParams.get('code') || '').toUpperCase();
  if (!getTournament(code)) return ws.close(4004, 'unknown tournament');

  if (!rooms.has(code)) rooms.set(code, new Set());
  rooms.get(code).add(ws);
  ws.on('close', () => {
    const room = rooms.get(code);
    if (room) {
      room.delete(ws);
      if (room.size === 0) rooms.delete(code);
    }
  });
  ws.send(JSON.stringify({ type: 'state', state: getState(code) }));
});

function broadcast(code) {
  const room = rooms.get(code);
  if (!room) return;
  const msg = JSON.stringify({ type: 'state', state: getState(code) });
  for (const ws of room) if (ws.readyState === ws.OPEN) ws.send(msg);
}

// ---------- API ----------

app.get('/api/presets', (_req, res) => res.json(PRESETS));

app.post('/api/tournaments', (req, res) => {
  const { name, hostName, pickMode, games, random } = req.body || {};
  if (!name?.trim() || !hostName?.trim()) {
    return res.status(400).json({ error: 'name and hostName are required' });
  }
  if (pickMode !== undefined && !PICK_MODES.includes(pickMode)) {
    return res.status(400).json({ error: `pickMode must be one of: ${PICK_MODES.join(', ')}` });
  }
  let pool;
  try {
    pool = buildPool(games, random === true);
  } catch (e) {
    if (e.status !== 400) throw e;
    return res.status(400).json({ error: e.message });
  }

  let code;
  do code = makeCode();
  while (data.tournaments[code]);

  const hostToken = makeToken();
  const playerId = makeId();
  const playerToken = makeToken();

  data.tournaments[code] = {
    code,
    name: name.trim(),
    hostToken,
    createdAt: now(),
    pickMode: pickMode || 'chance',
    games: pool,
    pendingPick: null,
    pendingVote: null,
    players: [
      { id: playerId, name: hostName.trim(), token: playerToken, isHost: true, joinedAt: now() },
    ],
    rounds: [],
  };
  persist();

  res.json({ code, hostToken, playerId, playerToken });
});

app.get('/api/tournaments/:code', (req, res) => {
  const state = getState(req.params.code);
  if (!state) return res.status(404).json({ error: 'Tournament not found' });
  res.json(state);
});

app.post('/api/tournaments/:code/join', (req, res) => {
  const t = getTournament(req.params.code);
  if (!t) return res.status(404).json({ error: 'Tournament not found' });
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (name.length > 24) return res.status(400).json({ error: 'name too long (max 24)' });
  if (t.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    return res.status(409).json({ error: 'That name is already taken in this tournament' });
  }

  const player = { id: makeId(), name, token: makeToken(), isHost: false, joinedAt: now() };
  t.players.push(player);
  persist();
  broadcast(t.code);
  res.json({ playerId: player.id, playerToken: player.token });
});

app.post('/api/tournaments/:code/games', (req, res) => {
  const t = requireHost(req, res);
  if (!t) return;
  let entry;
  try {
    entry = poolEntry(req.body || {});
  } catch (e) {
    if (e.status !== 400) throw e;
    return res.status(400).json({ error: e.message });
  }
  if (t.games.some((g) => g.name.toLowerCase() === entry.name.toLowerCase())) {
    return res.status(409).json({ error: 'That game is already in the pool' });
  }
  t.games.push(entry);
  persist();
  broadcast(t.code);
  res.json({ id: entry.id });
});

app.delete('/api/tournaments/:code/games/:gameId', (req, res) => {
  const t = requireHost(req, res);
  if (!t) return;
  const game = t.games.find((g) => g.id === req.params.gameId);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.status !== 'pending') return res.status(409).json({ error: 'Game was already played' });
  if (t.pendingPick?.gameId === game.id) {
    return res.status(409).json({ error: 'That game is picked as up next' });
  }
  t.games = t.games.filter((g) => g.id !== game.id);
  persist();
  broadcast(t.code);
  res.json({ ok: true });
});

app.post('/api/tournaments/:code/pick-mode', (req, res) => {
  const t = requireHost(req, res);
  if (!t) return;
  const { pickMode } = req.body || {};
  if (!PICK_MODES.includes(pickMode)) {
    return res.status(400).json({ error: `pickMode must be one of: ${PICK_MODES.join(', ')}` });
  }
  if (t.pendingPick) return res.status(409).json({ error: 'A game is already picked as up next' });
  if (t.pendingVote) return res.status(409).json({ error: 'Close the running vote first' });
  t.pickMode = pickMode;
  persist();
  broadcast(t.code);
  res.json({ ok: true });
});

app.post('/api/tournaments/:code/rounds', (req, res) => {
  const t = requireHost(req, res);
  if (!t) return;
  const { game, lobbyUrl } = req.body || {};
  if (!game?.trim() || !lobbyUrl?.trim()) {
    return res.status(400).json({ error: 'game and lobbyUrl are required' });
  }
  try {
    new URL(lobbyUrl);
  } catch {
    return res.status(400).json({ error: 'lobbyUrl must be a valid URL' });
  }
  if (activeRound(t)) return res.status(409).json({ error: 'Finish the current round first' });

  const round = {
    id: makeId(),
    number: t.rounds.length + 1,
    game: game.trim(),
    lobbyUrl: lobbyUrl.trim(),
    status: 'active',
    startedAt: now(),
    finishedAt: null,
    results: [],
  };
  t.rounds.push(round);
  persist();
  broadcast(t.code);
  res.json({ id: round.id, number: round.number });
});

// Scoring: with N players, 1st place gets N points, 2nd gets N-1, ... Ties share a
// placement and its points. Players left out of the submission score 0 for the round.
app.post('/api/tournaments/:code/rounds/:roundId/finish', (req, res) => {
  const t = requireHost(req, res);
  if (!t) return;
  const round = t.rounds.find((r) => r.id === req.params.roundId);
  if (!round) return res.status(404).json({ error: 'Round not found' });
  if (round.status !== 'active') return res.status(409).json({ error: 'Round already finished' });

  const placements = req.body?.placements;
  if (!Array.isArray(placements) || placements.length === 0) {
    return res.status(400).json({ error: 'placements array is required' });
  }
  const n = t.players.length;
  const validIds = new Set(t.players.map((p) => p.id));
  const seen = new Set();
  for (const p of placements) {
    if (!validIds.has(p.playerId) || seen.has(p.playerId)) {
      return res.status(400).json({ error: 'Unknown or duplicate player in placements' });
    }
    seen.add(p.playerId);
    if (!Number.isInteger(p.placement) || p.placement < 1 || p.placement > n) {
      return res.status(400).json({ error: `placement must be 1..${n}` });
    }
  }

  round.results = placements.map((p) => ({
    playerId: p.playerId,
    placement: p.placement,
    points: n - p.placement + 1,
  }));
  round.status = 'finished';
  round.finishedAt = now();
  persist();
  broadcast(t.code);
  res.json({ ok: true });
});

// Pretty URLs: /t/ABC123 serves the tournament page
app.get('/t/:code', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'tournament.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`WET running on http://localhost:${PORT}`));
