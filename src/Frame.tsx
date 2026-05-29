import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BulbAvatar, type BulbState } from "./BulbAvatar";
import { Controls } from "./Controls";

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

/* ============================================================================
 * PLACEHOLDER BACKEND HANDLERS
 * Replace the bodies with real calls to your AI backend. They are intentionally
 * thin so the wiring above stays declarative.
 * ==========================================================================*/
function onUserFinishedSpeaking(transcript: string): void {
  // TODO: send the captured transcript to the AI and await the next question.
  console.log("[AI] user finished speaking:", transcript);
}
function onFinishEntry(): void {
  // TODO: finalize the entry and navigate to the summary + practice screen.
  console.log("[AI] finish entry → open summary/practice screen");
}
function onNextPrompt(): void {
  // TODO: ask the AI for the next question/prompt.
  console.log("[AI] next prompt requested");
}

export const Frame = (): JSX.Element => {
  // --- Conversation state machine -------------------------------------
  // "idle"           → before the entry starts (Start Entry button visible)
  // "aiSpeaking"     → the AI (bulb) is talking; question visible
  // "personSpeaking" → the AI is listening; question hidden, transcript shown
  const [bulbState, setBulbState] = useState<BulbState>("idle");

  // Question shown under the bulb while the AI speaks (kept in state while
  // listening so it can re-appear instantly).
  const [currentQuestion, setCurrentQuestion] = useState(QUESTIONS[0]);

  // Live transcription of the person speaking. Plain string → trivial to
  // persist later for the Notion-like history page.
  const [personTranscript, setPersonTranscript] = useState("");

  // Mic recording on/off.
  const [isRecording, setIsRecording] = useState(false);

  // Whether the entry is closing (Finish entry tapped) — drives the fade-out.
  const [closing, setClosing] = useState(false);

  // One-shot glow-burst trigger for the Start Entry transition.
  const [burstKey, setBurstKey] = useState(0);

  // Rotating index into QUESTIONS for the demo conversation.
  const questionIndex = useRef(0);

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

  // Pick the next demo question (wraps around).
  const nextQuestion = useCallback(() => {
    questionIndex.current = (questionIndex.current + 1) % QUESTIONS.length;
    return QUESTIONS[questionIndex.current];
  }, []);

  // Start Entry: the AI always speaks first with the opening question.
  const handleStartEntry = () => {
    questionIndex.current = 0;
    setBurstKey((k) => k + 1); // play the glow-burst transition
    aiSay(QUESTIONS[0]);
  };

  // Mic toggle — the core of the recording flow.
  const handleMicToggle = () => {
    if (isRecording) {
      // Turning OFF: stop listening, hand the transcript to the AI, and let
      // the AI respond with the next question.
      setIsRecording(false);
      onUserFinishedSpeaking(personTranscript);
      aiSay(nextQuestion());
    } else {
      // Turning ON: AI stops, person starts; live transcription begins.
      setIsRecording(true);
      listen();
    }
  };

  // Next prompt — skip ahead to the next AI question.
  const handleNextPrompt = () => {
    onNextPrompt();
    if (isRecording) setIsRecording(false);
    // If we were listening and have something captured, treat it as finished.
    if (!aiSpeaking && personTranscript) onUserFinishedSpeaking(personTranscript);
    aiSay(nextQuestion());
  };

  // Finish entry — stop recording, fade things out, finalize the session.
  const handleFinishEntry = () => {
    if (isRecording) setIsRecording(false);
    setClosing(true);
    onFinishEntry();
  };

  // DEMO ONLY: simulate live speech-to-text while recording by revealing a
  // sample sentence word-by-word. Remove once a real STT stream feeds
  // `setPersonTranscript`.
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
      <section
        className="flex h-[844px] w-[390px] shrink-0 flex-col items-center overflow-hidden rounded-[44px] bg-white px-6 pt-[118px] pb-8 shadow-[0_20px_60px_rgba(0,0,0,0.12)] relative"
        aria-labelledby="activate-agent-title"
      >
        <AnimatePresence mode="wait">
          {closing ? (
            // Closing screen — placeholder until the summary/practice screen
            // is built. `onFinishEntry()` is where you'd navigate instead.
            <motion.div
              key="closing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.25 }}
              className="flex h-full w-full flex-col items-center justify-center gap-2 text-center"
            >
              <p className="[font-family:'Inter',Helvetica] font-medium text-[#1c2b33] text-[24px] tracking-[-0.4px]">
                Wrapping up your entry…
              </p>
              <p className="[font-family:'Inter',Helvetica] font-normal text-[15px] text-[#1c2b33]/55">
                Preparing your summary &amp; practice.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="conversation"
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
              className="flex h-full w-full flex-col items-center"
            >
              {/* Title fades out and unmounts once the entry starts. */}
              <AnimatePresence>
                {!started && (
                  <motion.h1
                    key="title"
                    id="activate-agent-title"
                    initial={false}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="relative w-fit [font-family:'Inter',Helvetica] font-normal text-[#1c2b33] text-[22px] text-center tracking-[-0.44px] leading-[1.3] whitespace-nowrap pb-px"
                  >
                    Activate Agent
                  </motion.h1>
                )}
              </AnimatePresence>

              {/* Bulb + AI question stack, vertically centered. */}
              <div className="flex w-full flex-1 flex-col items-center justify-center gap-9">
                <div className="relative flex items-center justify-center">
                  {/* One-shot glow burst played on the Start Entry transition. */}
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

                  <BulbAvatar visualState={bulbState} />
                </div>

                {/* AI question — visible only while the AI is speaking. Inter
                    medium, centered, slightly larger than the title. */}
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
                      {/* Transcript / hint zone above the controls. */}
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
                              {/* Live transcription — secondary to the bulb +
                                  question: Inter regular, smaller, dimmer. */}
                              <p className="max-w-[300px] text-center [font-family:'Inter',Helvetica] font-normal text-[15px] leading-[22px] text-[#1c2b33]/55">
                                {personTranscript || "Listening…"}
                              </p>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Bottom control bar (mic / finish / next). */}
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
          )}
        </AnimatePresence>
      </section>
    </main>
  );
};
