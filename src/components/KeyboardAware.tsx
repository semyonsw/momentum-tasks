/**
 * KeyboardAwareScrollView — a `ScrollView` that keeps its focused field above
 * the keyboard.
 *
 * The app moves things for the keyboard itself (`lib/keyboard.ts` says why), and
 * a scroll is the one surface that cannot do it by moving: it is the whole
 * screen. So it does the two things a scroll can. It grows EMPTY ROOM under its
 * content equal to the part of its own box the keyboard covers — without it the
 * last field could not be scrolled up at all — and once that room exists it
 * scrolls just far enough that the focused field's foot clears the keyboard by
 * `KEYBOARD_GAP` (`revealOffset`: never so far that the field's top is lost).
 *
 * A field focused while the keyboard is ALREADY up (tapping from one field to
 * the next) asks again through `useRevealOnFocus`, which `FieldWell` and the
 * app's bare `TextInput`s call from their `onFocus`. Outside one of these it is
 * a no-op, so a field can call it without knowing where it is.
 *
 * Measured with `measureInWindow` on a wrapping `View` rather than on the scroll
 * itself, so it reads a plain host view on every architecture.
 *
 * ── INSIDE A SURFACE THAT RIDES THE KEYBOARD, THE KEYBOARD IS NOT ITS EDGE ──
 *
 * A sheet's scroll ends above the keyboard by construction: the frame rises
 * until its foot clears it. Measuring that against the keyboard's top is worse
 * than redundant: the rise is a native-driven transform, which Fabric's
 * `measureInWindow` reads from the shadow tree and so may not see — mid-rise,
 * or at all. Then the scroll reads as still sitting where it rested, a long way
 * under the keyboard, and grows that much blank room under its Save, stretching
 * the sheet to the top of the screen. So a surface that rides says so
 * (`RidesKeyboard`), and a scroll inside it grows no room and reveals against
 * its OWN foot only: the field and the scroll are measured in the same frame,
 * so whatever transform is or is not seen, it is seen by both.
 */

import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  ScrollView,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native';

import { KEYBOARD_FOLLOW_MS, useKeyboardOverlap, useRootHeight } from '../hooks/useKeyboard';
import { coveredTail, revealOffset } from '../lib/keyboard';

/** After the keyboard (and any sheet riding it) has finished moving. */
const SETTLE_MS = KEYBOARD_FOLLOW_MS + 40;

const RevealContext = createContext<(() => void) | null>(null);

/**
 * True under a surface that lifts itself clear of the keyboard (`SheetFrame`).
 * See the header: its scrolls never need room for the keyboard, only a reveal.
 */
export const RidesKeyboard = createContext(false);

/*
 * Which scroll answers the keyboard opening. The one whose field was focused
 * last, when it said so (`useRevealOnFocus` — focus lands before the keyboard
 * does); otherwise the newest mounted, since a sheet's scroll mounts over the
 * screen's and nothing under its scrim can hold focus. Either way exactly one
 * scroll grows room and moves, so the screen under a sheet never scrolls after
 * a field that is not its own.
 */
let nextId = 0;
const mounted: number[] = [];
let owner: number | null = null;

function responder(): number | undefined {
  if (owner !== null && mounted.includes(owner)) return owner;
  return mounted[mounted.length - 1];
}

/**
 * For a field's `onFocus`: bring it above the keyboard if it sits in a
 * `KeyboardAwareScrollView`. Stable; a no-op anywhere else.
 */
export function useRevealOnFocus(): () => void {
  const reveal = useContext(RevealContext);
  return useCallback(() => reveal?.(), [reveal]);
}

type Measurable = {
  measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void;
};

function measure(node: Measurable | null | undefined): Promise<{ top: number; bottom: number }> {
  return new Promise((resolve) => {
    if (!node?.measureInWindow) {
      resolve({ top: NaN, bottom: NaN });
      return;
    }
    node.measureInWindow((_x, y, _w, h) => resolve({ top: y, bottom: y + h }));
  });
}

export interface KeyboardAwareScrollViewProps extends ScrollViewProps {
  /** dp of the scroll's top hidden under a floating header — never reveal into it. */
  topObscured?: number;
}

export const KeyboardAwareScrollView = forwardRef<ScrollView, KeyboardAwareScrollViewProps>(
  function KeyboardAwareScrollView(
    {
      topObscured = 0,
      contentContainerStyle,
      onScroll,
      onContentSizeChange,
      children,
      style,
      ...rest
    },
    ref,
  ) {
    const scroll = useRef<ScrollView>(null);
    useImperativeHandle(ref, () => scroll.current as ScrollView, []);
    const box = useRef<View>(null);
    const offset = useRef(0);
    const overlap = useKeyboardOverlap();
    const rootHeight = useRootHeight();
    const rides = useContext(RidesKeyboard);
    const [tail, setTail] = useState(0);
    const id = useRef(0);
    useEffect(() => {
      nextId += 1;
      id.current = nextId;
      mounted.push(nextId);
      return () => {
        const at = mounted.indexOf(id.current);
        if (at >= 0) mounted.splice(at, 1);
        if (owner === id.current) owner = null;
      };
    }, []);

    const keyboardUpRef = useRef(false);
    keyboardUpRef.current = overlap > 0;
    const keyboardTopRef = useRef(Number.POSITIVE_INFINITY);
    keyboardTopRef.current =
      overlap > 0 && rootHeight > 0 && !rides ? rootHeight - overlap : Number.POSITIVE_INFINITY;
    const topObscuredRef = useRef(topObscured);
    topObscuredRef.current = topObscured;

    const reveal = useCallback(async () => {
      if (!keyboardUpRef.current) return;
      const keyboardTop = keyboardTopRef.current;
      const focused = TextInput.State.currentlyFocusedInput() as Measurable | null;
      if (!focused) return;
      const [field, own] = await Promise.all([
        measure(focused),
        measure(box.current as unknown as Measurable),
      ]);
      const next = revealOffset({
        fieldTop: field.top,
        fieldBottom: field.bottom,
        visibleTop: own.top + topObscuredRef.current,
        visibleBottom: own.bottom,
        keyboardTop,
        scrollY: offset.current,
      });
      if (next !== null) scroll.current?.scrollTo({ y: next, animated: true });
    }, []);

    const revealLater = useCallback(() => {
      owner = id.current;
      setTimeout(() => void reveal(), SETTLE_MS);
    }, [reveal]);

    /** Set while new room is on its way: the reveal waits for the content to grow. */
    const pendingReveal = useRef(false);

    // Once the keyboard and any sheet riding it have settled: measure the room
    // the keyboard took (a render), then scroll into it once the content has
    // actually grown — a `scrollTo` before that is clamped to the old height.
    useEffect(() => {
      if (overlap <= 0) {
        // Focus claims ownership just before the keyboard rises; it lapses when
        // the keyboard goes, so a screen kept mounted on another tab never
        // answers for a field that did not claim it.
        if (owner === id.current) owner = null;
        pendingReveal.current = false;
        setTail(0);
        return undefined;
      }
      if (responder() !== id.current) {
        setTail(0);
        return undefined;
      }
      let live = true;
      let fallback: ReturnType<typeof setTimeout> | undefined;
      const settle = setTimeout(() => {
        void measure(box.current as unknown as Measurable).then((own) => {
          if (!live) return;
          const room = coveredTail(own.bottom, keyboardTopRef.current);
          pendingReveal.current = true;
          setTail(room);
          // No growth (the same room, or none) means no size change to wait for.
          fallback = setTimeout(() => {
            if (!live || !pendingReveal.current) return;
            pendingReveal.current = false;
            void reveal();
          }, 120);
        });
      }, SETTLE_MS);
      return () => {
        live = false;
        clearTimeout(settle);
        if (fallback) clearTimeout(fallback);
      };
    }, [overlap, rootHeight, rides, reveal]);

    const handleContentSize = useCallback(
      (width: number, height: number) => {
        onContentSizeChange?.(width, height);
        if (!pendingReveal.current) return;
        pendingReveal.current = false;
        void reveal();
      },
      [onContentSizeChange, reveal],
    );

    const handleScroll = useCallback(
      (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        offset.current = event.nativeEvent.contentOffset.y;
        onScroll?.(event);
      },
      [onScroll],
    );

    return (
      <RevealContext.Provider value={revealLater}>
        <View ref={box} collapsable={false} style={[{ flexGrow: 1, flexShrink: 1 }, style]}>
          <ScrollView
            ref={scroll}
            keyboardShouldPersistTaps="handled"
            scrollEventThrottle={16}
            {...rest}
            onScroll={handleScroll}
            onContentSizeChange={handleContentSize}
            contentContainerStyle={contentContainerStyle}
          >
            {children}
            {tail > 0 ? <View style={{ height: tail }} /> : null}
          </ScrollView>
        </View>
      </RevealContext.Provider>
    );
  },
);
