/**
 * Where the soft keyboard is, and what has to move so nothing typed is under it.
 *
 * ── WHY THE APP MOVES THINGS ITSELF NOW ───────────────────────────────────
 *
 * Until 2.5.0 this was Android's job: `softwareKeyboardLayoutMode: pan` slides
 * the whole window up until the FOCUSED RECT is visible. For a one-line field
 * that rect is the field, and `FieldWell`'s `keyboardReach` padded it so the
 * Save under it came along. For a MULTILINE field the rect is the caret's line —
 * so the finance note opened with its first line just above the keyboard and
 * the rest of the box, and its `Done`, under it. Pan cannot be told "this pane";
 * it only ever sees one line of text.
 *
 * So `app.json` runs `resize` and the app is edge-to-edge, which together mean
 * Android moves NOTHING: the keyboard is reported (`Keyboard` events) and every
 * surface that holds a field moves itself by exactly the amount it is covered —
 * a sheet rises above it, a composer sits on it, a scroll gains room under its
 * last field and brings the focused one into view. The rules for those amounts
 * are here, pure, so they are tested rather than eyeballed on one phone.
 *
 * ONE KNOWN GAP. On Android 11+ React Native reports the keyboard only when it
 * opens or closes (`ReactRootView.checkForKeyboardEvents`), not when it changes
 * height while open — a number pad swapped for a taller text keyboard, an
 * emoji panel. The lift stays at the height it opened at until the keyboard
 * next closes. Every typing surface here holds one keyboard type at a time, so
 * this is rare; the cure is a native height source (keyboard-controller), not
 * more JS.
 *
 * Every number is in dp, in window coordinates (0 = the top of the screen; the
 * app draws under the status bar).
 */

/** What a `keyboardDidShow` says, reduced to the two numbers this reads. */
export interface KeyboardFrame {
  /** `endCoordinates.screenY`: the keyboard's top edge, from the window's top. */
  top: number;
  /**
   * `endCoordinates.height`. On Android 11+ React Native reports the IME inset
   * MINUS the navigation bar, so this alone is short of the true cover by
   * `insets.bottom`.
   */
  height: number;
}

/** A measurement as a usable non-negative dp: anything not a finite number is 0. */
function dp(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/** Pixel-to-dp rounding between two separately converted measurements. */
const ROUNDING_SLACK = 1;

/** Air between the keyboard's top and the bottom of whatever must clear it. */
export const KEYBOARD_GAP = 12;

/**
 * How many dp at the foot of the app's root the keyboard covers. 0 when it is
 * down.
 *
 * The keyboard's TOP against the root's measured height is the honest answer and
 * the one preferred: if Android did resize the window after all (an old phone,
 * a future mode), the root ends where the keyboard starts and the overlap is 0 —
 * so nothing is ever lifted twice. The reported height plus the bottom inset is
 * the fallback for when that cannot be computed: the root not measured yet, or a
 * top that is not a position on this screen.
 */
export function keyboardOverlap(
  rootHeight: number,
  frame: KeyboardFrame | null,
  insetBottom: number,
): number {
  if (!frame || !(frame.height > 0)) return 0;
  const byHeight = frame.height + dp(insetBottom);
  if (!(rootHeight > 0)) return byHeight;
  // A dp of slack: the keyboard's top and the root's height are converted from
  // pixels separately, and a resized root must read as 0, never as off-screen.
  const topIsOnScreen =
    Number.isFinite(frame.top) && frame.top > 0 && frame.top <= rootHeight + ROUNDING_SLACK;
  if (!topIsOnScreen) return Math.min(byHeight, rootHeight);
  return Math.max(0, Math.min(rootHeight - frame.top, rootHeight));
}

/**
 * The distance from the root's foot to a floating pane's foot: its own `gap`
 * above the gesture strip when the keyboard is down, the same `gap` above the
 * keyboard when it is up. The keyboard REPLACES the inset rather than adding to
 * it — it already covers the gesture strip.
 */
export function liftedBottom(overlap: number, insetBottom: number, gap: number): number {
  return gap + Math.max(dp(insetBottom), dp(overlap));
}

/**
 * How tall a floating pane may be and still show its top: the root less the
 * status bar, what is under it (keyboard or gesture strip) and `gap` at each
 * end. Never negative, so a caller can `Math.min` it with a design height.
 */
export function paneRoom(
  rootHeight: number,
  overlap: number,
  insetTop: number,
  insetBottom: number,
  gap: number,
): number {
  if (!(rootHeight > 0)) return Number.POSITIVE_INFINITY;
  const below = Math.max(dp(insetBottom), dp(overlap));
  return Math.max(0, rootHeight - below - dp(insetTop) - gap * 2);
}

/**
 * How much empty room a scroll needs under its content so its last field can be
 * scrolled above the keyboard: the part of the scroll's own box that the
 * keyboard covers. A scroll that ends above the keyboard (inside a lifted
 * sheet) needs none.
 */
export function coveredTail(scrollBottom: number, keyboardTop: number): number {
  if (!Number.isFinite(scrollBottom) || !Number.isFinite(keyboardTop)) return 0;
  return Math.max(0, scrollBottom - keyboardTop);
}

/** A field's box and the scroll it lives in, measured in window coordinates. */
export interface RevealInput {
  fieldTop: number;
  fieldBottom: number;
  /** The scroll's visible top — under a floating header, its foot. */
  visibleTop: number;
  /** The scroll's own bottom edge. */
  visibleBottom: number;
  /** `rootHeight - overlap`, or +∞ with the keyboard down. */
  keyboardTop: number;
  /** The scroll's current offset. */
  scrollY: number;
  /** Air to leave under the field. */
  margin?: number;
}

/**
 * The offset to scroll to so the focused field sits fully above the keyboard,
 * or `null` when it already does.
 *
 * Only ever scrolls FORWARD to reveal a field's foot, and never so far that the
 * field's top goes under the visible top: a field taller than the room left
 * (an eight-line note on a small phone) keeps its first line and caret in view
 * rather than its last. A field above the visible top is brought down to it.
 */
export function revealOffset(input: RevealInput): number | null {
  const margin =
    input.margin !== undefined && Number.isFinite(input.margin) ? input.margin : KEYBOARD_GAP;
  const { fieldTop, fieldBottom, visibleTop, scrollY } = input;
  if (![fieldTop, fieldBottom, visibleTop, scrollY].every(Number.isFinite)) return null;
  const bottomEdge = Math.min(input.visibleBottom, input.keyboardTop);
  if (!Number.isFinite(bottomEdge)) return null;

  if (fieldTop < visibleTop) {
    return Math.max(0, scrollY - (visibleTop - fieldTop) - margin);
  }
  const overshoot = fieldBottom + margin - bottomEdge;
  if (overshoot <= 0) return null;
  const roomAbove = fieldTop - visibleTop;
  const delta = Math.min(overshoot, Math.max(0, roomAbove - margin));
  if (delta <= 0) return null;
  return scrollY + delta;
}
