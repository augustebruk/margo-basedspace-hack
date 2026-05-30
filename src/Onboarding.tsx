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
import { EntryGraph, type GraphNode, type GraphLink } from "./EntryGraph";
import { useScribe } from "./useScribe";
import { useMargoVoice } from "./useMargoVoice";
import { useInsight, type Insight } from "./useInsight";
import { highlightPhrases } from "./highlight";

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
    // Warm the next two spoken lines while the intro types out.
    prefetch(LINE_NAME);
  }, [unlocked, unlock, prefetch]);

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
      className="relative flex h-full w-full flex-col overflow-hidden"
    >
      {/* Soft pastel wash background, consistent across all steps. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(160deg, #f6eeff 0%, #fdf1f3 48%, #fef6f1 100%)",
        }}
      />
      <MargoLogo
        onClick={name ? onSkipToHome : undefined}
        className="absolute top-7 left-1/2 -translate-x-1/2 z-10"
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
        className="all-[unset] box-border inline-flex cursor-pointer items-center gap-2 rounded-full bg-white/70 px-5 py-2.5 shadow-[0_8px_24px_rgba(28,43,51,0.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1c2b33]"
      >
        <span className="[font-family:'Inter',Helvetica] text-[14px] font-medium tracking-[-0.2px] text-[#1c2b33]/70">
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
    className="all-[unset] inline-flex cursor-pointer items-center justify-center rounded-md p-1.5 text-[#1c2b33]/35 transition-colors hover:text-[#1c2b33]/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1c2b33]"
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

  const fieldClass =
    "w-full rounded-2xl border border-[#1c2b33]/10 bg-white/85 px-4 py-3 [font-family:'Inter',Helvetica] text-[16px] text-[#1c2b33] placeholder:text-[#1c2b33]/30 shadow-[0_8px_24px_rgba(28,43,51,0.06)] focus:border-[#c7a6f5]/60 focus:outline-none";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="flex w-full max-w-[320px] flex-col items-center gap-3"
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
          className={`${fieldClass} resize-none leading-[22px]`}
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
          className={`${fieldClass} text-center`}
        />
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="all-[unset] cursor-pointer rounded-full px-4 py-2 [font-family:'Inter',Helvetica] text-[13px] font-medium text-[#1c2b33]/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1c2b33]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim()}
          className="all-[unset] box-border inline-flex cursor-pointer items-center rounded-full px-5 py-2 [font-family:'Inter',Helvetica] text-[14px] font-semibold text-white shadow-[0_8px_20px_rgba(199,166,245,0.4)] disabled:cursor-default disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          style={{
            background:
              "linear-gradient(90deg, #c7a6f5 0%, #ec9fc4 52%, #f7b59a 100%)",
          }}
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
      className="all-[unset] relative flex h-full w-full cursor-pointer flex-col items-center justify-center gap-10 px-8"
      aria-label="Tap to begin"
    >
      <BulbAvatar state={unlocked ? "aiSpeaking" : "idle"} />

      <div className="flex min-h-[88px] flex-col items-center gap-2.5 text-center">
        {!unlocked ? (
          <motion.span
            animate={{ opacity: [0.4, 0.85, 0.4] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            className="[font-family:'Inter',Helvetica] text-[15px] font-medium uppercase tracking-[2px] text-[#1c2b33]/45"
          >
            Tap to begin
          </motion.span>
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
                    ? "[font-family:'Inter',Helvetica] text-[30px] font-medium leading-[1.2] tracking-[-0.5px] text-[#1c2b33]"
                    : "[font-family:'Inter',Helvetica] text-[19px] font-normal italic leading-[1.4] tracking-[-0.2px] text-[#1c2b33]/65"
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
  <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
    {[0, 1, 2].map((i) => (
      <motion.span
        key={i}
        className="absolute rounded-full border border-[#c7a6f5]/40"
        style={{ width: 180, height: 180 }}
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
      className="relative flex h-full w-full flex-col items-center justify-center gap-12 px-8"
    >
      <p className="max-w-[300px] text-center [font-family:'Inter',Helvetica] text-[22px] font-medium leading-[1.3] tracking-[-0.4px] text-[#1c2b33]">
        {LINE_NAME}
      </p>

      {/* Orb stays centered. Once a name is heard, a pencil appears next to it. */}
      <div className="relative flex items-center justify-center">
        <div className="relative flex h-[180px] w-[180px] items-center justify-center">
          <NameWaves active={recording && !speaking && !typing} />
          <BulbAvatar state={speaking ? "aiSpeaking" : "personSpeaking"} size={120} />
          {display && (
            <motion.div
              key={display}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, ease: EASE }}
              className="absolute flex items-center gap-1"
            >
              <span className="[font-family:'Inter',Helvetica] text-[28px] font-medium tracking-[-0.5px] text-[#1c2b33]">
                {display}
              </span>
              {!typing && (
                <span className="-mr-6">
                  <GhostIconButton
                    label="Edit your name"
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

      <div className="flex min-h-[48px] flex-col items-center gap-2">
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
            <TapPrompt
              key="tap"
              show={canAdvance}
              label={display ? `My name is ${display}` : "Try again"}
              onTap={onConfirm}
            />
          )}
        </AnimatePresence>
        {error && !speaking && !typing && (
          <p className="max-w-[300px] text-center [font-family:'Inter',Helvetica] text-[13px] text-[#d4576a]">
            {error}
          </p>
        )}
      </div>
    </motion.div>
  );
};

/* -------------------------------------------------------------------------- */
/* Count-up timer (mm:ss).                                                    */
/* -------------------------------------------------------------------------- */
const useElapsed = (running: boolean): string => {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    if (!running) return;
    const start = Date.now();
    setMs(0);
    const id = setInterval(() => setMs(Date.now() - start), 200);
    return () => clearInterval(id);
  }, [running]);
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

/* -------------------------------------------------------------------------- */
/* Step 3 — First Yap: speak freely; timer + live transcription; tap to end.  */
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
  const elapsed = useElapsed(recording && !speaking);
  const [typing, setTyping] = useState(false);
  const timerRunning = recording && !speaking && !typing;
  const [showTimer, setShowTimer] = useState(false);
  useEffect(() => {
    if (!timerRunning) {
      setShowTimer(false);
      return;
    }
    setShowTimer(true);
    const t = setTimeout(() => setShowTimer(false), 5000);
    return () => clearTimeout(t);
  }, [timerRunning]);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -24 }}
      transition={{ duration: 0.45, ease: "easeInOut" }}
      className="relative flex h-full w-full flex-col items-center px-7 pt-[120px] pb-9"
    >
      <div className="flex max-w-[330px] items-start justify-center">
        <p className="text-center [font-family:'Inter',Helvetica] text-[20px] font-medium leading-[1.32] tracking-[-0.3px] text-[#1c2b33]">
          {speaking ? lineFirstYap(name) : `I'm listening, ${name}…`}
        </p>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <div className="relative flex items-center justify-center">
          <BulbAvatar state={speaking ? "aiSpeaking" : "personSpeaking"} size={150} />
        </div>
        <motion.span
          aria-hidden={!showTimer}
          animate={{ opacity: showTimer ? 1 : 0 }}
          transition={{ duration: 3, ease: "easeInOut" }}
          className="[font-family:'Inter',Helvetica] text-[14px] font-medium tabular-nums tracking-[1px] text-[#1c2b33]/45"
        >
          {elapsed}
        </motion.span>
      </div>

      <div className="flex w-full flex-col items-center gap-5">
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
            <div key="voice" className="flex w-full flex-col items-center gap-5">
              <div className="flex min-h-[64px] w-full items-end justify-center">
                <p className="max-w-[320px] text-center [font-family:'Inter',Helvetica] text-[15px] font-normal leading-[22px] text-[#1c2b33]/60">
                  {transcript || (recording && !speaking ? "Listening…" : "")}
                </p>
              </div>
              <div className="relative flex w-full items-center justify-center">
                {!typing && (
                  <div className="absolute right-[calc(50%+70px)]">
                    <GhostIconButton
                      label="Type your entry instead"
                      onClick={() => {
                        onOpenKeyboard();
                        setTyping(true);
                      }}
                    >
                      <KeyboardIcon />
                    </GhostIconButton>
                  </div>
                )}
                <TapPrompt show={canAdvance} label="I'm done" onTap={onFinish} />
              </div>
            </div>
          )}
        </AnimatePresence>
        {error && !speaking && !typing && (
          <p className="max-w-[300px] text-center [font-family:'Inter',Helvetica] text-[13px] text-[#d4576a]">
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
      className="relative flex h-full w-full flex-col px-6 pt-[104px] pb-8"
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* The user's own words, replayed line-by-line. */}
        <div className="flex flex-col gap-2.5">
          {segmentsByLine.map((segs, i) =>
            i < shownLines ? (
              <motion.p
                key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: beat === "card" ? 0.55 : 1, y: 0 }}
                transition={{ duration: 0.6, ease: EASE }}
                className="[font-family:'Inter',Helvetica] text-[18px] font-normal leading-[1.5] tracking-[-0.2px] text-[#1c2b33]/85"
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
                      className="rounded-[6px] px-1 font-medium text-[#1c2b33]"
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
            <div className="mt-8">
              <InsightCard insight={insight} />
            </div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex justify-center pt-4">
        <TapPrompt show={beat === "card"} label="Continue" onTap={onContinue} />
      </div>
    </motion.div>
  );
};

/* -------------------------------------------------------------------------- */
/* Step 5 — Invitation: Atom Graph preview + the two CTAs.                    */
/* -------------------------------------------------------------------------- */
function graphFromInsight(insight: Insight): {
  nodes: GraphNode[];
  links: GraphLink[];
} {
  const labels = (insight.triggers.length ? insight.triggers : ["Pattern"])
    .map((t) => t.replace(/^you\s+/i, "").trim())
    .map((t) => (t.length > 28 ? t.slice(0, 27) + "…" : t))
    .slice(0, 4);

  // Lay the themes out in a loose cluster and chain neighbors together so the
  // graph reads as related ideas rather than spokes off a hub.
  const spots: Pt[] = [
    { x: -70, y: -46 },
    { x: 64, y: -52 },
    { x: -54, y: 58 },
    { x: 72, y: 44 },
  ];
  const types: GraphNode["type"][] = ["emotion", "topic", "person", "emotion"];
  const nodes: GraphNode[] = labels.map((label, i) => ({
    id: `n${i}`,
    label,
    type: types[i % types.length],
    pos: spots[i % spots.length],
  }));
  // Connect each theme to the next, and close the loop when there are 3+.
  const links: GraphLink[] = [];
  for (let i = 0; i + 1 < labels.length; i += 1) {
    links.push({ sourceId: `n${i}`, targetId: `n${i + 1}` });
  }
  if (labels.length >= 3) {
    links.push({ sourceId: `n${labels.length - 1}`, targetId: "n0" });
  }
  return { nodes, links };
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
  const { nodes, links } = useMemo(() => graphFromInsight(insight), [insight]);

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
      className="relative flex h-full w-full flex-col px-6 pt-[104px] pb-9"
    >
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-6">
        <p className="text-center [font-family:'Inter',Helvetica] text-[19px] font-normal leading-[1.45] tracking-[-0.2px] text-[#1c2b33]/85">
          {LINE_INVITE_2}
        </p>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease: EASE, delay: 0.2 }}
          className="overflow-hidden rounded-[24px] bg-white/80 p-2 shadow-[0_12px_36px_rgba(28,43,51,0.07)]"
        >
          <EntryGraph nodes={nodes} links={links} height={220} />
        </motion.div>
      </div>

      <div className="flex flex-col items-center gap-3 pt-4">
        <motion.button
          type="button"
          onClick={onStartNoticing}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.4 }}
          whileTap={{ scale: 0.97 }}
          className="all-[unset] box-border flex h-14 w-full cursor-pointer items-center justify-center rounded-full shadow-[0_14px_34px_rgba(199,166,245,0.45)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          style={{
            background:
              "linear-gradient(90deg, #c7a6f5 0%, #ec9fc4 52%, #f7b59a 100%)",
          }}
          aria-label="Start Noticing"
        >
          <span className="[font-family:'Inter',Helvetica] text-[16px] font-semibold tracking-[-0.2px] text-white">
            Start Noticing
            <span className="font-normal opacity-80"> · Era 1 is free</span>
          </span>
        </motion.button>
        <button
          type="button"
          onClick={onSaveAndExit}
          className="all-[unset] cursor-pointer rounded-sm px-3 py-1 [font-family:'Inter',Helvetica] text-[14px] font-medium text-[#1c2b33]/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1c2b33]"
        >
          Save &amp; Exit
        </button>
        <p className="max-w-[320px] [font-family:'Inter',Helvetica] font-normal text-[13px] text-center tracking-[-0.05px] leading-[18px]">
          <span className="text-[#1c2b33]/55">
            By tapping &apos;Start Noticing&apos; and using our app,
            you&apos;re agreeing to our{" "}
          </span>
          <a
            href={legalLinks[0].href}
            className="text-[#c7a6f5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c7a6f5] rounded-sm"
          >
            {legalLinks[0].label}
          </a>
          <span className="text-[#1c2b33]/55"> and </span>
          <a
            href={legalLinks[1].href}
            className="text-[#c7a6f5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c7a6f5] rounded-sm"
          >
            {legalLinks[1].label}
          </a>
        </p>
      </div>
    </motion.div>
  );
};
