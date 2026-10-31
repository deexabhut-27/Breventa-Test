import { randomInt } from 'node:crypto';

/** Cryptographically secure Fisher-Yates shuffle. Returns a new array. */
export function secureShuffle(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Pick `count` distinct items uniformly at random using a secure shuffle. */
export function securePick(items, count) {
  return secureShuffle(items).slice(0, count);
}
