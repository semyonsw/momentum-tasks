/**
 * Hatch — the 45° stripes a PAUSED day is drawn in (T3), filling its parent.
 *
 * An SVG pattern rather than a stack of rotated Views: one element per cell
 * whatever its size, clipped by the parent's own radius (`overflow: hidden`), and
 * the stripes stay crisp at any density. Rejected: an image asset, which would
 * not follow the token if the hatch's alpha ever changes, and a dashed border,
 * which is already what "missed on purpose" looks like on a single task's grid.
 *
 * Decorative: the cell carrying it says "paused" to a screen reader itself.
 */

import { useId } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';

import { hatch } from '../theme/tokens';

export function Hatch() {
  // One pattern id per instance: ids are document-wide on some renderers.
  const id = `hatch${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      width="100%"
      height="100%"
      accessible={false}
      pointerEvents="none"
    >
      <Defs>
        <Pattern
          id={id}
          patternUnits="userSpaceOnUse"
          width={hatch.pitch}
          height={hatch.pitch}
          patternTransform="rotate(45)"
        >
          <Rect width={hatch.pitch} height={hatch.pitch} fill={hatch.gap} />
          <Rect width={hatch.stripe} height={hatch.pitch} fill={hatch.line} />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}
