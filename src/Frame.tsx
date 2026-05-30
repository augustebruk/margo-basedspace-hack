/**
 * Frame — the single canonical root of the Margo app.
 *
 * This component IS the root route. main.tsx renders <Frame /> directly with
 * no router layer. It owns the top-level phase machine
 * (entry → loading → reflection → practice) and renders the correct screen
 * for each phase. Do NOT create an additional "home" page or wrap this in
 * another layout — add new top-level screens as new `Phase` values instead.
 *
 * Design-system anchors (do not duplicate or replace):
 *   Entry / orb screen  →  <MicScreen>    (src/components/margo/MicScreen.tsx)
 *   Orb / sphere        →  <BulbAvatar>   (src/BulbAvatar.tsx)
 *   Mic button          →  <Controls>     (src/Controls.tsx) — center button
 *   Side buttons        →  <Controls>     (src/Controls.tsx) — finish + next
 *   Font                →  Inter (loaded in index.html, applied via index.css)
 */
import { useEffect, useState, type JSX } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ReflectionView, type ReflectionViewProps } from "./ReflectionView";
import { PracticeView } from "./PracticeView";
import { MicScreen } from "./components/margo/MicScreen";

// MOCK reflection output. Replace with real AI results.
const REFLECTION: Omit<
  ReflectionViewProps,
  "aiSpeaking" | "onSummaryComplete" | "onStartDailyPractice"
> = {
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

type Phase = "entry" | "loading" | "reflection" | "practice";

// How long the white "preparing" loading screen shows before the reflection.
const LOADING_MS = 1900;

export const Frame = (): JSX.Element => {
  // Which screen we're on: entry → loading → reflection → practice.
  const [phase, setPhase] = useState<Phase>("entry");

  // Reflection screen: true while the AI "reads" the summary (drives the wave).
  const [reflectionSpeaking, setReflectionSpeaking] = useState(false);

  // Called by MicScreen when the user taps "Finish entry".
  const handleEntryComplete = () => {
    // TODO: finalize the entry server-side and request the reflection summary.
    console.log("[AI] finish entry → generate reflection");
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
    setReflectionSpeaking(false);
    setPhase("entry");
  };

  return (
    <main className="flex min-h-dvh w-full items-center justify-center overflow-auto bg-[#f3f3f3] p-4">
      <section className="relative flex h-[844px] w-[390px] shrink-0 flex-col overflow-hidden rounded-[44px] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.12)]">
        <AnimatePresence mode="wait">
          {phase === "entry" ? (
            // The orb / journaling screen. All mic + conversation logic lives
            // inside MicScreen; Frame only needs the completion callback.
            <MicScreen key="entry" onEntryComplete={handleEntryComplete} />
          ) : phase === "loading" ? (
            // White "preparing" loading screen with an animated spinner.
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
              <motion.span
                aria-hidden="true"
                className="h-10 w-10 rounded-full border-[3px] border-[#ece3ff] border-t-[#c7a6f5]"
                animate={{ rotate: 360 }}
                transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
              />
              <div className="flex flex-col gap-2">
                <p className="[font-family:'Inter',Helvetica] text-[24px] font-medium tracking-[-0.4px] text-[#1c2b33]">
                  Wrapping up your entry&hellip;
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
          ) : (
            <PracticeView key="practice" onBackHome={handleBackHome} />
          )}
        </AnimatePresence>
      </section>
    </main>
  );
};
