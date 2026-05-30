/**
 * MicScreen — the root orb / journaling screen of the Margo app.
 *
 * This is the first thing a user sees when they open Margo. It owns:
 *   - The centered orb (BulbAvatar) that reacts to AI / user speaking states.
 *   - The bottom mic button + finish/next side buttons (Controls).
 *   - The live transcript area that appears once recording starts.
 *   - Placeholders for the onboarding overlay and insight overlays.
 *
 * State overview
 * ──────────────
 *   onboardingStage  Controls which onboarding step is active (if any).
 *                    'idle'        → brand-new user, onboarding not yet shown.
 *                    'intro'       → "Hi, I'm Margo" greeting step.
 *                    'name'        → Ask the user their name.
 *                    'firstThought'→ Ask for their first free-form thought.
 *                    'done'        → Onboarding complete; regular entry flow.
 *
 *   isListening      True while the mic is actively capturing audio. Drive
 *                    this from a real STT hook when voice logic is wired in.
 *
 * Plugging in the next steps
 * ──────────────────────────
 *   1. Onboarding overlay  → render it conditionally on `onboardingStage`
 *      inside the TODO block below the orb. Drive stage transitions with
 *      `setOnboardingStage`. When stage reaches 'done', regular entry starts.
 *
 *   2. Insight / mockup overlays → render on top of the orb container via
 *      absolute positioning inside the TODO block for overlays.
 *
 *   3. Voice logic → replace the demo STT `useEffect` with a real hook that
 *      sets `isListening`, feeds `setPersonTranscript`, and calls
 *      `onUserFinishedSpeaking` when the user stops speaking.
 *
 *   4. AI messages → swap the local QUESTIONS array for a real AI call inside
 *      `aiSay()`. The function signature and call sites stay the same.
 */

import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BulbAvatar, type BulbState } from "../../BulbAvatar";
import { Controls } from "../../Controls";
import { MargoLogo } from "../../MargoLogo";

/* ─────────────────────────────────────────────────────────────────────────── */
/* Onboarding stage type                                                       */
/* ─────────────────────────────────────────────────────────────────────────── */

/**
 * Describes which step of the first-time onboarding flow is active.
 * 'idle'  → user is new but onboarding hasn't been triggered yet.
 * 'intro' → "Hi, I'm Margo" greeting.
 * 'name'  → collect the user's name.
 * 'firstThought' → ask for a free-form opening thought.
 * 'done'  → onboarding is complete; drop into normal entry flow.
 */
export type OnboardingStage =
  | "idle"
  | "intro"
  | "name"
  | "firstThought"
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
   * Which onboarding step is currently active.
   * TODO: initialise from user preferences / backend (e.g. skip when the user
   * has already completed onboarding in a previous session).
   */
  const [onboardingStage, setOnboardingStage] =
    useState<OnboardingStage>("idle");

  // ── Voice / recording state ───────────────────────────────────────────────
  /**
   * Whether the mic is actively capturing audio.
   * TODO: drive this from a real STT hook (e.g. Web Speech API, Whisper
   * streaming, etc.) — replace the demo `useEffect` simulation below.
   */
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

  // ── AI helpers ────────────────────────────────────────────────────────────
  /**
   * Make the AI "say" a question — update the displayed question and switch
   * the orb to its speaking state.
   * TODO: swap the local question string with a real AI-generated message.
   */
  const aiSay = useCallback((question: string) => {
    setCurrentQuestion(question);
    setPersonTranscript("");
    setBulbState("aiSpeaking");
  }, []);

  /**
   * Put the orb into listening state.
   * TODO: also start the real STT stream here.
   */
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

    // TODO: if onboardingStage === 'idle', begin the onboarding flow here
    // instead of jumping straight to the first journal question.
    // e.g. setOnboardingStage('intro');
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
    // Notify the parent so it can transition to loading → reflection.
    onEntryComplete();
  };

  // ── Demo STT simulation ───────────────────────────────────────────────────
  // DEMO ONLY: simulates a live speech-to-text stream while `isListening`.
  // Remove this effect and replace with a real STT hook when voice is wired in.
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
  return (
    <motion.div
      key="entry"
      exit={{ opacity: 0, y: -60, scale: 0.92 }}
      transition={{ duration: 0.5, ease: "easeInOut" }}
      className="relative flex h-full w-full flex-col items-center px-6 pt-[118px] pb-8"
    >
      {/* Brand logo, anchored at the top of the screen. */}
      <MargoLogo className="absolute top-7 left-1/2 -translate-x-1/2" />

      {/* ─── TODO: Onboarding overlay ────────────────────────────────────────
       * Render the onboarding steps here, conditionally on `onboardingStage`.
       * Each step should be a <motion.div> that animates in/out with
       * AnimatePresence. Advance stages with `setOnboardingStage(...)`.
       *
       * Example:
       *   {onboardingStage === 'intro' && (
       *     <OnboardingIntro onNext={() => setOnboardingStage('name')} />
       *   )}
       *   {onboardingStage === 'name' && (
       *     <OnboardingName onNext={() => setOnboardingStage('firstThought')} />
       *   )}
       *   {onboardingStage === 'firstThought' && (
       *     <OnboardingFirstThought onDone={() => setOnboardingStage('done')} />
       *   )}
       * ─────────────────────────────────────────────────────────────────── */}

      {/* Title — fades out once the entry starts. */}
      <AnimatePresence>
        {!started && (
          <motion.h1
            key="title"
            id="activate-agent-title"
            initial={false}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="relative w-fit [font-family:'Inter',Helvetica] font-medium text-[#1c2b33] text-[30px] text-center tracking-[-0.5px] leading-[1.25] whitespace-nowrap pb-px"
          >
            Activate Agent
          </motion.h1>
        )}
      </AnimatePresence>

      {/* ─── Orb + AI question + overlay container ─────────────────────────── */}
      <div className="flex w-full flex-1 flex-col items-center justify-center gap-9">
        <div className="relative flex items-center justify-center">
          {/* Burst ring that fires on entry start. */}
          <AnimatePresence>
            {burstKey > 0 && (
              <motion.span
                key={burstKey}
                aria-hidden="true"
                className="absolute h-[232px] w-[232px] rounded-full bg-[linear-gradient(135deg,rgba(244,231,255,1)_0%,rgba(253,221,222,1)_100%)] blur-xl"
                initial={{ opacity: 0.6, scale: 1 }}
                animate={{ opacity: 0, scale: 1.7 }}
                transition={{ duration: 0.7, ease: "easeOut" }}
              />
            )}
          </AnimatePresence>

          <BulbAvatar state={bulbState} />

          {/* ─── TODO: Insight / mockup overlays ─────────────────────────────
           * Render floating insight cards or visual mockups on top of the orb
           * here, using absolute positioning relative to this container.
           *
           * Example:
           *   {activeInsight && (
           *     <motion.div
           *       className="absolute -top-4 right-0 ..."
           *       initial={{ opacity: 0, y: 8 }}
           *       animate={{ opacity: 1, y: 0 }}
           *     >
           *       <InsightCard insight={activeInsight} />
           *     </motion.div>
           *   )}
           * ────────────────────────────────────────────────────────────────── */}
        </div>

        {/* AI question text — fades in/out with each new question. */}
        <AnimatePresence mode="wait">
          {aiSpeaking && (
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

      {/* ─── Bottom block: Start Entry (idle) OR transcript + controls ──────── */}
      <div className="flex w-full flex-col items-center">
        <AnimatePresence mode="wait">
          {!started ? (
            <motion.div
              key="start"
              exit={{ opacity: 0, y: 28 }}
              transition={{ duration: 0.5, ease: "easeIn" }}
              className="flex w-full flex-col items-center gap-[60px]"
            >
              <button
                type="button"
                onClick={handleStartEntry}
                className="all-[unset] box-border inline-flex items-center justify-center gap-2.5 px-[72px] py-3.5 relative rounded-[100px] bg-[linear-gradient(90deg,rgba(244,231,255,1)_0%,rgba(253,221,222,1)_100%)] cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1c2b33]"
                aria-label="Start Entry"
              >
                <span className="relative [font-family:'Inter',Helvetica] font-medium text-[#1c2b33] text-lg text-center tracking-[-0.36px] leading-[1.3] whitespace-nowrap">
                  Start Entry
                </span>
              </button>
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
