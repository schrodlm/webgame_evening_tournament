/* WET tournament page logic — vanilla JS, no build step. */

const CODE = location.pathname.split('/').pop().toUpperCase();
const IDENTITY_KEY = 'wet:' + CODE;

let identity = null;
try { identity = JSON.parse(localStorage.getItem(IDENTITY_KEY)); } catch { /* ignore */ }
let state = null;
let spinning = false; // a carousel animation is running; rendering is deferred until it lands
// Host form inputs survive re-renders via this scratch object
const draft = { lobbyUrl: '' };

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const isHost = () => !!identity?.hostToken;

// ---------- rendering ----------

function render() {
  if (!state || spinning) return;
  document.title = `WET — ${state.name}`;
  $('t-name').textContent = state.name;
  $('join-box').hidden = !!identity;

  renderRound();
  renderHost();
  renderPool();
  renderStandings();
  renderPlayers();
  renderHistory();
}

function activeRound() {
  return state.rounds.find((r) => r.status === 'active') || null;
}

const pendingPool = () => state.games.filter((g) => g.status === 'pending');
const pickedGame = () => state.games.find((g) => g.id === state.pendingPick?.gameId) || null;

function renderRound() {
  const round = activeRound();
  const box = $('round-box');
  if (round) {
    box.innerHTML = `<div class="card round live">
      <div class="round-label">ROUND ${round.number} · LIVE</div>
      <h2>${esc(round.game)}</h2>
      <a class="btn join" href="${esc(round.lobbyUrl)}" target="_blank" rel="noopener">
        ▶ JOIN LOBBY
      </a>
      <p class="hint">Everyone clicks, plays, then the host enters the results here.</p>
    </div>`;
    return;
  }

  if (state.pendingPick) {
    const g = pickedGame();
    box.innerHTML = `<div class="card round upnext">
      <div class="round-label">UP NEXT · ROUND ${state.rounds.length + 1}</div>
      <div class="upnext-tile">${gameTile(g, 'mini landed')}</div>
      <p class="hint">${isHost()
        ? 'Create the lobby and paste the link below.'
        : 'The host is creating the lobby — the join button will appear here.'}</p>
    </div>`;
    return;
  }

  const pool = pendingPool();
  if (!pool.length) {
    box.innerHTML = `<div class="card round idle">
      <h2>🏁 All games played</h2>
      <p>That was the night — the standings are final${
        isHost() ? ' (or add another game to the pool to keep going)' : ''}.</p>
    </div>`;
    return;
  }

  if (state.pickMode === 'chance') {
    const tiles = Array.from({ length: 20 }, (_, i) => pool[i % pool.length]);
    box.innerHTML = `<div class="card round pick">
      <div class="round-label">ROUND ${state.rounds.length + 1} · 🎰 CHANCE</div>
      <div class="carousel"><div class="carousel-marker"></div>
        <div class="carousel-strip">${tiles.map((g) => gameTile(g, 'mini')).join('')}</div>
      </div>
      <p class="hint">${isHost() ? 'Hit SPIN below when everyone is ready.' : 'Waiting for the host to spin…'}</p>
    </div>`;
    return;
  }

  if (state.pickMode === 'host') {
    box.innerHTML = `<div class="card round idle">
      <h2>Round ${state.rounds.length + 1}</h2>
      <p>${isHost()
        ? 'Pick the next game — click a tile in the pool below.'
        : 'The host is picking the next game…'}</p>
    </div>`;
    return;
  }

  if (state.pendingVote) {
    const voted = Object.keys(state.pendingVote.votes).length;
    const mine = identity && state.pendingVote.votes[identity.playerId];
    box.innerHTML = `<div class="card round pick">
      <div class="round-label">ROUND ${state.rounds.length + 1} · 🗳 VOTE</div>
      <h2>Vote for the next game</h2>
      <p class="hint">Click a game tile in the pool below${mine ? ' — you can still change your vote' : ''}.
        <b>${voted}/${state.players.length}</b> voted.</p>
      ${identity ? '<button id="vote-random" class="btn ghost">🎲 Vote random for me</button>' : ''}
    </div>`;
    if (identity) {
      $('vote-random').addEventListener('click', () => {
        const pool = pendingPool();
        castVote(pool[Math.floor(Math.random() * pool.length)].id);
      });
    }
    return;
  }

  box.innerHTML = `<div class="card round idle">
    <h2>Round ${state.rounds.length + 1}</h2>
    <p>${isHost() ? 'Open the vote below when everyone is ready.'
      : 'Waiting for the host to open the vote…'}</p>
  </div>`;
}

async function castVote(gameId) {
  try { await api(`/api/tournaments/${CODE}/pick/vote`, { gameId }); } catch (err) { alert(err.message); }
}

// ---------- carousel (chance mode) ----------

// Deterministic PRNG: the server's seed makes every client build the same
// strip and land on the same tile.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SPIN_MS = 5500;

function startSpin(spin) {
  const pool = pendingPool();
  const winner = pool.find((g) => g.id === spin.gameId);
  if (!winner) return;

  spinning = true;
  $('host-box').hidden = true;
  const rng = mulberry32(parseInt(spin.seed, 16) >>> 0);
  const STRIP = 60;
  const WIN = 52;
  const tiles = Array.from({ length: STRIP }, () => pool[Math.floor(rng() * pool.length)]);
  tiles[WIN] = winner;

  $('round-box').innerHTML = `<div class="card round pick">
    <div class="round-label">🎰 SPINNING…</div>
    <div class="carousel"><div class="carousel-marker"></div>
      <div class="carousel-strip" id="strip">${tiles.map((g) => gameTile(g, 'mini')).join('')}</div>
    </div>
  </div>`;

  const strip = $('strip');
  const stride = strip.children[1].offsetLeft - strip.children[0].offsetLeft;
  const jitter = (rng() - 0.5) * 0.6 * stride;
  const target = WIN * stride + stride / 2 + jitter
    - strip.parentElement.getBoundingClientRect().width / 2;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    strip.style.transition = `transform ${SPIN_MS}ms cubic-bezier(0.08, 0.7, 0.1, 1)`;
    strip.style.transform = `translateX(${-target}px)`;
  }));

  const done = () => {
    if (!spinning) return;
    spinning = false;
    render();
  };
  strip.addEventListener('transitionend', done, { once: true });
  setTimeout(done, SPIN_MS + 700);
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
  } else if (state.pendingPick) {
    const g = pickedGame();
    box.innerHTML = `<div class="card host">
      <h2>🎛 Host — open the ${esc(g.name)} lobby</h2>
      <p class="hint">
        ${g.site ? `<a href="${esc(g.site)}" target="_blank" rel="noopener">Open ${esc(g.name)} ↗</a> — ` : ''}${esc(g.hint)}
      </p>
      <form id="start-form">
        <label>Lobby link
          <input id="lobby-url" type="url" placeholder="Paste the lobby / invite URL here"
                 value="${esc(draft.lobbyUrl)}" required>
        </label>
        <button type="submit" class="btn primary">🚀 Start round — push to all players</button>
        <button type="button" id="cancel-pick" class="btn ghost">Cancel this pick</button>
        <p class="error" id="start-error" hidden></p>
      </form>
    </div>`;
    $('lobby-url').addEventListener('input', (e) => { draft.lobbyUrl = e.target.value; });
    $('start-form').addEventListener('submit', onStartRound);
    $('cancel-pick').addEventListener('click', async () => {
      try { await api(`/api/tournaments/${CODE}/pick/cancel`); } catch (err) { alert(err.message); }
    });
  } else if (state.pickMode === 'chance' && pendingPool().length) {
    box.innerHTML = `<div class="card host">
      <button id="spin-btn" class="btn spin">🎰 SPIN</button>
    </div>`;
    $('spin-btn').addEventListener('click', async () => {
      $('spin-btn').disabled = true;
      try { await api(`/api/tournaments/${CODE}/pick/spin`); } catch (err) {
        alert(err.message);
        $('spin-btn').disabled = false;
      }
    });
  } else if (state.pickMode === 'vote' && pendingPool().length) {
    if (state.pendingVote) {
      const voted = Object.keys(state.pendingVote.votes).length;
      box.innerHTML = `<div class="card host">
        <button id="close-vote" class="btn primary" ${voted ? '' : 'disabled'}>
          Close vote now (${voted}/${state.players.length} voted)
        </button>
        <p class="hint">The vote closes itself once everyone voted. Majority wins, ties go to chance.</p>
      </div>`;
      $('close-vote').addEventListener('click', async () => {
        try { await api(`/api/tournaments/${CODE}/pick/vote/close`); } catch (err) { alert(err.message); }
      });
    } else {
      box.innerHTML = `<div class="card host">
        <button id="open-vote" class="btn primary">🗳 Open the vote</button>
      </div>`;
      $('open-vote').addEventListener('click', async () => {
        try { await api(`/api/tournaments/${CODE}/pick/vote/open`); } catch (err) { alert(err.message); }
      });
    }
  } else {
    box.hidden = true;
  }
}

const PICK_MODE_LABELS = { chance: '🎰 Chance', host: '🎛 Host picks', vote: '🗳 Players vote' };

function gameTile(g, extraClass = '', inner = '') {
  return `<div class="tile ${extraClass} ${g.status === 'played' ? 'played' : ''}"
    data-id="${g.id}" style="--tile-color:${g.color}">
    <span class="tile-emoji">${g.emoji}</span>
    <span class="tile-name">${esc(g.name)}</span>
    ${g.status === 'played' ? '<span class="tile-check">✓</span>' : ''}
    ${inner}
  </div>`;
}

function renderPool() {
  const removable = isHost() && !activeRound();
  const hostPicking = isHost() && state.pickMode === 'host'
    && !state.pendingPick && !activeRound();
  const voting = !!state.pendingVote && !!identity;
  const tallies = {};
  if (state.pendingVote) {
    for (const gid of Object.values(state.pendingVote.votes)) {
      tallies[gid] = (tallies[gid] || 0) + 1;
    }
  }
  const myVote = state.pendingVote && identity ? state.pendingVote.votes[identity.playerId] : null;

  $('pool').innerHTML = state.games.map((g) => gameTile(
    g,
    [
      (hostPicking || voting) && g.status === 'pending' ? 'clickable' : '',
      myVote === g.id ? 'my-vote' : '',
    ].join(' '),
    (tallies[g.id] ? `<span class="tile-votes">🗳 ${tallies[g.id]}</span>` : '')
    + (removable && g.status === 'pending' && state.pendingPick?.gameId !== g.id
      ? `<button class="tile-del" data-del="${g.id}" title="Remove from pool">✕</button>` : '')
  )).join('') || '<p class="hint">The pool is empty — add a game below.</p>';

  for (const btn of $('pool').querySelectorAll('[data-del]')) {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await api(`/api/tournaments/${CODE}/games/${btn.dataset.del}`, null, { method: 'DELETE' });
      } catch (err) { alert(err.message); }
    });
  }

  if (hostPicking || voting) {
    for (const tile of $('pool').querySelectorAll('.tile.clickable')) {
      tile.addEventListener('click', async () => {
        if (voting) return castVote(tile.dataset.id);
        try {
          await api(`/api/tournaments/${CODE}/pick/choose`, { gameId: tile.dataset.id });
        } catch (err) { alert(err.message); }
      });
    }
  }

  if (!isHost()) {
    $('pool-controls').innerHTML =
      `<span class="badge">${PICK_MODE_LABELS[state.pickMode] || state.pickMode}</span>`;
    $('pool-manage').innerHTML = '';
    return;
  }

  $('pool-controls').innerHTML = `
    <select id="mode-select" title="How the next game is picked">
      ${Object.entries(PICK_MODE_LABELS).map(([v, l]) =>
        `<option value="${v}" ${v === state.pickMode ? 'selected' : ''}>${l}</option>`).join('')}
    </select>`;
  $('mode-select').addEventListener('change', async (e) => {
    try {
      await api(`/api/tournaments/${CODE}/pick-mode`, { pickMode: e.target.value });
    } catch (err) { alert(err.message); render(); }
  });

  $('pool-manage').innerHTML = `
    <form id="add-game-form" class="add-game">
      <input id="add-name" placeholder="Add a game (e.g. Skribbl)" maxlength="48" required>
      <input id="add-site" type="url" placeholder="Site (optional)">
      <button type="submit" class="btn ghost">＋ Add</button>
    </form>`;
  $('add-game-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api(`/api/tournaments/${CODE}/games`, {
        name: $('add-name').value.trim(),
        site: $('add-site').value.trim(),
      });
    } catch (err) { alert(err.message); }
  });
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
      ...(identity?.playerToken ? { 'X-Player-Token': identity.playerToken } : {}),
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
  try {
    await api(`/api/tournaments/${CODE}/rounds`, { lobbyUrl: $('lobby-url').value.trim() });
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
    } else if (msg.type === 'spin') {
      startSpin(msg.spin);
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
