import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BulbAvatar, type BulbState } from "./BulbAvatar";
import { Controls } from "./Controls";
import { MargoLogo } from "./MargoLogo";
import { ReflectionView, type ReflectionViewProps } from "./ReflectionView";
import { PracticeView } from "./PracticeView";
import { LiveVoiceAgent } from "./LiveVoiceAgent";

const legalLinks = [
  { label: "Terms of Service", href: "#terms" },
  { label: "Privacy Policy", href: "#privacy" },
];

// Demo question bank. The AI always opens with the first one. Replace these
// (or drive them from the backend via `aiSay()`) with real AI messages.
const QUESTIONS = [
  "How did that make you feel?",
  "What do you think triggered that?",
  "Is there anything you'd do differently?",
  "What would you tell a friend in your situation?",
];

// MOCK reflection output. Replace with real AI results — the shape already
// supports raw themes + recurrence/frequency info for the patterns.
const REFLECTION: Omit<
  ReflectionViewProps,
  "aiSpeaking" | "onSummaryComplete" | "onStartDailyPractice"
> = {
  // The spoken reflection is written as a warm reframe (1–3 sentences).
  summary:
    "Across your last few entries, you often mention feeling drained after saying yes to extra work. It seems like your need for rest keeps colliding with a fear of letting people down. What would it look like to protect a little more rest this week without disappointing yourself?",
  patterns: [
    { label: "Overwhelm", recurrenceLabel: "3x this week" },
    { label: "Need for rest", recurrenceLabel: "recurring" },
    { label: "Boundary setting", recurrenceLabel: "2 entries" },
    { label: "Self-criticism" },
  ],
  nextSteps: [
    "Block 20 minutes of unscheduled rest today.",
    "Say no to one non-essential request.",
    "Note one thing you handled well.",
  ],
};

/* ============================================================================
 * PLACEHOLDER BACKEND HANDLERS — replace bodies with real AI/navigation calls.
 * ==========================================================================*/
function onUserFinishedSpeaking(transcript: string): void {
  // TODO: send the captured transcript to the AI and await the next question.
  console.log("[AI] user finished speaking:", transcript);
}
function onFinishEntry(): void {
  // TODO: finalize the entry server-side and request the reflection summary.
  console.log("[AI] finish entry → generate reflection");
}
function onNextPrompt(): void {
  // TODO: ask the AI for the next question/prompt.
  console.log("[AI] next prompt requested");
}

type Phase = "entry" | "loading" | "reflection" | "practice" | "live";

// How long the white "preparing" loading screen shows before the reflection.
const LOADING_MS = 1900;

export const Frame = (): JSX.Element => {
  // Which screen we're on: journaling → loading → reflection → practice.
  const [phase, setPhase] = useState<Phase>("entry");

  // --- Entry conversation state machine -------------------------------
  const [bulbState, setBulbState] = useState<BulbState>("idle");
  const [currentQuestion, setCurrentQuestion] = useState(QUESTIONS[0]);
  const [personTranscript, setPersonTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [burstKey, setBurstKey] = useState(0);
  const questionIndex = useRef(0);

  // Reflection screen: true while the AI "reads" the summary (drives the wave).
  const [reflectionSpeaking, setReflectionSpeaking] = useState(false);

  // Live voice agent state
  const [showLiveAgent, setShowLiveAgent] = useState(false);
  const [liveAiSpeaking, setLiveAiSpeaking] = useState(false);
  const [livePersonSpeaking, setLivePersonSpeaking] = useState(false);
  const [liveQuestion, setLiveQuestion] = useState("");
  const [liveTranscript, setLiveTranscript] = useState("");

  const started = bulbState !== "idle";
  const aiSpeaking = bulbState === "aiSpeaking";
  const personSpeaking = bulbState === "personSpeaking";

  // ===================================================================
  // PLUG IN REAL AI HERE
  //   • aiSay(text)            → call when the AI produces a new message.
  //   • listen()               → call when you start capturing the user.
  //   • setPersonTranscript(s) → feed live speech-to-text results into this.
  // ===================================================================
  const aiSay = useCallback((question: string) => {
    setCurrentQuestion(question);
    setPersonTranscript("");
    setBulbState("aiSpeaking");
  }, []);

  const listen = useCallback(() => {
    setBulbState("personSpeaking");
  }, []);
  // ===================================================================

  const nextQuestion = useCallback(() => {
    questionIndex.current = (questionIndex.current + 1) % QUESTIONS.length;
    return QUESTIONS[questionIndex.current];
  }, []);

  const handleStartEntry = () => {
    questionIndex.current = 0;
    setBurstKey((k) => k + 1);
    aiSay(QUESTIONS[0]);
  };

  const handleMicToggle = () => {
    if (isRecording) {
      setIsRecording(false);
      onUserFinishedSpeaking(personTranscript);
      aiSay(nextQuestion());
    } else {
      setIsRecording(true);
      listen();
    }
  };

  const handleNextPrompt = () => {
    onNextPrompt();
    if (isRecording) setIsRecording(false);
    if (!aiSpeaking && personTranscript) onUserFinishedSpeaking(personTranscript);
    aiSay(nextQuestion());
  };

  // Finish entry → stop recording and show the white "preparing" loading
  // screen while the reflection is generated.
  const handleFinishEntry = () => {
    if (isRecording) setIsRecording(false);
    onFinishEntry();
    setPhase("loading");
  };

  // After the loading screen, move into the reflection with the AI speaking.
  useEffect(() => {
    if (phase !== "loading") return;
    const t = setTimeout(() => {
      setReflectionSpeaking(true);
      setPhase("reflection");
    }, LOADING_MS);
    return () => clearTimeout(t);
  }, [phase]);

  // Reflection CTA → the practice experience (third step).
  const handleStartDailyPractice = () => {
    // TODO: build the real practice from the next steps.
    console.log("[practice] start daily practice");
    setReflectionSpeaking(false);
    setPhase("practice");
  };

  // Back to home → reset the whole flow to the idle entry screen.
  const handleBackHome = () => {
    // TODO: connect to real navigation. For now, reset to the start.
    console.log("[nav] back to home");
    setIsRecording(false);
    setReflectionSpeaking(false);
    setPersonTranscript("");
    questionIndex.current = 0;
    setBulbState("idle");
    setPhase("entry");
  };

  // Toggle live agent demo
  const handleToggleLiveAgent = () => {
    if (showLiveAgent) {
      setShowLiveAgent(false);
      setPhase("entry");
      setBulbState("idle");
    } else {
      setShowLiveAgent(true);
      setPhase("live");
    }
  };

  // DEMO ONLY: simulate live speech-to-text while recording. Remove once a
  // real STT stream feeds `setPersonTranscript`.
  useEffect(() => {
    if (!isRecording) return;
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
  }, [isRecording]);

  return (
    <main className="flex min-h-dvh w-full items-center justify-center overflow-auto bg-[#f3f3f3] p-4">
      <section className="relative flex h-[844px] w-[390px] shrink-0 flex-col overflow-hidden rounded-[44px] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.12)]">
        <AnimatePresence mode="wait">
          {phase === "entry" ? (
            <motion.div
              key="entry"
              // Exit upward + shrink so it reads like the orb flowing up into
              // the voice bar on the next screen.
              exit={{ opacity: 0, y: -60, scale: 0.92 }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
              className="relative flex h-full w-full flex-col items-center px-6 pt-[118px] pb-8"
            >
              {/* Brand logo, anchored at the top of the entry screen. */}
              <MargoLogo className="absolute top-7 left-1/2 -translate-x-1/2" />

              {/* Title fades out and unmounts once the entry starts. */}
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

              {/* Bulb + AI question stack, vertically centered. */}
              <div className="flex w-full flex-1 flex-col items-center justify-center gap-9">
                <div className="relative flex items-center justify-center">
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
                </div>

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

              {/* Bottom block: Start Entry (idle) OR transcript + controls. */}
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
                      <button
                        type="button"
                        onClick={handleToggleLiveAgent}
                        className="all-[unset] box-border inline-flex items-center justify-center gap-2.5 px-[60px] py-3.5 relative rounded-[100px] bg-green-500 text-white cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 hover:bg-green-600 transition"
                        aria-label="Try Live Agent"
                      >
                        <span className="relative [font-family:'Inter',Helvetica] font-medium text-white text-lg text-center tracking-[-0.36px] leading-[1.3] whitespace-nowrap">
                          Try Live Agent ✨
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
                                {personTranscript || "Listening…"}
                              </p>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      <Controls
                        isRecording={isRecording}
                        onMicToggle={handleMicToggle}
                        onFinish={handleFinishEntry}
                        onNext={handleNextPrompt}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          ) : phase === "loading" ? (
            // White "preparing" loading screen with an animated icon.
            <motion.div
              key="loading"
              role="status"
              aria-live="polite"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="flex h-full w-full flex-col items-center justify-center gap-6 bg-white px-8 text-center"
            >
              {/* Animated loading icon — a soft pastel spinner. */}
              <motion.span
                aria-hidden="true"
                className="h-10 w-10 rounded-full border-[3px] border-[#ece3ff] border-t-[#c7a6f5]"
                animate={{ rotate: 360 }}
                transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
              />
              <div className="flex flex-col gap-2">
                <p className="[font-family:'Inter',Helvetica] text-[24px] font-medium tracking-[-0.4px] text-[#1c2b33]">
                  Wrapping up your entry…
                </p>
                <p className="[font-family:'Inter',Helvetica] text-[15px] font-normal text-[#1c2b33]/55">
                  Preparing your summary &amp; practice.
                </p>
              </div>
            </motion.div>
          ) : phase === "reflection" ? (
            <ReflectionView
              key="reflection"
              summary={REFLECTION.summary}
              patterns={REFLECTION.patterns}
              nextSteps={REFLECTION.nextSteps}
              aiSpeaking={reflectionSpeaking}
              onSummaryComplete={() => setReflectionSpeaking(false)}
              onStartDailyPractice={handleStartDailyPractice}
            />
          ) : phase === "practice" ? (
            <PracticeView key="practice" onBackHome={handleBackHome} />
          ) : phase === "live" ? (
            <motion.div
              key="live"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="flex h-full w-full flex-col items-center justify-center gap-6 bg-white px-8 py-8"
            >
              <div className="text-center mb-4">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Live Voice Agent</h2>
                <p className="text-gray-600 text-sm">
                  {livePersonSpeaking && "Listening..."}
                  {liveAiSpeaking && !livePersonSpeaking && "AI Speaking..."}
                  {!livePersonSpeaking && !liveAiSpeaking && "Ready"}
                </p>
              </div>

              {liveQuestion && (
                <div className="w-full p-4 bg-blue-50 rounded-lg border border-blue-200 mb-4">
                  <p className="text-gray-800 font-medium">{liveQuestion}</p>
                </div>
              )}

              {liveTranscript && (
                <div className="w-full p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="text-xs font-semibold text-gray-700 mb-2">Your Response</div>
                  <p className="text-gray-700">{liveTranscript}</p>
                </div>
              )}

              <div className="flex-1" />

              <LiveVoiceAgent
                onAiSpeakingChange={setLiveAiSpeaking}
                onPersonSpeakingChange={setLivePersonSpeaking}
                onQuestion={setLiveQuestion}
                onTranscript={setLiveTranscript}
              />

              <button
                onClick={handleToggleLiveAgent}
                className="px-6 py-2 bg-gray-500 text-white rounded-lg font-medium hover:bg-gray-600"
              >
                Back to Entry
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </section>
    </main>
  );
};
