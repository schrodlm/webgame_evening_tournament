// Competition ranking (1,2,2,4): a tie shares the previous placement but still
// consumes a slot, so the next non-tie lands on its 1-based position.
// taps: [{ playerId, tie }] in tap order; taps[0].tie is expected to be false.
function tapPlaces(taps) {
  const places = [];
  for (let i = 0; i < taps.length; i++) {
    places[i] = i === 0 ? 1 : taps[i].tie ? places[i - 1] : i + 1;
  }
  return places;
}

if (typeof module !== 'undefined') module.exports = { tapPlaces };
