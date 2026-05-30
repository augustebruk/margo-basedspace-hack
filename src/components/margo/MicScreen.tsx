/**
 * MicScreen — the root orb / journaling screen of the Margo app.
 *
 * Onboarding stage machine (mic-driven — no timers, no auto-advance)
 * ────────────────────────────────────────────────────────────────────
 *  'intro'           → "Hi, I'm Margo." — waits for first mic tap.
 *                      Tap mic → move to 'askName' + start listening.
 *
 *  'askName'         → mic is open. When speech ends:
 *                        • store the name, stay in 'askName'.
 *                      Tap mic again → confirm name, move to 'askFirstThought' + start listening.
 *
 *  'askFirstThought' → mic is open. When speech ends:
 *                        • store the thought, stay in 'askFirstThought'.
 *                      Tap mic again → generate insight, move to 'firstInsight'.
 *
 *  'firstInsight'    → shows insight panel. Tap mic → 'done' (normal mode).
 *
 *  'done'            → regular entry flow. Mic starts/stops recording.
 *                      Overlays open via voice commands, close via mic-tap-with-no-speech.
 *
 * DEV shortcut: press `d` to step through stages without speaking.
 */

import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BulbAvatar, type BulbState } from "../../BulbAvatar";
import { MargoLogo } from "../../MargoLogo";
import { OnboardingOverlay } from "./OnboardingOverlay";
import { useSpeechToText } from "../../hooks/useSpeechToText";
import { deriveInsight, type Insight } from "../../lib/insightEngine";

/* ─────────────────────────────────────────────────────────────────────────── */
/* Types                                                                        */
/* ─────────────────────────────────────────────────────────────────────────── */

export type OnboardingStage =
  | "intro"
  | "askName"
  | "askFirstThought"
  | "firstInsight"
  | "done";

const STAGE_ORDER: OnboardingStage[] = [
  "intro",
  "askName",
  "askFirstThought",
  "firstInsight",
  "done",
];

/* ─────────────────────────────────────────────────────────────────────────── */
/* Constants                                                                    */
/* ─────────────────────────────────────────────────────────────────────────── */

const QUESTIONS = [
  "How did that make you feel?",
  "What do you think triggered that?",
  "Is there anything you'd do differently?",
  "What would you tell a friend in your situation?",
];

const legalLinks = [
  { label: "Terms of Service", href: "#terms" },
  { label: "Privacy Policy", href: "#privacy" },
];

/* ─────────────────────────────────────────────────────────────────────────── */
/* Shared text styles                                                           */
/* ─────────────────────────────────────────────────────────────────────────── */

const headingCls =
  "[font-family:'Inter',Helvetica] font-medium text-[#1c2b33] tracking-[-0.5px] leading-[1.25] text-center";
const subCls =
  "[font-family:'Inter',Helvetica] font-normal text-[#1c2b33]/55 tracking-[-0.3px] leading-[1.5] text-center";

/* ─────────────────────────────────────────────────────────────────────────── */
/* Placeholder backend handlers (post-onboarding)                               */
/* ─────────────────────────────────────────────────────────────────────────── */

function onUserFinishedSpeaking(transcript: string): void {
  console.log("[AI] user finished speaking:", transcript);
}
function onNextPromptRequested(): void {
  console.log("[AI] next prompt requested");
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Props                                                                        */
/* ─────────────────────────────────────────────────────────────────────────── */

interface MicScreenProps {
  onEntryComplete: () => void;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Component                                                                    */
/* ─────────────────────────────────────────────────────────────────────────── */

export const MicScreen = ({ onEntryComplete }: MicScreenProps): JSX.Element => {
  // ── Onboarding state ──────────────────────────────────────────────────────
  const [onboardingStage, setOnboardingStage] =
    useState<OnboardingStage>("intro");
  const [userName, setUserName] = useState<string | null>(null);
  const [firstThoughtTranscript, setFirstThoughtTranscript] = useState<string | null>(null);
  const [currentInsight, setCurrentInsight] = useState<Insight | null>(null);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);

  // ── Post-onboarding voice state ───────────────────────────────────────────
  const [bulbState, setBulbState] = useState<BulbState>("idle");
  const [currentQuestion, setCurrentQuestion] = useState(QUESTIONS[0]);
  const [entryListening, setEntryListening] = useState(false);
  const [burstKey, setBurstKey] = useState(0);
  const questionIndex = useRef(0);

  const started = bulbState !== "idle";
  const aiSpeaking = bulbState === "aiSpeaking";
  const onboardingActive = onboardingStage !== "done";

  // ── STT: onboarding ───────────────────────────────────────────────────────
  /**
   * Called when the STT session ends during onboarding.
   * Stores the captured value but does NOT advance the stage —
   * stage advancement only happens on the next mic tap.
   */
  const onboardingSttOnEnd = useCallback(
    (transcript: string) => {
      const trimmed = transcript.trim();

      if (onboardingStage === "askName") {
        if (!trimmed) {
          setRetryMessage("I didn't catch that — try speaking again.");
          return;
        }
        const name = trimmed.split(/\s+/)[0];
        const capitalised = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
        setUserName(capitalised);
        setRetryMessage(null);
        // Stay in askName — user taps mic again to confirm.
      }

      if (onboardingStage === "askFirstThought") {
        if (!trimmed) {
          setRetryMessage("I didn't catch that — try speaking again.");
          return;
        }
        setFirstThoughtTranscript(trimmed);
        setRetryMessage(null);
        // Stay in askFirstThought — user taps mic again to confirm.
      }
    },
    [onboardingStage],
  );

  const {
    startListening: startOnboardingListening,
    stopListening: stopOnboardingListening,
    isListening: onboardingListening,
  } = useSpeechToText({
    onEnd: onboardingSttOnEnd,
    continuous: false,
    lang: "en-US",
  });

  // ── STT: post-onboarding entry ────────────────────────────────────────────
  const entrySttOnEnd = useCallback(
    (transcript: string) => {
      setEntryListening(false);
      onUserFinishedSpeaking(transcript);
    },
    [],
  );

  const {
    startListening: startEntryListening,
    stopListening: stopEntryListening,
    isListening: entryListeningActive,
    transcript: entryTranscript,
  } = useSpeechToText({
    onEnd: entrySttOnEnd,
    continuous: false,
    lang: "en-US",
  });

  // ── Mic state machine ─────────────────────────────────────────────────────
  /**
   * Single entry point for ALL mic button taps.
   * Behaviour depends on current onboarding stage and whether we are already listening.
   */
  const handleMicTap = useCallback(() => {
    // ── ONBOARDING ──────────────────────────────────────────────────────────
    if (onboardingStage === "intro") {
      // First tap: advance to askName + start listening immediately.
      setOnboardingStage("askName");
      setTimeout(() => startOnboardingListening(), 300);
      return;
    }

    if (onboardingStage === "askName") {
      if (onboardingListening) {
        // Stop current session early (transcript will arrive via onEnd).
        stopOnboardingListening();
        return;
      }
      if (!userName) {
        // No name captured yet — start listening.
        setRetryMessage(null);
        startOnboardingListening();
        return;
      }
      // Name captured — this tap confirms it; advance to askFirstThought.
      setOnboardingStage("askFirstThought");
      setTimeout(() => startOnboardingListening(), 300);
      return;
    }

    if (onboardingStage === "askFirstThought") {
      if (onboardingListening) {
        stopOnboardingListening();
        return;
      }
      if (!firstThoughtTranscript) {
        // No thought captured yet — start listening.
        setRetryMessage(null);
        startOnboardingListening();
        return;
      }
      // Thought captured — this tap confirms it; generate insight + advance.
      setCurrentInsight(deriveInsight(firstThoughtTranscript));
      setOnboardingStage("firstInsight");
      return;
    }

    if (onboardingStage === "firstInsight") {
      // Tap ends onboarding → normal mode.
      setOnboardingStage("done");
      return;
    }

    // ── POST-ONBOARDING ─────────────────────────────────────────────────────
    if (entryListening) {
      setEntryListening(false);
      stopEntryListening();
    } else {
      setEntryListening(true);
      setBulbState("personSpeaking");
      startEntryListening();
    }
  }, [
    onboardingStage,
    onboardingListening,
    userName,
    firstThoughtTranscript,
    entryListening,
    startOnboardingListening,
    stopOnboardingListening,
    startEntryListening,
    stopEntryListening,
  ]);

  // ── Post-onboarding entry helpers ─────────────────────────────────────────
  const aiSay = useCallback((question: string) => {
    setCurrentQuestion(question);
    setBulbState("aiSpeaking");
  }, []);

  const nextQuestion = useCallback(() => {
    questionIndex.current = (questionIndex.current + 1) % QUESTIONS.length;
    return QUESTIONS[questionIndex.current];
  }, []);

  const handleStartEntry = () => {
    questionIndex.current = 0;
    setBurstKey((k) => k + 1);
    aiSay(QUESTIONS[0]);
  };

  const handleNextPrompt = () => {
    onNextPromptRequested();
    if (entryListening) {
      setEntryListening(false);
      stopEntryListening();
    }
    aiSay(nextQuestion());
  };

  const handleFinishEntry = () => {
    setEntryListening(false);
    stopEntryListening();
    onEntryComplete();
  };

  // ── DEV: press `d` to step through stages ────────────────────────────────
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "d") return;
      setOnboardingStage((current) => {
        const idx = STAGE_ORDER.indexOf(current);
        if (current === "askName") setUserName("Alex");
        if (current === "askFirstThought") {
          const mock = "I've been feeling overwhelmed at work lately.";
          setFirstThoughtTranscript(mock);
          setCurrentInsight(deriveInsight(mock));
        }
        return idx < STAGE_ORDER.length - 1 ? STAGE_ORDER[idx + 1] : current;
      });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Derived display state ─────────────────────────────────────────────────
  const displayBulbState: BulbState = onboardingActive
    ? onboardingListening
      ? "personSpeaking"
      : "idle"
    : bulbState;

  const micActive = onboardingActive ? onboardingListening : entryListening || entryListeningActive;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <motion.div
      key="entry"
      exit={{ opacity: 0, y: -60, scale: 0.92 }}
      transition={{ duration: 0.5, ease: "easeInOut" }}
      className="relative flex h-full w-full flex-col items-center px-6 pt-[118px] pb-8"
    >
      {/* Brand logo */}
      <MargoLogo className="absolute top-7 left-1/2 -translate-x-1/2" />

      {/* firstInsight panel — absolutely positioned */}
      {onboardingActive && onboardingStage === "firstInsight" && (
        <OnboardingOverlay
          stage={onboardingStage}
          insight={currentInsight ?? undefined}
        />
      )}

      {/* Title — shown only after onboarding and before entry starts */}
      <AnimatePresence>
        {!onboardingActive && !started && (
          <motion.h1
            key="title"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="relative w-fit [font-family:'Inter',Helvetica] font-medium text-[#1c2b33] text-[30px] text-center tracking-[-0.5px] leading-[1.25] whitespace-nowrap pb-px"
          >
            Activate Agent
          </motion.h1>
        )}
      </AnimatePresence>

      {/* ── Orb + below-orb text ─────��────────────────────────────────────── */}
      <div className="flex w-full flex-1 flex-col items-center justify-center gap-9">
        <div className="relative flex items-center justify-center">
          <AnimatePresence>
            {burstKey > 0 && (
              <motion.span
                key={burstKey}
                aria-hidden="true"
                className="absolute rounded-full bg-[linear-gradient(135deg,rgba(244,231,255,1)_0%,rgba(253,221,222,1)_100%)] blur-xl"
                style={{ width: 220, height: 220 }}
                initial={{ opacity: 0.6, scale: 1 }}
                animate={{ opacity: 0, scale: 1.7 }}
                transition={{ duration: 0.7, ease: "easeOut" }}
              />
            )}
          </AnimatePresence>
          <BulbAvatar state={displayBulbState} size={220} />
        </div>

        {/* Below-orb text slot */}
        <div className="flex min-h-[120px] w-full flex-col items-center justify-start px-6">
          <AnimatePresence mode="wait">

            {/* intro */}
            {onboardingStage === "intro" && (
              <motion.div
                key="intro"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="flex flex-col items-center gap-2"
              >
                <p className={`${headingCls} text-[26px]`}>Hi, I&apos;m Margo.</p>
                <p className={`${subCls} text-[16px]`}>
                  What if your journal talked back?
                </p>
                <p className="mt-6 text-[13px] text-[#1c2b33]/50 [font-family:'Inter',Helvetica] font-normal leading-[1.5] max-w-[300px] text-center">
                  By tapping &apos;Start Entry&apos; and using our app, you&apos;re agreeing to our{" "}
                  <a href={legalLinks[0].href} className="text-[#00b2ff] hover:underline">
                    Terms of Service
                  </a>
                  {" "}and{" "}
                  <a href={legalLinks[1].href} className="text-[#00b2ff] hover:underline">
                    Privacy Policy
                  </a>
                  .
                </p>
              </motion.div>
            )}

            {/* askName */}
            {onboardingStage === "askName" && (
              <motion.div
                key="askName"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="flex flex-col items-center gap-2"
              >
                <p className={`${headingCls} text-[20px] max-w-[280px]`}>
                  Before we begin — what should I call you?
                </p>
                <AnimatePresence mode="wait">
                  {retryMessage ? (
                    <motion.span
                      key="retry"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className={`${subCls} text-[14px] mt-1`}
                    >
                      {retryMessage}
                    </motion.span>
                  ) : userName ? (
                    <motion.p
                      key="name"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="[font-family:'Inter',Helvetica] font-medium text-[#1c2b33] text-[30px] tracking-[-0.6px] mt-1"
                    >
                      {userName}
                    </motion.p>
                  ) : null}
                </AnimatePresence>
                {import.meta.env.DEV && (
                  <button
                    type="button"
                    onClick={() => {
                      setUserName("Alex");
                    }}
                    className="mt-2 rounded-full border border-dashed border-[#1c2b33]/20 px-4 py-1.5 text-[12px] text-[#1c2b33]/40 [font-family:'Inter',Helvetica] hover:border-[#1c2b33]/40 hover:text-[#1c2b33]/60 transition-colors"
                  >
                    [dev] capture name &rarr; &ldquo;Alex&rdquo;
                  </button>
                )}
              </motion.div>
            )}

            {/* askFirstThought */}
            {onboardingStage === "askFirstThought" && (
              <motion.div
                key="askFirstThought"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="flex flex-col items-center gap-2"
              >
                {userName && (
                  <p className={`${headingCls} text-[20px]`}>
                    Nice to meet you, {userName}.
                  </p>
                )}
                <p className={`${subCls} text-[15px] max-w-[300px]`}>
                  Tell me one thing that&apos;s been on your mind lately.
                  Anything. Big, small, messy. I&apos;m here to listen.
                </p>
                <AnimatePresence mode="wait">
                  {retryMessage && (
                    <motion.span
                      key="retry"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className={`${subCls} text-[14px] mt-1`}
                    >
                      {retryMessage}
                    </motion.span>
                  )}
                </AnimatePresence>
                {import.meta.env.DEV && (
                  <button
                    type="button"
                    onClick={() => {
                      const mock = "I've been feeling overwhelmed at work lately.";
                      setFirstThoughtTranscript(mock);
                    }}
                    className="mt-2 rounded-full border border-dashed border-[#1c2b33]/20 px-4 py-1.5 text-[12px] text-[#1c2b33]/40 [font-family:'Inter',Helvetica] hover:border-[#1c2b33]/40 hover:text-[#1c2b33]/60 transition-colors"
                  >
                    [dev] capture first thought
                  </button>
                )}
              </motion.div>
            )}

            {/* firstInsight — text is in the panel; keep slot empty */}
            {onboardingStage === "firstInsight" && (
              <motion.div key="firstInsightPlaceholder" />
            )}

            {/* Post-onboarding AI question */}
            {!onboardingActive && aiSpeaking && (
              <motion.p
                key={currentQuestion}
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="max-w-[320px] px-2 text-center [font-family:'Inter',Helvetica] font-medium text-[#1c2b33] text-[24px] leading-[1.3] tracking-[-0.4px]"
              >
                {currentQuestion}
              </motion.p>
            )}

          </AnimatePresence>
        </div>
      </div>

      {/* ── Bottom block ─────────────────────────────────────────────────────── */}
      <div className="flex w-full flex-col items-center">
        <AnimatePresence mode="wait">
          {!started ? (
            <motion.div
              key="start"
              exit={{ opacity: 0, y: 28 }}
              transition={{ duration: 0.5, ease: "easeIn" }}
              className="flex w-full flex-col items-center gap-[60px]"
            >
              <AnimatePresence>
                {!onboardingActive && (
                  <motion.button
                    key="startBtn"
                    type="button"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    onClick={handleStartEntry}
                    className="all-[unset] box-border inline-flex items-center justify-center gap-2.5 px-[72px] py-3.5 relative rounded-[100px] bg-[linear-gradient(90deg,rgba(244,231,255,1)_0%,rgba(253,221,222,1)_100%)] cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1c2b33]"
                    aria-label="Start Entry"
                  >
                    <span className="relative [font-family:'Inter',Helvetica] font-medium text-[#1c2b33] text-lg text-center tracking-[-0.36px] leading-[1.3] whitespace-nowrap">
                      Start Entry
                    </span>
                  </motion.button>
                )}
              </AnimatePresence>
            </motion.div>
          ) : (
            <motion.div
              key="live"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="flex w-full flex-col items-center gap-7"
            >
              <div className="flex w-full items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={handleNextPrompt}
                  className="rounded-full border border-[#1c2b33]/15 px-5 py-2 text-[13px] [font-family:'Inter',Helvetica] text-[#1c2b33]/50 hover:border-[#1c2b33]/30 hover:text-[#1c2b33]/70 transition-colors"
                >
                  Next
                </button>
                <button
                  type="button"
                  onClick={handleFinishEntry}
                  className="rounded-full border border-[#1c2b33]/15 px-5 py-2 text-[13px] [font-family:'Inter',Helvetica] text-[#1c2b33]/50 hover:border-[#1c2b33]/30 hover:text-[#1c2b33]/70 transition-colors"
                >
                  Finish
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Bottom white mic button ───────────────────────────────────────────── */}
      <motion.button
        type="button"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        onClick={handleMicTap}
        whileTap={{ scale: 0.95 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex h-[56px] w-[56px] items-center justify-center rounded-full bg-white border border-[#e0e7eb] shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1c2b33] cursor-pointer z-40"
        aria-label={micActive ? "Stop recording" : "Start recording"}
        aria-pressed={micActive}
        style={{ color: micActive ? "#b6a0e0" : "#54656e" }}
      >
        {micActive && (
          <>
            <motion.span
              aria-hidden="true"
              className="absolute -inset-[4px] rounded-full border-2 border-[#b6a0e0]"
              animate={{ opacity: [0.35, 0.85, 0.35], scale: [1, 1.1, 1] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.span
              aria-hidden="true"
              className="absolute inset-0 rounded-full"
              style={{ background: "radial-gradient(circle, rgba(182,160,224,0.25) 0%, rgba(182,160,224,0) 70%)" }}
              animate={{ opacity: [0.35, 0.8, 0.35] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            />
          </>
        )}
        <span className="relative flex items-center justify-center">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="9" y="2.5" width="6" height="11" rx="3" />
            <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
            <line x1="12" y1="17.5" x2="12" y2="21" />
            <line x1="8.5" y1="21" x2="15.5" y2="21" />
          </svg>
        </span>
      </motion.button>
    </motion.div>
  );
};
