// Built-in games. `key` is the stable identifier clients send when picking
// presets; emoji + color drive the game tile look everywhere in the UI.
module.exports = [
  {
    key: 'openguessr',
    name: 'OpenGuessr',
    site: 'https://openguessr.com/',
    hint: 'Create a party and copy the invite link.',
    emoji: '🌍',
    color: '#2e7dd7',
  },
  {
    key: 'codenames',
    name: 'Code Names',
    site: 'https://codenames.game/',
    hint: 'Create room → copy the room URL from the address bar.',
    emoji: '🕵️',
    color: '#c0392b',
  },
  {
    key: 'wikispeedruns',
    name: 'WikiSpeedruns',
    site: 'https://wikispeedruns.com/',
    hint: 'Create a private lobby and copy the invite link.',
    emoji: '📚',
    color: '#7d3fbf',
  },
  {
    key: 'dobyvatel',
    name: 'Dobyvatel',
    site: 'https://www.dobyvatel.cz/',
    hint: 'Create a quick game and copy the invite link.',
    emoji: '⚔️',
    color: '#c98a1b',
  },
];
