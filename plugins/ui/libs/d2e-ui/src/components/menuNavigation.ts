// Focus movement for D2eMenu. Kept pure so it can be tested without a DOM.

/**
 * Find the next enabled item index from `from`, moving in `direction`.
 *
 * - Disabled items are skipped.
 * - The search wraps at both ends.
 * - An empty list returns -1.
 * - A list with no enabled item returns `from` unchanged.
 *
 * Pass `from = -1` with direction 1 to get the first enabled item.
 * Pass `from = items.length` with direction -1 to get the last enabled item.
 */
export function nextEnabledIndex(
  items: readonly { disabled?: boolean }[],
  from: number,
  direction: 1 | -1,
): number {
  const count = items.length;
  if (count === 0) return -1;

  for (let step = 1; step <= count; step += 1) {
    const index = (((from + direction * step) % count) + count) % count;
    if (!items[index]?.disabled) return index;
  }

  return from;
}

/** First enabled item index, or -1 when there is none. */
export function firstEnabledIndex(
  items: readonly { disabled?: boolean }[],
): number {
  return items.findIndex((item) => !item.disabled);
}

/** Last enabled item index, or -1 when there is none. */
export function lastEnabledIndex(
  items: readonly { disabled?: boolean }[],
): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (!items[index]?.disabled) return index;
  }
  return -1;
}
