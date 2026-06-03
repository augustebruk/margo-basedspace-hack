import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { BulbAvatar } from "./BulbAvatar";
import { MargoLogo } from "./MargoLogo";
import { InsightCard } from "./InsightCard";
import { EntryGraph } from "./EntryGraph";
import type { AggregatedGraph, AggregatedNode, AggregatedLink } from "./graphModel";
import type { GraphNodeType } from "./useReflection";
import { useScribe } from "./useScribe";
import { useMargoVoice } from "./useMargoVoice";
import { useInsight, type Insight } from "./useInsight";
import { highlightPhrases } from "./highlight";
import { cx } from "./cx";
import styles from "./Onboarding.module.css";

/* ============================================================================
 * Onboarding — "Your First Mirror Moment".
 *
 * One continuous, voice-first conversation: Margo speaks (real TTS), the user
 * speaks their name and first entry (live STT), then Margo reflects a pattern
 * back. White/pastel theme throughout. Advancement is tap-to-continue; the tap
 * prompt only appears after a first natural pause is detected.
 * ==========================================================================*/
type Step = "entrance" | "name" | "firstYap" | "mirror" | "invitation";

const EASE = [0.22, 1, 0.36, 1] as const;

// Brief gap after Margo finishes speaking before the mic opens, so her voice
// never bleeds into the transcript.
const MIC_DELAY_MS = 350;

// Scripted lines (name interpolated). Mirror transition is Claude-generated.
const LINE_NAME = "Before we begin — what should I call you?";
const lineFirstYap = (name: string) =>
  `Perfect, ${name}. Now — tell me one thing that's been on your mind lately. Anything. Big, small, messy. I'm here to listen.`;
const LINE_INVITE_1 =
  "This is just your first entry. The more you share, the clearer the map becomes.";
const LINE_INVITE_2 =
  "Over time, this becomes your Atom Graph — a living map of your inner world. Ready to see it grow?";

const legalLinks = [
  { label: "Terms of Service", href: "#terms" },
  { label: "Privacy Policy", href: "#privacy" },
];

interface OnboardingProps {
  /** Persisted name setter (writes to localStorage). */
  onName: (name: string) => void;
  /** Finish onboarding and enter the main app. */
  onStartNoticing: () => void;
  /** Finish onboarding and exit to a calm idle state. */
  onSaveAndExit: () => void;
  /** Skip the rest of onboarding and jump to the main app (logo tap). */
  onSkipToHome: () => void;
}

export const Onboarding = ({
  onName,
  onStartNoticing,
  onSaveAndExit,
  onSkipToHome,
}: OnboardingProps): JSX.Element => {
  const [step, setStep] = useState<Step>("entrance");
  const [name, setName] = useState("");
  const [nameTranscript, setNameTranscript] = useState("");
  const [entryTranscript, setEntryTranscript] = useState("");

  const { speak, prefetch, unlock, stop: stopVoice, speaking } = useMargoVoice();
  const { insight, generate: generateInsight } = useInsight();

  // Whether the tap-to-continue prompt is revealed (after first pause).
  const [canAdvance, setCanAdvance] = useState(false);

  // The active recording target drives which transcript setter Scribe feeds.
  const recordingTargetRef = useRef<"name" | "entry" | null>(null);
  const handleTranscript = useCallback((text: string) => {
    if (recordingTargetRef.current === "name") setNameTranscript(text);
    else if (recordingTargetRef.current === "entry") setEntryTranscript(text);
  }, []);
  const handleFirstPause = useCallback(() => setCanAdvance(true), []);

  const {
    start: startScribe,
    requestPermission: requestMicPermission,
    stop: stopScribe,
    active: recording,
    error: scribeError,
  } = useScribe(handleTranscript, { onFirstPause: handleFirstPause });

  // -------- step orchestration helpers --------------------------------------
  const beginRecording = useCallback(
    (target: "name" | "entry") => {
      recordingTargetRef.current = target;
      setCanAdvance(false);
      setTimeout(() => void startScribe(), MIC_DELAY_MS);
    },
    [startScribe],
  );

  // Entrance: unlocked by the first tap, then types the intro and advances.
  const [unlocked, setUnlocked] = useState(false);
  const handleBegin = useCallback(() => {
    if (unlocked) return;
    setUnlocked(true);
    unlock();
    // Request mic permission on this first tap (a user gesture) so Safari/iOS/
    // Private mode prompt reliably. The name/entry steps auto-start the mic from
    // a timer (not a gesture), which would otherwise be too late for Safari to
    // show the prompt; priming here secures the grant up front.
    void requestMicPermission();
    // Warm the next two spoken lines while the intro types out.
    prefetch(LINE_NAME);
  }, [unlocked, unlock, requestMicPermission, prefetch]);

  // Run the spoken script for each step. Driven by `step` transitions.
  useEffect(() => {
    if (step === "name") {
      let cancelled = false;
      void (async () => {
        await speak(LINE_NAME);
        if (cancelled) return;
        beginRecording("name");
      })();
      return () => {
        cancelled = true;
      };
    }
    if (step === "firstYap") {
      let cancelled = false;
      prefetch(lineFirstYap(name));
      void (async () => {
        await speak(lineFirstYap(name));
        if (cancelled) return;
        beginRecording("entry");
      })();
      return () => {
        cancelled = true;
      };
    }
  }, [step, name, speak, prefetch, beginRecording]);

  // --- transitions between steps -------------------------------------------
  const confirmName = useCallback(() => {
    const captured = nameTranscript.trim();
    if (!captured) {
      // Empty/unclear — let the user try again instead of advancing blank.
      setCanAdvance(false);
      stopScribe();
      recordingTargetRef.current = null;
      setNameTranscript("");
      setTimeout(() => beginRecording("name"), 200);
      return;
    }
    // Use the first word as the name (people often say just their name).
    const firstWord = captured.split(/\s+/)[0].replace(/[.!?,]+$/, "");
    stopScribe();
    recordingTargetRef.current = null;
    setName(firstWord);
    onName(firstWord);
    setCanAdvance(false);
    setStep("firstYap");
  }, [nameTranscript, stopScribe, beginRecording, onName]);

  // Typed name (keyboard alternative): use it verbatim and advance.
  const submitTypedName = useCallback(
    (typed: string) => {
      const firstWord = typed.trim().split(/\s+/)[0]?.replace(/[.!?,]+$/, "");
      if (!firstWord) return;
      stopScribe();
      recordingTargetRef.current = null;
      setName(firstWord);
      onName(firstWord);
      setCanAdvance(false);
      setStep("firstYap");
    },
    [stopScribe, onName],
  );

  const finishEntry = useCallback(() => {
    const transcript = stopScribe().trim() || entryTranscript.trim();
    recordingTargetRef.current = null;
    setCanAdvance(false);
    void generateInsight(transcript, name);
    setStep("mirror");
  }, [stopScribe, entryTranscript, generateInsight, name]);

  // Typed first entry (keyboard alternative).
  const submitTypedEntry = useCallback(
    (typed: string) => {
      const transcript = typed.trim();
      if (!transcript) return;
      stopScribe();
      recordingTargetRef.current = null;
      setEntryTranscript(transcript);
      setCanAdvance(false);
      void generateInsight(transcript, name);
      setStep("mirror");
    },
    [stopScribe, generateInsight, name],
  );

  // Cleanup any audio/mic on unmount.
  useEffect(() => {
    return () => {
      stopVoice();
      stopScribe();
    };
  }, [stopVoice, stopScribe]);

  return (
    <motion.div
      key="onboarding"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -40, scale: 0.96 }}
      transition={{ duration: 0.5, ease: "easeInOut" }}
      className={styles.root}
    >
      {/* Soft pastel wash background, consistent across all steps. */}
      <div
        aria-hidden="true"
        className={styles.bgWash}
      />
      <MargoLogo
        onClick={name ? onSkipToHome : undefined}
        className={styles.logo}
      />

      <AnimatePresence mode="wait">
        {step === "entrance" && (
          <EntranceStep
            key="entrance"
            unlocked={unlocked}
            onBegin={handleBegin}
            onDone={() => setStep("name")}
          />
        )}
        {step === "name" && (
          <NameStep
            key="name"
            transcript={nameTranscript}
            recording={recording}
            speaking={speaking}
            canAdvance={canAdvance}
            error={scribeError}
            onConfirm={confirmName}
            onOpenKeyboard={() => stopScribe()}
            onSubmitTyped={submitTypedName}
          />
        )}
        {step === "firstYap" && (
          <FirstYapStep
            key="firstYap"
            name={name}
            transcript={entryTranscript}
            recording={recording}
            speaking={speaking}
            canAdvance={canAdvance}
            error={scribeError}
            onFinish={finishEntry}
            onOpenKeyboard={() => stopScribe()}
            onSubmitTyped={submitTypedEntry}
          />
        )}
        {step === "mirror" && (
          <MirrorStep
            key="mirror"
            transcript={entryTranscript}
            insight={insight}
            speak={speak}
            onContinue={() => setStep("invitation")}
          />
        )}
        {step === "invitation" && (
          <InvitationStep
            key="invitation"
            insight={insight}
            speak={speak}
            onStartNoticing={onStartNoticing}
            onSaveAndExit={onSaveAndExit}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
};

/* -------------------------------------------------------------------------- */
/* Shared: the orb + an optional tap-to-continue prompt that fades in.        */
/* -------------------------------------------------------------------------- */
const TapPrompt = ({
  show,
  label,
  onTap,
}: {
  show: boolean;
  label: string;
  onTap: () => void;
}): JSX.Element => (
  <AnimatePresence>
    {show && (
      <motion.button
        type="button"
        onClick={onTap}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.4, ease: EASE }}
        className={cx("btnReset", "focusRing", styles.tapPrompt)}
      >
        <span className={styles.tapPromptLabel}>
          {label}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1c2b33" strokeOpacity="0.5" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </motion.button>
    )}
  </AnimatePresence>
);

/* -------------------------------------------------------------------------- */
/* Small ghost icons (no circle): keyboard toggle + pencil edit.              */
/* -------------------------------------------------------------------------- */
const KeyboardIcon = (): JSX.Element => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="6" width="20" height="12" rx="2.5" />
    <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 13h.01M18 13h.01M9 13h6" />
  </svg>
);

const PencilIcon = (): JSX.Element => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

/* A labeled "Type instead" pill, mirroring the in-app keyboard toggle. */
const KeyboardToggle = ({ onClick }: { onClick: () => void }): JSX.Element => (
  <motion.button
    type="button"
    onClick={onClick}
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: 6 }}
    transition={{ duration: 0.35, ease: EASE }}
    aria-label="Type instead"
    className={cx("btnReset", "focusRing", styles.keyboardToggle)}
  >
    <KeyboardIcon />
    <span>Type instead</span>
  </motion.button>
);

const GhostIconButton = ({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: JSX.Element;
}): JSX.Element => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    className={cx("btnReset", "focusRing", styles.ghostIconButton)}
  >
    {children}
  </button>
);

/* Inline text entry — an alternative to speaking. White/pastel, soft. */
const KeyboardInput = ({
  placeholder,
  multiline,
  initialValue,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  multiline?: boolean;
  initialValue?: string;
  submitLabel: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}): JSX.Element => {
  const [value, setValue] = useState(initialValue ?? "");
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.3, ease: EASE }}
      className={styles.kbdRoot}
    >
      {multiline ? (
        <textarea
          ref={(el) => {
            inputRef.current = el;
          }}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className={cx(styles.kbdField, styles.kbdFieldTextarea)}
        />
      ) : (
        <input
          ref={(el) => {
            inputRef.current = el;
          }}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          className={cx(styles.kbdField, styles.kbdFieldInput)}
        />
      )}
      <div className={styles.kbdActions}>
        <button
          type="button"
          onClick={onCancel}
          className={cx("btnReset", "focusRing", styles.kbdCancel)}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim()}
          className={cx("btnReset", styles.kbdSubmit)}
        >
          {submitLabel}
        </button>
      </div>
    </motion.div>
  );
};

/* -------------------------------------------------------------------------- */
/* Step 1 — Entrance: tap to begin, then a typed intro.                       */
/* -------------------------------------------------------------------------- */
const ENTRANCE_LINES = ["Hi, I'm Margo", "What if your journal talked back?"];

const EntranceStep = ({
  unlocked,
  onBegin,
  onDone,
}: {
  unlocked: boolean;
  onBegin: () => void;
  onDone: () => void;
}): JSX.Element => {
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    if (!unlocked) return;
    if (revealed >= ENTRANCE_LINES.length) {
      const t = setTimeout(onDone, 1100);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setRevealed((r) => r + 1), revealed === 0 ? 500 : 1400);
    return () => clearTimeout(t);
  }, [unlocked, revealed, onDone]);

  return (
    <motion.button
      type="button"
      onClick={onBegin}
      exit={{ opacity: 0, y: -30 }}
      transition={{ duration: 0.45, ease: "easeInOut" }}
      className={cx("btnReset", styles.entranceRoot)}
      aria-label="Tap To Begin"
    >
      <BulbAvatar state={unlocked ? "aiSpeaking" : "idle"} />

      <div className={styles.entranceTextBlock}>
        {!unlocked ? (
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className={styles.entrancePrompt}
          >
            Tap anywhere to begin
          </motion.p>
        ) : (
          ENTRANCE_LINES.map((line, i) =>
            i < revealed ? (
              <motion.p
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: EASE }}
                className={
                  i === 0
                    ? styles.entranceLinePrimary
                    : styles.entranceLineSecondary
                }
              >
                {line}
              </motion.p>
            ) : null,
          )
        )}
      </div>
    </motion.button>
  );
};

/* -------------------------------------------------------------------------- */
/* Live "waves" — concentric rings that ripple while the user speaks.         */
/* -------------------------------------------------------------------------- */
const NameWaves = ({ active }: { active: boolean }): JSX.Element => (
  <div aria-hidden="true" className={styles.nameWaves}>
    {[0, 1, 2].map((i) => (
      <motion.span
        key={i}
        className={styles.nameWave}
        animate={
          active
            ? { scale: [0.7, 1.5], opacity: [0.5, 0] }
            : { scale: 0.7, opacity: 0 }
        }
        transition={
          active
            ? { duration: 2.4, repeat: Infinity, ease: "easeOut", delay: i * 0.8 }
            : { duration: 0.4 }
        }
      />
    ))}
  </div>
);

/* -------------------------------------------------------------------------- */
/* Step 2 — Name: speak your name; waves ripple; tap to confirm.              */
/* -------------------------------------------------------------------------- */
const NameStep = ({
  transcript,
  recording,
  speaking,
  canAdvance,
  error,
  onConfirm,
  onOpenKeyboard,
  onSubmitTyped,
}: {
  transcript: string;
  recording: boolean;
  speaking: boolean;
  canAdvance: boolean;
  error: string | null;
  onConfirm: () => void;
  onOpenKeyboard: () => void;
  onSubmitTyped: (value: string) => void;
}): JSX.Element => {
  const display = (transcript.trim().split(/\s+/)[0] ?? "").replace(/[.!?,]+$/, "");
  const [typing, setTyping] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -24 }}
      transition={{ duration: 0.45, ease: "easeInOut" }}
      className={styles.nameRoot}
    >
      <p className={styles.namePrompt}>
        {LINE_NAME}
      </p>

      {/* Orb stays centered. Once a name is heard, a pencil appears next to it. */}
      <div className={styles.nameOrbOuter}>
        <div className={styles.nameOrbInner}>
          <NameWaves active={recording && !speaking && !typing} />
          <BulbAvatar state={speaking ? "aiSpeaking" : "personSpeaking"} size={120} />
          {display && (
            <motion.div
              key={display}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, ease: EASE }}
              className={styles.nameCaptured}
            >
              <span className={styles.nameCapturedText}>
                {display}
              </span>
              {!typing && (
                <span className={styles.namePencilSlot}>
                  <GhostIconButton
                    label="Edit Your Name"
                    onClick={() => {
                      onOpenKeyboard();
                      setTyping(true);
                    }}
                  >
                    <PencilIcon />
                  </GhostIconButton>
                </span>
              )}
            </motion.div>
          )}
        </div>
      </div>

      <div className={styles.nameControls}>
        <AnimatePresence mode="wait">
          {typing ? (
            <KeyboardInput
              key="kbd"
              placeholder="Your name"
              submitLabel="Confirm"
              initialValue={display}
              onSubmit={onSubmitTyped}
              onCancel={() => setTyping(false)}
            />
          ) : (
            <div key="voice" className={styles.nameVoiceBlock}>
              <TapPrompt
                show={canAdvance}
                label={display ? `My Name Is ${display}` : "Try Again"}
                onTap={onConfirm}
              />
              {/* Keyboard alternative — always available, even before speaking,
                  mirroring the in-app entry controls. */}
              {!speaking && (
                <KeyboardToggle
                  onClick={() => {
                    onOpenKeyboard();
                    setTyping(true);
                  }}
                />
              )}
            </div>
          )}
        </AnimatePresence>
        {error && !speaking && !typing && (
          <p className={styles.nameError}>
            {error}
          </p>
        )}
      </div>
    </motion.div>
  );
};

/* -------------------------------------------------------------------------- */
/* Step 3 — First Yap: speak freely; live transcription; tap to end.          */
/* -------------------------------------------------------------------------- */
const FirstYapStep = ({
  name,
  transcript,
  recording,
  speaking,
  canAdvance,
  error,
  onFinish,
  onOpenKeyboard,
  onSubmitTyped,
}: {
  name: string;
  transcript: string;
  recording: boolean;
  speaking: boolean;
  canAdvance: boolean;
  error: string | null;
  onFinish: () => void;
  onOpenKeyboard: () => void;
  onSubmitTyped: (value: string) => void;
}): JSX.Element => {
  const [typing, setTyping] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -24 }}
      transition={{ duration: 0.45, ease: "easeInOut" }}
      className={styles.yapRoot}
    >
      <div className={styles.yapPromptWrap}>
        <p className={styles.yapPrompt}>
          {speaking ? lineFirstYap(name) : `I'm listening, ${name}…`}
        </p>
      </div>

      <div className={styles.yapOrbBlock}>
        <div className={styles.yapOrbWrap}>
          <BulbAvatar state={speaking ? "aiSpeaking" : "personSpeaking"} size={232} />
        </div>
      </div>

      <div className={styles.yapBottom}>
        <AnimatePresence mode="wait">
          {typing ? (
            <KeyboardInput
              key="kbd"
              placeholder="What's been on your mind?"
              multiline
              submitLabel="Done"
              initialValue={transcript}
              onSubmit={onSubmitTyped}
              onCancel={() => setTyping(false)}
            />
          ) : (
            <div key="voice" className={styles.yapVoiceBlock}>
              <div className={styles.yapTranscriptWrap}>
                {recording && !speaking ? (
                  <div className={styles.yapTurnGroup}>
                    <span className={styles.yapTurnLabel}>Your turn</span>
                    <p className={styles.yapTranscript}>
                      {transcript || "Listening…"}
                    </p>
                  </div>
                ) : (
                  <p className={styles.yapTranscript}>{transcript}</p>
                )}
              </div>
              <div className={styles.yapPromptRow}>
                <TapPrompt show={canAdvance} label="I'm Done" onTap={onFinish} />
                {/* Keyboard alternative — always available, mirroring the
                    in-app entry controls. */}
                {!speaking && (
                  <KeyboardToggle
                    onClick={() => {
                      onOpenKeyboard();
                      setTyping(true);
                    }}
                  />
                )}
              </div>
            </div>
          )}
        </AnimatePresence>
        {error && !speaking && !typing && (
          <p className={styles.yapError}>
            {error}
          </p>
        )}
      </div>
    </motion.div>
  );
};

/* -------------------------------------------------------------------------- */
/* Step 4 — Mirror Moment: replay words, highlight phrases, reveal the card.  */
/* -------------------------------------------------------------------------- */
type MirrorBeat = "transition" | "replay" | "highlight" | "card";

const MirrorStep = ({
  transcript,
  insight,
  speak,
  onContinue,
}: {
  transcript: string;
  insight: Insight;
  speak: (text: string) => Promise<void>;
  onContinue: () => void;
}): JSX.Element => {
  const [beat, setBeat] = useState<MirrorBeat>("transition");

  // Split the user's words into short lines for the gentle scroll-up replay.
  const lines = useMemo(() => {
    const source = transcript.trim() || "…";
    return source
      .split(/(?<=[.!?])\s+/)
      .flatMap((s) => (s.length > 70 ? s.match(/.{1,70}(\s|$)/g) ?? [s] : [s]))
      .map((s) => s.trim())
      .filter(Boolean);
  }, [transcript]);

  const segmentsByLine = useMemo(
    () => lines.map((line) => highlightPhrases(line, insight.highlightPhrases)),
    [lines, insight.highlightPhrases],
  );

  const [shownLines, setShownLines] = useState(0);

  // Beat sequencing.
  useEffect(() => {
    const t = setTimeout(() => setBeat("replay"), 700);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (beat !== "replay") return;
    if (shownLines >= lines.length) {
      const t = setTimeout(() => setBeat("highlight"), 500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setShownLines((n) => n + 1), shownLines === 0 ? 250 : 900);
    return () => clearTimeout(t);
  }, [beat, shownLines, lines.length]);

  useEffect(() => {
    if (beat !== "highlight") return;
    let cancelled = false;
    void (async () => {
      await speak(insight.transitionLine);
      if (!cancelled) setBeat("card");
    })();
    const fallback = setTimeout(() => !cancelled && setBeat("card"), 6000);
    return () => {
      cancelled = true;
      clearTimeout(fallback);
    };
  }, [beat, insight.transitionLine, speak]);

  const showHighlights = beat === "highlight" || beat === "card";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -24 }}
      transition={{ duration: 0.5, ease: "easeInOut" }}
      className={styles.mirrorRoot}
    >
      <div className={styles.mirrorScroll}>
        {/* The user's own words, replayed line-by-line. */}
        <div className={styles.mirrorLines}>
          {segmentsByLine.map((segs, i) =>
            i < shownLines ? (
              <motion.p
                key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: beat === "card" ? 0.55 : 1, y: 0 }}
                transition={{ duration: 0.6, ease: EASE }}
                className={styles.mirrorLine}
              >
                {segs.map((seg, j) =>
                  seg.highlight ? (
                    <motion.span
                      key={j}
                      initial={false}
                      animate={
                        showHighlights
                          ? {
                              backgroundColor: "rgba(244,231,255,0.95)",
                              boxShadow: "0 0 18px rgba(199,166,245,0.45)",
                            }
                          : { backgroundColor: "rgba(244,231,255,0)" }
                      }
                      transition={{ duration: 0.7, ease: "easeOut" }}
                      className={styles.mirrorHighlight}
                    >
                      {seg.text}
                    </motion.span>
                  ) : (
                    <span key={j}>{seg.text}</span>
                  ),
                )}
              </motion.p>
            ) : null,
          )}
        </div>

        {/* The insight card slides up once Margo has spoken. */}
        <AnimatePresence>
          {beat === "card" && (
            <div className={styles.mirrorCardWrap}>
              <InsightCard insight={insight} />
            </div>
          )}
        </AnimatePresence>
      </div>

      <div className={styles.mirrorFooter}>
        <TapPrompt show={beat === "card"} label="Continue" onTap={onContinue} />
      </div>
    </motion.div>
  );
};

/* -------------------------------------------------------------------------- */
/* Step 5 — Invitation: Atom Graph preview + the two CTAs.                    */
/* -------------------------------------------------------------------------- */
function graphFromInsight(insight: Insight): AggregatedGraph {
  const labels = (insight.triggers.length ? insight.triggers : ["Pattern"])
    .map((t) => t.replace(/^you\s+/i, "").trim())
    .map((t) => (t.length > 28 ? t.slice(0, 27) + "…" : t))
    .slice(0, 4);

  const types: GraphNodeType[] = ["feeling", "situation", "person", "feeling"];
  const nodes: AggregatedNode[] = labels.map((label, i) => ({
    id: `n${i}`,
    label,
    type: types[i % types.length],
    count: 1,
    entryCount: 1,
    share: 1,
    mentions: [],
    lastSeen: Date.now(),
    // The very first entry — everything on the map grew today.
    newToday: true,
    touchedToday: true,
    inRange: true,
  }));

  // Connect each theme to the next, and close the loop when there are 3+.
  const links: AggregatedLink[] = [];
  for (let i = 0; i + 1 < labels.length; i += 1) {
    links.push({
      id: `n${i}__n${i + 1}`,
      sourceId: `n${i}`,
      targetId: `n${i + 1}`,
      count: 1,
      relations: [],
      newToday: true,
      touchedToday: true,
      inRange: true,
    });
  }
  if (labels.length >= 3) {
    links.push({
      id: `n0__n${labels.length - 1}`,
      sourceId: `n${labels.length - 1}`,
      targetId: "n0",
      count: 1,
      relations: [],
      newToday: true,
      touchedToday: true,
      inRange: true,
    });
  }
  return { nodes, links, entryCount: 1, grewTodayCount: nodes.length };
}

const InvitationStep = ({
  insight,
  speak,
  onStartNoticing,
  onSaveAndExit,
}: {
  insight: Insight;
  speak: (text: string) => Promise<void>;
  onStartNoticing: () => void;
  onSaveAndExit: () => void;
}): JSX.Element => {
  const graph = useMemo(() => graphFromInsight(insight), [insight]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await speak(LINE_INVITE_1);
      if (!cancelled) await speak(LINE_INVITE_2);
    })();
    return () => {
      cancelled = true;
    };
  }, [speak]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -24 }}
      transition={{ duration: 0.5, ease: "easeInOut" }}
      className={styles.invitationRoot}
    >
      <div className={styles.invitationBody}>
        <p className={styles.invitationLead}>
          {LINE_INVITE_2}
        </p>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease: EASE, delay: 0.2 }}
          className={styles.invitationGraphCard}
        >
          <EntryGraph graph={graph} range="week" height={220} />
        </motion.div>
      </div>

      <div className={styles.invitationFooter}>
        <motion.button
          type="button"
          onClick={onStartNoticing}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.4 }}
          whileTap={{ scale: 0.97 }}
          className={cx("btnReset", styles.invitationCta)}
          aria-label="Start Noticing"
        >
          <span className={styles.invitationCtaLabel}>
            Start Noticing
            <span className={styles.invitationCtaSub}> · Era 1 is free</span>
          </span>
        </motion.button>
        <button
          type="button"
          onClick={onSaveAndExit}
          className={cx("btnReset", "focusRing", styles.invitationSecondary)}
        >
          Save &amp; Exit
        </button>
        <p className={styles.invitationLegal}>
          <span className={styles.invitationLegalMuted}>
            By tapping &apos;Start Noticing&apos; and using our app,
            you&apos;re agreeing to our{" "}
          </span>
          <a
            href={legalLinks[0].href}
            className={styles.invitationLegalLink}
          >
            {legalLinks[0].label}
          </a>
          <span className={styles.invitationLegalMuted}> and </span>
          <a
            href={legalLinks[1].href}
            className={styles.invitationLegalLink}
          >
            {legalLinks[1].label}
          </a>
        </p>
      </div>
    </motion.div>
  );
};
