/**
 * SessionDock — the bar at the foot of a running workout (redesign #5).
 *
 *   ╭────────────────────────────────────────────╮
 *   │ ╭──── ◎ Focus ────╮ ╭───── Finish ──────╮  │   ← glass bar, two equal halves
 *   │ ╰─────────────────╯ ╰───────────────────╯  │
 *   ╰────────────────────────────────────────────╯
 *
 * It replaced the floating pair, where `Focus` was a 64 dp gradient pill and
 * `Finish` a 52 dp ghost beside it. The pair's argument — different weight and
 * geometry, so a thumb trained on `Focus` cannot end the workout by habit — is
 * kept by colour alone: `Focus` carries the accent fill, `Finish` the glass.
 * The redesign asked for the two to be EQUAL in size, because a 52 dp ghost
 * floating beside a big pill read as a footnote and people hunted for how to
 * end the session.
 *
 * Each half is ≥ 52 dp tall — past the 48 a mid-workout target needs. One item
 * (every set logged: `Finish workout` alone) takes the whole bar.
 */

import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { glass, palette } from '../theme/tokens';
import { BubblePressable } from './bubbles';
import { GlassBar } from './glass';
import { Icon, type IconName } from './Icon';
import { GradientFill } from './primitives';

export interface DockItem {
  label: string;
  icon?: IconName;
  onPress: () => void;
  /** The accent fill — the thing to do. At most one per dock. */
  primary?: boolean;
}

/** The bar's own height: two 52 dp halves and 6 dp of glass round them. */
/**
 * 66, not 64: the bar's 1 dp edge sits inside its box, so 64 left 50 dp under the
 * 6 dp padding for 52 dp buttons, and `overflow: hidden` clipped their bottom 2.
 */
export const DOCK_HEIGHT = 66;

export function SessionDock({ items, bottom }: { items: readonly DockItem[]; bottom: number }) {
  const insets = useSafeAreaInsets();
  return (
    <GlassBar
      radius={32}
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: bottom + insets.bottom,
        height: DOCK_HEIGHT,
        padding: 6,
        flexDirection: 'row',
        gap: 6,
      }}
    >
      {items.map((item) => (
        <DockButton key={item.label} item={item} />
      ))}
    </GlassBar>
  );
}

function DockButton({ item }: { item: DockItem }) {
  const ink = item.primary ? palette.onAcc : palette.ink;
  return (
    <BubblePressable
      // BubblePressable already plays the tap haptic.
      onPress={item.onPress}
      radius="pill"
      bubbleColor={item.primary ? palette.onAcc : palette.greenBright}
      accessibilityRole="button"
      accessibilityLabel={item.label}
      style={{
        flex: 1,
        height: 52,
        borderRadius: 26,
        overflow: 'hidden',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 12,
        ...(item.primary
          ? null
          : { backgroundColor: glass.raised, borderWidth: 1, borderColor: glass.raisedEdge }),
      }}
    >
      {item.primary ? <GradientFill /> : null}
      {item.icon ? (
        <View style={{ marginRight: 8 }}>
          <Icon name={item.icon} size={18} color={ink} />
        </View>
      ) : null}
      <Text
        maxFontSizeMultiplier={1.3}
        numberOfLines={1}
        style={{ color: ink }}
        className="text-body font-semibold"
      >
        {item.label}
      </Text>
    </BubblePressable>
  );
}
