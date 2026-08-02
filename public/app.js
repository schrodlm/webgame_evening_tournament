/* WET tournament page logic — vanilla JS, no build step. */

const CODE = location.pathname.split('/').pop().toUpperCase();
const IDENTITY_KEY = 'wet:' + CODE;

const GAMES = [
  { name: 'OpenGuessr', site: 'https://openguessr.com/', hint: 'Create a party and copy the invite link.' },
  { name: 'Krycí jména', site: 'https://codenames.game/', hint: 'Create room → copy the room URL from the address bar.' },
  { name: 'WikiSpeedruns', site: 'https://wikispeedruns.com/', hint: 'Create a private lobby and copy the invite link.' },
  { name: 'Dobyvatel', site: 'https://www.dobyvatel.cz/', hint: 'Create a quick game and copy the invite link.' },
  { name: 'Custom…', site: '', hint: 'Any game with a shareable lobby link works.' },
];

let identity = null;
try { identity = JSON.parse(localStorage.getItem(IDENTITY_KEY)); } catch { /* ignore */ }
let state = null;
// Host form inputs survive re-renders via this scratch object
const draft = { game: GAMES[0].name, customGame: '', lobbyUrl: '' };

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const isHost = () => !!identity?.hostToken;

// ---------- rendering ----------

function render() {
  if (!state) return;
  document.title = `WET — ${state.name}`;
  $('t-name').textContent = state.name;
  $('join-box').hidden = !!identity;

  renderRound();
  renderHost();
  renderStandings();
  renderPlayers();
  renderHistory();
}

function activeRound() {
  return state.rounds.find((r) => r.status === 'active') || null;
}

function renderRound() {
  const round = activeRound();
  const box = $('round-box');
  if (!round) {
    const played = state.rounds.length;
    box.innerHTML = `<div class="card round idle">
      <h2>No round in progress</h2>
      <p>${played ? 'Waiting for the host to start the next round…' : 'Waiting for the host to start round 1…'}</p>
    </div>`;
    return;
  }
  box.innerHTML = `<div class="card round live">
    <div class="round-label">ROUND ${round.number} · LIVE</div>
    <h2>${esc(round.game)}</h2>
    <a class="btn join" href="${esc(round.lobbyUrl)}" target="_blank" rel="noopener">
      ▶ JOIN LOBBY
    </a>
    <p class="hint">Everyone clicks, plays, then the host enters the results here.</p>
  </div>`;
}

function renderHost() {
  const box = $('host-box');
  if (!isHost()) { box.hidden = true; return; }
  box.hidden = false;

  const round = activeRound();
  if (round) {
    box.innerHTML = `<div class="card host">
      <h2>🎛 Host — finish round ${round.number}</h2>
      <p class="hint">Enter placements when the game ends. Points: 1st of ${state.players.length} players gets ${state.players.length}, last gets 1. Leave “sat out” for anyone who didn’t play.</p>
      <form id="finish-form">
        ${state.players.map((p) => `
          <label class="placement-row">
            <span>${esc(p.name)}</span>
            <select name="${p.id}">
              <option value="">— sat out —</option>
              ${state.players.map((_, i) =>
                `<option value="${i + 1}">${i + 1}${['st', 'nd', 'rd'][i] || 'th'} place</option>`).join('')}
            </select>
          </label>`).join('')}
        <button type="submit" class="btn primary">Submit results</button>
        <p class="error" id="finish-error" hidden></p>
      </form>
    </div>`;
    $('finish-form').addEventListener('submit', onFinishRound);
  } else {
    const selected = GAMES.find((g) => g.name === draft.game) || GAMES[0];
    box.innerHTML = `<div class="card host">
      <h2>🎛 Host — start round ${state.rounds.length + 1}</h2>
      <form id="start-form">
        <label>Game
          <select id="game-select">
            ${GAMES.map((g) =>
              `<option ${g.name === draft.game ? 'selected' : ''}>${g.name}</option>`).join('')}
          </select>
        </label>
        <input id="custom-game" placeholder="Game name" maxlength="48"
               value="${esc(draft.customGame)}" ${selected.site ? 'hidden' : ''}>
        <p class="hint">
          ${selected.site
            ? `<a href="${selected.site}" target="_blank" rel="noopener">Open ${esc(selected.name)} ↗</a> — ${esc(selected.hint)}`
            : esc(selected.hint)}
        </p>
        <label>Lobby link
          <input id="lobby-url" type="url" placeholder="Paste the lobby / invite URL here"
                 value="${esc(draft.lobbyUrl)}" required>
        </label>
        <button type="submit" class="btn primary">🚀 Start round — push to all players</button>
        <p class="error" id="start-error" hidden></p>
      </form>
    </div>`;
    $('game-select').addEventListener('change', (e) => { draft.game = e.target.value; renderHost(); });
    $('lobby-url').addEventListener('input', (e) => { draft.lobbyUrl = e.target.value; });
    $('custom-game').addEventListener('input', (e) => { draft.customGame = e.target.value; });
    $('start-form').addEventListener('submit', onStartRound);
  }
}

function renderStandings() {
  const medals = ['🥇', '🥈', '🥉'];
  $('standings').innerHTML = state.standings.map((s, i) => `
    <li class="${s.playerId === identity?.playerId ? 'me' : ''}">
      <span class="rank">${medals[i] || i + 1 + '.'}</span>
      <span class="name">${esc(s.name)}</span>
      <span class="pts">${s.total} pts</span>
    </li>`).join('');
}

function renderPlayers() {
  $('players').innerHTML = state.players.map((p) => `
    <li>${esc(p.name)}${p.isHost ? ' <span class="badge">host</span>' : ''}${
      p.id === identity?.playerId ? ' <span class="badge you">you</span>' : ''}</li>`).join('');
}

function renderHistory() {
  const finished = state.rounds.filter((r) => r.status === 'finished');
  $('history').innerHTML = finished.length
    ? finished.map((r) => {
        const winner = r.results.filter((x) => x.placement === 1)
          .map((x) => state.players.find((p) => p.id === x.playerId)?.name).filter(Boolean);
        return `<li><b>R${r.number}</b> ${esc(r.game)} — 🏅 ${esc(winner.join(', ') || '—')}</li>`;
      }).join('')
    : '<li class="hint">Nothing played yet.</li>';
}

// ---------- actions ----------

async function api(path, body, opts = {}) {
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(isHost() ? { 'X-Host-Token': identity.hostToken } : {}),
    },
    body: JSON.stringify(body),
    ...opts,
  });
  const out = await res.json();
  if (!res.ok) throw new Error(out.error || 'Request failed');
  return out;
}

function showError(id, err) {
  const el = $(id);
  el.textContent = err.message;
  el.hidden = false;
}

$('join-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const name = new FormData(e.target).get('name');
    const out = await api(`/api/tournaments/${CODE}/join`, { name });
    identity = { playerId: out.playerId, playerToken: out.playerToken };
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
    render();
  } catch (err) { showError('join-error', err); }
});

async function onStartRound(e) {
  e.preventDefault();
  const game = draft.game === 'Custom…' ? draft.customGame.trim() : draft.game;
  try {
    if (!game) throw new Error('Give the custom game a name');
    await api(`/api/tournaments/${CODE}/rounds`, { game, lobbyUrl: draft.lobbyUrl.trim() });
    draft.lobbyUrl = '';
  } catch (err) { showError('start-error', err); }
}

async function onFinishRound(e) {
  e.preventDefault();
  const round = activeRound();
  const placements = [...new FormData(e.target).entries()]
    .filter(([, v]) => v !== '')
    .map(([playerId, v]) => ({ playerId, placement: Number(v) }));
  try {
    if (!placements.length) throw new Error('Enter at least one placement');
    await api(`/api/tournaments/${CODE}/rounds/${round.id}/finish`, { placements });
  } catch (err) { showError('finish-error', err); }
}

$('copy-invite').addEventListener('click', async () => {
  await navigator.clipboard.writeText(location.origin + '/t/' + CODE);
  $('copy-invite').textContent = '✅ Copied!';
  setTimeout(() => { $('copy-invite').textContent = '🔗 Copy invite link'; }, 1500);
});

// ---------- live updates ----------

let retryMs = 500;
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws?code=${CODE}`);
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'state') {
      state = msg.state;
      retryMs = 500;
      $('conn').hidden = true;
      render();
    }
  };
  ws.onclose = () => {
    $('conn').hidden = false;
    setTimeout(connect, retryMs);
    retryMs = Math.min(retryMs * 2, 10000);
  };
}

(async () => {
  const res = await fetch(`/api/tournaments/${CODE}`);
  if (!res.ok) {
    document.body.innerHTML =
      '<main class="landing"><h1 class="logo">🏆 WET</h1><p class="tagline">Tournament not found. Check your invite link.</p></main>';
    return;
  }
  state = await res.json();
  render();
  connect();
})();
