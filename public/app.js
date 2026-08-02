/* WET tournament page logic - vanilla JS, no build step. All user-visible
   text comes from STR in strings.js. */

const CODE = location.pathname.split('/').pop().toUpperCase();
const IDENTITY_KEY = 'wet:' + CODE;

let identity = null;
try { identity = JSON.parse(localStorage.getItem(IDENTITY_KEY)); } catch { /* ignore */ }
let state = null;
let spinning = false; // a carousel animation is running; rendering is deferred until it lands
// Host form inputs survive re-renders via this scratch object
const draft = { lobbyUrl: '' };
let addGameOpen = false; // the pool's add-game form is collapsed by default
let fixLinkFor = null; // round id whose fix-lobby-link form is open
let fixLinkDraft = null; // typed-but-unsaved fix-link URL, survives re-renders
// Tap-in-order results entry; keyed to a round id so a new round starts clean.
// taps: [{ playerId, tie }] in tap order; tie=true shares the previous placement.
let finishTaps = { roundId: null, taps: [] };
let finishSubmitting = false; // in-flight POST guard
let justPlaced = null; // playerId whose badge pops this render only

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const isHost = () => !!identity?.hostToken;

// One source of truth for how a rank looks, shared by standings and results entry
const rankBadge = (rank) => ['🥇', '🥈', '🥉'][rank - 1] || `${rank}.`;

// ---------- rendering ----------

function render() {
  if (!state || spinning) return;
  document.title = fmt(STR.tournamentTitle, { name: state.name });
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
const ordinal = (n) => `${n}${['st', 'nd', 'rd'][n - 1] || 'th'}`;

// Animated ellipsis appended to waiting hints so idle screens read as live
const WAIT_DOTS = '<span class="dots"><span>.</span><span>.</span><span>.</span></span>';

// One-line ribbon acknowledging the last finished round on between-round cards.
// The viewer appears as "You" ("You took round 1"), listed first among co-winners.
function lastRoundRecap() {
  const finished = state.rounds.filter((r) => r.status === 'finished');
  const last = finished[finished.length - 1];
  if (!last) return '';
  const mine = identity && last.results.find((x) => x.playerId === identity.playerId);
  const iWon = mine?.placement === 1;
  const winners = last.results.filter((x) => x.placement === 1)
    .map((x) => (x.playerId === identity?.playerId
      ? STR.youWord
      : esc(state.players.find((p) => p.id === x.playerId)?.name || '')))
    .filter(Boolean)
    .sort((a, b) => (a === STR.youWord ? -1 : b === STR.youWord ? 1 : 0));
  return `<p class="recap">${fmt(STR.roundRecap, {
    n: last.number,
    game: esc(last.game),
    winners: winners.join(', ') || STR.noWinnerDash,
    you: mine && !iWon ? fmt(STR.recapYou, { place: ordinal(mine.placement) }) : '',
  })}</p>`;
}

function renderRound() {
  const round = activeRound();
  const box = $('round-box');
  if (round) {
    const g = state.games.find((x) => x.id === round.gameId);
    box.innerHTML = `<div class="card round live">
      <div class="round-label">${fmt(STR.roundLiveLabel, { n: round.number })}</div>
      <h2>${g ? `${g.emoji} ` : ''}${esc(round.game)}</h2>
      ${round.lobbyUrl
        ? `<a class="btn join ${identity ? '' : 'dimmed'}" href="${esc(round.lobbyUrl)}" target="_blank" rel="noopener">
            ${STR.joinLobbyButton}
          </a>`
        : `<p class="no-link">${STR.noLinkHint}</p>`}
      <p class="hint">${identity ? STR.roundLiveHint : STR.joinFirstHint}</p>
    </div>`;
    return;
  }

  if (state.pendingPick) {
    const g = pickedGame();
    box.innerHTML = `<div class="card round upnext">
      <div class="round-label">${fmt(STR.upNextLabel, { n: state.rounds.length + 1 })}</div>
      ${lastRoundRecap()}
      <div class="upnext-tile">${gameTile(g, 'mini landed')}</div>
      <p class="hint">${isHost()
        ? (g.noLink ? STR.upNextNoLinkHostHint : STR.upNextHostHint)
        : (g.noLink ? STR.upNextNoLinkPlayerHint : STR.upNextPlayerHint) + WAIT_DOTS}</p>
    </div>`;
    return;
  }

  const pool = pendingPool();
  if (!pool.length) {
    const anyFinished = state.rounds.some((r) => r.status === 'finished');
    const top = state.standings[0];
    const champs = anyFinished && top
      ? state.standings.filter((s) => s.total === top.total).map((s) => s.name) : [];
    box.innerHTML = `<div class="card round ${champs.length ? 'final' : 'idle'}">
      <h2>${STR.allPlayedHeading}</h2>
      ${champs.length ? `<p class="champ-line">${fmt(STR.championLine, {
        name: esc(champs.join(' & ')), pts: top.total })}</p>` : ''}
      <p>${fmt(STR.allPlayedBody, { extra: isHost() ? STR.allPlayedHostExtra : '' })}</p>
    </div>`;
    return;
  }

  if (state.pickMode === 'chance') {
    const tiles = Array.from({ length: 20 }, (_, i) => pool[i % pool.length]);
    box.innerHTML = `<div class="card round pick">
      <div class="round-label">${fmt(STR.chanceLabel, { n: state.rounds.length + 1 })}</div>
      ${lastRoundRecap()}
      <div class="carousel"><div class="carousel-marker"></div>
        <div class="carousel-strip">${tiles.map((g) => gameTile(g, 'mini')).join('')}</div>
      </div>
      <p class="hint">${isHost() ? STR.chanceHostHint : STR.chancePlayerHint + WAIT_DOTS}</p>
    </div>`;
    return;
  }

  if (state.pickMode === 'host') {
    box.innerHTML = `<div class="card round idle">
      <h2>${fmt(STR.roundHeading, { n: state.rounds.length + 1 })}</h2>
      ${lastRoundRecap()}
      <p>${isHost() ? STR.hostPickHostHint : STR.hostPickPlayerHint + WAIT_DOTS}</p>
    </div>`;
    return;
  }

  if (state.pendingVote) {
    const voted = Object.keys(state.pendingVote.votes).length;
    const mine = identity && state.pendingVote.votes[identity.playerId];
    const stragglers = state.players
      .filter((p) => !state.pendingVote.votes[p.id]).map((p) => p.name);
    box.innerHTML = `<div class="card round pick">
      <div class="round-label">${fmt(STR.voteLabel, { n: state.rounds.length + 1 })}</div>
      ${lastRoundRecap()}
      <h2>${STR.voteHeading}</h2>
      <p class="hint">${fmt(STR.voteHint, {
        changeNote: mine ? STR.voteChangeNote : '',
        voted,
        total: state.players.length,
      })}</p>
      ${voted > 0 && stragglers.length ? `<p class="hint">${fmt(STR.waitingOn, {
        names: esc(stragglers.slice(0, 4).join(', ')) + (stragglers.length > 4 ? ` +${stragglers.length - 4}` : ''),
      })}</p>` : ''}
      ${identity ? `<button id="vote-random" class="btn ghost">${STR.voteRandomButton}</button>` : ''}
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
    <h2>${fmt(STR.roundHeading, { n: state.rounds.length + 1 })}</h2>
    ${lastRoundRecap()}
    <p>${isHost() ? STR.voteIdleHostHint : STR.voteIdlePlayerHint + WAIT_DOTS}</p>
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
    <div class="round-label">${STR.spinningLabel}</div>
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
    if (finishTaps.roundId !== round.id) finishTaps = { roundId: round.id, taps: [] };
    // Defensive: drop taps for players missing from state, keep the head untied
    finishTaps.taps = finishTaps.taps.filter((t) => state.players.some((p) => p.id === t.playerId));
    if (finishTaps.taps.length) finishTaps.taps[0].tie = false;

    const places = tapPlaces(finishTaps.taps);
    const at = new Map(finishTaps.taps.map((t, i) => [t.playerId, i]));
    box.innerHTML = `<div class="card host">
      <h2>${fmt(STR.finishHeading, { n: round.number })}</h2>
      <p class="hint">${fmt(STR.finishHint, { total: state.players.length })}</p>
      <form id="finish-form">
        <div class="chips">
          ${state.players.map((p) => {
            const i = at.get(p.id);
            const placed = i !== undefined;
            const badge = placed ? rankBadge(places[i]) : '';
            const satOut = !placed && finishTaps.taps.length > 0;
            return `<div class="chip ${placed ? 'placed' : ''} ${satOut ? 'satout' : ''} ${
                p.id === justPlaced ? 'just-placed' : ''}"
              data-tap="${p.id}" role="button" tabindex="0" aria-pressed="${placed}">
              ${placed ? `<span class="chip-place ${p.id === justPlaced ? 'pop' : ''}">${badge}</span>` : ''}
              <span class="chip-name">${esc(p.name)}</span>
              ${satOut ? '<span class="chip-zzz">💤</span>' : ''}
              ${placed && i > 0 ? `<button type="button" class="chip-tie ${finishTaps.taps[i].tie ? 'on' : ''}"
                data-tie="${p.id}" title="${STR.tieToggleTitle}" aria-label="${STR.tieToggleTitle}"
                aria-pressed="${finishTaps.taps[i].tie}">${STR.tieMark}</button>` : ''}
            </div>`;
          }).join('')}
        </div>
        ${finishTaps.taps.length
          ? `<button type="button" id="clear-taps" class="btn ghost small">${STR.clearTapsButton}</button>` : ''}
        <button type="submit" class="btn primary" ${finishSubmitting ? 'disabled' : ''}>
          ${finishSubmitting ? STR.submittingButton : finishTaps.taps.length
            ? fmt(STR.submitResultsProgress, { placed: finishTaps.taps.length, total: state.players.length })
            : STR.submitResultsButton}
        </button>
        <p class="error" id="finish-error" hidden></p>
      </form>
      ${state.games.find((x) => x.id === round.gameId)?.noLink ? '' : `
      <button type="button" id="fix-link-toggle" class="btn ghost small">${STR.fixLinkToggle}</button>`}
      ${fixLinkFor === round.id ? `
      <form id="fix-link-form" class="add-game">
        <input id="fix-link-url" type="url" placeholder="${STR.lobbyLinkPlaceholder}"
               value="${esc(fixLinkDraft ?? round.lobbyUrl)}" enterkeyhint="go" required>
        ${navigator.clipboard?.readText
          ? `<button type="button" id="paste-fix-link" class="btn ghost">${STR.pasteButton}</button>` : ''}
        <button type="submit" class="btn ghost">${STR.fixLinkButton}</button>
      </form>` : ''}
    </div>`;
    $('finish-form').addEventListener('submit', onFinishRound);
    const toggleTap = (id) => {
      if (finishSubmitting) return;
      const i = finishTaps.taps.findIndex((t) => t.playerId === id);
      if (i >= 0) {
        const wasHead = !finishTaps.taps[i].tie;
        finishTaps.taps.splice(i, 1);
        // Removing a tie-group head: promote the next member so the group
        // does not silently merge into the one above
        if (wasHead && finishTaps.taps[i]?.tie) finishTaps.taps[i].tie = false;
      } else {
        finishTaps.taps.push({ playerId: id, tie: false });
        justPlaced = id;
      }
      render();
      justPlaced = null;
    };
    for (const chip of box.querySelectorAll('[data-tap]')) {
      chip.addEventListener('click', () => toggleTap(chip.dataset.tap));
      chip.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault(); // Space must toggle, not scroll
        toggleTap(chip.dataset.tap);
        // render() rebuilt the DOM; put focus back on this player's fresh chip
        document.querySelector(`[data-tap="${chip.dataset.tap}"]`)?.focus();
      });
    }
    for (const btn of box.querySelectorAll('[data-tie]')) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (finishSubmitting) return;
        const t = finishTaps.taps.find((x) => x.playerId === btn.dataset.tie);
        t.tie = !t.tie;
        render();
      });
    }
    if (finishTaps.taps.length) {
      $('clear-taps').addEventListener('click', () => {
        if (finishSubmitting) return;
        finishTaps.taps = [];
        render();
      });
    }
    $('fix-link-toggle')?.addEventListener('click', () => {
      fixLinkFor = fixLinkFor === round.id ? null : round.id;
      fixLinkDraft = null;
      render();
      if (fixLinkFor) $('fix-link-url').focus();
    });
    if (fixLinkFor === round.id) {
      $('fix-link-url').addEventListener('input', (e) => { fixLinkDraft = e.target.value; });
      $('paste-fix-link')?.addEventListener('click', async () => {
        try {
          const text = (await navigator.clipboard.readText()).trim();
          if (!text) return;
          fixLinkDraft = text;
          $('fix-link-url').value = text;
        } catch { /* permission denied */ }
      });
      $('fix-link-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await api(`/api/tournaments/${CODE}/rounds/${round.id}/lobby`, {
            lobbyUrl: $('fix-link-url').value.trim(),
          });
          fixLinkFor = null;
          fixLinkDraft = null;
        } catch (err) { alert(err.message); }
      });
    }
  } else if (state.pendingPick) {
    const g = pickedGame();
    box.innerHTML = `<div class="card host">
      <h2>${fmt(g.noLink ? STR.startNoLinkHeading : STR.openLobbyHeading, { game: esc(g.name) })}</h2>
      <p class="host-cta">
        ${g.site ? `<a href="${esc(g.site)}" target="_blank" rel="noopener">${
          fmt(STR.openSiteLink, { game: esc(g.name) })}</a> - ` : ''}${esc(g.hint)}
      </p>
      <form id="start-form">
        ${g.noLink ? '' : `
        <label>${STR.lobbyLinkLabel}
          <div class="link-row">
            <input id="lobby-url" type="url" placeholder="${STR.lobbyLinkPlaceholder}"
                   value="${esc(draft.lobbyUrl)}" enterkeyhint="go" required>
            ${navigator.clipboard?.readText
              ? `<button type="button" id="paste-link" class="btn ghost">${STR.pasteButton}</button>` : ''}
          </div>
        </label>`}
        <button type="submit" class="btn primary">${STR.startRoundButton}</button>
        <button type="button" id="cancel-pick" class="btn ghost">${STR.cancelPickButton}</button>
        <p class="error" id="start-error" hidden></p>
      </form>
    </div>`;
    $('lobby-url')?.addEventListener('input', (e) => { draft.lobbyUrl = e.target.value; });
    $('paste-link')?.addEventListener('click', async () => {
      try {
        const text = (await navigator.clipboard.readText()).trim();
        if (!text) return;
        draft.lobbyUrl = text;
        $('lobby-url').value = text;
        $('lobby-url').focus();
      } catch { /* permission denied - the host pastes by hand */ }
    });
    $('start-form').addEventListener('submit', onStartRound);
    $('cancel-pick').addEventListener('click', async () => {
      try { await api(`/api/tournaments/${CODE}/pick/cancel`); } catch (err) { alert(err.message); }
    });
  } else if (state.pickMode === 'chance' && pendingPool().length) {
    box.innerHTML = `<div class="card host">
      <button id="spin-btn" class="btn spin">${STR.spinButton}</button>
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
          ${fmt(STR.closeVoteButton, { voted, total: state.players.length })}
        </button>
        <p class="hint">${STR.closeVoteHint}</p>
        ${identity && !state.pendingVote.votes[identity.playerId]
          ? `<p class="hint host-nudge">${STR.hostNotVoted}</p>` : ''}
      </div>`;
      $('close-vote').addEventListener('click', async () => {
        try { await api(`/api/tournaments/${CODE}/pick/vote/close`); } catch (err) { alert(err.message); }
      });
    } else {
      box.innerHTML = `<div class="card host">
        <button id="open-vote" class="btn primary">${STR.openVoteButton}</button>
      </div>`;
      $('open-vote').addEventListener('click', async () => {
        try { await api(`/api/tournaments/${CODE}/pick/vote/open`); } catch (err) { alert(err.message); }
      });
    }
  } else {
    box.hidden = true;
  }
}

const PICK_MODE_LABELS = {
  chance: STR.pickModeChance,
  host: STR.pickModeHost,
  vote: STR.pickModeVote,
};

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
    (tallies[g.id] ? `<span class="tile-votes">🗳️ ${tallies[g.id]}${
      myVote === g.id ? ` · ${STR.youBadge}` : ''}</span>` : '')
    + (removable && g.status === 'pending' && state.pendingPick?.gameId !== g.id
      ? `<button class="tile-del" data-del="${g.id}" title="${STR.removeTileTitle}">✕</button>` : '')
  )).join('') || `<p class="hint">${STR.poolEmpty}</p>`;

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
    <select id="mode-select" title="${STR.modeSelectTitle}">
      ${Object.entries(PICK_MODE_LABELS).map(([v, l]) =>
        `<option value="${v}" ${v === state.pickMode ? 'selected' : ''}>${l}</option>`).join('')}
    </select>`;
  $('mode-select').addEventListener('change', async (e) => {
    try {
      await api(`/api/tournaments/${CODE}/pick-mode`, { pickMode: e.target.value });
    } catch (err) { alert(err.message); render(); }
  });

  $('pool-manage').innerHTML = `
    <button id="toggle-add-game" class="btn ghost small">${STR.addGameToggle}</button>
    ${addGameOpen ? `
    <form id="add-game-form" class="add-game">
      <input id="add-name" placeholder="${STR.addGamePlaceholder}" maxlength="48" required>
      <input id="add-site" type="url" placeholder="${STR.addSitePlaceholder}">
      <label class="nolink"><input type="checkbox" id="add-nolink"> ${STR.customNoLinkLabel}</label>
      <button type="submit" class="btn ghost">${STR.addGameButton}</button>
    </form>` : ''}`;
  $('toggle-add-game').addEventListener('click', () => {
    addGameOpen = !addGameOpen;
    render();
    if (addGameOpen) $('add-name').focus();
  });
  if (addGameOpen) {
    $('add-game-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api(`/api/tournaments/${CODE}/games`, {
          name: $('add-name').value.trim(),
          site: $('add-site').value.trim(),
          noLink: $('add-nolink').checked,
        });
        addGameOpen = false;
      } catch (err) { alert(err.message); }
    });
  }
}

function renderStandings() {
  // No medals before the first result lands - a fresh tournament is a guest
  // list, not a leaderboard. Ties share a rank (same 1,2,2,4 scheme as results).
  const anyFinished = state.rounds.some((r) => r.status === 'finished');
  const nightOver = anyFinished && !pendingPool().length && !activeRound() && !state.pendingPick;
  let rank = 0;
  $('standings').innerHTML = state.standings.map((s, i) => {
    if (i === 0 || s.total !== state.standings[i - 1].total) rank = i + 1;
    return `<li class="${s.playerId === identity?.playerId ? 'me' : ''} ${
      nightOver && rank === 1 ? 'champ' : ''}">
      <span class="rank">${anyFinished ? rankBadge(rank) : '·'}</span>
      <span class="name">${esc(s.name)}</span>
      <span class="pts">${fmt(s.total === 1 ? STR.pointsSuffixOne : STR.pointsSuffix, { n: s.total })}</span>
    </li>`;
  }).join('');
}

function renderPlayers() {
  $('players').innerHTML = state.players.map((p) => `
    <li>${esc(p.name)}${p.isHost ? ` <span class="badge">${STR.hostBadge}</span>` : ''}${
      p.id === identity?.playerId ? ` <span class="badge you">${STR.youBadge}</span>` : ''}</li>`).join('');
}

function renderHistory() {
  const finished = state.rounds.filter((r) => r.status === 'finished');
  $('history').innerHTML = finished.length
    ? finished.map((r) => {
        const winner = r.results.filter((x) => x.placement === 1)
          .map((x) => state.players.find((p) => p.id === x.playerId)?.name).filter(Boolean);
        return `<li>${fmt(STR.historyLine, {
          n: r.number,
          game: esc(r.game),
          winners: esc(winner.join(', ') || STR.noWinnerDash),
        })}</li>`;
      }).join('')
    : `<li class="hint">${STR.emptyHistory}</li>`;
}

// ---------- actions ----------

async function api(path, body, opts = {}) {
  const hasBody = body !== null && body !== undefined;
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(isHost() ? { 'X-Host-Token': identity.hostToken } : {}),
      ...(identity?.playerToken ? { 'X-Player-Token': identity.playerToken } : {}),
    },
    ...(hasBody ? { body: JSON.stringify(body) } : {}),
    ...opts,
  });
  // Never assume JSON came back - a proxy or error page would crash the caller
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || STR.requestFailedError);
  return out;
}

function showError(id, err) {
  const el = $(id);
  if (!el) return alert(err.message); // the form may have re-rendered away mid-request
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
    await api(`/api/tournaments/${CODE}/rounds`, { lobbyUrl: $('lobby-url')?.value.trim() ?? '' });
    draft.lobbyUrl = '';
  } catch (err) { showError('start-error', err); }
}

async function onFinishRound(e) {
  e.preventDefault();
  const round = activeRound();
  if (!round || round.id !== finishTaps.roundId || finishSubmitting) return;
  const places = tapPlaces(finishTaps.taps);
  const placements = finishTaps.taps.map((t, i) => ({ playerId: t.playerId, placement: places[i] }));
  if (!placements.length) return showError('finish-error', new Error(STR.noPlacementsError));

  finishSubmitting = true;
  render();
  try {
    await api(`/api/tournaments/${CODE}/rounds/${round.id}/finish`, { placements });
    finishTaps = { roundId: null, taps: [] };
    finishSubmitting = false;
    // The broadcast repaints into the next-round view almost instantly; this
    // render is the fallback so a dropped websocket can't leave a stale,
    // interactive finish form on screen disagreeing with the reset draft.
    render();
  } catch (err) {
    finishSubmitting = false;
    render(); // re-enable the submit button, then surface the error on the fresh node
    showError('finish-error', err);
  }
}

$('copy-invite').addEventListener('click', async () => {
  const url = location.origin + '/t/' + CODE;
  try {
    // On phones the native share sheet drops the link straight into the group chat
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ url });
      return;
    }
    await navigator.clipboard.writeText(url); // undefined on http:// - caught below
    $('copy-invite').textContent = STR.copiedButton;
    setTimeout(() => { $('copy-invite').textContent = STR.copyInviteButton; }, 1500);
  } catch (err) {
    if (err?.name === 'AbortError') return; // share sheet dismissed - not a failure
    prompt(STR.copyFallbackPrompt, url); // last resort: let the host copy by hand
  }
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
  applyStrings();
  const res = await fetch(`/api/tournaments/${CODE}`);
  if (!res.ok) {
    document.body.innerHTML = `<main class="landing"><h1 class="logo">${STR.appName}</h1>
      <p class="tagline">${STR.notFound}</p></main>`;
    return;
  }
  state = await res.json();
  render();
  connect();
})();
