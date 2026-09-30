/**
 * ColorPickerSheet — one of Custom's three colours, chosen inside the app.
 *
 *   ╭────────────────────────────────────────────╮
 *   │ Colour 2                                   │
 *   │ ┌──────┐ ┌──────────────────────────────┐  │  ← the colour, and the theme
 *   │ │  ●   │ │ c1 ─────── NEW ─────── c3    │  │    it would make
 *   │ └──────┘ └──────────────────────────────┘  │
 *   │ ● ● ● ● ● ● ● ● ● ● ● ●                    │  ← twelve hues
 *   │ ■ ■ ■ ■ ■ ■                                │  ← tones of the chosen one
 *   │ ■ ■ ■ ■ ■ ■                                │
 *   │ # [3DDC84 ]                                │  ← or type it
 *   │ (            ✓ Done             )          │
 *   ╰────────────────────────────────────────────╯
 *
 * ── WHY IN-APP ────────────────────────────────────────────────────────────
 *
 * The prototype opens the browser's colour input; Android has no system colour
 * picker to hand the job to, and a native module for one is a dependency for a
 * setting touched twice a year. The arithmetic is `lib/colorPicker.ts`, and why
 * it is swatches rather than a wheel is written there.
 *
 * ── NOTHING IS WRITTEN UNTIL DONE ─────────────────────────────────────────
 *
 * Changing the theme remounts the whole app tree — that is how every token
 * reading a colour during render picks up the new one. A picker that wrote on
 * every tap would remount the app (and close itself) under the user's thumb on
 * the first swatch. So the choice lives in this sheet's state, the preview shows
 * what it WOULD look like, and only `Done` hands it to the caller. The scrim and
 * back are the non-committal answer, as on every sheet.
 */

import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Sheet } from './Sheet';
import { BubblePressable } from './bubbles';
import { SpecularEdge } from './glass';
import { Icon } from './Icon';
import { pressedStyle } from './motion';
import { useT } from '../hooks/useT';
import { tap } from '../lib/feedback';
import {
  PICKER_HUES,
  hslToHex,
  nearestHueIndex,
  parseTypedHex,
  toneGrid,
} from '../lib/colorPicker';
import { deriveTheme, type ThemeColors } from '../lib/theme';
import { gradientFill, palette, radius, specularHeavy } from '../theme/tokens';

export function ColorPickerSheet({
  index,
  colors,
  onDone,
  onDismiss,
}: {
  /** Which of the three stops is being chosen. */
  index: 0 | 1 | 2;
  /** Custom's three colours as they are now; `colors[index]` is the start. */
  colors: ThemeColors;
  /** Called once, with the chosen `#RRGGBB`. The caller writes the setting. */
  onDone: (hex: string) => void;
  onDismiss: () => void;
}) {
  const t = useT();
  const [hex, setHex] = useState(colors[index]);
  const [hue, setHue] = useState(() => nearestHueIndex(colors[index]));
  const [typed, setTyped] = useState(colors[index].slice(1));
  const grid = useMemo(() => toneGrid(PICKER_HUES[hue]), [hue]);

  const choose = (next: string) => {
    tap();
    setHex(next);
    setTyped(next.slice(1));
  };

  /* The theme the choice would make, so the preview answers the real question. */
  const stops = colors.map((c, i) => (i === index ? hex : c)) as unknown as ThemeColors;
  const preview = deriveTheme(stops);

  return (
    <Sheet title={t('Colour {n}', { n: index + 1 })} onDismiss={onDismiss}>
      {/* THE PREVIEW: the colour alone, and the three-stop bar it would sit in. */}
      <View className="flex-row" style={{ gap: 10 }}>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 20,
            backgroundColor: hex,
            borderWidth: 2,
            borderColor: 'rgba(236,241,238,0.22)',
          }}
        />
        <View style={{ flex: 1, height: 72, borderRadius: 20, overflow: 'hidden' }}>
          <LinearGradient
            colors={[preview.c1, preview.c2, preview.c3]}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{
              flex: 1,
              paddingHorizontal: 14,
              justifyContent: 'center',
            }}
          >
            <Text
              allowFontScaling={false}
              style={{ fontFamily: 'monospace', fontSize: 13, color: preview.onAcc }}
            >
              {hex}
            </Text>
          </LinearGradient>
        </View>
      </View>

      {/* THE HUE STRIP. Each dot is its hue at full strength. */}
      <View className="mt-lg flex-row justify-between">
        {PICKER_HUES.map((h, i) => {
          const selected = i === hue;
          const fill = hslToHex(h, 100, 50);
          return (
            <Pressable
              key={h}
              onPress={() => {
                tap();
                setHue(i);
              }}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${t('Hue')} ${h}°`}
              style={{
                width: 24,
                height: 24,
                borderRadius: radius.pill,
                backgroundColor: fill,
                borderWidth: selected ? 2 : 0,
                borderColor: palette.ink,
                transform: [{ scale: selected ? 1.15 : 1 }],
              }}
            />
          );
        })}
      </View>

      {/* THE TONES of that hue: saturation down, lightness across. */}
      <View className="mt-md" style={{ gap: 6 }}>
        {grid.map((row, r) => (
          <View key={r} className="flex-row" style={{ gap: 6 }}>
            {row.map((swatch) => {
              const selected = swatch === hex;
              return (
                <Pressable
                  key={swatch}
                  onPress={() => choose(swatch)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={swatch}
                  style={{
                    flex: 1,
                    height: 34,
                    borderRadius: 10,
                    backgroundColor: swatch,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: selected ? 2 : 0,
                    borderColor: palette.ink,
                  }}
                >
                  {selected ? (
                    <Icon
                      name="check"
                      size={14}
                      color={deriveTheme([swatch, swatch, swatch]).onAcc}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      {/* OR TYPE IT. Applied the moment it is six digits; a half-typed value
          leaves the last good colour standing. */}
      <View
        className="mt-md flex-row items-center"
        style={{
          height: 52,
          paddingHorizontal: 16,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: 'rgba(236,241,238,0.08)',
          backgroundColor: 'rgba(236,241,238,0.04)',
        }}
      >
        <Text
          allowFontScaling={false}
          style={{ fontFamily: 'monospace', fontSize: 16, color: palette.inkFaint }}
        >
          #
        </Text>
        <TextInput
          value={typed}
          onChangeText={(value) => {
            const clean = value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
            setTyped(clean.toUpperCase());
            const parsed = parseTypedHex(clean);
            if (parsed) {
              setHex(parsed);
              setHue(nearestHueIndex(parsed));
            }
          }}
          maxLength={6}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          importantForAutofill="no"
          accessibilityLabel={t('Hex colour')}
          placeholder="3DDC84"
          placeholderTextColor={palette.inkFaint}
          style={{
            flex: 1,
            marginLeft: 4,
            padding: 0,
            fontFamily: 'monospace',
            fontSize: 16,
            color: palette.ink,
          }}
        />
        <View style={{ width: 22, height: 22, borderRadius: 7, backgroundColor: hex }} />
      </View>

      {/* DONE — the only thing in this sheet that writes anything. */}
      <View className="mt-lg" style={{ borderRadius: radius.pill }}>
        <BubblePressable
          onPress={() => onDone(hex)}
          radius="pill"
          bubbleColor={palette.ink}
          accessibilityRole="button"
          accessibilityLabel={t('Apply')}
          style={(state) => [
            pressedStyle(state),
            {
              height: 56,
              borderRadius: radius.pill,
              overflow: 'hidden',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
            },
          ]}
        >
          <LinearGradient
            {...gradientFill()}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
          <SpecularEdge color={specularHeavy} radius={radius.pill} height={2} />
          <Icon name="check" size={16} color={palette.onAcc} />
          <Text
            numberOfLines={1}
            allowFontScaling={false}
            style={{ marginLeft: 8, color: palette.onAcc }}
            className="text-body font-semibold"
          >
            {t('Apply')}
          </Text>
        </BubblePressable>
      </View>
    </Sheet>
  );
}
