/**
 * Keypad — twelve keys the app owns, compact enough to sit inside a sheet.
 *
 *   ( 1 )( 2 )( 3 )
 *   ( 4 )( 5 )( 6 )
 *   ( 7 )( 8 )( 9 )
 *   ( . )( 0 )( ⌫ )
 *
 * For a NUMBER that is the whole point of a sheet (W9's measurement): the phone's
 * keyboard covers half the pane, flips between layouts by locale (a Russian one
 * offers `,`), and hides the ± chips it would be used beside. The amount editor
 * has the full-size pad as its own screen; this is the same twelve keys at 48 dp
 * — the mid-workout minimum — and the same reducer (`keypadPress`), so a second
 * point is ignored and backspace walks back across it exactly as it does there.
 *
 * Rejected: reusing the amount editor's `Key` (62 dp, staggered entry): four rows
 * of it are taller than a sheet's scroll window.
 */

import { Text, View } from 'react-native';

import { BubblePressable } from './bubbles';
import { MaterialSymbol } from './MaterialSymbol';
import { pressedStyle } from './motion';
import { useT } from '../hooks/useT';
import { keypadKeys } from '../lib/moneyUnits';
import { glass, palette, radius, tint } from '../theme/tokens';

const KEY_HEIGHT = 48;
const GAP = 8;

export function Keypad({
  decimals,
  onPress,
}: {
  /** > 0 puts a `.` bottom-left; 0 puts `000` there, as on the amount pad. */
  decimals: number;
  onPress: (key: string) => void;
}) {
  const t = useT();
  const keys = keypadKeys(decimals);
  return (
    <View style={{ gap: GAP }}>
      {[0, 1, 2, 3].map((row) => (
        <View key={row} className="flex-row" style={{ gap: GAP }}>
          {keys.slice(row * 3, row * 3 + 3).map((key) => {
            const back = key === 'back';
            const point = key === '.';
            return (
              <BubblePressable
                key={key}
                onPress={() => onPress(key)}
                radius={radius.row}
                accessibilityRole="button"
                accessibilityLabel={
                  back ? t('Delete the last digit') : point ? t('Decimal point') : key
                }
                style={(state) => [
                  pressedStyle(state),
                  {
                    flex: 1,
                    height: KEY_HEIGHT,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: radius.row,
                    borderWidth: 1,
                    borderColor: point ? glass.greenEdge : glass.raisedEdge,
                    backgroundColor: state.pressed
                      ? tint(0.18)
                      : point
                        ? glass.green
                        : glass.raised,
                  },
                ]}
              >
                {back ? (
                  <MaterialSymbol name="backspace" size={22} color={palette.inkMuted} />
                ) : (
                  <Text
                    maxFontSizeMultiplier={1.3}
                    style={{ fontSize: 22 }}
                    className={`font-medium tabular-nums ${point ? 'text-acc' : 'text-ink'}`}
                  >
                    {key}
                  </Text>
                )}
              </BubblePressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
