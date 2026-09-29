/**
 * MaterialSymbol — one Material Symbols Rounded glyph, outline or filled.
 *
 * `Icon` stays the app's stroke set (✓, +, chevrons, the corner destinations),
 * because its per-glyph stroke weights are a decision about marks of commitment.
 * This is the other vocabulary the Momentum redesign brought: the four section
 * glyphs of the nav bar and the Home tiles, the Home button, the launch morph.
 * Those are SHAPES rather than strokes — the active nav slot is the same glyph
 * filled in — so they come from the symbol set rather than being redrawn here.
 */

import { memo } from 'react';
import Svg, { Path } from 'react-native-svg';

import { SYMBOL_PATHS, type SymbolName } from './symbolPaths';

export type { SymbolName } from './symbolPaths';

/* Memoised: primitive props only, and the nav bar and tiles that draw it
   re-render far more often than the glyph changes. */
export const MaterialSymbol = memo(function MaterialSymbol({
  name,
  size,
  color,
  filled = false,
}: {
  name: SymbolName;
  size: number;
  color: string;
  filled?: boolean;
}) {
  const paths = SYMBOL_PATHS[name];
  return (
    <Svg width={size} height={size} viewBox="0 -960 960 960">
      <Path d={filled ? paths.fill : paths.outline} fill={color} />
    </Svg>
  );
});
