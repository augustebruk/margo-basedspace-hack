import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BulbAvatar, type BulbState } from "./BulbAvatar";
import { Controls } from "./Controls";
import { MargoLogo } from "./MargoLogo";
import { ReflectionView } from "./ReflectionView";
import { PracticeView } from "./PracticeView";
import { useScribe } from "./useScribe";
import { useReflection } from "./useReflection";
import { useFollowup } from "./useFollowup";
import { usePractice } from "./usePractice";
import { Onboarding } from "./Onboarding";
import { useOnboarding } from "./useOnboarding";
import { useEntries, countWords } from "./useEntries";
import { HistoryView } from "./HistoryView";
import { EntryDetailView } from "./EntryDetailView";
import { InsightsView } from "./InsightsView";
import { BottomNav, type MenuAction } from "./BottomNav";
import { WriteEntryView } from "./WriteEntryView";

// The journaling entry always opens with this fixed prompt. The remaining
// prompts are generated live by the AI from the conversation (see `useFollowup`).
// The conversation is endless — it only ends when the user taps finish.
const OPENING_QUESTION = "How was your day?";

type Phase =
  | "onboarding"
  | "entry"
  | "loading"
  | "reflection"
  | "practice"
  | "history"
  | "historyDetail"
  | "insights"
  | "write";

// Minimum time the white "preparing" loading screen shows, so the transition
// into the reflection feels calm even if generation resolves quickly.
const LOADING_MS = 1900;

export const Frame = (): JSX.Element => {
  // Persisted onboarding state (name + completion flag in localStorage).
  const { name, onboardingComplete, setName, completeOnboarding } =
    useOnboarding();

  // Which screen we're on. New users land in the voice-first onboarding;
  // returning users (onboardingComplete) skip straight to the journaling app.
  const [phase, setPhase] = useState<Phase>(
    onboardingComplete ? "entry" : "onboarding",
  );

  // --- Entry conversation state machine -------------------------------
  const [bulbState, setBulbState] = useState<BulbState>("idle");
  const [currentQuestion, setCurrentQuestion] = useState(OPENING_QUESTION);
  const [personTranscript, setPersonTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  // True while the user has switched to keyboard input for the current turn.
  const [isTyping, setIsTyping] = useState(false);
  const [burstKey, setBurstKey] = useState(0);
  // True once the user has started talking at least once this session. Used to
  // show the one-time "Tap to speak" hint only on the very first question and
  // never again afterward.
  const [hasEverSpoken, setHasEverSpoken] = useState(false);
  // How many prompts the user has answered so far (opener counts as the first
  // prompt). Used as the follow-up step index when generating questions.
  const promptCount = useRef(0);

  // The keyboard-input textarea, auto-grown to fit its content (see effect
  // below) so it matches the roomy feel of the voice-entry window.
  const typingRef = useRef<HTMLTextAreaElement | null>(null);

  // The live (mic-mode) transcript paragraph, capped to a scrollable height so
  // a long, still-growing entry never pushes the controls off the frame. We
  // keep it pinned to the bottom so the newest words stay visible.
  const transcriptScrollRef = useRef<HTMLParagraphElement | null>(null);

  // Reflection screen: true while the AI "reads" the summary (drives the wave).
  const [reflectionSpeaking, setReflectionSpeaking] = useState(false);

  // Past entries (persisted) + which one is open in the detail view.
  const { entries, addEntry, updateEntry, deleteEntry } = useEntries();
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  // The id of the entry just created in this session (for saving next-step responses).
  const currentEntryId = useRef<string | null>(null);
  // When the current session started, to compute its duration on finish.
  const entryStartedAt = useRef<number>(0);

  const started = bulbState !== "idle";
  const aiSpeaking = bulbState === "aiSpeaking";
  const personSpeaking = bulbState === "personSpeaking";

  // When the user's in-progress input grows long, the transcript/textarea
  // block below starts to crowd the orb. We progressively reclaim vertical
  // space in three escalating stages — and only ever hide the orb as a last
  // resort, because keeping it visible is the default we want.
  //
  //   1. Lift the centered orb stack up the screen (cheap headroom).
  //   2. Once we run out of lift, narrow the gap between the prompt and the
  //      input field below (so a long prompt + long entry still fit).
  //   3. Only when even a tight layout would overflow (very long prompt AND a
  //      long, still-growing entry) do we slide the orb fully up and out of
  //      view, smoothly, to give the text the whole screen.
  const inputLength = personSpeaking ? personTranscript.length : 0;
  const promptLength = currentQuestion.length;

  // Stage 1 — lift the orb stack. Caps out (the orb would otherwise collide
  // with the logo at the top of the screen, which is what the old code hit).
  const orbLift =
    inputLength <= 120
      ? 0
      : inputLength <= 240
        ? -28
        : inputLength <= 400
          ? -52
          : -72;

  // Stage 2 — once the orb is near its lift ceiling, start collapsing the gap
  // between the centered orb/prompt block and the input field below it. This
  // pulls the prompt down toward the input instead of trying (and failing) to
  // push the orb further up.
  //
  // We only tighten when space is actually scarce: a long prompt already eats
  // vertical room, so it starts tightening at a lower entry length, while a
  // short prompt (and any time the entry is still small) keeps the full,
  // roomy `gap-9`. A rough "pressure" score combines both.
  const layoutPressure = inputLength + promptLength * 2;
  const blockGap =
    layoutPressure <= 280
      ? 56 // plenty of space — let the orb and prompt breathe apart
      : layoutPressure <= 460
        ? 36
        : layoutPressure <= 620
          ? 18
          : 8;

  // Breathing room reserved BELOW the prompt (between it and the input block).
  // The centered orb/prompt stack would otherwise ride right up against the
  // input once the keyboard textarea makes the bottom block tall, leaving a
  // big empty void above the orb but a cramped prompt→input gap. This keeps a
  // generous gap while there's room, and only tightens under real pressure.
  const promptToInputGap =
    promptLength > 90
      ? // A long prompt already fills the vertical space on its own — pull the
        // controls up closer so the long text doesn't float with a big void
        // beneath it.
        12
      : layoutPressure <= 280
        ? 56
        : layoutPressure <= 460
          ? 36
          : layoutPressure <= 620
            ? 18
            : 4;

  // Stage 3 (last resort) — hide the orb entirely. The bottom block now caps
  // and scrolls internally, so this is purely about reclaiming the breathing
  // room above once the entry is long: a long entry alone is enough (a long
  // prompt just makes it kick in a touch sooner).
  const hideOrb = inputLength > 420 || (promptLength > 70 && inputLength > 300);


  // ===================================================================
  // PLUG IN REAL AI HERE
  //   • aiSay(text)            → call when the AI produces a new message.
  //   • listen()               → call when you start capturing the user.
  //   • setPersonTranscript(s) → feed live speech-to-text results into this.
  //
  // Speech-to-text is wired to ElevenLabs Scribe v2 Realtime via `useScribe`
  // (driven by `isRecording`), and the reflection is generated by an LLM via
  // `useReflection` on finish. AI follow-up questions are still mocked.
  // ===================================================================
  const {
    start: startScribe,
    requestPermission: requestMicPermission,
    stop: stopScribe,
    error: scribeError,
  } = useScribe(setPersonTranscript);

  // Accumulated journal: each Q&A turn the user spoke this session. Fed to the
  // reflection generator when the entry finishes.
  const transcriptLog = useRef<string[]>([]);
  const { reflection, generating: generatingReflection, generate: generateReflection } = useReflection();
  const { next: generateFollowup } = useFollowup();
  // Tonight's personalized, therapy-grounded practice, generated from the same
  // transcript as the reflection (in parallel, during the loading screen).
  const { practice, generate: generatePractice } = usePractice();

  // Record a completed turn (the question the AI asked + what the user said).
  const recordTurn = useCallback((question: string, answer: string) => {
    const said = answer.trim();
    if (!said) return;
    transcriptLog.current.push(`Q: ${question}\nA: ${said}`);
  }, []);

  const aiSay = useCallback((question: string) => {
    setCurrentQuestion(question);
    setPersonTranscript("");
    setBulbState("aiSpeaking");
  }, []);

  const listen = useCallback(() => {
    setBulbState("personSpeaking");
  }, []);
  // ===================================================================

  // Advance the conversation after the user finishes a turn: record it, then
  // ask the next AI-generated follow-up (built from the conversation so far).
  // The entry only wraps up when the user taps the finish button.
  const advanceConversation = useCallback(() => {
    recordTurn(currentQuestion, personTranscript);
    setIsRecording(false);

    // The conversation is endless: each "next" generates another AI follow-up.
    // The entry only ends when the user taps the finish (check mark) button.
    const step = promptCount.current - 1; // 0-based index of this follow-up
    promptCount.current += 1;

    // Show the thinking orb immediately, then swap in the generated question.
    setPersonTranscript("");
    setCurrentQuestion("");
    setBulbState("aiSpeaking");

    void generateFollowup(transcriptLog.current.join("\n\n"), step, name).then(
      (question) => {
        aiSay(question);
      },
    );
  }, [
    aiSay,
    currentQuestion,
    generateFollowup,
    name,
    personTranscript,
    recordTurn,
  ]);

  const handleStartEntry = () => {
    promptCount.current = 1; // the opener is the first prompt
    transcriptLog.current = [];
    entryStartedAt.current = Date.now();
    setHasEverSpoken(false);
    setBurstKey((k) => k + 1);
    aiSay(OPENING_QUESTION);
  };

  const handleMicToggle = () => {
    if (isRecording) {
      // Pause recording but stay in this turn — the user can switch to the
      // keyboard, then tap the mic again to resume and keep talking. Advancing
      // to the next prompt / finishing is handled by the side buttons.
      setIsRecording(false);
    } else {
      // (Re)activate the mic. Any text already captured (spoken or typed) is
      // kept; new speech is appended to it via the scribe seed.
      //
      // Request mic permission *here*, synchronously inside this click handler,
      // so Safari/iOS/Private-mode reliably show the permission prompt (they
      // only prompt when getUserMedia is reached directly from a user gesture;
      // the later start() runs from an effect/microtask, which is too late).
      void requestMicPermission();
      setIsTyping(false);
      setIsRecording(true);
      setHasEverSpoken(true);
      listen();
    }
  };

  const handleToggleKeyboard = () => {
    if (isTyping) {
      // Leaving keyboard mode — keep the typed text; the user can tap the mic
      // to resume speaking (it will append to what they typed).
      setIsTyping(false);
    } else {
      // Switching to keyboard pauses the mic so speech doesn't fight typing.
      // Enter the person-speaking turn so the textarea is shown even when the
      // user types first (before ever starting the mic on this prompt).
      setIsRecording(false);
      setIsTyping(true);
      setHasEverSpoken(true);
      listen();
    }
  };

  const handleNextPrompt = () => {
    advanceConversation();
  };

  // Finish entry → stop recording, capture the final turn, then run the
  // minimum loading time and reflection generation in parallel. The full-screen
  // loader only waits for the SUMMARY text (needed for the reflection screen to
  // have something to reveal); the map then shows its own loading state until
  // the rest of generation (the graph seed) settles and the entry is persisted.
  const handleFinishEntry = useCallback((alreadyRecorded = false) => {
    if (isRecording) setIsRecording(false);
    if (!alreadyRecorded && personTranscript)
      recordTurn(currentQuestion, personTranscript);
    setPhase("loading");

    // Capture session stats now (audio is never stored — only the transcript).
    const transcript = transcriptLog.current.join("\n\n");
    const durationMs = entryStartedAt.current
      ? Date.now() - entryStartedAt.current
      : 0;
    const wordCount = countWords(transcript);

    const minDelay = new Promise<void>((r) => setTimeout(r, LOADING_MS));
    const generation = generateReflection(transcript);
    // Generate tonight's practice from the same transcript, in parallel. It's
    // not on the critical path to the reflection screen — by the time the user
    // taps "Start daily practice" it's typically ready (falls back otherwise).
    if (transcript.trim()) void generatePractice(transcript, name);

    // Show the reflection screen once the minimum loading beat has passed —
    // even if generation is still in flight. The summary area and the map then
    // show their own loading states (driven by `generatingReflection`) until
    // the model responds.
    void minDelay.then(() => {
      setReflectionSpeaking(true);
      setPhase("reflection");
    });

    // When generation settles, persist the finished session so it appears in
    // the History tab — and so its graph seed feeds the (until-now loading) map.
    void generation.then((generated) => {
      if (transcript.trim() && generated.summary) {
        const entry = addEntry({
          topic: generated.topic || "Journal entry",
          durationMs,
          wordCount,
          transcript,
          reflection: generated,
        });
        currentEntryId.current = entry.id;
      }
    });
  }, [
    addEntry,
    currentQuestion,
    generatePractice,
    generateReflection,
    isRecording,
    name,
    personTranscript,
    recordTurn,
  ]);

  // Reflection CTA → the practice experience (third step). The practice was
  // already generated in parallel during the loading screen (see
  // handleFinishEntry); here we just transition to it.
  const handleStartDailyPractice = () => {
    setReflectionSpeaking(false);
    setPhase("practice");
  };

  // Save a next-step response into the current entry.
  const handleNextStepResponse = useCallback(
    (stepIndex: number, text: string) => {
      const id = currentEntryId.current;
      if (!id) return;
      const entry = entries.find((e) => e.id === id);
      const prev = entry?.nextStepResponses ?? {};
      updateEntry(id, { nextStepResponses: { ...prev, [stepIndex]: text } });
    },
    [entries, updateEntry],
  );

  // Back to home → reset the whole flow to the idle entry screen.
  const handleBackHome = useCallback(() => {
    // TODO: connect to real navigation. For now, reset to the start.
    console.log("[nav] back to home");
    setIsRecording(false);
    setIsTyping(false);
    setHasEverSpoken(false);
    setReflectionSpeaking(false);
    setPersonTranscript("");
    transcriptLog.current = [];
    promptCount.current = 0;
    setBulbState("idle");
    setPhase("entry");
  }, []);

  // Tapping the logo goes home (the main entry screen) — but only if we
  // already have the user's name. Without a name we're still onboarding, so
  // there's nowhere to skip to and the tap is a no-op.
  const handleLogoClick = useCallback(() => {
    if (!name) return;
    handleBackHome();
  }, [name, handleBackHome]);

  // Bottom-nav tab selection between the journaling flow and the history list.
  const navHistory = useRef<Phase[]>([]);

  const navigateTo = useCallback((target: Phase) => {
    setPhase((current) => {
      if (current !== "onboarding" && current !== "loading") {
        navHistory.current.push(current);
      }
      return target;
    });
  }, []);

  const handleNavBack = useCallback(() => {
    const prev = navHistory.current.pop();
    if (prev) {
      setPhase(prev);
    } else {
      setPhase("entry");
    }
  }, []);

  const handleNavHome = useCallback(() => {
    navHistory.current = [];
    handleBackHome();
  }, [handleBackHome]);

  const handleMenuAction = useCallback((action: MenuAction) => {
    if (action === "history") {
      setSelectedEntryId(null);
      navigateTo("history");
    } else if (action === "insights") {
      navigateTo("insights");
    } else if (action === "write") {
      navigateTo("write");
    }
  }, [navigateTo]);

  const handleOpenEntry = (id: string) => {
    setSelectedEntryId(id);
    navigateTo("historyDetail");
  };

  // Handle written entry → reflection flow
  const handleWriteReflect = useCallback((text: string) => {
    const durationMs = 0;
    const wordCount = countWords(text);
    const transcript = `A: ${text}`;
    transcriptLog.current = [text];
    entryStartedAt.current = Date.now();

    const generation = generateReflection(transcript);
    if (text.trim()) void generatePractice(text, name);

    void generation.then((generated) => {
      if (text.trim() && generated.summary) {
        const entry = addEntry({
          topic: generated.topic || "Written entry",
          durationMs,
          wordCount,
          transcript,
          reflection: generated,
        });
        currentEntryId.current = entry.id;
      }
    });

    navHistory.current.push("write");
    setPhase("loading");
  }, [addEntry, generatePractice, generateReflection, name]);

  const selectedEntry =
    entries.find((entry) => entry.id === selectedEntryId) ?? null;

  // Show the bottom nav bar on all screens except onboarding, loading, and active voice conversation.
  const showBottomNav = phase !== "onboarding" && phase !== "loading" && !(phase === "entry" && started);
  const canGoBack = navHistory.current.length > 0;

  // Live speech-to-text via ElevenLabs Scribe. Start a streaming session when
  // recording begins and tear it down when it stops. `useScribe` feeds results
  // into `setPersonTranscript`. When resuming a turn (after a keyboard edit or
  // a pause) we seed Scribe with the existing transcript so new speech is
  // appended rather than overwriting what's already there.
  const transcriptRef = useRef("");
  useEffect(() => {
    transcriptRef.current = personTranscript;
  }, [personTranscript]);

  useEffect(() => {
    if (!isRecording) return;
    void startScribe(transcriptRef.current);
    return () => {
      stopScribe();
    };
  }, [isRecording, startScribe, stopScribe]);

  // When typing mode is active and the AI finishes showing a question,
  // automatically transition to personSpeaking so the textarea appears.
  useEffect(() => {
    if (isTyping && aiSpeaking && currentQuestion) {
      const t = setTimeout(() => {
        setBulbState("personSpeaking");
      }, 400);
      return () => clearTimeout(t);
    }
  }, [isTyping, aiSpeaking, currentQuestion]);

  // Auto-grow the keyboard textarea to fit its content so it matches the roomy
  // feel of the voice-entry window instead of staying a tiny fixed 2-row box.
  useEffect(() => {
    const el = typingRef.current;
    if (!el || !(personSpeaking && isTyping)) return;
    el.style.height = "auto";
    // Cap the auto-grown height so the textarea scrolls internally instead of
    // pushing the controls below the frame (matches the CSS max-height).
    el.style.height = `${Math.min(el.scrollHeight, 190)}px`;
  }, [personTranscript, personSpeaking, isTyping]);

  // Keep the live (mic-mode) transcript pinned to its newest words as speech
  // streams in, since the block now scrolls internally instead of growing.
  useEffect(() => {
    const el = transcriptScrollRef.current;
    if (!el || !(personSpeaking && !isTyping)) return;
    el.scrollTop = el.scrollHeight;
  }, [personTranscript, personSpeaking, isTyping]);

  return (
    <main className="flex min-h-dvh w-full items-center justify-center overflow-auto bg-white p-0 sm:bg-[#f3f3f3] sm:p-4">
      <section className="relative flex h-dvh w-full shrink-0 flex-col overflow-hidden rounded-none bg-white shadow-none sm:h-[844px] sm:max-h-[calc(100dvh-2rem)] sm:w-[390px] sm:rounded-[44px] sm:shadow-[0_20px_60px_rgba(0,0,0,0.12)]">
        <AnimatePresence mode="wait">
          {phase === "onboarding" ? (
            <Onboarding
              key="onboarding"
              onName={setName}
              onStartNoticing={() => {
                completeOnboarding();
                setPhase("entry");
              }}
              onSaveAndExit={() => {
                completeOnboarding();
                setPhase("entry");
              }}
              onSkipToHome={() => {
                completeOnboarding();
                handleBackHome();
              }}
            />
          ) : phase === "entry" ? (
            <motion.div
              key="entry"
              // Exit upward + shrink so it reads like the orb flowing up into
              // the voice bar on the next screen.
              exit={{ opacity: 0, y: -60, scale: 0.92 }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
              className="relative flex h-full w-full flex-col items-center px-6 pt-[88px] pb-[max(40px,env(safe-area-inset-bottom))] sm:pt-[118px]"
            >
              {/* Brand logo, anchored at the top of the entry screen. */}
              <MargoLogo
                onClick={handleLogoClick}
                className="absolute top-7 left-1/2 -translate-x-1/2"
              />

              {/* Title fades out and unmounts once the entry starts. */}
              <AnimatePresence>
                {!started && (
                  <motion.div
                    key="title"
                    initial={false}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="flex flex-col items-center gap-2"
                  >
                    <h1
                      id="activate-agent-title"
                      className="relative w-fit [font-family:'Inter',Helvetica] font-medium text-[#1c2b33] text-[30px] text-center tracking-[-0.5px] leading-[1.2] whitespace-nowrap pb-px"
                    >
                      {name ? `Welcome back, ${name}` : "Welcome"}
                    </h1>
                    <p className="max-w-[280px] text-center [font-family:'Inter',Helvetica] font-normal text-[15px] leading-[21px] text-[#1c2b33]/50">
                      {name
                        ? "Ready to think out loud?"
                        : "Your space to think out loud."}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Bulb + AI question stack, vertically centered. As the user's
                  input grows we lift the whole stack, then tighten the gap
                  between the orb and the prompt, and — only as a last resort —
                  slide the orb up and out so the text has the full screen. */}
              <motion.div
                animate={{
                  // The orb lift only exists to keep the orb clear of the logo.
                  // Once the orb is hidden, the prompt is pinned to the top of
                  // the stack instead — applying the negative lift there drags
                  // it up into the logo, so drop the lift entirely when hidden.
                  y: hideOrb ? 0 : orbLift,
                  paddingBottom: started ? (hideOrb ? 8 : promptToInputGap) : 0,
                }}
                transition={{ type: "spring", stiffness: 120, damping: 22 }}
                className={`flex w-full flex-1 flex-col items-center ${
                  // While the orb is visible we pin the stack to the bottom of
                  // the centered area (orb above, prompt resting just over the
                  // input). Once the orb hides there's no orb to anchor to, so
                  // the prompt would otherwise stay pinned to the bottom with a
                  // big empty void above where the orb used to be — instead lift
                  // it to the top so the prompt reads near the logo and the
                  // freed space sits below it (next to the growing input).
                  !started
                    ? "justify-center"
                    : hideOrb
                      ? "justify-start"
                      : "justify-end"
                }`}
              >
                <div className="flex w-full flex-col items-center">
                  {/* The orb itself collapses (height → 0) and slides up out of
                      view when there's truly no room. Kept visible otherwise. */}
                  <motion.div
                    animate={{
                      height: hideOrb ? 0 : "auto",
                      opacity: hideOrb ? 0 : 1,
                      y: hideOrb ? -160 : 0,
                      scale: hideOrb ? 0.6 : 1,
                    }}
                    transition={{ type: "spring", stiffness: 130, damping: 24 }}
                    // Only clip while collapsing (height → 0). When the orb is
                    // visible, keep overflow visible so its breathing scale and
                    // blurred glow halo aren't clipped at the top.
                    style={{ overflow: hideOrb ? "hidden" : "visible" }}
                    className="flex w-full flex-col items-center"
                  >
                    <div className="relative flex flex-col items-center justify-center gap-7">
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

                        {/* Idle: the whole orb is the tap-to-begin affordance.
                            Once started, tapping the orb toggles the mic on/off —
                            identical to the mic button in the controls. */}
                        {!started ? (
                          <button
                            type="button"
                            onClick={handleStartEntry}
                            aria-label="Tap To Begin"
                            className="all-[unset] box-border cursor-pointer rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1c2b33]"
                          >
                            <BulbAvatar state={bulbState} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handleMicToggle}
                            aria-label={isRecording ? "Tap to pause" : "Tap to speak"}
                            aria-pressed={isRecording}
                            className="all-[unset] box-border cursor-pointer rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1c2b33]"
                          >
                            <BulbAvatar state={bulbState} />
                          </button>
                        )}
                      </div>

                      {/* "Tap to speak" hint under the orb. Shown on the intro
                          screen (tap to begin) and on the opening question until
                          the user first starts talking — then gone for the
                          session. */}
                      <AnimatePresence>
                        {(!started ||
                          (aiSpeaking &&
                            !hasEverSpoken &&
                            currentQuestion === OPENING_QUESTION)) && (
                          <motion.span
                            key="tap-to-speak"
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.4, ease: "easeOut" }}
                            className="pointer-events-none [font-family:'Inter',Helvetica] font-medium uppercase tracking-[1.5px] text-[12px] text-[#1c2b33]/40"
                          >
                            Tap To Speak
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>

                  {/* Explicit, reliably-rendered spacer between the orb and the
                      prompt. (Animating CSS `gap` directly via motion isn't
                      reliable — it can resolve to 0 — so we animate a real
                      element's height instead.) Roomy when there's space,
                      tightening only under real layout pressure; collapses when
                      the orb hides. */}
                  <motion.div
                    aria-hidden="true"
                    className="w-full shrink-0"
                    // When the orb hides, the prompt jumps to the top of the
                    // stack right under the logo — keep a small top gap so it
                    // doesn't crowd the logo. Otherwise use the breathing gap
                    // between the orb and the prompt.
                    animate={{ height: hideOrb ? 24 : blockGap }}
                    transition={{ type: "spring", stiffness: 140, damping: 24 }}
                  />

                  <AnimatePresence mode="wait">
                    {(aiSpeaking || personSpeaking) && currentQuestion && (
                      <motion.p
                        key={currentQuestion}
                        initial={{ opacity: 0, y: 10, scale: 0.98 }}
                        animate={{
                          opacity: personSpeaking ? 0.55 : 1,
                          y: 0,
                          scale: personSpeaking ? 0.92 : 1,
                        }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                        className="max-w-[320px] px-2 text-center [font-family:'Inter',Helvetica] font-medium text-[#1c2b33] text-[24px] leading-[1.3] tracking-[-0.4px]"
                      >
                        {currentQuestion}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>

              {/* Bottom block: transcript + controls (started). Pinned at the
                  bottom of the frame and never allowed to shrink, so the
                  controls (mic / finish / next) always stay on screen — the
                  input area above caps and scrolls internally instead of
                  pushing the controls down out of view. */}
              <div className="flex w-full shrink-0 flex-col items-center">
                <AnimatePresence mode="wait">
                  {started && (
                    <motion.div
                      key="live"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                      className="flex w-full flex-col items-center gap-7"
                    >
                      <div className="flex max-h-[230px] min-h-[64px] w-full items-end justify-center px-2">
                        <AnimatePresence mode="wait">
                          {personSpeaking && !isTyping && (
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
                              <p
                                ref={transcriptScrollRef}
                                className="w-full max-w-[300px] max-h-[190px] overflow-y-auto text-center [font-family:'Inter',Helvetica] font-normal text-[15px] leading-[22px] text-[#1c2b33]/55"
                              >
                                {personTranscript ||
                                  (isRecording ? "Listening…" : "Tap The Mic Or Keyboard To Begin")}
                              </p>
                              {scribeError && (
                                <p className="max-w-[300px] text-center [font-family:'Inter',Helvetica] font-normal text-[13px] leading-[18px] text-[#d4576a]">
                                  {scribeError}
                                </p>
                              )}
                            </motion.div>
                          )}
                          {personSpeaking && isTyping && (
                            <motion.div
                              key="typing"
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 8 }}
                              transition={{ duration: 0.3, ease: "easeOut" }}
                              className="flex w-full flex-col items-center gap-2"
                            >
                              <span className="[font-family:'Inter',Helvetica] font-medium uppercase tracking-[1.5px] text-[12px] text-[#1c2b33]/40">
                                Your turn
                              </span>
                              <textarea
                                ref={typingRef}
                                autoFocus
                                value={personTranscript}
                                onChange={(e) => setPersonTranscript(e.target.value)}
                                placeholder="Type to add to your entry…"
                                rows={2}
                                className="w-full max-w-[300px] resize-none overflow-y-auto rounded-2xl border border-[rgba(244,231,255,0.9)] bg-white/70 px-4 py-3 text-center [font-family:'Inter',Helvetica] text-[15px] font-normal leading-[22px] text-[#1c2b33] shadow-[0_6px_16px_rgba(28,43,51,0.06)] placeholder:text-[#1c2b33]/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b6a0e0] min-h-[68px] max-h-[190px]"
                              />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      <Controls
                        isRecording={isRecording}
                        isTyping={isTyping}
                        onMicToggle={handleMicToggle}
                        onToggleKeyboard={handleToggleKeyboard}
                        onFinish={() => handleFinishEntry()}
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
              summary={reflection.summary}
              patterns={reflection.patterns}
              nextSteps={reflection.nextSteps}
              pastEntries={entries}
              mapLoading={generatingReflection}
              aiSpeaking={reflectionSpeaking}
              onSummaryComplete={() => setReflectionSpeaking(false)}
              onStartDailyPractice={handleStartDailyPractice}
              onBackHome={handleBackHome}
              onNextStepResponse={handleNextStepResponse}
              nextStepResponses={entries.find((e) => e.id === currentEntryId.current)?.nextStepResponses}
            />
          ) : phase === "practice" ? (
            <PracticeView
              key="practice"
              practice={practice}
              onBackHome={handleBackHome}
            />
          ) : phase === "history" ? (
            <HistoryView
              key="history"
              entries={entries}
              onOpenEntry={handleOpenEntry}
              onBack={handleNavBack}
            />
          ) : phase === "insights" ? (
            <InsightsView
              key="insights"
              entries={entries}
              name={name}
              onBack={handleNavBack}
            />
          ) : phase === "write" ? (
            <WriteEntryView
              key="write-entry"
              name={name}
              onReflect={handleWriteReflect}
            />
          ) : selectedEntry ? (
            <EntryDetailView
              key="history-detail"
              entry={selectedEntry}
              allEntries={entries}
              onBack={handleNavBack}
              onDelete={() => {
                deleteEntry(selectedEntry.id);
                setSelectedEntryId(null);
                setPhase("history");
              }}
            />
          ) : (
            // Fallback: a selected entry went missing — return to the list.
            <HistoryView
              key="history-fallback"
              entries={entries}
              onOpenEntry={handleOpenEntry}
              onBack={handleNavBack}
            />
          )}
        </AnimatePresence>

        {/* Floating pill nav bar */}
        <AnimatePresence>
          {showBottomNav && (
            <motion.div
              key="bottom-nav"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="pointer-events-none absolute inset-0 z-20 flex items-end justify-center px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
            >
              <BottomNav
                onBack={handleNavBack}
                onHome={handleNavHome}
                onMenuAction={handleMenuAction}
                canGoBack={canGoBack}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </main>
  );
};
