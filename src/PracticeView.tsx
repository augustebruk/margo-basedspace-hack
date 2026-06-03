import { useEffect, useState, type JSX } from "react";
import { AnimatePresence, motion, type Variants } from "motion/react";
import type { Practice } from "./usePractice";
import { cx } from "./cx";
import styles from "./PracticeView.module.css";

/* ============================================================================
 * PracticeView — a personalized, evidence-based daily practice.
 *
 * The whole practice is generated from the entry transcript (see `usePractice`
 * / the `practice` mode of `/api/reflection`). The server silently picks the
 * single best-fitting therapeutic modality for what the person said — CBT
 * thought records, ACT defusion + values + committed action, DBT skills,
 * Kristin Neff self-compassion / CFT, or behavioral activation — and shapes the
 * steps around it. This component just renders those steps:
 *
 *   1. Focus      — a single-choice read of what's really going on tonight.
 *   2. Deepen     — a guided written reflection with "write more about X" chips.
 *   3. Skill      — one tiny in-the-moment skill to try right now.
 *   4. Commit     — one small, values-aligned action before tomorrow.
 *
 * The OUTER SHELL (gradient, header, "Save practice", "Back to home") stays
 * stable; all copy is prop-driven from the generated `Practice`.
 * ==========================================================================*/
export interface PracticeResult {
  /** The Step 1 single-choice read the person picked. */
  focus: string | null;
  /** The Step 2 free-written reflection. */
  reflection: string;
  /** Whether they marked the Step 3 micro-skill as done. */
  triedSkill: boolean;
  /** The Step 4 committed action (a suggested one or their own). */
  action: string;
}

export interface PracticeViewProps {
  /** The generated, personalized practice. */
  practice: Practice;
  /** Called with the collected answers when "Save practice" is tapped. */
  onSave?: (result: PracticeResult) => void;
  /** Secondary CTA — wire to real navigation later. */
  onBackHome: () => void;
}

const EASE = [0.22, 1, 0.36, 1] as const;

// A little variation so each "write more about X" box invites differently,
// rather than every input repeating the same placeholder. Picked by the
// followup's position so it stays stable per field.
const FOLLOWUP_PLACEHOLDERS = [
  "Write as much or as little as you like.",
  "Let it be messy — no one's reading this but you.",
  "Start anywhere. The first words don't have to be the right ones.",
  "Whatever comes to mind, even a single line, counts.",
  "Say the part you'd usually skip over.",
  "There's no wrong answer here. Just be honest.",
] as const;

const followupPlaceholder = (index: number): string =>
  FOLLOWUP_PLACEHOLDERS[index % FOLLOWUP_PLACEHOLDERS.length];

// Gentle entrance stagger so the steps "flow" in, matching the Reflection feel.
const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
};

const StepLabel = ({
  step,
  children,
}: {
  step: number;
  children: string;
}): JSX.Element => (
  <div className={styles.stepLabel}>
    <span aria-hidden="true" className={styles.stepBadge}>
      {step}
    </span>
    <p className={styles.stepLabelText}>{children}</p>
  </div>
);

/** Radio-style single choice tile. */
const ChoiceTile = ({
  label,
  active,
  onSelect,
}: {
  label: string;
  active: boolean;
  onSelect: () => void;
}): JSX.Element => (
  <button
    type="button"
    onClick={onSelect}
    aria-pressed={active}
    className={cx(
      "btnReset",
      styles.choiceTile,
      active ? styles.choiceTileActive : styles.choiceTileInactive,
    )}
  >
    <span
      aria-hidden="true"
      className={cx(
        styles.choiceRadio,
        active ? styles.choiceRadioActive : styles.choiceRadioInactive,
      )}
    >
      {active && <span className={styles.choiceRadioDot} />}
    </span>
    <span className={styles.choiceLabel}>{label}</span>
  </button>
);

export const PracticeView = ({
  practice,
  onSave,
  onBackHome,
}: PracticeViewProps): JSX.Element => {
  const [selectedFocus, setSelectedFocus] = useState<string | null>(null);
  const [reflection, setReflection] = useState("");
  // Each "write more about X" chip opens its own dedicated text input. We track
  // which followups have been opened (preserving tap order) and the text the
  // person has written under each one, keyed by the followup prompt.
  const [openFollowups, setOpenFollowups] = useState<string[]>([]);
  const [followupAnswers, setFollowupAnswers] = useState<
    Record<string, string>
  >({});
  const [triedSkill, setTriedSkill] = useState(false);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [customAction, setCustomAction] = useState("");
  const [saved, setSaved] = useState(false);

  const finalAction = customAction.trim() || selectedAction || "";

  // Tapping a "write more about X" chip opens a fresh text input dedicated to
  // that prompt (rather than appending into the shared reflection box).
  const handleAddFollowup = (followup: string) => {
    if (openFollowups.includes(followup)) return;
    setOpenFollowups((prev) => [...prev, followup]);
  };

  // Collected reflection = the main box plus each opened followup (prompt +
  // the person's answer), in the order the chips were tapped.
  const composeReflection = () => {
    const parts: string[] = [];
    const main = reflection.trim();
    if (main) parts.push(main);
    for (const f of openFollowups) {
      const answer = (followupAnswers[f] ?? "").trim();
      if (answer) parts.push(`${f}\n${answer}`);
    }
    return parts.join("\n\n");
  };

  const handleSave = () => {
    const result: PracticeResult = {
      focus: selectedFocus,
      reflection: composeReflection(),
      triedSkill,
      action: finalAction,
    };
    // Placeholder: later persist this / advance to the next experience.
    console.log("[practice] save practice:", result);
    onSave?.(result);
    setSaved(true);
  };

  // Once saved, return home after a short beat so the confirmation can be read.
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => onBackHome(), 1500);
    return () => clearTimeout(t);
  }, [saved, onBackHome]);

  return (
    <motion.div
      key="practice"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={styles.root}
    >
      {/* Same washed-out pastel orb background as the Reflection screen. */}
      <div aria-hidden="true" className={styles.bg} />

      {/* Header — title + Margo's intro + the (non-clinical) approach pill. */}
      <div className={styles.header}>
        <p className={styles.eyebrow}>Tonight's practice</p>
        <h1 className={styles.title}>{practice.title}</h1>
        <p className={styles.intro}>{practice.intro}</p>
        {practice.approachLabel && (
          <span className={styles.approachPill}>
            <span aria-hidden="true" className={styles.approachDot} />
            <span className={styles.approachLabel}>
              {practice.approachLabel}
            </span>
          </span>
        )}
      </div>

      {/* Scrollable steps (min-h-0 so the footer stays pinned). */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className={styles.steps}
      >
        {/* Step 1 — focus (single choice) */}
        <motion.section variants={item} className={styles.section}>
          <StepLabel step={1}>{practice.focusPrompt}</StepLabel>
          <div className={styles.choiceList}>
            {practice.options.map((opt) => (
              <ChoiceTile
                key={opt}
                label={opt}
                active={selectedFocus === opt}
                onSelect={() => setSelectedFocus(opt)}
              />
            ))}
          </div>
        </motion.section>

        {/* Step 2 — guided written reflection + "write more about X" chips */}
        <motion.section variants={item} className={styles.sectionSpaced}>
          <StepLabel step={2}>{practice.deepenLabel}</StepLabel>
          <p className={styles.deepenPrompt}>{practice.deepenPrompt}</p>
          <textarea
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            rows={5}
            placeholder="Take your time. There's no wrong answer here."
            className={styles.textarea}
          />
          {/* Each opened followup gets its own dedicated labeled text input. */}
          <AnimatePresence initial={false}>
            {openFollowups.map((f) => (
              <motion.div
                key={f}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: EASE }}
                className={styles.followup}
              >
                <p className={styles.followupLabel}>{f}</p>
                <textarea
                  value={followupAnswers[f] ?? ""}
                  onChange={(e) =>
                    setFollowupAnswers((prev) => ({
                      ...prev,
                      [f]: e.target.value,
                    }))
                  }
                  rows={5}
                  autoFocus
                  placeholder={followupPlaceholder(
                    practice.deepenFollowups.indexOf(f),
                  )}
                  className={styles.textarea}
                />
              </motion.div>
            ))}
          </AnimatePresence>

          {practice.deepenFollowups.some((f) => !openFollowups.includes(f)) && (
            <div className={styles.followupSuggest}>
              <p className={styles.followupSuggestLabel}>
                Stuck? Write a little more about…
              </p>
              <div className={styles.chipRow}>
                {practice.deepenFollowups
                  .filter((f) => !openFollowups.includes(f))
                  .map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => handleAddFollowup(f)}
                      className={cx("btnReset", styles.chip)}
                    >
                      <span aria-hidden="true" className={styles.chipPlus}>
                        +
                      </span>
                      {f}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </motion.section>

        {/* Step 3 — one tiny in-the-moment skill */}
        <motion.section variants={item} className={styles.sectionSpaced}>
          <StepLabel step={3}>Try this, right now</StepLabel>
          <button
            type="button"
            onClick={() => setTriedSkill((v) => !v)}
            aria-pressed={triedSkill}
            className={cx(
              "btnReset",
              styles.skillCard,
              triedSkill ? styles.skillCardActive : styles.skillCardInactive,
            )}
          >
            <div className={styles.skillHead}>
              <span className={styles.skillName}>{practice.skill.name}</span>
              <span
                aria-hidden="true"
                className={cx(
                  styles.skillCheck,
                  triedSkill
                    ? styles.skillCheckActive
                    : styles.skillCheckInactive,
                )}
              >
                {triedSkill && (
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </span>
            </div>
            <p className={styles.skillInstruction}>
              {practice.skill.instruction}
            </p>
            <span className={styles.skillHint}>
              {triedSkill ? "Nice — you did it." : "Tap when you've tried it"}
            </span>
          </button>
        </motion.section>

        {/* Step 4 — one small committed action */}
        <motion.section variants={item} className={styles.sectionSpaced}>
          <StepLabel step={4}>One small thing before tomorrow</StepLabel>
          <p className={styles.deepenPrompt}>
            Pick one tiny step you're actually willing to take. Small counts.
          </p>
          <div className={styles.choiceList}>
            {practice.actions.map((a) => {
              const active = !customAction.trim() && selectedAction === a;
              return (
                <ChoiceTile
                  key={a}
                  label={a}
                  active={active}
                  onSelect={() => {
                    setSelectedAction(a);
                    setCustomAction("");
                  }}
                />
              );
            })}
          </div>
          <input
            type="text"
            value={customAction}
            onChange={(e) => {
              setCustomAction(e.target.value);
              if (e.target.value.trim()) setSelectedAction(null);
            }}
            placeholder="Or write your own…"
            className={styles.actionInput}
          />
        </motion.section>

        {/* Margo's closing line. */}
        {practice.closingLine && (
          <motion.p variants={item} className={styles.closingLine}>
            {practice.closingLine}
          </motion.p>
        )}
      </motion.div>

      {/* Footer — primary "Save practice" pill + secondary "Back to home". */}
      <div className={styles.footer}>
        <AnimatePresence>
          {saved && (
            <motion.p
              key="saved"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className={styles.savedNote}
            >
              Saved — we'll remind you tonight.
            </motion.p>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={handleSave}
          className={cx("btnReset", styles.saveBtn)}
          aria-label="Save Practice"
        >
          <span className={styles.saveBtnLabel}>Save Practice</span>
        </button>

        <button
          type="button"
          onClick={onBackHome}
          className={cx("btnReset", "focusRing", styles.backBtn)}
          aria-label="Return Home"
        >
          Return Home
        </button>
      </div>
    </motion.div>
  );
};
