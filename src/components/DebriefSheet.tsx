/**
 * DebriefSheet — the few questions after a workout, one at a time.
 *
 *   ╭────────────────────────────────────────────╮
 *   │ AFTER THE WORKOUT · PUSH              ✕    │
 *   │ ▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░   2 of 6        │  ← fills as you go
 *   │                                            │
 *   │ How did the weights feel?                  │  ← slides in from the side
 *   │ ( Too light ) ( A bit light ) (▓Right▓)    │
 *   │ ( A bit heavy ) ( Too heavy )              │
 *   │ + Add a note                               │
 *   │ ╭──────────────── Next ────────────────╮   │
 *   │  ‹ Back                         Later      │
 *   ╰────────────────────────────────────────────╯
 *
 * `lib/debrief.ts` has the argument for why these questions exist and what the
 * assistant does with the answers; this file is only how they are asked.
 *
 * ── ONE QUESTION PER SCREEN ────────────────────────────────────────────────
 *
 * Six questions on one scroll is a form, and a form after a workout is a thing
 * people close. One at a time, with a bar that visibly fills, is a thirty-second
 * conversation — and every step is SAVED as it is left, so walking away halfway
 * keeps what was said and Home offers the rest later.
 *
 * ── NOTHING IS REQUIRED ─────────────────────────────────────────────────────
 *
 * The primary button says `Skip` until something is picked and `Next` after,
 * so moving on without answering is the same tap as moving on with an answer.
 * The note is folded behind `Add a note` on the choice questions: it is there
 * for the detail an option cannot carry ("left knee, only on the way down"), and
 * an open text box under every question would read as homework.
 *
 * ── AND IT ENDS ON THE POINT OF IT ─────────────────────────────────────────
 *
 * The last screen says the answers were kept and what for, with the one button
 * that uses them straight away: ask the assistant about this workout. That is
 * the whole reason the questions were asked, so it is offered while it is fresh.
 * It opens a NEW chat whose first message quotes every answer, the session and
 * the routine's plan (`state/debriefChat.ts`, `debriefChatMessage`).
 *
 * ── IT RIDES THE KEYBOARD, LIKE EVERY SHEET ────────────────────────────────
 *
 * Docked rather than `SheetFrame`'s floating pane, so it does what the frame
 * does by hand (`lib/keyboard.ts` says why the app moves its own surfaces): it
 * rises by what the keyboard covers past the gesture strip, its height is capped
 * to the room left under the status bar, and the question scrolls inside that
 * cap while `Next` stays pinned under it — so an open note leaves the box, and
 * the button that moves on from it, above the keyboard.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Pressable } from './Pressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BubblePressable } from './bubbles';
import { CommitMark, GlassSurface } from './glass';
import { Icon } from './Icon';
import { Pop, pressedStyle } from './motion';
import { useIsOverlay } from './overlay';
import { KeyboardAwareScrollView, RidesKeyboard, useRevealOnFocus } from './KeyboardAware';
import { PrimaryButton } from './primitives';
import { useFollow, useKeyboardOverlap, useRootHeight } from '../hooks/useKeyboard';
import { useMotionScale } from '../hooks/useMotionScale';
import { useT } from '../hooks/useT';
import {
  DEBRIEF_NOTE_MAX,
  answeredCount,
  debriefToOffer,
  isAnswered,
  toggleChoice,
  type DebriefAnswer,
  type DebriefQuestion,
  type WorkoutDebrief,
} from '../lib/debrief';
import { celebrate, commit, tap } from '../lib/feedback';
import { liftedBottom, paneRoom } from '../lib/keyboard';
import { useAi } from '../state/aiStore';
import { startDebriefChat } from '../state/debriefChat';
import { useDebriefs } from '../state/debriefStore';
import { useWorkoutHistory } from '../state/workoutHistoryStore';
import { curve, glass, motion, palette, radius, tint } from '../theme/tokens';

/**
 * The sheet, wherever the app is. Mounted once, beside the shell rather than in
 * it: the shell renders only the top of its stack, and a debrief opened a beat
 * after Save must not vanish because Home replaced the session underneath it.
 */
export function DebriefHost() {
  const debrief = useDebriefs((s) =>
    s.openId ? (s.debriefs.find((d) => d.workoutId === s.openId) ?? null) : null,
  );
  const aiReady = useAi((s) => s.status === 'ready');
  if (!debrief) return null;
  return (
    <DebriefSheet
      key={debrief.workoutId}
      debrief={debrief}
      aiReady={aiReady}
      onAskAi={() => startDebriefChat(debrief.workoutId)}
    />
  );
}

/**
 * Home's reminder of a debrief put off with `Later`: the newest pending one from
 * the last week, one tap to pick it up, ✕ to let it go. Nothing at all when
 * there is none — this card never asks twice about the same workout.
 */
export function DebriefCard() {
  const t = useT();
  const debriefs = useDebriefs((s) => s.debriefs);
  const openId = useDebriefs((s) => s.openId);
  const queuedId = useDebriefs((s) => s.queuedId);
  const workouts = useWorkoutHistory((s) => s.workouts);
  const offer = useMemo(
    () => debriefToOffer(debriefs, new Date(), new Set(workouts.map((w) => w.id))),
    [debriefs, workouts],
  );
  if (!offer || openId || queuedId) return null;

  const answered = answeredCount(offer);
  const title = offer.title
    ? t('How did {routine} go?', { routine: offer.title })
    : t('How did the workout go?');
  const line =
    answered > 0
      ? t('{answered} of {total} answered · pick up where you left off', {
          answered,
          total: offer.questions.length,
        })
      : t('{total} quick questions for the AI coach', { total: offer.questions.length });

  return (
    <GlassSurface tier="lit" radius={radius.card} shadow="e1" flat className="mx-lg mt-lg">
      <View style={{ padding: 16 }} className="flex-row items-center">
        <BubblePressable
          onPress={() => useDebriefs.getState().open(offer.workoutId)}
          radius={radius.row}
          accessibilityRole="button"
          accessibilityLabel={`${title}. ${line}`}
          style={(state) => [
            pressedStyle(state),
            { flex: 1, flexDirection: 'row', alignItems: 'center' },
          ]}
        >
          <View
            style={{
              height: 40,
              width: 40,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: tint(0.18),
              borderWidth: 1,
              borderColor: tint(0.3),
            }}
          >
            <Icon name="edit" size={18} color={palette.greenBright} />
          </View>
          <View className="flex-1 px-md">
            <Text numberOfLines={1} className="text-body font-medium text-ink">
              {title}
            </Text>
            <Text numberOfLines={1} className="mt-[2px] text-label text-ink-faint">
              {line}
            </Text>
          </View>
        </BubblePressable>
        <Pressable
          onPress={() => {
            tap();
            useDebriefs.getState().dismiss(offer.workoutId);
          }}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('Not this time')}
          style={pressedStyle}
        >
          <Icon name="x" size={16} color={palette.inkFaint} />
        </Pressable>
      </View>
    </GlassSurface>
  );
}

interface DebriefSheetProps {
  debrief: WorkoutDebrief;
  /** A key is connected — the last screen offers to ask about this workout. */
  aiReady: boolean;
  /** Start a new chat about this workout — `state/debriefChat.ts`. */
  onAskAi: () => void;
}

/** Air kept between the sheet's top and the status bar while the keyboard is up. */
const TOP_GAP = 8;
/** A scroll clips; the chips' pop and the bubble ring need this much to the side. */
const BLEED = 8;

function DebriefSheet({ debrief, aiReady, onAskAi }: DebriefSheetProps) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const overlap = useKeyboardOverlap();
  const measuredRoot = useRootHeight();
  const rootHeight = measuredRoot > 0 ? measuredRoot : windowHeight;
  /* Its own padding already clears the gesture strip, so only what the keyboard
     covers BEYOND the strip lifts it — the same sum `SheetFrame` does. */
  const raise = liftedBottom(overlap, insets.bottom, 0) - liftedBottom(0, insets.bottom, 0);
  const follow = useFollow(-raise);
  /* Conservative by the strip (the padding under the keyboard is room too), so
     the cap never lets the top reach the status bar. */
  const room = paneRoom(rootHeight, overlap, insets.top, 0, TOP_GAP);
  const scale = useMotionScale();
  const { questions } = debrief;

  /* Opens on the first question nobody has answered yet — a debrief left halfway
     picks up where it was left, not back at the start. */
  const [index, setIndex] = useState(() => {
    const first = questions.findIndex((q) => !isAnswered(debrief.answers[q.id]));
    return first === -1 ? 0 : first;
  });
  const [direction, setDirection] = useState<1 | -1>(1);
  const [answers, setAnswers] = useState<Record<string, DebriefAnswer>>(debrief.answers);
  const [finished, setFinished] = useState(false);

  const question = questions[index];
  const answer = answers[question.id] ?? { choices: [] };
  const last = index === questions.length - 1;
  const answeredHere = isAnswered(answer);

  const save = (next: Record<string, DebriefAnswer>, done: boolean) =>
    useDebriefs.getState().saveAnswers(debrief.workoutId, next, done);

  /** `Later` / ✕ / the back key: keep what was said, and close. */
  const later = () => {
    save(answers, false);
    useDebriefs.getState().close();
  };
  useIsOverlay(finished ? () => useDebriefs.getState().close() : later);

  /* Entrance: the scrim fades, the sheet rises. */
  const enter = useRef(new Animated.Value(scale === 0 ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: motion.sheet * scale,
      easing: curve(motion.ease),
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enter]);

  /* The bar: how far through, filling on the ease curve as each step is left. */
  const fill = useRef(new Animated.Value(index / questions.length)).current;
  useEffect(() => {
    Animated.timing(fill, {
      toValue: finished ? 1 : index / questions.length,
      duration: 420 * scale,
      easing: curve(motion.ease),
      useNativeDriver: false,
    }).start();
  }, [fill, finished, index, questions.length, scale]);
  // Built once: a fresh interpolation node per render (every chip tap, every
  // keystroke in a note) makes each Animated.View re-attach its native graph.
  const rise = useMemo(
    () => Animated.add(enter.interpolate({ inputRange: [0, 1], outputRange: [60, 0] }), follow),
    [enter, follow],
  );
  const fillWidth = useMemo(
    () => fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
    [fill],
  );

  const setAnswer = (next: DebriefAnswer) => setAnswers((all) => ({ ...all, [question.id]: next }));

  const go = (step: 1 | -1) => {
    save(answers, false);
    setDirection(step);
    setIndex((i) => Math.max(0, Math.min(questions.length - 1, i + step)));
  };

  const advance = () => {
    if (!last) {
      if (answeredHere) commit();
      go(1);
      return;
    }
    save(answers, true);
    celebrate();
    setFinished(true);
  };

  return (
    <RidesKeyboard.Provider value>
      <View className="absolute inset-0" accessibilityViewIsModal>
        <Animated.View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: palette.scrim,
            opacity: enter,
          }}
        >
          <Pressable
            style={{ flex: 1 }}
            onPress={finished ? () => useDebriefs.getState().close() : later}
            accessibilityRole="button"
            accessibilityLabel={t('Later')}
          />
        </Animated.View>

        <Animated.View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            maxHeight: Number.isFinite(room) ? room : undefined,
            opacity: enter,
            transform: [{ translateY: rise }],
          }}
        >
          <View
            style={{
              flexShrink: 1,
              paddingBottom: insets.bottom + 16,
              borderTopLeftRadius: radius.sheet,
              borderTopRightRadius: radius.sheet,
            }}
            className="border-t border-t-hairline bg-surface px-lg pt-lg"
          >
            <View className="mb-md h-xs w-[36px] self-center rounded-pill bg-hairline" />

            {/* Kicker, and the ✕ that is `Later`. */}
            <View className="flex-row items-center">
              <Text
                numberOfLines={1}
                style={{ letterSpacing: 1.3 }}
                className="flex-1 text-micro font-semibold uppercase text-green-bright"
              >
                {debrief.title
                  ? `${t('After the workout')} · ${debrief.title}`
                  : t('After the workout')}
              </Text>
              <Pressable
                onPress={finished ? () => useDebriefs.getState().close() : later}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={t('Close')}
                style={pressedStyle}
              >
                <Icon name="x" size={18} color={palette.inkMuted} />
              </Pressable>
            </View>

            {/* The bar. */}
            <View className="mt-md flex-row items-center">
              <View
                className="flex-1 overflow-hidden rounded-pill"
                style={{ height: 6, backgroundColor: palette.greenDim }}
              >
                <Animated.View
                  style={{
                    height: 6,
                    borderRadius: radius.pill,
                    backgroundColor: palette.greenBright,
                    width: fillWidth,
                  }}
                />
              </View>
              <Text
                className="ml-md text-label text-ink-faint"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {finished
                  ? t('Done')
                  : t('{n} of {total}', { n: index + 1, total: questions.length })}
              </Text>
            </View>

            {/* The part that gives way when the keyboard leaves too little room.
              Keyed per step, so every question opens at its own top. `handled`,
              so a chip tapped with the note's keyboard up lands first time. */}
            <KeyboardAwareScrollView
              key={finished ? 'finished' : question.id}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              style={{ flexGrow: 0, flexShrink: 1, marginHorizontal: -BLEED }}
              contentContainerStyle={{ paddingHorizontal: BLEED }}
            >
              {finished ? (
                <Finished
                  aiReady={aiReady}
                  onAsk={() => {
                    useDebriefs.getState().close();
                    onAskAi();
                  }}
                  onClose={() => useDebriefs.getState().close()}
                />
              ) : (
                <QuestionPane
                  question={question}
                  answer={answer}
                  direction={direction}
                  onChange={setAnswer}
                />
              )}
            </KeyboardAwareScrollView>

            {finished ? null : (
              <>
                <View className="mt-xl">
                  <PrimaryButton
                    label={last ? t('Save answers') : answeredHere ? t('Next') : t('Skip')}
                    variant={answeredHere || last ? 'primary' : 'ghost'}
                    onPress={advance}
                  />
                </View>
                <View className="mt-xs flex-row items-center justify-between">
                  {index > 0 ? (
                    <Pressable
                      onPress={() => {
                        tap();
                        go(-1);
                      }}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={t('Back')}
                      style={pressedStyle}
                      className="h-[44px] flex-row items-center"
                    >
                      <Icon name="chevron-left" size={14} color={palette.inkMuted} />
                      <Text className="ml-xs text-label font-medium text-ink-muted">
                        {t('Back')}
                      </Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={() => {
                        tap();
                        useDebriefs.getState().dismiss(debrief.workoutId);
                      }}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={t('Not this time')}
                      style={pressedStyle}
                      className="h-[44px] justify-center"
                    >
                      <Text className="text-label font-medium text-ink-muted">
                        {t('Not this time')}
                      </Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => {
                      tap();
                      later();
                    }}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={t('Later')}
                    style={pressedStyle}
                    className="h-[44px] justify-center"
                  >
                    <Text className="text-label font-medium text-ink-muted">{t('Later')}</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </Animated.View>
      </View>
    </RidesKeyboard.Provider>
  );
}

/* ------------------------------------------------------------------ */

/** One question: its prompt, its chips, and its note. Slides in on mount. */
function QuestionPane({
  question,
  answer,
  direction,
  onChange,
}: {
  question: DebriefQuestion;
  answer: DebriefAnswer;
  direction: 1 | -1;
  onChange: (answer: DebriefAnswer) => void;
}) {
  const t = useT();
  const scale = useMotionScale();
  const reveal = useRevealOnFocus();
  const [noteTapped, setNoteTapped] = useState(false);
  const [noteOpen, setNoteOpen] = useState(
    question.kind === 'text' || (answer.note ?? '').trim() !== '',
  );

  const slide = useRef(new Animated.Value(scale === 0 ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(slide, {
      toValue: 1,
      duration: 300 * scale,
      easing: curve(motion.ease),
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide]);
  const translateX = useMemo(
    () => slide.interpolate({ inputRange: [0, 1], outputRange: [28 * direction, 0] }),
    [direction, slide],
  );

  return (
    <Animated.View style={{ opacity: slide, transform: [{ translateX }] }}>
      <Text className="mt-xl text-title font-medium text-ink">{t(question.prompt)}</Text>
      {question.kind === 'multi' ? (
        <Text className="mt-xs text-label text-ink-faint">{t('Pick all that apply')}</Text>
      ) : null}

      {question.options.length > 0 ? (
        <View className="mt-lg flex-row flex-wrap" style={{ gap: 8 }}>
          {question.options.map((option) => (
            <Choice
              key={option.id}
              label={option.literal ? option.label : t(option.label)}
              selected={answer.choices.includes(option.id)}
              onPress={() =>
                onChange({ ...answer, choices: toggleChoice(question, answer.choices, option.id) })
              }
            />
          ))}
        </View>
      ) : null}

      {noteOpen ? (
        <View
          className="mt-lg rounded-surface border border-hairline bg-surface-alt px-lg"
          style={{ minHeight: question.kind === 'text' ? 104 : 56, paddingVertical: 10 }}
        >
          <TextInput
            value={answer.note ?? ''}
            onChangeText={(note) => onChange({ ...answer, note })}
            placeholder={
              question.kind === 'text'
                ? t('Sleep, stress, what worked, what did not…')
                : t('Add a detail (optional)')
            }
            placeholderTextColor={palette.inkFaint}
            cursorColor={palette.greenBright}
            selectionColor={palette.greenBright}
            multiline
            maxLength={DEBRIEF_NOTE_MAX}
            // Only when the user just asked for the field — never on arrival.
            autoFocus={noteTapped}
            onFocus={reveal}
            accessibilityLabel={t('Note')}
            className="text-body text-ink"
            style={{ textAlignVertical: 'top' }}
          />
        </View>
      ) : (
        <Pressable
          onPress={() => {
            tap();
            setNoteTapped(true);
            setNoteOpen(true);
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('Add a note')}
          style={pressedStyle}
          className="mt-lg h-[36px] flex-row items-center self-start"
        >
          <Icon name="plus" size={14} color={palette.greenBright} />
          <Text className="ml-xs text-label font-medium text-green-bright">{t('Add a note')}</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

/**
 * A choice chip: glass when idle, the commit green when picked, and a small pop
 * as it is picked — the thumb sees the tap land, not just the colour change.
 */
function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const scale = useMotionScale();
  const bump = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!selected || scale === 0) return;
    bump.setValue(0.9);
    Animated.timing(bump, {
      toValue: 1,
      duration: 280,
      easing: curve(motion.pop),
      useNativeDriver: true,
    }).start();
  }, [bump, scale, selected]);

  return (
    <Animated.View style={{ transform: [{ scale: bump }] }}>
      <BubblePressable
        onPress={onPress}
        radius="pill"
        bubbleColor={selected ? palette.ink : palette.greenBright}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={label}
        style={(state) => [
          pressedStyle(state),
          {
            height: 40,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: selected ? tint(0.6) : palette.hairline,
            backgroundColor: selected ? palette.green : glass.sunken,
          },
        ]}
      >
        {selected ? (
          <View style={{ marginRight: 6 }}>
            <Icon name="check" size={13} color={palette.onAcc} />
          </View>
        ) : null}
        <Text
          numberOfLines={1}
          className={
            selected
              ? 'text-label font-semibold text-on-acc'
              : 'text-label font-medium text-ink-muted'
          }
        >
          {label}
        </Text>
      </BubblePressable>
    </Animated.View>
  );
}

/** The last screen: kept, what for, and the button that uses it now. */
function Finished({
  aiReady,
  onAsk,
  onClose,
}: {
  aiReady: boolean;
  onAsk: () => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <View className="items-center pt-xl">
      <Pop duration={420}>
        <CommitMark size={72} glyph={32} />
      </Pop>
      <Text className="mt-lg text-title font-medium text-ink">{t('Thanks — noted')}</Text>
      <Text className="mt-sm text-center text-body text-ink-muted">
        {t('The AI coach reads these answers whenever you ask about your training or a routine.')}
      </Text>
      <View className="mt-xl w-full">
        {aiReady ? (
          <>
            <PrimaryButton label={t('Ask the AI coach about it')} onPress={onAsk} />
            <View className="h-sm" />
            <PrimaryButton label={t('Close')} variant="ghost" onPress={onClose} />
          </>
        ) : (
          <PrimaryButton label={t('Close')} onPress={onClose} />
        )}
      </View>
    </View>
  );
}
