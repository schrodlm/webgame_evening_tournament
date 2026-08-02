const assert = require('node:assert');
const { tapPlaces } = require('../public/ranking');

// [tie flags per tap] -> expected placements (competition ranking)
const cases = [
  [[], []],
  [['-'], [1]],
  [['-', '-', '-'], [1, 2, 3]],
  [['-', '-', 'T', '-'], [1, 2, 2, 4]],
  [['-', 'T', 'T', '-'], [1, 1, 1, 4]],
  [['-', 'T', '-', 'T'], [1, 1, 3, 3]],
  [['-', '-', 'T', 'T', '-'], [1, 2, 2, 2, 5]],
  [['-', '-', '-', '-', '-', '-', '-', '-'], [1, 2, 3, 4, 5, 6, 7, 8]],
];

for (const [flags, expected] of cases) {
  const taps = flags.map((f, i) => ({ playerId: 'p' + i, tie: f === 'T' }));
  assert.deepStrictEqual(tapPlaces(taps), expected, `pattern ${flags.join('')}`);
}

// Placements must always satisfy the server contract: integers in 1..taps.length
for (const [flags] of cases) {
  const taps = flags.map((f, i) => ({ playerId: 'p' + i, tie: f === 'T' }));
  for (const p of tapPlaces(taps)) {
    assert.ok(Number.isInteger(p) && p >= 1 && p <= taps.length, `bounds for ${flags.join('')}`);
  }
}

console.log(`ranking: all ${cases.length} patterns pass`);
