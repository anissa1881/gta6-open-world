// A small seeded random number generator (mulberry32): the same seed gives the same
// city, the same traffic and the same screenshot scenes, which is what makes the
// deterministic ?shot= scenes repeatable.

export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An integer in [min, max] from a seeded random function. */
export function randomInt(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

/** One element of an array, picked by a seeded random function. */
export function randomPick(random, items) {
  return items[Math.floor(random() * items.length)];
}

/** Clamp a number into [min, max]. */
export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** The shortest signed angle from `from` to `to`, in radians. */
export function angleDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Distance between two points. */
export function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}
