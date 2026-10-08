/**
 * The one destructive rule (U19), as something a test can hold.
 *
 *   control                         confirm
 *   ───────────────────────────     ──────────────────────────────────────
 *   Archive this task…   (muted,    CAN'T BE UNDONE            (coral edge,
 *   at the foot of the screen)  →  Archive this task — “Read”?  coral kicker)
 *                                   [ Keep it ]                  filled, safe
 *                                   [ Archive it ]               coral outline
 *
 * The audit that produced it found three treatments for one idea: coral text
 * (`Archive this task`, the Settings reset), a dashed muted box (`Delete this
 * amount`) and a centred muted row (`Delete routine`), and confirms that asked
 * in the gradient (`Archive “Food”?`) beside confirms that asked in coral. The
 * colour said "scary word" on one screen and "last chance" on the next.
 *
 * So: every way INTO a destructive confirm is `DangerFootAction` (or, where it
 * belongs to one item in a list, the same muted text in place), and every
 * confirm that deletes, discards, archives or overwrites is
 * `ConfirmSheet tone="danger"`. Removing a set or an exercise is NOT on this
 * list and stays one tap with an Undo (ROADMAP §8, "Things to KEEP"); so does
 * deleting a past AI chat (U14) — an Undo toast is the better answer whenever
 * the thing can be put back exactly.
 *
 * Why a grep and not a render: the regressions this guards against are a new
 * `<ConfirmSheet` written without `tone`, and a `danger` import on a control.
 * Both are visible in the source and invisible in a snapshot.
 *
 * REJECTED: a `DestructiveConfirm` component with the tone baked in. It would
 * make the rule unbreakable for new code and do nothing about the sixteen call
 * sites — and a second component for one prop is a second thing to keep in
 * step with `ConfirmSheet`.
 */

/** A confirm button whose answer loses something. Both languages' keys are English. */
const DESTRUCTIVE_VERB =
  /\b(delete|remove|discard|archive|reset|replace|import|throw|restart|disconnect|clear|stop)\b/i;

/** True for a confirm label that deletes, discards, archives or overwrites. */
export function isDestructiveLabel(label: string): boolean {
  return DESTRUCTIVE_VERB.test(label);
}

export interface ConfirmUse {
  /** 1-based line of the `<ConfirmSheet`. */
  line: number;
  /** The `confirmLabel` as written — usually `t('Delete it')`. */
  confirmLabel: string;
  tone: 'primary' | 'danger';
}

/**
 * Every `<ConfirmSheet …>` in a source file, with its confirm label and tone.
 *
 * Reads the props up to the element's closing `/>`; a `tone` prop that is not
 * the literal `"danger"` counts as primary, because a computed tone is exactly
 * the thing that drifts.
 */
export function confirmSheetUses(source: string): ConfirmUse[] {
  const uses: ConfirmUse[] = [];
  const opener = /<ConfirmSheet\b/g;
  for (const match of source.matchAll(opener)) {
    const start = match.index ?? 0;
    const end = source.indexOf('/>', start);
    const props = source.slice(start, end === -1 ? undefined : end);
    const label = props.match(/confirmLabel=\{([^}]*)\}/)?.[1] ?? '';
    uses.push({
      line: source.slice(0, start).split('\n').length,
      confirmLabel: label.trim(),
      tone: /\btone="danger"/.test(props) ? 'danger' : 'primary',
    });
  }
  return uses;
}

/** The confirms that lose something but do not say so in coral. */
export function confirmsMissingDanger(source: string): ConfirmUse[] {
  return confirmSheetUses(source).filter(
    (use) => use.tone !== 'danger' && isDestructiveLabel(use.confirmLabel),
  );
}

/**
 * Files allowed to import the `danger` hue: the confirm that wears it, the
 * button it outlines, the token file, and the AI key form's error mark (an
 * error, not a control).
 */
export const DANGER_HUE_ALLOWED: readonly string[] = [
  'components/ConfirmSheet.tsx',
  'components/primitives.tsx',
  'screens/AiSettingsScreen.tsx',
  'theme/tokens.ts',
];

/** True when a source file imports `danger` from the tokens. */
export function importsDangerHue(source: string): boolean {
  for (const match of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*'[^']*theme\/tokens'/g)) {
    if (/(^|[\s,])danger([\s,]|$)/.test(match[1])) return true;
  }
  return false;
}
