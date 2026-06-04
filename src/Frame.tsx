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
import { useInputMode } from "./useInputMode";
import { useEntries, countWords } from "./useEntries";
import { HistoryView } from "./HistoryView";
import { EntryDetailView } from "./EntryDetailView";
import { InsightsView } from "./InsightsView";
import { WriteEntryView } from "./WriteEntryView";
import { HomeMenu, type HomeMenuAction } from "./HomeMenu";
import { PreferencesView } from "./PreferencesView";
import { cx } from "./cx";
import styles from "./Frame.module.css";

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
  | "preferences"
  | "write";

// Minimum time the white "preparing" loading screen shows, so the transition
// into the reflection feels calm even if generation resolves quickly.
const LOADING_MS = 1900;

// Fixed design dimensions of the phone frame, in CSS pixels. The frame is
// always laid out at exactly this size and only ever scaled DOWN (never up)
// to fit smaller viewports — see the frame-scale effect below.
const FRAME_W = 390;
const FRAME_H = 844;

// Minimum gap (in CSS pixels) kept between the frame and every viewport edge
// when shown in a desktop/laptop browser, so the "phone" never touches the
// window edges. The frame is scaled down if needed to preserve this margin.
const FRAME_MARGIN = 16;

export const Frame = (): JSX.Element => {
  // Persisted onboarding state (name + completion flag in localStorage).
  const { name, onboardingComplete, setName, completeOnboarding } =
    useOnboarding();

  // Remembered input modality (voice / keyboard). The next entry — and every
  // subsequent choice on the main flow — defaults to whatever the user picked
  // last, persisted across page reloads.
  const { inputMode, setInputMode } = useInputMode();

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
  // True while the keyboard textarea is focused — drives the "composing" layout
  // (orb slides off, prompt pins to the top, the input expands and the control
  // row drops to give the text the whole screen).
  const [typingFocused, setTypingFocused] = useState(false);
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

  // --- Fixed-size phone frame ------------------------------------------
  // The whole app is laid out in a fixed design coordinate space of
  // FRAME_W × FRAME_H. We never grow past that (so on a wide desktop the
  // "phone" stays the same size and never gets blown up); when the viewport
  // is smaller than the frame — e.g. an actual iPhone 13 browser viewport —
  // we uniformly scale the entire frame down with a CSS transform so the
  // layout/proportions stay pixel-identical and nothing reflows. This avoids
  // the old behavior where the frame stretched to the device and broke the
  // layout on real devices.
  const [frameScale, setFrameScale] = useState(1);
  // True when we're on an actual phone (touch device whose viewport is too
  // small to show the framed "phone" with margins). On a phone we go
  // edge-to-edge: no grey margin, no rounded corners, no drop shadow — the app
  // should fill the device screen exactly like a native app. On a desktop /
  // laptop browser we keep the centered phone-shaped frame with margins.
  const [isPhone, setIsPhone] = useState(false);
  useEffect(() => {
    const computeScale = () => {
      // A real phone: a coarse (touch) pointer whose viewport can't fit the
      // full-size frame plus its desktop margins. Desktops with touchscreens
      // stay in "framed" mode because their viewport is large enough.
      const coarsePointer = window.matchMedia(
        "(pointer: coarse)",
      ).matches;
      const tooSmallForFrame =
        window.innerWidth < FRAME_W + FRAME_MARGIN * 2 ||
        window.innerHeight < FRAME_H + FRAME_MARGIN * 2;
      const phone = coarsePointer && tooSmallForFrame;
      setIsPhone(phone);

      if (phone) {
        // Fill the entire viewport edge-to-edge with NO visible margin. We use
        // "cover" (Math.max): the fixed design space is scaled up until it
        // covers both viewport dimensions, so there's never a grey bar on any
        // edge. Any slight overflow on the looser axis (e.g. a short phone like
        // the iPhone SE) is clipped by the frame's `overflow-hidden`.
        const scale = Math.max(
          window.innerWidth / FRAME_W,
          window.innerHeight / FRAME_H,
        );
        setFrameScale(scale);
        return;
      }

      // Desktop/laptop: reserve at least FRAME_MARGIN on every edge so the
      // frame never butts up against the viewport edges, and never scale up.
      const availW = window.innerWidth - FRAME_MARGIN * 2;
      const availH = window.innerHeight - FRAME_MARGIN * 2;
      const scale = Math.min(1, availW / FRAME_W, availH / FRAME_H);
      setFrameScale(scale);
    };
    computeScale();
    window.addEventListener("resize", computeScale);
    window.addEventListener("orientationchange", computeScale);
    return () => {
      window.removeEventListener("resize", computeScale);
      window.removeEventListener("orientationchange", computeScale);
    };
  }, []);

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
  // "Composing" — the keyboard input is focused. Focusing the textarea is what
  // reshapes the whole entry screen to give the text room: the orb slides off
  // the top, the prompt pins just below the logo, the input expands, and the
  // control row drops down (the "Use voice" affordance moves down out of view).
  const composing = personSpeaking && isTyping && typingFocused;

  // Keyboard mode reshapes the layout. Per spec this is driven by FOCUS, not by
  // merely switching to typing — so before the textarea is focused the screen
  // keeps its normal compact layout (orb centered, prompt mid-screen), and only
  // on focus does everything expand. (Aliased to `composing` and kept as a
  // separate name because several layout classes below are keyed off it.)
  const keyboardMode = composing;

  const hideOrb =
    keyboardMode ||
    inputLength > 420 ||
    (promptLength > 70 && inputLength > 300);


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

    if (inputMode === "keyboard") {
      // The user last journaled by keyboard — open straight into typing mode
      // (no mic prompt) so we honor their remembered choice.
      setIsRecording(false);
      setIsTyping(true);
      setTypingFocused(false);
      setHasEverSpoken(true);
      listen();
      return;
    }

    // Activate the mic right away so the user can start speaking without a
    // second tap. Request permission synchronously inside this click handler
    // (Safari/iOS only prompt when getUserMedia is reached directly from a
    // user gesture; the later start() runs too late to trigger the prompt).
    void requestMicPermission();
    setIsTyping(false);
    setTypingFocused(false);
    setIsRecording(true);
    setHasEverSpoken(true);
    listen();
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
      setTypingFocused(false);
      setIsRecording(true);
      setHasEverSpoken(true);
      setInputMode("voice");
      listen();
    }
  };

  const handleToggleKeyboard = () => {
    if (isTyping) {
      // Leaving keyboard mode — keep the typed text; the user can tap the mic
      // to resume speaking (it will append to what they typed).
      setIsTyping(false);
      setTypingFocused(false);
      setInputMode("voice");
    } else {
      // Switching to keyboard pauses the mic so speech doesn't fight typing.
      // Enter the person-speaking turn so the textarea is shown even when the
      // user types first (before ever starting the mic on this prompt).
      setIsRecording(false);
      setIsTyping(true);
      setHasEverSpoken(true);
      setInputMode("keyboard");
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
    setTypingFocused(false);
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

  // The bottom-left home button opens a small modal of secondary destinations.
  const [homeMenuOpen, setHomeMenuOpen] = useState(false);

  const handleHomeMenuSelect = useCallback(
    (action: HomeMenuAction) => {
      if (action === "insights") {
        navigateTo("insights");
      } else if (action === "preferences") {
        navigateTo("preferences");
      }
    },
    [navigateTo],
  );

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
  // When composing (focused) the textarea instead flex-fills the whole space up
  // to the prompt via `.textareaKeyboard` (height: 100%), so inline auto-grow
  // is skipped there.
  useEffect(() => {
    const el = typingRef.current;
    if (!el || !(personSpeaking && isTyping)) return;
    if (composing) {
      // Let CSS flex control the height; clear any inline height from a prior
      // auto-grow pass so it doesn't fight the fill.
      el.style.height = "";
      return;
    }
    el.style.height = "auto";
    // Cap the auto-grown height so the (unfocused) textarea scrolls internally
    // instead of pushing the controls below the frame.
    el.style.height = `${Math.min(el.scrollHeight, 190)}px`;
  }, [personTranscript, personSpeaking, isTyping, composing]);

  // Keep the live (mic-mode) transcript pinned to its newest words as speech
  // streams in, since the block now scrolls internally instead of growing.
  useEffect(() => {
    const el = transcriptScrollRef.current;
    if (!el || !(personSpeaking && !isTyping)) return;
    el.scrollTop = el.scrollHeight;
  }, [personTranscript, personSpeaking, isTyping]);

  return (
    <main className={cx(styles.main, isPhone && styles.mainPhone)}>
      {/* Scaling wrapper: reserves the on-screen (scaled) footprint of the
          frame so it stays centered, while the frame itself is transformed.
          On desktop/laptop, `p-4` (16px) on <main> guarantees a uniform
          minimum margin on every edge and the frame keeps its phone-shaped
          look (rounded corners + shadow). On a real phone we drop the padding,
          corners and shadow so the app fills the device edge-to-edge. */}
      <div
        style={{
          width: FRAME_W * frameScale,
          height: FRAME_H * frameScale,
        }}
        className={styles.scaleWrap}
      >
        <section
          style={{
            width: FRAME_W,
            height: FRAME_H,
            transform: `scale(${frameScale})`,
            transformOrigin: "top left",
          }}
          className={cx(styles.frame, isPhone && styles.framePhone)}
        >
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
              className={styles.entry}
            >
              {/* Brand logo, anchored at the top of the entry screen. */}
              <MargoLogo
                onClick={handleLogoClick}
                className={styles.logo}
              />

              {/* Title fades out and unmounts once the entry starts. */}
              <AnimatePresence>
                {!started && (
                  <motion.div
                    key="title"
                    initial={false}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className={styles.titleBlock}
                  >
                    <h1
                      id="activate-agent-title"
                      className={styles.title}
                    >
                      {name ? `Welcome back, ${name}` : "Welcome"}
                    </h1>
                    <p className={styles.subtitle}>
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
                className={cx(
                  styles.orbStack,
                  !started
                    ? styles.orbStackIdle
                    : hideOrb
                      ? styles.orbStackHidden
                      : styles.orbStackVisible,
                  keyboardMode && styles.orbStackKeyboard,
                )}
              >
                <div className={styles.orbColumn}>
                  {/* The orb slides up and out of view (and gives its space back
                      via a negative margin) when there's truly no room. Kept
                      visible otherwise. */}
                  <motion.div
                    animate={{
                      opacity: hideOrb ? 0 : 1,
                      y: hideOrb ? -160 : 0,
                      scale: hideOrb ? 0.6 : 1,
                      // Pull the following content up by (roughly) the orb's own
                      // height so it reclaims the space, but drive motion entirely
                      // through `y`/`scale` so the orb travels the *same* path in
                      // both directions — straight up when hiding, straight back
                      // down from the top when re-appearing (no growing-from-the-
                      // bottom asymmetry that a `height → 0` collapse introduces).
                      marginBottom: hideOrb ? -160 : 0,
                    }}
                    transition={{ type: "spring", stiffness: 130, damping: 24 }}
                    // Keep overflow visible so the orb's breathing scale and
                    // blurred glow halo aren't clipped.
                    style={{ overflow: "visible", pointerEvents: hideOrb ? "none" : "auto" }}
                    className={styles.orbColumn}
                  >
                    <div className={styles.orbInner}>
                      <div className={styles.orbHitArea}>
                        <AnimatePresence>
                          {burstKey > 0 && (
                            <motion.span
                              key={burstKey}
                              aria-hidden="true"
                              className={styles.burst}
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
                            className={cx("btnReset", styles.orbButton)}
                          >
                            <BulbAvatar state={bulbState} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handleMicToggle}
                            aria-label={isRecording ? "Tap to pause" : "Tap to speak"}
                            aria-pressed={isRecording}
                            className={cx("btnReset", styles.orbButton)}
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
                            className={styles.tapHint}
                          >
                            {!started ? "Tap To Start" : "Tap To Speak"}
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
                    className={styles.spacer}
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
                        className={styles.prompt}
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
              <div className={cx(styles.bottomBlock, keyboardMode && styles.bottomBlockKeyboard)}>
                <AnimatePresence mode="wait">
                  {started && (
                    <motion.div
                      key="live"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                      className={cx(styles.live, keyboardMode && styles.liveKeyboard)}
                    >
                      <div
                        className={cx(
                          styles.transcriptArea,
                          keyboardMode && styles.transcriptAreaKeyboard,
                        )}
                      >
                        <AnimatePresence mode="wait">
                          {personSpeaking && !isTyping && (
                            <motion.div
                              key="transcript"
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 8 }}
                              transition={{ duration: 0.35, ease: "easeOut" }}
                              className={styles.turnGroup}
                            >
                              <span className={styles.turnLabel}>
                                Your turn
                              </span>
                              <p
                                ref={transcriptScrollRef}
                                className={styles.transcript}
                              >
                                {personTranscript ||
                                  (isRecording ? "Listening…" : "Tap The Mic Or Keyboard To Begin")}
                              </p>
                              {scribeError && (
                                <p className={styles.scribeError}>
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
                              className={cx(styles.turnGroup, keyboardMode && styles.turnGroupKeyboard)}
                            >
                              <span className={styles.turnLabel}>
                                Your turn
                              </span>
                              <textarea
                                ref={typingRef}
                                autoFocus
                                value={personTranscript}
                                onChange={(e) => setPersonTranscript(e.target.value)}
                                onFocus={() => setTypingFocused(true)}
                                onBlur={() => setTypingFocused(false)}
                                placeholder="Type to add to your entry…"
                                rows={2}
                                className={cx(
                                  styles.textarea,
                                  keyboardMode && styles.textareaKeyboard,
                                )}
                              />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      <Controls
                        isRecording={isRecording}
                        isTyping={isTyping}
                        composing={composing}
                        onMicToggle={handleMicToggle}
                        onToggleKeyboard={handleToggleKeyboard}
                        onFinish={() => handleFinishEntry()}
                        onNext={handleNextPrompt}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Minimal history affordance: a bare icon in the bottom-right
                  corner of the home screen. */}
              <AnimatePresence>
                {!started && (
                  <motion.button
                    key="history-fab"
                    type="button"
                    onClick={() => {
                      setSelectedEntryId(null);
                      navigateTo("history");
                    }}
                    aria-label="Past entries"
                    initial={false}
                    exit={{ opacity: 0 }}
                    whileTap={{ scale: 0.9 }}
                    className={cx("btnReset", "focusRing", styles.fab, styles.fabRight)}
                  >
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                      stroke="currentColor"
                      strokeWidth={1.7}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 12a9 9 0 1 0 3-6.7" />
                      <path d="M3 4v4h4" />
                      <path d="M12 8v4l2.5 2.5" />
                    </svg>
                  </motion.button>
                )}
              </AnimatePresence>

              {/* Bottom-left menu affordance: opens the HomeMenu modal
                  (Insights + Preferences). */}
              <AnimatePresence>
                {!started && (
                  <motion.button
                    key="menu-fab"
                    type="button"
                    onClick={() => setHomeMenuOpen(true)}
                    aria-label="Menu"
                    aria-expanded={homeMenuOpen}
                    initial={false}
                    exit={{ opacity: 0 }}
                    whileTap={{ scale: 0.9 }}
                    className={cx("btnReset", "focusRing", styles.fab, styles.fabLeft)}
                  >
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                      stroke="currentColor"
                      strokeWidth={1.8}
                      strokeLinecap="round"
                    >
                      <path d="M4 7h16M4 12h16M4 17h16" />
                    </svg>
                  </motion.button>
                )}
              </AnimatePresence>
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
              className={styles.loading}
            >
              {/* Animated loading icon — a soft pastel spinner. */}
              <motion.span
                aria-hidden="true"
                className={styles.spinner}
                animate={{ rotate: 360 }}
                transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
              />
              <div className={styles.loadingTextBlock}>
                <p className={styles.loadingTitle}>
                  Wrapping up your entry…
                </p>
                <p className={styles.loadingSubtitle}>
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
          ) : phase === "preferences" ? (
            <PreferencesView
              key="preferences"
              name={name}
              onSaveName={setName}
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

        {/* Bottom-left home menu modal (Insights + Preferences) */}
        <HomeMenu
          open={homeMenuOpen}
          onClose={() => setHomeMenuOpen(false)}
          onSelect={handleHomeMenuSelect}
        />
      </section>
      </div>
    </main>
  );
};
