import { describe, expect, it } from 'vitest';

import {
  KEYBOARD_GAP,
  coveredTail,
  keyboardOverlap,
  liftedBottom,
  paneRoom,
  revealOffset,
  type RevealInput,
} from './keyboard';

/**
 * The soft-keyboard arithmetic. With `resize` + edge-to-edge Android moves
 * nothing, so every one of these numbers is the whole difference between a note
 * input that can be seen and one under the keyboard.
 *
 * The phone used throughout: an 800 dp root, a 48 dp navigation bar, and a
 * keyboard React Native reports as 300 dp tall (Android 11+ reports the IME inset
 * MINUS the nav bar), so it truly covers 348 dp and its top sits at 452.
 */
const ROOT = 800;
const NAV = 48;
const KB_HEIGHT = 300;
const KB_TOP = ROOT - KB_HEIGHT - NAV; // 452
const STATUS = 24;

describe('keyboardOverlap', () => {
  describe('keyboard down', () => {
    it('is 0 for a null frame', () => {
      expect(keyboardOverlap(ROOT, null, NAV)).toBe(0);
      expect(keyboardOverlap(0, null, 0)).toBe(0);
    });

    it('is 0 for a zero-height frame wherever its top claims to be', () => {
      expect(keyboardOverlap(ROOT, { top: KB_TOP, height: 0 }, NAV)).toBe(0);
      expect(keyboardOverlap(ROOT, { top: ROOT, height: 0 }, NAV)).toBe(0);
    });

    it('is 0 for a negative height', () => {
      expect(keyboardOverlap(ROOT, { top: KB_TOP, height: -300 }, NAV)).toBe(0);
    });

    it('is 0 for a NaN height, even with an on-screen top', () => {
      expect(keyboardOverlap(ROOT, { top: KB_TOP, height: NaN }, NAV)).toBe(0);
      expect(keyboardOverlap(0, { top: KB_TOP, height: NaN }, NAV)).toBe(0);
    });
  });

  describe('the top is on screen (preferred answer)', () => {
    it('is root minus top on the realistic phone', () => {
      expect(keyboardOverlap(ROOT, { top: KB_TOP, height: KB_HEIGHT }, NAV)).toBe(348);
    });

    it('trusts the top over the reported height', () => {
      // Height says 300 + 48 = 348, the top says 400. The top wins.
      expect(keyboardOverlap(ROOT, { top: 400, height: KB_HEIGHT }, NAV)).toBe(400);
      expect(keyboardOverlap(ROOT, { top: 700, height: KB_HEIGHT }, NAV)).toBe(100);
    });

    it('ignores the inset entirely when the top is usable', () => {
      const frame = { top: KB_TOP, height: KB_HEIGHT };
      expect(keyboardOverlap(ROOT, frame, 0)).toBe(348);
      expect(keyboardOverlap(ROOT, frame, 200)).toBe(348);
      expect(keyboardOverlap(ROOT, frame, -10)).toBe(348);
    });

    it('is 0 when the OS resized the window (top == rootHeight), so nothing lifts twice', () => {
      // After a resize the root is 452 tall and ends exactly where the keyboard starts.
      expect(keyboardOverlap(KB_TOP, { top: KB_TOP, height: KB_HEIGHT }, NAV)).toBe(0);
      expect(keyboardOverlap(ROOT, { top: ROOT, height: KB_HEIGHT }, NAV)).toBe(0);
    });

    it('handles a top just inside the root', () => {
      expect(keyboardOverlap(ROOT, { top: ROOT - 1, height: KB_HEIGHT }, NAV)).toBe(1);
      expect(keyboardOverlap(ROOT, { top: 1, height: KB_HEIGHT }, NAV)).toBe(ROOT - 1);
    });

    it('accepts fractional dp', () => {
      expect(keyboardOverlap(800.5, { top: 452.25, height: 300 }, 48)).toBeCloseTo(348.25);
    });
  });

  describe('the top is not a position on this screen (fallback: height + inset)', () => {
    it('falls back for a top of 0', () => {
      expect(keyboardOverlap(ROOT, { top: 0, height: KB_HEIGHT }, NAV)).toBe(348);
    });

    it('falls back for a negative top', () => {
      expect(keyboardOverlap(ROOT, { top: -50, height: KB_HEIGHT }, NAV)).toBe(348);
    });

    it('falls back for a top below the root (in another coordinate space)', () => {
      expect(keyboardOverlap(ROOT, { top: ROOT + 5, height: KB_HEIGHT }, NAV)).toBe(348);
      expect(keyboardOverlap(ROOT, { top: 2400, height: KB_HEIGHT }, NAV)).toBe(348);
    });

    it('falls back for a NaN or infinite top', () => {
      expect(keyboardOverlap(ROOT, { top: NaN, height: KB_HEIGHT }, NAV)).toBe(348);
      expect(keyboardOverlap(ROOT, { top: Infinity, height: KB_HEIGHT }, NAV)).toBe(348);
      expect(keyboardOverlap(ROOT, { top: -Infinity, height: KB_HEIGHT }, NAV)).toBe(348);
    });

    it('caps the fallback at the root height', () => {
      expect(keyboardOverlap(ROOT, { top: NaN, height: 5000 }, NAV)).toBe(ROOT);
      expect(keyboardOverlap(ROOT, { top: NaN, height: Infinity }, NAV)).toBe(ROOT);
    });

    it('clamps a negative inset to 0 rather than shrinking the cover', () => {
      expect(keyboardOverlap(ROOT, { top: NaN, height: KB_HEIGHT }, -48)).toBe(KB_HEIGHT);
    });

    describe('nav bar inset variants', () => {
      const frame = { top: -1, height: KB_HEIGHT };
      it.each([
        ['gesture strip hidden', 0, 300],
        ['gesture strip', 24, 324],
        ['three-button bar', 48, 348],
        ['tall bar', 63, 363],
      ])('%s (%i dp)', (_label, inset, expected) => {
        expect(keyboardOverlap(ROOT, frame, inset)).toBe(expected);
      });
    });
  });

  describe('root not measured yet', () => {
    it('uses height + inset for a zero root, even with a top that looks valid', () => {
      expect(keyboardOverlap(0, { top: KB_TOP, height: KB_HEIGHT }, NAV)).toBe(348);
    });

    it('uses height + inset for a negative or NaN root', () => {
      expect(keyboardOverlap(-1, { top: KB_TOP, height: KB_HEIGHT }, NAV)).toBe(348);
      expect(keyboardOverlap(NaN, { top: KB_TOP, height: KB_HEIGHT }, NAV)).toBe(348);
    });

    it('does not cap the fallback when there is no root to cap it with', () => {
      expect(keyboardOverlap(0, { top: 0, height: 5000 }, 0)).toBe(5000);
    });
  });

  it('is never negative and never exceeds a measured root', () => {
    const tops = [-100, 0, 1, 100, 452, 799, 800, 801, NaN, Infinity];
    const heights = [1, 100, 300, 799, 800, 5000];
    const insets = [0, 24, 48, -5];
    for (const top of tops) {
      for (const height of heights) {
        for (const inset of insets) {
          const v = keyboardOverlap(ROOT, { top, height }, inset);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(ROOT);
          expect(Number.isFinite(v)).toBe(true);
        }
      }
    }
  });
});

describe('liftedBottom', () => {
  it('sits gap above the nav bar with the keyboard down', () => {
    expect(liftedBottom(0, NAV, KEYBOARD_GAP)).toBe(60);
    expect(liftedBottom(0, 0, KEYBOARD_GAP)).toBe(12);
  });

  it('sits gap above the keyboard when it is up — the keyboard REPLACES the inset', () => {
    expect(liftedBottom(348, NAV, KEYBOARD_GAP)).toBe(360);
    expect(liftedBottom(348, NAV, KEYBOARD_GAP)).not.toBe(348 + NAV + KEYBOARD_GAP);
  });

  it('uses the inset when the overlap is smaller than it (resized window, partial cover)', () => {
    expect(liftedBottom(10, NAV, KEYBOARD_GAP)).toBe(60);
    expect(liftedBottom(NAV, NAV, KEYBOARD_GAP)).toBe(60);
  });

  it('clamps negative overlap and inset to 0', () => {
    expect(liftedBottom(-100, -48, 8)).toBe(8);
    expect(liftedBottom(-100, NAV, 8)).toBe(56);
    expect(liftedBottom(200, -48, 8)).toBe(208);
  });

  it('honours a zero gap', () => {
    expect(liftedBottom(348, NAV, 0)).toBe(348);
  });

  it('composes with keyboardOverlap on the realistic phone', () => {
    const overlap = keyboardOverlap(ROOT, { top: KB_TOP, height: KB_HEIGHT }, NAV);
    // The pane's foot is 12 dp above the keyboard's top.
    expect(ROOT - liftedBottom(overlap, NAV, KEYBOARD_GAP)).toBe(KB_TOP - KEYBOARD_GAP);
  });
});

describe('paneRoom', () => {
  it('is +Infinity before the root is measured, so Math.min keeps the design height', () => {
    expect(paneRoom(0, 0, STATUS, NAV, 12)).toBe(Number.POSITIVE_INFINITY);
    expect(paneRoom(-5, 0, STATUS, NAV, 12)).toBe(Number.POSITIVE_INFINITY);
    expect(paneRoom(NaN, 300, STATUS, NAV, 12)).toBe(Number.POSITIVE_INFINITY);
    expect(Math.min(420, paneRoom(0, 0, STATUS, NAV, 12))).toBe(420);
  });

  it('is root less status bar, nav bar and gap at each end with the keyboard down', () => {
    expect(paneRoom(ROOT, 0, STATUS, NAV, 12)).toBe(800 - 48 - 24 - 24);
  });

  it('is root less status bar, keyboard and gaps with the keyboard up', () => {
    expect(paneRoom(ROOT, 348, STATUS, NAV, 12)).toBe(800 - 348 - 24 - 24);
  });

  it('counts only the larger of keyboard and inset under the pane', () => {
    expect(paneRoom(ROOT, 10, STATUS, NAV, 12)).toBe(paneRoom(ROOT, 0, STATUS, NAV, 12));
  });

  it('clamps negative insets and overlap', () => {
    expect(paneRoom(ROOT, -50, -24, -48, 0)).toBe(ROOT);
  });

  it('is never negative, even with a keyboard as tall as the root', () => {
    expect(paneRoom(ROOT, ROOT, STATUS, NAV, 12)).toBe(0);
    expect(paneRoom(300, 290, STATUS, NAV, 12)).toBe(0);
  });

  it('agrees with liftedBottom: a pane of exactly paneRoom touches the status bar gap', () => {
    const overlap = 348;
    const room = paneRoom(ROOT, overlap, STATUS, NAV, 12);
    const foot = ROOT - liftedBottom(overlap, NAV, 12);
    expect(foot - room).toBe(STATUS + 12);
  });
});

describe('coveredTail', () => {
  it('is how far the scroll box extends below the keyboard top', () => {
    expect(coveredTail(ROOT, KB_TOP)).toBe(348);
    expect(coveredTail(ROOT - NAV, KB_TOP)).toBe(300);
  });

  it('is 0 for a scroll ending above the keyboard (inside a lifted sheet)', () => {
    expect(coveredTail(400, KB_TOP)).toBe(0);
    expect(coveredTail(KB_TOP, KB_TOP)).toBe(0);
  });

  it('is 0 with the keyboard down (+Infinity top)', () => {
    expect(coveredTail(ROOT, Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('is 0 for any non-finite input', () => {
    expect(coveredTail(NaN, KB_TOP)).toBe(0);
    expect(coveredTail(ROOT, NaN)).toBe(0);
    expect(coveredTail(Infinity, KB_TOP)).toBe(0);
    expect(coveredTail(ROOT, -Infinity)).toBe(0);
  });

  it('allows a keyboard top at 0 (fully covered scroll)', () => {
    expect(coveredTail(ROOT, 0)).toBe(ROOT);
  });
});

describe('revealOffset', () => {
  /** A full-screen scroll under a 56 dp header, keyboard up on the realistic phone. */
  const base: RevealInput = {
    fieldTop: 600,
    fieldBottom: 650,
    visibleTop: 80,
    visibleBottom: ROOT,
    keyboardTop: KB_TOP,
    scrollY: 1000,
  };

  it('defaults the margin to KEYBOARD_GAP', () => {
    // overshoot = 650 + 12 - 452 = 210
    expect(revealOffset(base)).toBe(1000 + 210);
    expect(revealOffset({ ...base, margin: KEYBOARD_GAP })).toBe(1210);
  });

  it('honours a margin override', () => {
    expect(revealOffset({ ...base, margin: 0 })).toBe(1000 + 198);
    expect(revealOffset({ ...base, margin: 40 })).toBe(1000 + 238);
  });

  it('puts the field foot exactly margin above the keyboard after scrolling', () => {
    const next = revealOffset(base)!;
    const shift = next - base.scrollY;
    expect(base.fieldBottom - shift + KEYBOARD_GAP).toBe(KB_TOP);
  });

  it('is null when the field is already fully visible above the keyboard', () => {
    expect(revealOffset({ ...base, fieldTop: 300, fieldBottom: 340 })).toBeNull();
    // Exactly margin above the keyboard counts as visible.
    expect(revealOffset({ ...base, fieldTop: 300, fieldBottom: KB_TOP - 12 })).toBeNull();
  });

  it('scrolls when the margin, not the field, is under the keyboard', () => {
    expect(revealOffset({ ...base, fieldTop: 300, fieldBottom: KB_TOP - 11 })).toBe(1001);
  });

  it('uses the scroll bottom when it is above the keyboard', () => {
    // A scroll inside a lifted sheet ends at 400, above the 452 keyboard.
    expect(revealOffset({ ...base, fieldTop: 350, fieldBottom: 395, visibleBottom: 400 })).toBe(
      1000 + 7,
    );
  });

  it('uses the scroll bottom with the keyboard down (+Infinity)', () => {
    const down = { ...base, keyboardTop: Number.POSITIVE_INFINITY };
    expect(revealOffset({ ...down, fieldTop: 300, fieldBottom: 340 })).toBeNull();
    expect(revealOffset({ ...down, fieldTop: 760, fieldBottom: 800 })).toBe(1012);
  });

  it('is null when both bottom edges are infinite (nothing to measure against)', () => {
    expect(revealOffset({ ...base, visibleBottom: Infinity, keyboardTop: Infinity })).toBeNull();
  });

  it('keeps the top of a field taller than the room in view', () => {
    // An eight-line note from 200 to 700: revealing its foot would need 260 dp,
    // but only 200 - 80 - 12 = 108 dp can go before its top passes the header.
    const tall = { ...base, fieldTop: 200, fieldBottom: 700 };
    const next = revealOffset(tall)!;
    expect(next).toBe(1000 + 108);
    expect(tall.fieldTop - (next - tall.scrollY)).toBe(base.visibleTop + KEYBOARD_GAP);
  });

  it('is null for a tall field already pinned at the visible top', () => {
    expect(revealOffset({ ...base, fieldTop: 92, fieldBottom: 900 })).toBeNull();
    // Within margin of the top: no room to scroll at all.
    expect(revealOffset({ ...base, fieldTop: 85, fieldBottom: 900 })).toBeNull();
  });

  it('brings a field above the visible top down to it, with margin', () => {
    // Field top 30 dp above the header's foot.
    expect(revealOffset({ ...base, fieldTop: 50, fieldBottom: 100 })).toBe(1000 - 30 - 12);
  });

  it('never returns a negative offset when bringing a field down', () => {
    expect(revealOffset({ ...base, fieldTop: -500, fieldBottom: -450, scrollY: 100 })).toBe(0);
  });

  it('brings a field above the top down even if its foot is also under the keyboard', () => {
    const r = revealOffset({ ...base, fieldTop: 40, fieldBottom: 900 });
    expect(r).toBe(1000 - 40 - 12);
  });

  it('only scrolls forward to reveal a foot', () => {
    for (let fieldTop = 80; fieldTop < 800; fieldTop += 37) {
      const r = revealOffset({ ...base, fieldTop, fieldBottom: fieldTop + 60 });
      if (r != null) expect(r).toBeGreaterThan(base.scrollY);
    }
  });

  it('works from scrollY 0', () => {
    expect(revealOffset({ ...base, scrollY: 0 })).toBe(210);
  });

  describe('non-finite inputs return null', () => {
    it.each(['fieldTop', 'fieldBottom', 'visibleTop', 'scrollY'] as const)('%s', (key) => {
      expect(revealOffset({ ...base, [key]: NaN })).toBeNull();
      expect(revealOffset({ ...base, [key]: Infinity })).toBeNull();
    });

    it('a NaN visibleBottom', () => {
      expect(revealOffset({ ...base, visibleBottom: NaN })).toBeNull();
    });

    it('a NaN keyboardTop', () => {
      expect(revealOffset({ ...base, keyboardTop: NaN })).toBeNull();
    });
  });

  it('works end to end with keyboardOverlap on the realistic phone', () => {
    const overlap = keyboardOverlap(ROOT, { top: KB_TOP, height: KB_HEIGHT }, NAV);
    const keyboardTop = ROOT - overlap;
    expect(keyboardTop).toBe(KB_TOP);
    const r = revealOffset({ ...base, keyboardTop, fieldTop: 500, fieldBottom: 620 });
    expect(r).toBe(1000 + (620 + 12 - KB_TOP));
    expect(coveredTail(ROOT, keyboardTop)).toBe(overlap);
  });
});

/**
 * Robustness: `Math.max(0, NaN)` is NaN, so a bare clamp lets NaN through.
 * These pin the fix (`dp` in `lib/keyboard.ts`): a non-finite measurement is 0
 * and a non-finite margin is the default. Insets are finite in practice, so
 * these guard a latent case, not a live one.
 */
describe('a resized root is never lifted twice', () => {
  it('a top a fraction of a dp past the root still reads as the root ending there', () => {
    expect(keyboardOverlap(ROOT, { top: ROOT + 0.4, height: KB_HEIGHT }, NAV)).toBe(0);
    expect(keyboardOverlap(ROOT, { top: ROOT + 1, height: KB_HEIGHT }, NAV)).toBe(0);
  });

  it('a top clearly past the root is not a position and falls back', () => {
    expect(keyboardOverlap(ROOT, { top: ROOT + 5, height: KB_HEIGHT }, NAV)).toBe(KB_HEIGHT + NAV);
  });
});

describe('NaN never leaks through the clamps', () => {
  it('keyboardOverlap: a NaN inset on the fallback path is not NaN', () => {
    expect(keyboardOverlap(ROOT, { top: NaN, height: KB_HEIGHT }, NaN)).toBe(KB_HEIGHT);
  });

  it('liftedBottom: a NaN overlap falls back to the inset', () => {
    expect(liftedBottom(NaN, NAV, KEYBOARD_GAP)).toBe(60);
  });

  it('revealOffset: a NaN margin does not produce a NaN offset', () => {
    expect(revealOffset({ ...base(), margin: NaN })).not.toBeNaN();
  });

  function base(): RevealInput {
    return {
      fieldTop: 600,
      fieldBottom: 650,
      visibleTop: 80,
      visibleBottom: ROOT,
      keyboardTop: KB_TOP,
      scrollY: 1000,
    };
  }
});
