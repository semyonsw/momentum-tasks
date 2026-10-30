/**
 * CategoryEditorSheet — a glyph and a name, and nothing else.
 *
 *   ╭────────────────────────────────────────────╮
 *   │ New category                               │
 *   │ ┌────┐ ┌───────────────────────────────┐   │
 *   │ │ 🚌 │ │ Transport                     │   │
 *   │ └────┘ └───────────────────────────────┘   │
 *   │ ╭────────────── Save ──────────────────╮   │
 *   ╰────────────────────────────────────────────╯
 *
 * The glyph is the ONLY picture in the app, and it is the user's — a keyboard
 * emoji, typed into a one-character field. A shipped icon set would need a
 * picker, a search, and an opinion about what "Charity" looks like; a category
 * is a word the user chose and the glyph is how they find it in a grid of eight
 * at arm's length.
 *
 * There is no colour to pick. Categories are not colour-coded — see
 * `tailwind.config.js` — so the glyph is doing the work a colour chip would do
 * in another app, which is why it gets a 56-square of its own rather than
 * sitting inside the name field.
 *
 * The money screen's SUBSECTIONS are a glyph and a name too, so they arrive here
 * rather than at a second sheet that would be this one with two words changed.
 * That is why the two fields are announced as `Name` and `Glyph` and not as a
 * category's: the title says which thing is being named.
 *
 * An account's sheet is also that account's OWN surface — there is no account
 * screen — so its danger zone (redesign §6) is handed in as `footer` and drawn
 * last, under Save. A category's own surface is its screen, so its sheet has
 * none.
 */

import { useState, type ReactNode } from 'react';
import { Text, TextInput, View } from 'react-native';

import { useRevealOnFocus } from './KeyboardAware';
import { Sheet, SheetCancel } from './Sheet';
import { FieldWell, PrimaryButton } from './primitives';
import { useT } from '../hooks/useT';
import { lastGlyph } from '../lib/glyph';
import { palette } from '../theme/tokens';

interface CategoryEditorSheetProps {
  title: string;
  name?: string;
  glyph?: string;
  onSave: (name: string, glyph: string) => void;
  onDismiss: () => void;
  /** The last block — an account's `DangerZone`. */
  footer?: ReactNode;
}

export function CategoryEditorSheet({
  title,
  name: initialName = '',
  glyph: initialGlyph = '',
  onSave,
  onDismiss,
  footer,
}: CategoryEditorSheetProps) {
  const t = useT();
  const reveal = useRevealOnFocus();
  const [name, setName] = useState(initialName);
  const [glyph, setGlyph] = useState(initialGlyph);
  const savable = name.trim() !== '';

  return (
    <Sheet title={title} onDismiss={onDismiss}>
      <View className="flex-row">
        <View
          className="h-row w-row items-center justify-center rounded-[18px] border"
          style={{
            backgroundColor: 'rgba(236,241,238,0.04)',
            borderColor: 'rgba(236,241,238,0.10)',
          }}
        >
          <TextInput
            value={glyph}
            onChangeText={(text) => setGlyph(lastGlyph(text))}
            placeholder="🙂"
            placeholderTextColor={palette.inkFaint}
            cursorColor={palette.greenBright}
            selectionColor={palette.greenBright}
            onFocus={reveal}
            accessibilityLabel={t('Glyph')}
            className="w-full text-center text-[22px] text-ink"
          />
        </View>
        <View className="ml-md flex-1">
          <FieldWell
            value={name}
            size="body"
            lit
            placeholder={t('Name')}
            onChangeText={setName}
            autoFocus={initialName === ''}
            accessibilityLabel={t('Name')}
          />
        </View>
      </View>

      {savable ? null : (
        <Text className="mt-sm text-label text-ink-faint">{t('Give it a name.')}</Text>
      )}

      <View className="mt-xl">
        <PrimaryButton
          label={t('Save')}
          onPress={() => {
            if (savable) onSave(name.trim(), glyph.trim());
          }}
        />
        <SheetCancel label={t('Cancel')} onDismiss={onDismiss} />
      </View>
      {footer ? <View className="mt-lg">{footer}</View> : null}
    </Sheet>
  );
}
