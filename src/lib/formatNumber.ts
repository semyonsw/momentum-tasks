/**
 * A whole number with its thousands grouped — `2,100`, `12,480`.
 *
 * `en-US` grouping in both languages on purpose: the level sheet and the badges
 * put these figures beside each other, and a Russian thin-space group in one
 * place and a comma in the next would read as two different kinds of number.
 */
export function formatWhole(value: number): string {
  const rounded = Math.round(Math.abs(value));
  // The sign only when something survives the rounding: `-0.4` is "0", not "-0".
  return (value < 0 && rounded > 0 ? '-' : '') + rounded.toLocaleString('en-US');
}
