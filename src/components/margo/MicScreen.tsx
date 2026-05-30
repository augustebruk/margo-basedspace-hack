/**
 * MicScreen — the root orb / journaling screen of the Margo app.
 *
 * Onboarding stage machine
 * ────────────────────────
 *   'intro'           → "Hi, I'm Margo" (auto-advances after 3 s)
 *   'askName'         → mic opens automatically; first utterance → userName
 *   'askFirstThought' → mic opens automatically; utterance → firstThoughtTranscript
 *   'firstInsight'    → shows mirror-moment panel with real transcript + insight
 *   'done'            → regular entry flow
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
  const [retryCount, setRetryCount] = useState(0);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);

  // ── Voice / recording state (post-onboarding entry) ───────────────────────
  const [bulbState, setBulbState] = useState<BulbState>("idle");
  const [currentQuestion, setCurrentQuestion] = useState(QUESTIONS[0]);
  const [personTranscript, setPersonTranscript] = useState("");
  const [burstKey, setBurstKey] = useState(0);
  const questionIndex = useRef(0);

  const started = bulbState !== "idle";
  const aiSpeaking = bulbState === "aiSpeaking";
  const personSpeaking = bulbState === "personSpeaking";
  const onboardingActive = onboardingStage !== "done";

  // ── Real STT hook (onboarding voice capture) ──────────────────────────────
  const onboardingSttOnEnd = useCallback(
    (transcript: string) => {
      const trimmed = transcript.trim();

      if (onboardingStage === "askName") {
        if (!trimmed) {
          // Retry once on empty capture.
          if (retryCount < 1) {
            setRetryCount((c) => c + 1);
            setRetryMessage("I didn't catch that — let's try again.");
            setTimeout(() => {
              setRetryMessage(null);
              startOnboardingListening();
            }, 1800);
          } else {
            // Second failure: skip to a default name and continue.
            setUserName("friend");
            setRetryCount(0);
            setRetryMessage(null);
            setTimeout(() => setOnboardingStage("askFirstThought"), 600);
          }
          return;
        }
        // Take the first word as the name, capitalise it.
        const name = trimmed.split(/\s+/)[0];
        const capitalised = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
        setUserName(capitalised);
        setRetryCount(0);
        setRetryMessage(null);
        setTimeout(() => setOnboardingStage("askFirstThought"), 900);
      }

      if (onboardingStage === "askFirstThought") {
        if (!trimmed) {
          if (retryCount < 1) {
            setRetryCount((c) => c + 1);
            setRetryMessage("I didn't catch that — let's try again.");
            setTimeout(() => {
              setRetryMessage(null);
              startOnboardingListening();
            }, 1800);
          } else {
            // Skip to insight with placeholder.
            const fallback = "Something on my mind.";
            setFirstThoughtTranscript(fallback);
            setCurrentInsight(deriveInsight(fallback));
            setRetryCount(0);
            setRetryMessage(null);
            setOnboardingStage("firstInsight");
          }
          return;
        }
        setFirstThoughtTranscript(trimmed);
        setCurrentInsight(deriveInsight(trimmed));
        setRetryCount(0);
        setRetryMessage(null);
        setOnboardingStage("firstInsight");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onboardingStage, retryCount],
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

  // ── Auto-start mic on stage entry ─────────────────────────────────────────
  useEffect(() => {
    if (onboardingStage === "askName" || onboardingStage === "askFirstThought") {
      // Small delay so the stage animation finishes before the mic opens.
      const t = setTimeout(() => startOnboardingListening(), 600);
      return () => clearTimeout(t);
    }
    // Stop mic if we leave a listening stage.
    if (onboardingStage !== "askName" && onboardingStage !== "askFirstThought") {
      stopOnboardingListening();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboardingStage]);

  // ── Onboarding: auto-advance 'intro' → 'askName' after 3 s ───────────────
  useEffect(() => {
    if (onboardingStage !== "intro") return;
    const t = setTimeout(() => setOnboardingStage("askName"), 3000);
    return () => clearTimeout(t);
  }, [onboardingStage]);

  // ── DEV ONLY: press `d` to step through stages ───────────────────────────
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "d") return;
      setOnboardingStage((current) => {
        const idx = STAGE_ORDER.indexOf(current);
        // Inject mock data when fast-forwarding through capture stages.
        if (current === "askName") {
          setUserName("Alex");
        }
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

  // ── Post-onboarding AI helpers ────────────────────────────────────────────
  const aiSay = useCallback((question: string) => {
    setCurrentQuestion(question);
    setPersonTranscript("");
    setBulbState("aiSpeaking");
  }, []);

  const listen = useCallback(() => {
    setBulbState("personSpeaking");
  }, []);

  const nextQuestion = useCallback(() => {
    questionIndex.current = (questionIndex.current + 1) % QUESTIONS.length;
    return QUESTIONS[questionIndex.current];
  }, []);

  // ── Event handlers ────────────────────────────────────────────────────────
  const handleStartEntry = () => {
    questionIndex.current = 0;
    setBurstKey((k) => k + 1);
    aiSay(QUESTIONS[0]);
  };

  const [entryListening, setEntryListening] = useState(false);

  const handleMicToggle = () => {
    if (entryListening) {
      setEntryListening(false);
      onUserFinishedSpeaking(personTranscript);
      aiSay(nextQuestion());
    } else {
      setEntryListening(true);
      listen();
    }
  };

  const handleNextPrompt = () => {
    onNextPromptRequested();
    if (entryListening) setEntryListening(false);
    if (!aiSpeaking && personTranscript) onUserFinishedSpeaking(personTranscript);
    aiSay(nextQuestion());
  };

  const handleFinishEntry = () => {
    setEntryListening(false);
    onEntryComplete();
  };

  // ── Demo transcript stream (post-onboarding, entry phase only) ───────────
  useEffect(() => {
    if (!entryListening) return;
    const words =
      "I think it made me feel a little more hopeful than before, like things might actually be okay.".split(" ");
    let i = 0;
    setPersonTranscript("");
    const id = setInterval(() => {
      i += 1;
      setPersonTranscript(words.slice(0, i).join(" "));
      if (i >= words.length) clearInterval(id);
    }, 180);
    return () => clearInterval(id);
  }, [entryListening]);

  // ── Render ────────────────────────────────────────────────────────────────

  // During onboarding, show orb in listening state when mic is open.
  const displayBulbState: BulbState = onboardingActive
    ? onboardingListening
      ? "personSpeaking"
      : "idle"
    : bulbState;

  return (
    <motion.div
      key="entry"
      exit={{ opacity: 0, y: -60, scale: 0.92 }}
      transition={{ duration: 0.5, ease: "easeInOut" }}
      className="relative flex h-full w-full flex-col items-center px-6 pt-[118px] pb-8"
    >
      {/* Brand logo */}
      <MargoLogo className="absolute top-7 left-1/2 -translate-x-1/2" />

      {/* firstInsight bottom panel — absolutely positioned */}
      {onboardingActive && onboardingStage === "firstInsight" && (
        <OnboardingOverlay
          stage={onboardingStage}
          insight={currentInsight ?? undefined}
        />
      )}

      {/* Title — shown only after onboarding and before entry starts. */}
      <AnimatePresence>
        {!onboardingActive && !started && (
          <motion.h1
            key="title"
            id="activate-agent-title"
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

      {/* ── Orb + below-orb text ──────────────────────────────────────────── */}
      <div className="flex w-full flex-1 flex-col items-center justify-center gap-9">
        <div className="relative flex items-center justify-center">
          {/* Burst ring on entry start */}
          <AnimatePresence>
            {burstKey > 0 && (
              <motion.span
                key={burstKey}
                aria-hidden="true"
                className="absolute rounded-full bg-[linear-gradient(135deg,rgba(244,231,255,1)_0%,rgba(253,221,222,1)_100%)] blur-xl"
                style={{ width: 227, height: 227 }}
                initial={{ opacity: 0.6, scale: 1 }}
                animate={{ opacity: 0, scale: 1.7 }}
                transition={{ duration: 0.7, ease: "easeOut" }}
              />
            )}
          </AnimatePresence>

          <BulbAvatar state={displayBulbState} size={227} />
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
                      setTimeout(() => setOnboardingStage("askFirstThought"), 900);
                    }}
                    className="mt-2 rounded-full border border-dashed border-[#1c2b33]/20 px-4 py-1.5 text-[12px] text-[#1c2b33]/40 [font-family:'Inter',Helvetica] hover:border-[#1c2b33]/40 hover:text-[#1c2b33]/60 transition-colors"
                  >
                    [dev] simulate name &rarr; &ldquo;Alex&rdquo;
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
                  ) : null}
                </AnimatePresence>
                {import.meta.env.DEV && (
                  <button
                    type="button"
                    onClick={() => {
                      const mock = "I've been feeling overwhelmed at work lately.";
                      setFirstThoughtTranscript(mock);
                      setCurrentInsight(deriveInsight(mock));
                      setOnboardingStage("firstInsight");
                    }}
                    className="mt-2 rounded-full border border-dashed border-[#1c2b33]/20 px-4 py-1.5 text-[12px] text-[#1c2b33]/40 [font-family:'Inter',Helvetica] hover:border-[#1c2b33]/40 hover:text-[#1c2b33]/60 transition-colors"
                  >
                    [dev] simulate first thought captured
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
              <div className="flex min-h-[64px] w-full items-end justify-center px-2">
                <AnimatePresence mode="wait">
                  {personSpeaking && (
                    <motion.div
                      key="transcript"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ duration: 0.35, ease: "easeOut" }}
                      className="flex w-full flex-col items-center gap-2"
                    >
                      <span className="[font-family:'Inter',Helvetica] font-medium uppercase tracking-[1.5px] text-[12px] text-[#1c2b33]/40">
                        Your turn
                      </span>
                      <p className="max-w-[300px] text-center [font-family:'Inter',Helvetica] font-normal text-[15px] leading-[22px] text-[#1c2b33]/55">
                        {personTranscript || "Listening\u2026"}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Bottom white mic button (fixed) ────────────────────────────── */}
      <motion.button
        type="button"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        onClick={handleMicToggle}
        whileTap={{ scale: 0.95 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex h-[56px] w-[56px] items-center justify-center rounded-full bg-white border border-[#e0e7eb] shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1c2b33] cursor-pointer z-40"
        aria-label={entryListening ? "Stop recording" : "Start recording"}
        aria-pressed={entryListening}
        style={{
          color: entryListening ? "#b6a0e0" : "#54656e",
        }}
      >
        {entryListening && (
          <>
            <motion.span
              aria-hidden="true"
              className="absolute -inset-[4px] rounded-full border-2 border-[#b6a0e0]"
              initial={{ opacity: 0.4, scale: 1 }}
              animate={{ opacity: [0.35, 0.85, 0.35], scale: [1, 1.1, 1] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.span
              aria-hidden="true"
              className="absolute inset-0 rounded-full"
              style={{
                background: "radial-gradient(circle, rgba(182,160,224,0.25) 0%, rgba(182,160,224,0) 70%)",
              }}
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
