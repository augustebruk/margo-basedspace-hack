import { useCallback, useState, type JSX } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BulbAvatar, type BulbState } from "./BulbAvatar";

const legalLinks = [
  { label: "Terms of Service", href: "#terms" },
  { label: "Privacy Policy", href: "#privacy" },
];

// Opening line the AI says first when the entry starts. Change this copy
// freely, or drive it from the backend via `aiSay()` below.
const FIRST_QUESTION = "How did that make you feel?";

export const Frame = (): JSX.Element => {
  // --- Conversation state machine -------------------------------------
  // "idle"           → before the entry starts (Start Entry button visible)
  // "aiSpeaking"     → the AI (bulb) is talking; question visible
  // "personSpeaking" → the AI is listening; question hidden, transcript shown
  const [bulbState, setBulbState] = useState<BulbState>("idle");

  // The question shown under the bulb while the AI speaks. We keep it in
  // state even while listening so it can re-appear instantly when the AI
  // resumes speaking.
  const [currentQuestion, setCurrentQuestion] = useState(FIRST_QUESTION);

  // Live transcription of the person speaking. Kept as a plain string so it is
  // trivial to persist later for the Notion-like history page.
  const [personTranscript, setPersonTranscript] = useState("");

  // Key used to replay the one-shot "glow burst" on the Start Entry transition.
  const [burstKey, setBurstKey] = useState(0);

  const started = bulbState !== "idle";
  const aiSpeaking = bulbState === "aiSpeaking";
  const personSpeaking = bulbState === "personSpeaking";

  // ===================================================================
  // PLUG IN REAL AI HERE
  // These three handlers are the whole public surface to wire to a backend:
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

  // Start Entry: the AI always speaks first with the opening question.
  const handleStartEntry = () => {
    setBurstKey((k) => k + 1); // trigger the glow-burst transition
    aiSay(FIRST_QUESTION);
  };

  // DEMO ONLY: tapping the bulb after starting toggles AI ↔ Person so all
  // states can be previewed. Remove once the backend drives the conversation.
  const handleBulbTap = () => {
    if (!started) return;
    if (aiSpeaking) {
      setPersonTranscript(
        "I think it made me feel a little more hopeful than before…",
      );
      listen();
    } else {
      aiSay(currentQuestion);
    }
  };

  return (
    <main className="flex min-h-dvh w-full items-center justify-center overflow-auto bg-[#f3f3f3] p-4">
      <section
        className="flex h-[844px] w-[390px] shrink-0 flex-col items-center overflow-hidden rounded-[44px] bg-white px-6 pt-[118px] pb-8 shadow-[0_20px_60px_rgba(0,0,0,0.12)] relative"
        aria-labelledby="activate-agent-title"
      >
        <h1
          id="activate-agent-title"
          className="relative w-fit [font-family:'Inter',Helvetica] font-normal text-[#1c2b33] text-[22px] text-center tracking-[-0.44px] leading-[1.3] whitespace-nowrap pb-px"
        >
          Activate Agent
        </h1>

        {/* Bulb + AI question stack, vertically centered. */}
        <div className="flex w-full flex-1 flex-col items-center justify-center gap-9">
          <div className="relative flex items-center justify-center">
            {/* One-shot glow burst played on the Start Entry transition. */}
            <AnimatePresence>
              {burstKey > 0 && (
                <motion.span
                  key={burstKey}
                  aria-hidden="true"
                  className="absolute h-[235px] w-[235px] rounded-full bg-[linear-gradient(135deg,rgba(244,231,255,1)_0%,rgba(253,221,222,1)_100%)] blur-xl"
                  initial={{ opacity: 0.6, scale: 1 }}
                  animate={{ opacity: 0, scale: 1.7 }}
                  transition={{ duration: 0.7, ease: "easeOut" }}
                />
              )}
            </AnimatePresence>

            <button
              type="button"
              onClick={handleBulbTap}
              aria-label={
                aiSpeaking
                  ? "AI is speaking"
                  : personSpeaking
                    ? "Listening"
                    : "Agent"
              }
              className="all-[unset] box-border cursor-pointer rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1c2b33]"
            >
              <BulbAvatar state={bulbState} />
            </button>
          </div>

          {/* AI question — visible only while the AI is speaking. Larger and
              more dominant than the title, Inter medium, centered. */}
          <AnimatePresence mode="wait">
            {aiSpeaking && (
              <motion.p
                key={currentQuestion}
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="max-w-[320px] px-2 text-center [font-family:'Inter',Helvetica] font-medium text-[#1c2b33] text-[28px] leading-[1.3] tracking-[-0.4px]"
              >
                {currentQuestion}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom zone — fixed height so the bulb stays put across states.
            Shows the Start Entry CTA (idle) or the live transcript (listening). */}
        <div className="flex min-h-[210px] w-full flex-col items-center justify-end">
          <AnimatePresence mode="wait">
            {!started && (
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
            )}

            {personSpeaking && (
              <motion.div
                key="transcript"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="flex w-full flex-col items-center gap-3 pb-2"
              >
                {/* Minimal "your turn" hint while the AI listens. */}
                <span className="[font-family:'Inter',Helvetica] font-medium uppercase tracking-[1.5px] text-[12px] text-[#1c2b33]/40">
                  Your turn
                </span>
                {/* Live transcription — secondary to the bulb + question:
                    Inter regular, smaller and dimmer. */}
                <p className="max-w-[300px] text-center [font-family:'Inter',Helvetica] font-normal text-[15px] leading-[22px] text-[#1c2b33]/55">
                  {personTranscript || "Listening…"}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>
    </main>
  );
};
