// Every user-visible string in the WET frontend lives here.
// {placeholders} are filled by fmt() at render time — keep them when rewording.
const STR = {
  // shared
  appName: '🏆 WET',

  // landing page
  landingTitle: "WET - Webgame Evening Tournament",
  tagline: "Webgame Evening Tournament - one lobby for your whole game night.",
  createHeading: "Start the best tournament night",
  tournamentNameLabel: 'Tournament name',
  tournamentNamePlaceholder: 'Friday Night Showdown',
  nicknameLabel: 'Your nickname',
  nicknamePlaceholder: "nickname",
  pickModeLegend: 'How is the next game picked?',
  pickModeChanceOption: "🎰 Chance - spin the carousel, let the gods decide",
  pickModeHostOption: "🎛 Host picks - you choose every round",
  pickModeVoteOption: "🗳 Players vote - for the fans of democracy, ties go to chance",
  gamesLegend: 'Games for the night',
  addCustomButton: '＋ Custom game',
  randomPoolButton: '🎲 Random pool',
  randomPoolNote: "The standard games, shuffled - no custom games. Click 🎲 again to pick yourself.",
  customNamePlaceholder: 'Game name',
  customSitePlaceholder: 'Game site (optional)',
  removeCustomTitle: 'Remove',
  createButton: 'Create & get invite link',
  needOneGameError: 'Pick at least one game for the night',
  joinHintLanding: "Joining someone else's night? Ask the host for their invite link. :)",

  // tournament page chrome
  tournamentTitle: 'WET - {name}',
  copyInviteButton: '🔗 Copy invite link',
  copiedButton: "Copied!",
  joinHeading: 'Join this tournament',
  joinButton: 'Join',
  standingsHeading: '🥇 Standings',
  playersHeading: '👥 Players',
  roundsHeading: '📜 Rounds',
  reconnecting: 'reconnecting…',
  notFound: 'Tournament not found. Check your invite link.',

  // pick-mode badges
  pickModeChance: '🎰 Chance',
  pickModeHost: '🎛 Host picks',
  pickModeVote: '🗳 Players vote',

  // round card
  roundLiveLabel: 'ROUND {n} · LIVE',
  joinLobbyButton: '▶ JOIN LOBBY',
  roundLiveHint: 'Everyone clicks, plays, then the host enters the results here.',
  upNextLabel: 'UP NEXT · ROUND {n}',
  upNextHostHint: 'Create the lobby and paste the link below.',
  upNextPlayerHint: "The host is creating the lobby - the join button will appear here.",
  allPlayedHeading: '🏁 All games played',
  allPlayedBody: "That is all folks - the standings are final{extra}.",
  allPlayedHostExtra: ' (or add another game to the pool to keep going)',
  chanceLabel: 'ROUND {n} · 🎰 CHANCE',
  chanceHostHint: 'Hit SPIN below when everyone is ready.',
  chancePlayerHint: 'Waiting for the host to spin…',
  spinningLabel: '🎰 SPINNING…',
  roundHeading: 'Round {n}',
  hostPickHostHint: 'Pick the next game - click a tile in the pool below.',
  hostPickPlayerHint: 'The host is picking the next game…',
  voteLabel: 'ROUND {n} · 🗳 VOTE',
  voteHeading: 'Vote for the next game',
  voteHint: 'Click a game tile in the pool below{changeNote}. <b>{voted}/{total}</b> voted.',
  voteChangeNote: " - you can still change your vote",
  voteRandomButton: '🎲 Vote random for me',
  voteIdleHostHint: 'Open the vote below when everyone is ready.',
  voteIdlePlayerHint: 'Waiting for the host to open the vote…',

  // host controls
  finishHeading: "🎛 Host - finish round {n}",
  finishHint: 'Enter placements when the game ends. Points: 1st of {total} players gets {total}, last gets 1. Leave “sat out” for anyone who didn’t play.',
  satOutOption: "- sat out -",
  placeOption: '{ordinal} place',
  submitResultsButton: 'Submit results',
  noPlacementsError: 'Enter at least one placement',
  openLobbyHeading: "🎛 Host - open the {game} lobby",
  openSiteLink: 'Open {game} ↗',
  lobbyLinkLabel: 'Lobby link',
  lobbyLinkPlaceholder: 'Paste the lobby / invite URL here',
  startRoundButton: '🚀 Start round - push to all players',
  cancelPickButton: 'Cancel this pick',
  spinButton: '🎰 SPIN',
  openVoteButton: '🗳 Open the vote',
  closeVoteButton: 'Close vote now ({voted}/{total} voted)',
  closeVoteHint: 'The vote closes itself once everyone voted. Majority wins, ties go to chance.',

  // pool card
  poolHeading: '🎮 Game pool',
  poolEmpty: "The pool is empty - add a game below.",
  modeSelectTitle: 'How the next game is picked',
  addGamePlaceholder: 'Add a game (e.g. Skribbl)',
  addSitePlaceholder: 'Site (optional)',
  addGameButton: '＋ Add',
  removeTileTitle: 'Remove from pool',

  // standings / players / history
  requestFailedError: 'Request failed',
  genericError: 'Something went wrong',
  hostBadge: 'host',
  youBadge: 'you',
  pointsSuffix: '{n} pts',
  historyLine: "<b>R{n}</b> {game} - 🏅 {winners}",
  noWinnerDash: '—',
  emptyHistory: 'Nothing played yet.',
};

// Replaces {name} placeholders; unknown ones are left visible so a missing
// variable shows up instead of silently vanishing.
function fmt(s, vars = {}) {
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

// Fills static markup: <el data-str="key">, data-str-placeholder, data-str-title
function applyStrings(root = document) {
  for (const el of root.querySelectorAll('[data-str]')) el.innerHTML = STR[el.dataset.str];
  for (const el of root.querySelectorAll('[data-str-placeholder]')) {
    el.placeholder = STR[el.dataset.strPlaceholder];
  }
  for (const el of root.querySelectorAll('[data-str-title]')) el.title = STR[el.dataset.strTitle];
}

if (typeof module !== 'undefined') module.exports = { STR, fmt };
