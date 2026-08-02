// Dead-simple persistence: everything lives in one JS object, flushed to a JSON
// file shortly after each change (atomic write via tmp+rename). Plenty for a
// handful of friends on one server process; swap for a real DB if WET ever grows.
const fs = require('fs');
const path = require('path');

const FILE = process.env.DB_PATH || path.join(__dirname, 'wet.json');

let data = { tournaments: {} };
try {
  data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
} catch {
  /* first run - start empty */
}

let timer = null;
function persist() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, FILE);
  }, 100);
}

module.exports = { data, persist };
