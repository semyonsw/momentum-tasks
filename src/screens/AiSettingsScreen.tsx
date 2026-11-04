/**
 * AiSettingsScreen — `Settings → AI assistant`: the key, the model, the test.
 *
 *   SETTINGS
 *   AI assistant
 *   [✦ Connect a Google AI key to use AI in your workouts.]   ← came from a section
 *   [✓ Connected · gemini-3.8-flash · tested 18:44 · 0.8 s   Disconnect]
 *   PROVIDER   [ Google Gemini | OpenAI soon | Claude soon ]
 *   API KEY    [ AIza…                          ✕  Paste ]
 *   MODEL      [ gemini-3.8-flash   Fast · recommended  ⌄ ]
 *   WHAT IT READS
 *                                              ( ✦ Test & connect )
 *
 * ── THE KEY IS TESTED BEFORE IT IS KEPT ────────────────────────────────────
 *
 * What is typed lives in this screen's own state and nowhere else until the
 * test passes; only then does `aiActions.testKey` put it in the keystore. So a
 * mistyped key is never stored, never half-connected, and never in any store a
 * backup could read — and on a failed test the field still holds what was typed,
 * with Google's own reason under it, so fixing one character is one character.
 *
 * ── REACHED FROM A SECTION, IT GOES BACK TO THAT SECTION ───────────────────
 *
 * Tapping the sparkle in Tasks without a key lands here with a line naming
 * Tasks, and the ready screen's button is `Open Tasks AI` — it opens that
 * section's chat, and asks the chip's question if a chip was what was tapped.
 * Connecting a key is a detour on the way to a question, not a destination.
 * Reached from Settings instead, the button opens THIS app's chat — one per
 * app since 3.0.0 (`lib/ai/aiScope.ts`), so there is no other to default to.
 *
 * Only Google is live. OpenAI and Claude are drawn, disabled, with `soon`: the
 * control is where it will be, and a screen that grew a provider row later would
 * be a screen that moved under the user.
 */

import { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { KeyboardAwareScrollView } from '../components/KeyboardAware';
import { AiTestOverlay } from '../components/AiTestOverlay';
import { BubblePressable } from '../components/bubbles';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { CommitMark, FloatingAction, GlassSurface, Lamps } from '../components/glass';
import { Icon } from '../components/Icon';
import { pressedStyle } from '../components/motion';
import { Kicker } from '../components/primitives';
import { ScreenHeader } from '../components/ScreenHeader';
import { Sheet } from '../components/Sheet';
import { useLanguage, useT } from '../hooks/useT';
import { DEFAULT_MODEL, checkKeyShape, maskKey } from '../lib/ai/gemini';
import { getKey } from '../lib/ai/secureKey';
import type { AiSection } from '../lib/ai/aiSchema';
import { aiReadsNote, aiSection } from '../lib/ai/aiScope';
import { APP_VARIANT } from '../lib/appVariant';
import { clipboardAvailable, readClipboard } from '../lib/clipboard';
import { formatClockTime } from '../lib/days';
import { tap } from '../lib/feedback';
import { disconnect, listModels, testKey } from '../state/aiActions';
import { useAi } from '../state/aiStore';
import { danger, glass, glassTier, palette, radius, tint } from '../theme/tokens';

/** How long the testing overlay stays up at the least, so its steps can be read. */
const MIN_TEST_MS = 2500;
/** The pause on the last ✓ before the ready screen replaces it. */
const SETTLE_MS = 450;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const NOTE: Record<AiSection, string> = {
  Workout: 'Connect a Google AI key to use AI in your workouts.',
  Tasks: 'Connect a Google AI key to use AI in your daily tasks.',
  Expenses: 'Connect a Google AI key to use AI in your finances.',
};

const CTA: Record<AiSection, string> = {
  Workout: 'Try it on your workouts',
  Tasks: 'Open the Tasks AI coach',
  Expenses: 'Open the Finance AI coach',
};

export interface AiSettingsScreenProps {
  /** The section whose sparkle or chip brought the user here, if one did. */
  from?: AiSection;
  onBack: () => void;
  /** The ready screen's button: that section's chat, and the question, if any. */
  onOpenChat: (section: AiSection) => void;
}

export function AiSettingsScreen({ from, onBack, onOpenChat }: AiSettingsScreenProps) {
  const t = useT();
  const lang = useLanguage();
  const status = useAi((s) => s.status);
  const model = useAi((s) => s.model);
  const lastError = useAi((s) => s.lastError);
  const lastTestedAt = useAi((s) => s.lastTestedAt);
  const latencyMs = useAi((s) => s.latencyMs);
  const ready = status === 'ready';

  const [keyInput, setKeyInput] = useState('');
  const [error, setError] = useState<string | null>(status === 'error' ? lastError : null);
  const [phase, setPhase] = useState<'form' | 'testing' | 'ready'>('form');
  const [step, setStep] = useState(0);
  const [tested, setTested] = useState<{ masked: string; latencyMs: number | null }>({
    masked: '',
    latencyMs: null,
  });
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [models, setModels] = useState<string[] | null>(null);
  const [pickingModel, setPickingModel] = useState(false);
  const canPaste = clipboardAvailable();

  /* The test outlives nothing: leaving mid-test must not set state on a dead screen. */
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const typed = keyInput.trim();
  const canTest = typed !== '' || ready;

  async function runTest() {
    if (phase !== 'form') return;
    const key = typed !== '' ? typed : ready ? await getKey() : null;
    if (!key) return;
    // A key of the wrong shape never reaches Google, or the overlay.
    const shape = checkKeyShape(key, lang);
    if (shape) {
      setError(shape);
      return;
    }
    tap();
    setError(null);
    setStep(0);
    setTested({ masked: maskKey(key), latencyMs: null });
    setPhase('testing');
    /*
     * What to fall back to when the test fails for a reason that is not the
     * stored key's fault. A NEW key that fails was never stored (`testKey` only
     * stores a pass), so the old one still works; and "offline" says nothing
     * about any key. Turning a working connection off for either would make every
     * chat say "connect a key first" to somebody whose key is fine.
     */
    const wasReady = useAi.getState().status === 'ready';
    const typedNew = typed !== '';
    const verdict = (failed: { error: string; transient?: boolean }) => {
      // Back to exactly what it was — the last verified test still stands.
      if (wasReady && (typedNew || failed.transient)) useAi.setState({ status: 'ready' });
      else useAi.getState().markError(failed.error);
    };
    useAi.getState().markTesting();

    const started = Date.now();
    const result = await testKey(key, (done) => {
      if (alive.current) setStep(done);
    });
    const left = MIN_TEST_MS - (Date.now() - started);
    if (left > 0) await sleep(left);
    if (!alive.current) {
      // Gone mid-test: record the verdict, show nothing.
      if (result.ok) useAi.getState().markReady(result.latencyMs);
      else verdict(result);
      return;
    }

    if (result.ok) {
      setStep(3);
      await sleep(SETTLE_MS);
      useAi.getState().markReady(result.latencyMs);
      if (!alive.current) return;
      setTested({ masked: maskKey(key), latencyMs: result.latencyMs });
      setKeyInput('');
      setPhase('ready');
    } else {
      verdict(result);
      setError(result.error);
      setPhase('form');
    }
  }

  async function paste() {
    const text = await readClipboard();
    if (text && alive.current) {
      setKeyInput(text);
      setError(null);
    }
  }

  function openModels() {
    setPickingModel(true);
    if (models == null && ready) {
      void listModels().then((found) => {
        if (alive.current) setModels(found);
      });
    }
  }

  const testedLine = [
    model,
    lastTestedAt
      ? t('tested {time}', {
          time: formatClockTime(
            new Date(lastTestedAt).getHours(),
            new Date(lastTestedAt).getMinutes(),
          ),
        })
      : null,
    latencyMs != null ? t('{s} s', { s: (latencyMs / 1000).toFixed(1) }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const wellBorder = error
    ? 'rgba(224,115,95,0.55)'
    : typed !== ''
      ? glass.greenEdge
      : glassTier.well.border;

  return (
    <View className="flex-1 bg-bg">
      <StatusBar style="light" />
      <Lamps section="Settings" />
      <ScreenHeader kicker={t('Settings')} onBack={onBack} bordered={false} />

      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="mx-lg mt-xs text-title font-medium text-ink">{t('AI coach')}</Text>

        {from && !ready ? (
          <GlassSurface tier="well" radius={radius.row} flat className="mx-lg mt-lg">
            <View className="flex-row items-center px-lg py-md">
              <Icon name="sparkle" size={16} color={palette.greenBright} />
              <Text className="ml-sm flex-1 text-label text-ink">{t(NOTE[from])}</Text>
            </View>
          </GlassSurface>
        ) : null}

        {ready ? (
          <GlassSurface tier="lit" radius={radius.card} shadow="e1" flat className="mx-lg mt-lg">
            <View className="flex-row items-center p-lg">
              <CommitMark size={36} glyph={17} />
              <View className="ml-md flex-1">
                <Text className="text-body font-medium text-ink">{t('Connected')}</Text>
                <Text
                  numberOfLines={1}
                  style={{ fontFamily: 'monospace' }}
                  className="mt-[2px] text-[12.5px] tabular-nums text-ink-muted"
                >
                  {testedLine}
                </Text>
              </View>
              <BubblePressable
                onPress={() => setConfirmingDisconnect(true)}
                radius="pill"
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('Disconnect')}
                style={(state) => [
                  pressedStyle(state),
                  { height: 44, justifyContent: 'center', paddingLeft: 8 },
                ]}
              >
                {/* Muted, like every way into a destructive confirm (U19); the
                    coral is on the sheet it opens. */}
                <Text className="text-label font-semibold text-ink-muted">
                  {`${t('Disconnect')}…`}
                </Text>
              </BubblePressable>
            </View>
          </GlassSurface>
        ) : null}

        <Kicker className="mx-lg mb-sm mt-xl">{t('Provider')}</Kicker>
        <ProviderControl />

        <Kicker className="mx-lg mb-sm mt-xl">{t('API key')}</Kicker>
        <View
          style={{
            height: 56,
            borderRadius: radius.row,
            borderWidth: 1,
            borderColor: wellBorder,
            backgroundColor: glassTier.well.tint,
          }}
          className="mx-lg flex-row items-center pl-lg pr-sm"
        >
          <TextInput
            value={keyInput}
            onChangeText={(value) => {
              setKeyInput(value);
              setError(null);
            }}
            placeholder={ready ? t('A new key replaces the one in use') : 'AIza…'}
            placeholderTextColor={palette.inkFaint}
            autoCorrect={false}
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            importantForAutofill="no"
            accessibilityLabel={t('API key')}
            style={{
              flex: 1,
              fontFamily: 'monospace',
              fontSize: 14,
              color: palette.ink,
              padding: 0,
            }}
          />
          {keyInput !== '' ? (
            <BubblePressable
              onPress={() => {
                setKeyInput('');
                setError(null);
              }}
              radius="pill"
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={t('Clear the key')}
              style={(state) => [
                pressedStyle(state),
                { height: 36, width: 36, alignItems: 'center', justifyContent: 'center' },
              ]}
            >
              <Icon name="x" size={16} color={palette.inkFaint} />
            </BubblePressable>
          ) : null}
          {canPaste ? (
            <BubblePressable
              onPress={() => void paste()}
              radius="pill"
              accessibilityRole="button"
              accessibilityLabel={t('Paste')}
              style={(state) => [
                pressedStyle(state),
                {
                  height: 34,
                  marginLeft: 4,
                  paddingHorizontal: 14,
                  justifyContent: 'center',
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: glass.greenEdge,
                  backgroundColor: glass.green,
                },
              ]}
            >
              <Text className="text-label font-semibold text-green-bright">{t('Paste')}</Text>
            </BubblePressable>
          ) : null}
        </View>

        {error ? (
          <View className="mx-lg mt-sm flex-row">
            <View style={{ marginTop: 2 }}>
              <Icon name="x" size={14} color={danger} />
            </View>
            <View className="ml-sm flex-1">
              <Text className="text-label font-medium text-ink">{t('That key didn’t work.')}</Text>
              <Text className="mt-[2px] text-label text-ink-muted">{error}</Text>
            </View>
          </View>
        ) : null}

        <Text className="mx-lg mt-sm text-label text-ink-faint">
          {t(
            'Create one in Google AI Studio → Get API key. It is stored on this phone only and sent to nobody but Google.',
          )}
        </Text>

        <Kicker className="mx-lg mb-sm mt-xl">{t('Model')}</Kicker>
        <BubblePressable
          onPress={openModels}
          radius={radius.row}
          accessibilityRole="button"
          accessibilityLabel={`${t('Model')}: ${model}`}
          style={(state) => [
            pressedStyle(state),
            {
              marginHorizontal: 16,
              height: 56,
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 16,
              borderRadius: radius.row,
              borderWidth: 1,
              borderColor: glassTier.card.border,
              backgroundColor: glassTier.card.tint,
            },
          ]}
        >
          <Text
            numberOfLines={1}
            style={{ fontFamily: 'monospace', fontSize: 14 }}
            className="flex-1 text-ink"
          >
            {model}
          </Text>
          {model === DEFAULT_MODEL ? (
            <Text className="mr-sm text-label text-ink-faint">{t('Fast · recommended')}</Text>
          ) : null}
          <Icon name="chevron-down" size={16} color={palette.inkFaint} />
        </BubblePressable>

        <Kicker className="mx-lg mb-sm mt-xl">{t('What it reads')}</Kicker>
        <Text className="mx-lg text-label text-ink-muted">{t(aiReadsNote(APP_VARIANT))}</Text>
      </KeyboardAwareScrollView>

      <FloatingAction
        label={ready && typed === '' ? t('Test again') : t('Test & connect')}
        icon="sparkle"
        asleep={!canTest}
        bottom={28}
        onPress={() => void runTest()}
      />

      {pickingModel ? (
        <Sheet title={t('Model')} onDismiss={() => setPickingModel(false)}>
          {(models && models.length > 0 ? models : [model, DEFAULT_MODEL])
            .filter((id, index, all) => all.indexOf(id) === index)
            .map((id) => (
              <BubblePressable
                key={id}
                onPress={() => {
                  useAi.getState().setModel(id);
                  setPickingModel(false);
                }}
                radius={radius.row}
                accessibilityRole="radio"
                accessibilityState={{ selected: id === model }}
                accessibilityLabel={id}
                style={(state) => [
                  pressedStyle(state),
                  { height: 52, flexDirection: 'row', alignItems: 'center' },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={{ fontFamily: 'monospace', fontSize: 14 }}
                  className={['flex-1', id === model ? 'text-green-bright' : 'text-ink'].join(' ')}
                >
                  {id}
                </Text>
                {id === model ? <Icon name="check" size={16} color={palette.greenBright} /> : null}
              </BubblePressable>
            ))}
          <Text className="mb-sm mt-sm text-label text-ink-faint">
            {ready
              ? models == null
                ? t('Asking Google which models this key can use…')
                : t('Changing the model is tested on your next question.')
              : t('Connect a key to see every model it can use.')}
          </Text>
        </Sheet>
      ) : null}

      {confirmingDisconnect ? (
        <ConfirmSheet
          tone="danger"
          title={t('Disconnect the AI?')}
          body={t(
            'The key is removed from this phone. Your chats stay, and nothing in your log changes.',
          )}
          confirmLabel={t('Disconnect')}
          onConfirm={() => {
            setConfirmingDisconnect(false);
            void disconnect();
          }}
          onCancel={() => setConfirmingDisconnect(false)}
        />
      ) : null}

      {phase !== 'form' ? (
        <AiTestOverlay
          phase={phase}
          step={step}
          maskedKey={tested.masked}
          model={model}
          latencyMs={tested.latencyMs}
          ctaLabel={t(CTA[from ?? aiSection(APP_VARIANT)])}
          onCta={() => onOpenChat(from ?? aiSection(APP_VARIANT))}
          onDismiss={() => setPhase('form')}
        />
      ) : null}
    </View>
  );
}

/**
 * The provider row: Google lit, the other two drawn where they will be.
 *
 * Not `Segmented`: that control's segments are all choosable, and two of these
 * three are not. The lit thumb is the tab bar's recipe.
 */
function ProviderControl() {
  const t = useT();
  const options = [
    { key: 'google', label: t('Google Gemini'), live: true },
    { key: 'openai', label: 'OpenAI', live: false },
    { key: 'claude', label: 'Claude', live: false },
  ];
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t('Provider')}
      style={{ backgroundColor: glass.sunken, borderRadius: radius.pill }}
      className="mx-lg h-hit flex-row items-center border border-hairline p-xs"
    >
      {options.map((option) => (
        <View
          key={option.key}
          accessibilityRole="radio"
          accessibilityState={{ selected: option.live, disabled: !option.live }}
          accessibilityLabel={option.live ? option.label : `${option.label}, ${t('soon')}`}
          style={[
            { flex: option.live ? 1.4 : 1, height: 36, borderRadius: radius.pill },
            option.live
              ? {
                  borderWidth: 1,
                  borderColor: tint(0.28),
                  backgroundColor: tint(0.16),
                }
              : null,
          ]}
          className="flex-row items-center justify-center"
        >
          <Text
            numberOfLines={1}
            className={[
              'text-label',
              option.live ? 'font-semibold text-green-bright' : 'font-medium text-ink-faint',
            ].join(' ')}
          >
            {option.label}
          </Text>
          {option.live ? null : (
            <Text
              style={{ fontSize: 12.5, letterSpacing: 0.9, marginLeft: 4 }}
              className="font-semibold uppercase text-ink-faint"
            >
              {t('soon')}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}
