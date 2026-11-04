/**
 * NavBar — the app's own section and Settings, on one pane of glass.
 *
 *   ╭──────────────────────────────╮
 *   │      🏋              ⚙       │
 *   │    Workout        Settings   │
 *   ╰──────────────────────────────╯
 *
 * ── TWO ITEMS, EACH IN ITS OWN HALF (3.0) ─────────────────────────────────
 *
 * From 2.0 to 2.10 the bar was four glyphs around a raised, gradient-filled
 * Home button: Momentum put a landing above three logs, and the way back to it
 * had to be one tap from anywhere. Each log is its own app now
 * (`lib/appVariant.ts`), the section is the landing, and the bar holds exactly
 * what the app has — its section and Settings (`variantSections`). They sit at
 * the quarter points (`lib/sectionNav.navSlots`), each centred in the half it
 * owns. Rejected: keeping two of the old four positions (a hole in the middle
 * where a button used to be reads as something missing) and dropping the bar
 * for a gear in the corner (Settings would stop being one tap from the root,
 * and the blob would have nowhere to go).
 *
 * ── EVERY ITEM IS NAMED (2.9, redesign #10) ───────────────────────────────
 *
 * Each glyph has its section's name under it, 12.5 px, and the active one is
 * `acc` — the word and the glyph together, so the lit item is said twice and
 * the other is still legible. The label replaced the small dot that used to
 * mark the active item: the blob and the lit word already say which one, and a
 * third mark is noise. Rejected: labels only on the active item (the inactive
 * one is the one a newcomer needs named).
 *
 * ── THE BLOB IS LIQUID ────────────────────────────────────────────────────
 *
 * The lit pane under the active icon does not slide as a rectangle. Its LEADING
 * edge moves in 360 ms and its trailing edge follows in 560 ms, 60 ms late, both
 * on an overshooting curve — so for a moment it is wider than itself and then it
 * lands, and the pane reads as liquid rather than a rectangle being slid.
 *
 * Hidden on every pushed screen: it drops away in 380 ms, and comes back up on
 * an overshoot 160 ms after a section arrives, so the section is on screen
 * before the chrome is.
 *
 * All of it is Reanimated, on the UI thread — the blob moves while the incoming
 * section renders, and a JS-thread animation there is a nav bar that stutters
 * on every tap.
 */

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BubblePressable } from './bubbles';
import { BlurGate, GlassBar } from './glass';
import { useOverlayOpen } from './overlay';
import { MaterialSymbol, type SymbolName } from './MaterialSymbol';
import { useT } from '../hooks/useT';
import { BLOB_HALF, navSlots, type SectionTab } from '../lib/sectionNav';
import { palette, tint } from '../theme/tokens';

const GLYPH: Record<SectionTab, SymbolName> = {
  Workout: 'fitness_center',
  Tasks: 'task_alt',
  Expenses: 'account_balance_wallet',
  Settings: 'settings',
};

/** The section's own name — printed under the glyph and spoken. Expenses as Finance. */
const LABEL: Record<SectionTab, string> = {
  Workout: 'Workout',
  Tasks: 'Tasks',
  Expenses: 'Finance',
  Settings: 'Settings',
};

const LIQUID = Easing.bezier(0.34, 1.3, 0.64, 1);
const RISE = Easing.bezier(0.34, 1.45, 0.64, 1);
const DROP = Easing.bezier(0.5, 0, 0.75, 0);

const NAV_HEIGHT = 70;
const NAV_BOTTOM = 14;
/** Each item's label line sits this far above the bar's bottom edge. */
const LABEL_BOTTOM = 8;
const LABEL_LINE = 16;

interface NavBarProps {
  /** The sections this app has, in bar order (`variantSections`). */
  sections: readonly SectionTab[];
  active: SectionTab;
  /**
   * False under a pushed screen. A sheet being up hides it too, but
   * that is read here rather than passed in: the overlay count is subscribed to
   * by THIS component, so a sheet opening re-renders the pill and not the shell
   * and the whole screen under it.
   */
  visible: boolean;
  onSelect: (tab: SectionTab) => void;
}

function NavBarComponent({ sections, active, visible: onRoute, onSelect }: NavBarProps) {
  const insets = useSafeAreaInsets();
  const t = useT();
  const [width, setWidth] = useState(0);
  const overlayOpen = useOverlayOpen();
  const visible = onRoute && !overlayOpen;

  /*
   * WHETHER THE BLUR IS MOUNTED — true from the moment the bar is asked for until
   * its drop has finished. A hidden bar is only at opacity 0, and a Dimezis blur
   * at opacity 0 still redraws the whole window into its bitmap on every frame:
   * under every pushed screen, for the whole of a workout. Set during
   * render on the way up, so the blur is there before the 160 ms delay ends.
   */
  const [blurLive, setBlurLive] = useState(visible);
  if (visible && !blurLive) setBlurLive(true);

  const shown = useSharedValue(visible ? 1 : 0);
  useEffect(() => {
    shown.value = visible
      ? withDelay(160, withTiming(1, { duration: 620, easing: RISE }))
      : withTiming(0, { duration: 380, easing: DROP }, (finished) => {
          if (finished) runOnJS(setBlurLive)(false);
        });
  }, [shown, visible]);

  /* The blob's two edges, each on its own clock. See the file header. */
  const slots = useMemo(() => navSlots(sections), [sections]);
  const centre = (slots[active] ?? 0) * width;
  const left = useSharedValue(centre - BLOB_HALF);
  const right = useSharedValue(centre + BLOB_HALF);
  const activeIndex = sections.indexOf(active);
  const previous = useSharedValue(activeIndex);
  const placed = useRef(false);
  useEffect(() => {
    if (width === 0) return;
    /* The first measurement places the blob; only later changes travel. */
    if (!placed.current) {
      placed.current = true;
      left.value = centre - BLOB_HALF;
      right.value = centre + BLOB_HALF;
      previous.value = activeIndex;
      return;
    }
    const movingRight = activeIndex > previous.value;
    const lead = { duration: 360, easing: LIQUID };
    const trail = { duration: 560, easing: LIQUID };
    left.value = movingRight
      ? withDelay(60, withTiming(centre - BLOB_HALF, trail))
      : withTiming(centre - BLOB_HALF, lead);
    right.value = movingRight
      ? withTiming(centre + BLOB_HALF, lead)
      : withDelay(60, withTiming(centre + BLOB_HALF, trail));
    previous.value = activeIndex;
  }, [activeIndex, centre, left, previous, right, width]);

  const centres = useMemo(
    () => sections.map((s) => (slots[s] ?? 0) * width),
    [sections, slots, width],
  );

  const barStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, shown.value * 1.4),
    transform: [{ translateY: (1 - shown.value) * 130 }, { scale: 0.92 + 0.08 * shown.value }],
  }));

  const blobStyle = useAnimatedStyle(() => ({
    left: left.value,
    width: right.value - left.value,
  }));

  return (
    <Animated.View
      pointerEvents={visible ? 'box-none' : 'none'}
      style={[
        {
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: NAV_BOTTOM + insets.bottom,
          height: NAV_HEIGHT,
        },
        barStyle,
      ]}
    >
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          borderRadius: 30,
        }}
      >
        <BlurGate.Provider value={blurLive}>
          <GlassBar radius={30} style={{ flex: 1 }}>
            <View style={{ flex: 1 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
              {width > 0 ? (
                <Animated.View
                  style={[
                    {
                      position: 'absolute',
                      top: 9,
                      bottom: 9,
                      borderRadius: 22,
                      borderWidth: 1,
                      borderColor: tint(0.3),
                      backgroundColor: tint(0.18),
                    },
                    blobStyle,
                  ]}
                />
              ) : null}
            </View>
          </GlassBar>
        </BlurGate.Provider>
      </View>

      {width > 0
        ? sections.map((section, i) => (
            <NavItem
              key={section}
              section={section}
              label={t(LABEL[section])}
              active={section === active}
              centre={centres[i]}
              onSelect={onSelect}
            />
          ))
        : null}
    </Animated.View>
  );
}

/**
 * Memoized, and handed the section rather than a bound closure, so the
 * items only re-render when one of them changes state.
 */
export const NavBar = memo(NavBarComponent);

const NavItem = memo(function NavItem({
  section,
  label,
  active,
  centre,
  onSelect,
}: {
  section: SectionTab;
  label: string;
  active: boolean;
  centre: number;
  onSelect: (tab: SectionTab) => void;
}) {
  const glyph = GLYPH[section];
  const on = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    on.value = withTiming(active ? 1 : 0, {
      duration: 420,
      easing: Easing.bezier(0.34, 1.56, 0.64, 1),
    });
  }, [active, on]);
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -on.value }, { scale: 1 + 0.1 * on.value }],
  }));

  return (
    <BubblePressable
      onPress={() => onSelect(section)}
      radius={22}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={{
        position: 'absolute',
        top: 0,
        left: centre - 32,
        width: 64,
        height: NAV_HEIGHT,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingBottom: LABEL_BOTTOM,
      }}
    >
      <Animated.View style={iconStyle}>
        <MaterialSymbol
          name={glyph}
          size={25}
          color={active ? palette.acc : palette.inkMuted}
          filled={active}
        />
      </Animated.View>
      <NavLabel label={label} active={active} />
    </BubblePressable>
  );
});

/**
 * The name under a glyph. Wider than the 64 dp item (the Russian `Тренировка`
 * is ~70 dp at 12.5) and centred on it: with two slots half a bar apart there
 * is room for far longer. Not clipped, not shrunk — 12.5 is the floor.
 */
function NavLabel({ label, active }: { label: string; active: boolean }) {
  return (
    <Text
      numberOfLines={1}
      maxFontSizeMultiplier={1.15}
      importantForAccessibility="no"
      accessibilityElementsHidden
      style={{
        marginTop: 3,
        width: 84,
        textAlign: 'center',
        fontSize: 12.5,
        lineHeight: LABEL_LINE,
        fontWeight: '600',
        color: active ? palette.acc : palette.inkMuted,
      }}
    >
      {label}
    </Text>
  );
}
