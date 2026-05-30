/**
 * MicScreen — the root orb / journaling screen of the Margo app.
 *
 * This is the first thing a user sees when they open Margo. It owns:
 *   - The centered orb (BulbAvatar) that reacts to AI / user speaking states.
 *   - The bottom mic button + finish/next side buttons (Controls).
 *   - The live transcript area that appears once recording starts.
 *   - Onboarding text rendered below the orb in normal document flow.
 *   - OnboardingOverlay for absolutely-positioned elements (firstInsight panel).
 *
 * Onboarding stage machine
 * ────────────────────────
 *   'intro'          → "Hi, I'm Margo" (auto-advances after 3 s)
 *   'askName'        → collect the user's name via voice
 *   'askFirstThought'→ ask for a free-form opening thought via voice
 *   'firstInsight'   → show the first mirror moment panel
 *   'done'           → onboarding complete; regular entry flow active
 *
 * DEV shortcut: press `d` to step through stages one at a time.
 *
 * Plugging in the next steps
 * ──────────────────────────
 *   1. Voice logic → replace the demo STT `useEffect` with a real STT hook
 *      that sets `isListening`, feeds `setPersonTranscript`, and calls
 *      `onUserFinishedSpeaking` when the user stops speaking.
 *   2. Real name / thought capture → call `handleNameCaptured` /
 *      `handleFirstThoughtCaptured` from the STT hook when audio is detected
 *      during the respective stages.
 *   3. AI messages → swap the local QUESTIONS array for a real AI call inside
 *      `aiSay()`. The function signature and call sites stay the same.
 */

import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BulbAvatar, type BulbState } from "../../BulbAvatar";
import { Controls } from "../../Controls";
import { MargoLogo } from "../../MargoLogo";
import { OnboardingOverlay } from "./OnboardingOverlay";

/* ─────────────────────────────────────────────────────────────────────────── */
/* Onboarding stage type                                                        */
/* ─────────────────────────────────────────────────────────────────────────── */

/**
 * Describes which step of the first-time onboarding flow is active.
 * 'intro'          → "Hi, I'm Margo" greeting (auto-advances after 3 s).
 * 'askName'        → collect the user's name.
 * 'askFirstThought'→ ask for a free-form opening thought.
 * 'firstInsight'   → show the first mirror moment panel.
 * 'done'           → onboarding complete; drop into normal entry flow.
 */
export type OnboardingStage =
  | "intro"
  | "askName"
  | "askFirstThought"
  | "firstInsight"
  | "done";

/* ─────────────────────────────────────────────────────────────────────────── */
/* Demo question bank — swap with real AI responses when ready                 */
/* ─────────────────────────────────────────────────────────────────────────── */

const QUESTIONS = [
  "How did that make you feel?",
  "What do you think triggered that?",
  "Is there anything you'd do differently?",
  "What would you tell a friend in your situation?",
];

/* ─────────────────────────────────────────────────────────────────────────── */
/* Ordered onboarding stage sequence (for the dev keyboard shortcut)           */
/* ─────────────────────────────────────────────────────────────────────────── */

const STAGE_ORDER: OnboardingStage[] = [
  "intro",
  "askName",
  "askFirstThought",
  "firstInsight",
  "done",
];

/* ─────────────────────────────────────────────────────────────────────────── */
/* Legal links                                                                  */
/* ─────────────────────────────────────────────────────────────────────────── */

const legalLinks = [
  { label: "Terms of Service", href: "#terms" },
  { label: "Privacy Policy", href: "#privacy" },
];

/* ─────────────────────────────────────────────────────────────────────────── */
/* Placeholder backend handlers                                                 */
/* ─────────────────────────────────────────────────────────────────────────── */

function onUserFinishedSpeaking(transcript: string): void {
  // TODO: send the captured transcript to the AI and await the next question.
  console.log("[AI] user finished speaking:", transcript);
}

function onNextPromptRequested(): void {
  // TODO: ask the AI for the next question/prompt.
  console.log("[AI] next prompt requested");
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Shared text styles                                                           */
/* ─────────────────────────────────────────────────────────────────────────── */

const headingCls =
  "[font-family:'Inter',Helvetica] font-medium text-[#1c2b33] tracking-[-0.5px] leading-[1.25] text-center";
const subCls =
  "[font-family:'Inter',Helvetica] font-normal text-[#1c2b33]/55 tracking-[-0.3px] leading-[1.5] text-center";

/* ─────────────────────────────────────────────────────────────────────────── */
/* Props                                                                        */
/* ─────────────────────────────────────────────────────────────────────────── */

interface MicScreenProps {
  /**
   * Called when the user taps "Finish entry". The parent (Frame) uses this to
   * transition the app to the loading → reflection phase.
   */
  onEntryComplete: () => void;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Component                                                                    */
/* ─────────────────────────────────────────────────────────────────────────── */

export const MicScreen = ({ onEntryComplete }: MicScreenProps): JSX.Element => {
  // ── Onboarding state ──────────────────────────────────────────────────────
  /**
   * Active onboarding stage. Starts at 'intro' for all new sessions.
   * TODO: skip to 'done' if the user has already completed onboarding
   * (check a persisted flag from backend / localStorage).
   */
  const [onboardingStage, setOnboardingStage] =
    useState<OnboardingStage>("intro");

  /** Name captured during the 'askName' stage. */
  const [capturedName, setCapturedName] = useState("");

  // ── Voice / recording state ───────────────────────────────────────────────
  const [isListening, setIsListening] = useState(false);

  // ── Conversation / orb state ──────────────────────────────────────────────
  const [bulbState, setBulbState] = useState<BulbState>("idle");
  const [currentQuestion, setCurrentQuestion] = useState(QUESTIONS[0]);
  const [personTranscript, setPersonTranscript] = useState("");
  const [burstKey, setBurstKey] = useState(0);
  const questionIndex = useRef(0);

  const started = bulbState !== "idle";
  const aiSpeaking = bulbState === "aiSpeaking";
  const personSpeaking = bulbState === "personSpeaking";

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
        return idx < STAGE_ORDER.length - 1
          ? STAGE_ORDER[idx + 1]
          : current;
      });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Onboarding callbacks ──────────────────────────────────────────────────

  const handleNameCaptured = (name: string) => {
    setCapturedName(name);
    setTimeout(() => setOnboardingStage("askFirstThought"), 900);
  };

  const handleFirstThoughtCaptured = (transcript: string) => {
    console.log("[onboarding] first thought:", transcript);
    setOnboardingStage("firstInsight");
  };

  // ── AI helpers ────────────────────────────────────────────────────────────
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

  const handleMicToggle = () => {
    if (isListening) {
      setIsListening(false);
      onUserFinishedSpeaking(personTranscript);
      aiSay(nextQuestion());
    } else {
      setIsListening(true);
      listen();
    }
  };

  const handleNextPrompt = () => {
    onNextPromptRequested();
    if (isListening) setIsListening(false);
    if (!aiSpeaking && personTranscript)
      onUserFinishedSpeaking(personTranscript);
    aiSay(nextQuestion());
  };

  const handleFinishEntry = () => {
    if (isListening) setIsListening(false);
    onEntryComplete();
  };

  // ── Demo STT simulation ───────────────────────────────────────────────────
  // DEMO ONLY: simulates a live speech-to-text stream while `isListening`.
  // Replace with a real STT hook when voice is wired in.
  useEffect(() => {
    if (!isListening) return;
    const words =
      "I think it made me feel a little more hopeful than before, like things might actually be okay.".split(
        " ",
      );
    let i = 0;
    setPersonTranscript("");
    const id = setInterval(() => {
      i += 1;
      setPersonTranscript(words.slice(0, i).join(" "));
      if (i >= words.length) clearInterval(id);
    }, 180);
    return () => clearInterval(id);
  }, [isListening]);

  // ── Render ────────────────────────────────────────────────────────────────

  const onboardingActive = onboardingStage !== "done";

  return (
    <motion.div
      key="entry"
      exit={{ opacity: 0, y: -60, scale: 0.92 }}
      transition={{ duration: 0.5, ease: "easeInOut" }}
      className="relative flex h-full w-full flex-col items-center px-6 pt-[118px] pb-8"
    >
      {/* Brand logo, anchored at the top of the screen. */}
      <MargoLogo className="absolute top-7 left-1/2 -translate-x-1/2" />

      {/* firstInsight panel — absolutely positioned, rendered over the screen */}
      {onboardingActive && <OnboardingOverlay stage={onboardingStage} />}

      {/* Title — visible only after onboarding and before entry starts. */}
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

      {/* ── Orb ────────────────────────────────────────────────────────────── */}
      <div className="flex w-full flex-1 flex-col items-center justify-center gap-9">
        <div className="relative flex items-center justify-center">
          {/* Burst ring that fires on entry start. */}
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

          <BulbAvatar state={bulbState} size={227} />
        </div>

        {/* ── Below-orb text: onboarding prompts OR AI question ────────────── */}
        <div className="flex min-h-[80px] w-full flex-col items-center justify-center px-6">
          <AnimatePresence mode="wait">

            {/* Onboarding: intro */}
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
              </motion.div>
            )}

            {/* Onboarding: ask name */}
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
                  {capturedName ? (
                    <motion.p
                      key="name"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="[font-family:'Inter',Helvetica] font-medium text-[#1c2b33] text-[30px] tracking-[-0.6px] mt-1"
                    >
                      {capturedName}
                    </motion.p>
                  ) : (
                    <motion.span
                      key="hint"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className={`${subCls} text-[14px]`}
                    >
                      Listening for your name&hellip;
                    </motion.span>
                  )}
                </AnimatePresence>
                {import.meta.env.DEV && (
                  <button
                    type="button"
                    onClick={() => handleNameCaptured("Alex")}
                    className="mt-2 rounded-full border border-dashed border-[#1c2b33]/20 px-4 py-1.5 text-[12px] text-[#1c2b33]/40 [font-family:'Inter',Helvetica] hover:border-[#1c2b33]/40 hover:text-[#1c2b33]/60 transition-colors"
                  >
                    [dev] simulate name &rarr; &ldquo;Alex&rdquo;
                  </button>
                )}
              </motion.div>
            )}

            {/* Onboarding: ask first thought */}
            {onboardingStage === "askFirstThought" && (
              <motion.div
                key="askFirstThought"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="flex flex-col items-center gap-2"
              >
                {capturedName && (
                  <p className={`${headingCls} text-[20px]`}>
                    Nice to meet you, {capturedName}.
                  </p>
                )}
                <p className={`${subCls} text-[15px] max-w-[300px]`}>
                  Tell me one thing that&apos;s been on your mind lately.
                  Anything. Big, small, messy. I&apos;m here to listen.
                </p>
                {import.meta.env.DEV && (
                  <button
                    type="button"
                    onClick={() =>
                      handleFirstThoughtCaptured(
                        "I've been feeling overwhelmed at work lately.",
                      )
                    }
                    className="mt-2 rounded-full border border-dashed border-[#1c2b33]/20 px-4 py-1.5 text-[12px] text-[#1c2b33]/40 [font-family:'Inter',Helvetica] hover:border-[#1c2b33]/40 hover:text-[#1c2b33]/60 transition-colors"
                  >
                    [dev] simulate first thought captured
                  </button>
                )}
              </motion.div>
            )}

            {/* Onboarding: firstInsight — text slot is empty; panel is positioned */}
            {onboardingStage === "firstInsight" && (
              <motion.div key="firstInsightPlaceholder" />
            )}

            {/* Post-onboarding: AI question */}
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

      {/* ── Bottom block: Start Entry (idle) OR transcript + controls ───────── */}
      <div className="flex w-full flex-col items-center">
        <AnimatePresence mode="wait">
          {!started ? (
            <motion.div
              key="start"
              exit={{ opacity: 0, y: 28 }}
              transition={{ duration: 0.5, ease: "easeIn" }}
              className="flex w-full flex-col items-center gap-[60px]"
            >
              {/* Hide the Start Entry button until onboarding is complete. */}
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

              <p className="relative self-stretch [font-family:'Inter',Helvetica] font-normal text-transparent text-base text-center tracking-[-0.32px] leading-[22px]">
                <span className="text-[#1c2b33b8] tracking-[-0.05px]">
                  By tapping &apos;Start Entry&apos; and using our app,
                  you&apos;re agreeing to our{" "}
                </span>
                <a
                  href={legalLinks[0].href}
                  className="text-[#00b2ff] tracking-[-0.05px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00b2ff] rounded-sm"
                >
                  {legalLinks[0].label}
                </a>
                <span className="text-[#1c2b33b8] tracking-[-0.05px]">
                  {" "}
                  and{" "}
                </span>
                <a
                  href={legalLinks[1].href}
                  className="text-[#00b2ff] tracking-[-0.05px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00b2ff] rounded-sm"
                >
                  {legalLinks[1].label}
                </a>
              </p>
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

              <Controls
                isRecording={isListening}
                onMicToggle={handleMicToggle}
                onFinish={handleFinishEntry}
                onNext={handleNextPrompt}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
