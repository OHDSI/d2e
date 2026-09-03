/**
 * Conditional truncation tooltips.
 *
 * The frame's note on card 2635:208762 reads: "If name/description is longer
 * than the row, it will be truncated and user should be able to view a tooltip
 * to see the full naming/description". A `title` that is always present shows a
 * tooltip even when the text fits, which is noise; this only sets it when the
 * element actually overflows.
 */

/**
 * True when the element's content is wider than its box.
 *
 * The 1px allowance absorbs sub-pixel rounding: a fitting element can report a
 * scrollWidth a fraction larger than its clientWidth after layout scaling, and
 * without it every row would claim to be truncated.
 */
export function isTruncated(el: Pick<HTMLElement, "scrollWidth" | "clientWidth">): boolean {
  return el.scrollWidth > el.clientWidth + 1;
}

/**
 * Sets `title` to the element's text while it overflows, and removes it when it
 * fits. Re-measures on resize, because the grid reflows at every breakpoint.
 */
export const vTruncationTitle = {
  mounted(el: HTMLElement) {
    const sync = () => {
      if (isTruncated(el)) {
        el.setAttribute("title", el.textContent?.trim() ?? "");
      } else {
        el.removeAttribute("title");
      }
    };

    sync();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(sync);
      observer.observe(el);
      (el as HTMLElement & { _truncationObserver?: ResizeObserver })._truncationObserver = observer;
    }

    (el as HTMLElement & { _truncationSync?: () => void })._truncationSync = sync;
  },
  updated(el: HTMLElement) {
    (el as HTMLElement & { _truncationSync?: () => void })._truncationSync?.();
  },
  unmounted(el: HTMLElement) {
    (el as HTMLElement & { _truncationObserver?: ResizeObserver })._truncationObserver?.disconnect();
  },
};
