/**
 * AiChatScreen — one section's conversation with the assistant.
 *
 *   ‹  AI · WORKOUT                                  +
 *      Gemini · reads your training log on this phone
 *   ─────────────────────────────────────────────────
 *                          Summarize my last 4 weeks ▸
 *   GEMINI
 *   [ LAST 4 WEEKS · 11 WORKOUTS  214 sets · 38.4 t … ]
 *   ─────────────────────────────────────────────────
 *   [Last 4 weeks] [Squat trend] [Suggest a routine] →
 *   ( Ask about your workouts…                    ➤ )
 *
 * ── ONE CHAT PER SECTION, AND IT SAYS WHICH ────────────────────────────────
 *
 * Three chats rather than one, because each is about a different log and the
 * context sent with a question is that log alone. The kicker names the section
 * and the line under it names what is read, so there is never a question about
 * what the assistant can see: the training log, the task answers, or the amounts.
 *
 * ── THE SCREEN IS COMPOSITION ──────────────────────────────────────────────
 *
 * Every decision is elsewhere: what is sent and what the answer means is
 * `state/aiActions.ts` over `lib/ai/`, and how a block is drawn is
 * `components/AiBlocks.tsx`. This file lays them out, keeps the list scrolled to
 * the newest message, and owns one piece of state — the draft in the composer.
 *
 * A proposal's `Add to routines` goes to the shell rather than straight to the
 * store, because the toast that says what happened — with its Undo — has to be
 * raised by something that outlives this screen. Deleting a past chat raises
 * the same toast (`onToast`): the ✕ acts at once and Undo puts the chat back
 * where it was, messages and suggestions and all (U14).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Keyboard, ScrollView, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SparkleCircle } from '../components/AiEntryCard';
import { ErrorAnswer, SummaryCard, TextAnswer, Typing, UserBubble } from '../components/AiBlocks';
import { AiProposalCard } from '../components/AiProposalCard';
import { AiSequenceCard } from '../components/AiSequenceCard';
import { BubblePressable } from '../components/bubbles';
import { Sheet } from '../components/Sheet';
import { GlassBar, GlassSurface, Lamps, type ToastAction } from '../components/glass';
import { Icon } from '../components/Icon';
import { Stagger, pressedStyle } from '../components/motion';
import { useAiPrompts } from '../hooks/useAiPrompts';
import { useLanguage, usePlural, useT } from '../hooks/useT';
import { dayKey, formatShortDay } from '../lib/days';
import type { AiSection } from '../lib/ai/aiSchema';
import { tap } from '../lib/feedback';
import { discardSequence, sectionContext, sendMessage } from '../state/aiActions';
import { useAi, type AiMessage } from '../state/aiStore';
import { glassTier, gradientFill, motion, palette, radius } from '../theme/tokens';

/** The composer's line, and how many lines it shows before it scrolls inside. */
const COMPOSER_LINE = 22;
const COMPOSER_MAX_LINES = 4;

const META: Record<
  AiSection,
  { kicker: string; line: string; title: string; body: string; placeholder: string }
> = {
  Workout: {
    kicker: 'AI · Workout',
    line: 'Gemini · reads your training log on this phone',
    title: 'Ask about your training',
    body: 'Answers come from your own log on this phone. Suggested routines and edits wait for your OK before anything changes.',
    placeholder: 'Ask about your workouts…',
  },
  Tasks: {
    kicker: 'AI · Daily tasks',
    line: 'Gemini · reads your task answers on this phone',
    title: 'Ask about your habits',
    body: 'Reads your daily tasks and how each day was answered, including the days you excused on purpose.',
    placeholder: 'Ask about your tasks…',
  },
  Expenses: {
    kicker: 'AI · Expenses',
    line: 'Gemini · reads your amounts on this phone',
    title: 'Ask about your money',
    body: 'Reads your amounts by day and month, with categories. Whole-month amounts like rent are counted per month, never per day.',
    placeholder: 'Ask about your expenses…',
  },
};

export interface AiChatScreenProps {
  section: AiSection;
  /** A question to ask on arrival — the chip that opened this chat. */
  prompt?: string;
  /** Called once the arrival question has been sent, so it is not sent again. */
  onPromptSent: () => void;
  onBack: () => void;
  onReview: (proposalId: string) => void;
  onAccept: (proposalId: string) => void;
  /** `Apply loop` on a suggested training loop — the shell shows the Undo. */
  onApplySequence: (messageId: string) => void;
  /** The shell's toast, which outlives this screen — the past-chat delete's Undo. */
  onToast: (text: string, action?: ToastAction) => void;
}

export function AiChatScreen({
  section,
  prompt,
  onPromptSent,
  onBack,
  onReview,
  onAccept,
  onApplySequence,
  onToast,
}: AiChatScreenProps) {
  const t = useT();
  const lang = useLanguage();
  const plural = usePlural();
  const insets = useSafeAreaInsets();
  const meta = META[section];
  const messages = useAi((s) => s.chats[section]);
  const proposals = useAi((s) => s.proposals);
  const pending = useAi((s) => s.pending[section]);
  const retrying = useAi((s) => s.retrying[section]);
  const prompts = useAiPrompts(section);
  /* Filled in by the composer, which owns the draft — see `Composer`. */
  const clearDraft = useRef<() => void>(() => undefined);
  const [showingHistory, setShowingHistory] = useState(false);
  const archived = useAi((s) => s.archive[section]);
  const scrollRef = useRef<ScrollView>(null);

  /* The arrival question, exactly once. */
  const sent = useRef(false);
  useEffect(() => {
    if (!prompt || sent.current) return;
    sent.current = true;
    void sendMessage(section, prompt);
    onPromptSent();
  }, [onPromptSent, prompt, section]);

  /* How much is being read, counted once per question rather than per render. */
  const reading = useMemo(() => {
    if (!pending) return '';
    const count = sectionContext(section).count;
    if (section === 'Workout') {
      return t('Reading {count} {noun}…', {
        count,
        noun: plural(count, { one: t('workout'), few: 'тренировки', many: t('workouts') }),
      });
    }
    if (section === 'Tasks') {
      return t('Reading {count} {noun} of tasks…', {
        count,
        noun: plural(count, { one: t('day'), few: 'дня', many: t('days') }),
      });
    }
    return t('Reading {count} {noun} of amounts…', {
      count,
      noun: plural(count, { one: t('month'), few: 'месяца', many: t('months') }),
    });
  }, [pending, plural, section, t]);

  const ask = (text: string) => {
    const question = text.trim();
    if (!question || pending) return;
    tap();
    clearDraft.current();
    void sendMessage(section, question);
  };

  /*
   * `+` files the chat in the history and opens an empty one. It used to delete
   * it — with a confirm, for a suggestion not yet added — and a chat now lives on
   * in the history with its suggestion still there to add, so there is nothing
   * left to confirm.
   */
  const startNew = () => useAi.getState().clearChat(section);

  /** The pill's resting height — one line. It grows to four (`Composer`). */
  const composerHeight = 60;
  /** What the pill measures now, so the thread clears a grown composer too. */
  const [composerDrawn, setComposerDrawn] = useState(composerHeight);
  /** From the composer's foot to the screen's — see the note on the field. */
  const keyboardReach = insets.bottom + 12 + 8;

  /* The keyboard opening is the moment the newest answer must be in view. */
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () =>
      scrollRef.current?.scrollToEnd({ animated: true }),
    );
    return () => sub.remove();
  }, []);
  const chipsHeight = messages.length > 0 ? 44 : 0;

  return (
    <View className="flex-1 bg-bg">
      <StatusBar style="light" />
      <Lamps section={section} />

      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}>
        <GlassBar>
          <View style={{ paddingTop: insets.top }} className="pb-sm pl-sm pr-md">
            <View className="h-[56px] flex-row items-center">
              <RoundButton icon="chevron-left" label={t('Back')} onPress={onBack} />
              <View className="flex-1 px-sm">
                <Text
                  numberOfLines={1}
                  style={{ letterSpacing: 1.3 }}
                  className="text-micro font-semibold uppercase text-green-bright"
                >
                  {t(meta.kicker)}
                </Text>
                <Text numberOfLines={1} className="mt-[2px] text-label text-ink-muted">
                  {t(meta.line)}
                </Text>
              </View>
              {/* Not while an answer is on its way: it would arrive into the new,
                  empty chat with no question above it. */}
              {archived.length > 0 && !pending ? (
                <View className="mr-sm">
                  <RoundButton
                    icon="history"
                    label={t('Past chats')}
                    onPress={() => setShowingHistory(true)}
                  />
                </View>
              ) : null}
              {messages.length > 0 && !pending ? (
                <RoundButton icon="plus" label={t('Start a new chat')} onPress={startNew} />
              ) : null}
            </View>
          </View>
        </GlassBar>
      </View>

      <ScrollView
        ref={scrollRef}
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        contentContainerStyle={{
          paddingTop: insets.top + 64 + 16,
          paddingBottom: insets.bottom + composerDrawn + chipsHeight + 36,
          paddingHorizontal: 16,
          gap: 14,
        }}
      >
        {messages.length === 0 && !pending ? (
          <EmptyChat
            title={t(meta.title)}
            body={t(meta.body)}
            prompts={prompts.map((p) => ({ key: p.key, label: p.label, hint: p.hint }))}
            onAsk={ask}
          />
        ) : null}

        {messages.map((message, index) => (
          <Stagger key={message.id} duration={motion.enter}>
            <Message
              message={message}
              proposals={proposals}
              // Only the LAST error retries: an older one's question has later
              // turns after it, and its answer would land at the bottom with no
              // question beside it.
              onRetry={
                index === messages.length - 1
                  ? (m) => void sendMessage(section, m.retry, m.id)
                  : undefined
              }
              onReview={onReview}
              onAccept={onAccept}
              onApplySequence={() => onApplySequence(message.id)}
              onDiscardSequence={() => discardSequence(section, message.id)}
            />
          </Stagger>
        ))}

        {pending ? (
          <Typing caption={retrying ? t('Google is busy — asking again…') : reading} />
        ) : null}
      </ScrollView>

      <View
        style={{ position: 'absolute', left: 12, right: 12, bottom: insets.bottom + 12 }}
        pointerEvents="box-none"
      >
        {messages.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: 8, paddingBottom: 10 }}
          >
            {prompts.map((p) => (
              <BubblePressable
                key={p.key}
                onPress={() => ask(p.label)}
                radius="pill"
                accessibilityRole="button"
                accessibilityLabel={p.label}
                style={(state) => [
                  pressedStyle(state),
                  {
                    height: 32,
                    justifyContent: 'center',
                    paddingHorizontal: 12,
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: glassTier.bar.border,
                    backgroundColor: glassTier.bar.tint,
                  },
                ]}
              >
                <Text numberOfLines={1} className="text-label text-ink-muted">
                  {p.chip}
                </Text>
              </BubblePressable>
            ))}
          </ScrollView>
        ) : null}

        <Composer
          placeholder={t(meta.placeholder)}
          pending={pending}
          height={composerHeight}
          keyboardReach={keyboardReach}
          onHeight={setComposerDrawn}
          onAsk={ask}
          clearRef={clearDraft}
        />
      </View>

      {showingHistory ? (
        <Sheet title={t('Past chats')} onDismiss={() => setShowingHistory(false)}>
          {archived.length === 0 ? (
            <Text className="text-body text-ink-muted">{t('No past chats yet.')}</Text>
          ) : null}
          {archived.map((chat, index) => (
            <View
              key={chat.id}
              className={`flex-row items-center ${index > 0 ? 'border-t border-t-hairline' : ''}`}
              style={{ minHeight: 60 }}
            >
              <BubblePressable
                onPress={() => {
                  useAi.getState().openArchived(section, chat.id);
                  setShowingHistory(false);
                }}
                radius={radius.row}
                accessibilityRole="button"
                accessibilityLabel={chat.title}
                style={(state) => [pressedStyle(state), { flex: 1, paddingVertical: 10 }]}
              >
                <Text numberOfLines={1} className="text-body text-ink">
                  {chat.title}
                </Text>
                <Text className="mt-[2px] text-label text-ink-faint">
                  {`${formatShortDay(dayKey(chat.updatedAt), lang)} · ${t('{count} messages', {
                    count: chat.messages.length,
                  })}`}
                </Text>
              </BubblePressable>
              <BubblePressable
                onPress={() => {
                  // One tap, and the Undo puts it back exactly (U14) — see
                  // `lib/ai/chatArchive.ts` for why not a confirm.
                  const deleted = useAi.getState().deleteArchived(section, chat.id);
                  if (!deleted) return;
                  onToast(t('Chat deleted'), {
                    label: t('Undo'),
                    onPress: () => useAi.getState().restoreArchived(deleted),
                  });
                }}
                hitSlop={10}
                radius="pill"
                accessibilityRole="button"
                accessibilityLabel={t('Delete chat')}
                style={(state) => [pressedStyle(state), { padding: 10 }]}
              >
                <Icon name="x" size={16} color={palette.inkFaint} />
              </BubblePressable>
            </View>
          ))}
          <Text className="mt-md text-label text-ink-faint">
            {t(
              'Past chats are kept on this phone and in your backups. Opening one puts the chat you have open now into this list.',
            )}
          </Text>
        </Sheet>
      ) : null}
    </View>
  );
}

function Message({
  message,
  proposals,
  onRetry,
  onReview,
  onAccept,
  onApplySequence,
  onDiscardSequence,
}: {
  message: AiMessage;
  proposals: ReturnType<typeof useAi.getState>['proposals'];
  onRetry?: (message: Extract<AiMessage, { role: 'error' }>) => void;
  onReview: (proposalId: string) => void;
  onAccept: (proposalId: string) => void;
  onApplySequence: () => void;
  onDiscardSequence: () => void;
}) {
  if (message.role === 'user') return <UserBubble text={message.text} />;
  if (message.role === 'error') {
    return (
      <ErrorAnswer
        text={message.text}
        onRetry={message.retry && onRetry ? () => onRetry(message) : undefined}
      />
    );
  }
  return (
    <View style={{ gap: 12 }}>
      {message.blocks.map((block, index) => {
        if (block.type === 'text') return <TextAnswer key={index} text={block.text} />;
        if (block.type === 'summary') return <SummaryCard key={index} block={block} />;
        if (block.type === 'sequence') {
          return (
            <AiSequenceCard
              key={index}
              block={block}
              onApply={onApplySequence}
              onDiscard={onDiscardSequence}
            />
          );
        }
        const stored = proposals[block.proposalId];
        if (!stored) return null;
        return (
          <AiProposalCard
            key={block.proposalId}
            stored={stored}
            onReview={() => onReview(block.proposalId)}
            onAccept={() => onAccept(block.proposalId)}
          />
        );
      })}
    </View>
  );
}

function EmptyChat({
  title,
  body,
  prompts,
  onAsk,
}: {
  title: string;
  body: string;
  prompts: { key: string; label: string; hint: string }[];
  onAsk: (text: string) => void;
}) {
  return (
    <View className="pt-xl">
      <SparkleCircle size={56} />
      <Text
        style={{ fontSize: 30, lineHeight: 34, letterSpacing: -0.9 }}
        className="mt-lg font-semibold text-ink"
      >
        {title}
      </Text>
      <Text className="mt-sm text-body text-ink-muted">{body}</Text>
      <View className="mt-xl" style={{ gap: 8 }}>
        {prompts.map((prompt) => (
          <GlassSurface key={prompt.key} tier="card" radius={radius.row} shadow="e1" flat>
            <BubblePressable
              onPress={() => onAsk(prompt.label)}
              radius={radius.row}
              accessibilityRole="button"
              accessibilityLabel={prompt.label}
              style={(state) => [
                pressedStyle(state),
                { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
              ]}
            >
              <Text numberOfLines={1} className="flex-1 text-body text-ink">
                {prompt.label}
              </Text>
              <Text className="mx-sm text-label text-ink-faint">{prompt.hint}</Text>
              <Icon name="chevron-right" size={16} color={palette.greenBright} />
            </BubblePressable>
          </GlassSurface>
        ))}
      </View>
    </View>
  );
}

function RoundButton({
  icon,
  label,
  onPress,
}: {
  icon: 'chevron-left' | 'plus' | 'history';
  label: string;
  onPress: () => void;
}) {
  return (
    <BubblePressable
      onPress={onPress}
      hitSlop={8}
      radius="pill"
      accessibilityRole="button"
      accessibilityLabel={label}
      style={(state) => [
        pressedStyle(state),
        {
          height: 36,
          width: 36,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: 'rgba(236,241,238,0.07)',
          backgroundColor: 'rgba(236,241,238,0.055)',
        },
      ]}
    >
      <Icon name={icon} size={18} color={palette.inkMuted} />
    </BubblePressable>
  );
}

/**
 * The field and ➤, and the one piece of state that changes on every keystroke.
 *
 * Its own component so that typing re-renders the composer and nothing else: with
 * the draft in the screen, every character re-rendered the whole conversation —
 * each message, each proposal card, each entrance — and a long chat typed like a
 * slow one. `clearRef` is how the screen empties it: a chip or a suggestion asked
 * from the thread clears the draft in the same batch as it always did.
 *
 * ── IT GROWS TO FOUR LINES, AND RETURN IS A NEW LINE (U26) ────────────────
 *
 * A question about a training block is often two sentences, and a one-line
 * field scrolled the start of it out of sight while it was typed. The field
 * grows 1 → 4 lines (22 each) and then scrolls inside itself; ➤ stays at the
 * bottom of the pill, where the thumb already is. Return now inserts a line
 * break rather than sending: a multi-line field whose return sends cannot hold
 * a second line, and ➤ is right there. The rejected alternative was keeping
 * return-sends on a growing field, which only grows by wrapping.
 */
function Composer({
  placeholder,
  pending,
  height,
  keyboardReach,
  onHeight,
  onAsk,
  clearRef,
}: {
  placeholder: string;
  pending: boolean;
  /** One line's pill. */
  height: number;
  keyboardReach: number;
  onHeight: (height: number) => void;
  onAsk: (text: string) => void;
  clearRef: MutableRefObject<() => void>;
}) {
  const [draft, setDraft] = useState('');
  const clear = useCallback(() => setDraft(''), []);
  clearRef.current = clear;
  // One 22 line centred in the resting pill; four of them at most.
  const padY = (height - COMPOSER_LINE) / 2;
  return (
    <GlassBar radius={radius.navPill}>
      <View
        style={{ minHeight: height }}
        className="flex-row items-end pl-lg pr-sm"
        onLayout={(e) => onHeight(Math.round(e.nativeEvent.layout.height))}
      >
        {/*
          THE KEYBOARD. The app runs Android's `pan` mode, which scrolls the
          window just far enough to show the FOCUSED RECT of the field — and
          for a text field that is its text line plus its bottom padding. With
          no padding, the pan stopped at the text and left the bottom of the
          pill (and its margin) under the keyboard. So the field's padding
          reaches the foot of the screen, pulled back by a matching negative
          margin so the pill looks the same: the rect Android reveals is now
          the whole composer, and it sits flush on the keyboard.
        */}
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={placeholder}
          placeholderTextColor={palette.inkFaint}
          multiline
          scrollEnabled
          accessibilityLabel={placeholder}
          style={{
            flex: 1,
            fontSize: 16,
            lineHeight: COMPOSER_LINE,
            color: palette.ink,
            paddingHorizontal: 0,
            paddingTop: padY,
            paddingBottom: padY + keyboardReach,
            marginBottom: -keyboardReach,
            // Grows with its text to four lines, then scrolls inside.
            maxHeight: COMPOSER_LINE * COMPOSER_MAX_LINES + padY * 2 + keyboardReach,
            textAlignVertical: 'top',
          }}
        />
        <View style={{ paddingBottom: (height - 44) / 2 }}>
          <SendButton live={draft.trim() !== '' && !pending} onPress={() => onAsk(draft)} />
        </View>
      </View>
    </GlassBar>
  );
}

function SendButton({ live, onPress }: { live: boolean; onPress: () => void }) {
  const t = useT();
  return (
    <BubblePressable
      onPress={onPress}
      disabled={!live}
      radius="pill"
      bubbleColor={palette.ink}
      accessibilityRole="button"
      accessibilityLabel={t('Send')}
      accessibilityState={{ disabled: !live }}
      style={{
        height: 44,
        width: 44,
        borderRadius: radius.pill,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: live ? undefined : 'rgba(236,241,238,0.07)',
        opacity: live ? 1 : 0.6,
      }}
    >
      {live ? (
        <LinearGradient
          {...gradientFill()}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
      ) : null}
      {/* The one arrow in the app is the chevron; "send" is the chevron, forward. */}
      <Icon name="chevron-right" size={20} color={live ? palette.onAcc : palette.inkMuted} />
    </BubblePressable>
  );
}
