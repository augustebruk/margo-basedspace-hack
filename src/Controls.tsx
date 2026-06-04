import type { JSX } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cx } from "./cx";
import styles from "./Controls.module.css";

/* -------------------------------------------------------------------------- */
/* Icons (inline SVG so we don't pull in an icon dependency). Color is         */
/* inherited via `currentColor`, set by each button.                          */
/* -------------------------------------------------------------------------- */

const MicIcon = (): JSX.Element => (
  <svg
    width="26"
    height="26"
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
);

const CheckIcon = (): JSX.Element => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5 12.5l4.5 4.5L19 7" />
  </svg>
);

const ForwardIcon = (): JSX.Element => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5 12h13" />
    <path d="M12.5 6l6 6-6 6" />
  </svg>
);

const KeyboardIcon = (): JSX.Element => (
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
    <rect x="2" y="6" width="20" height="12" rx="2.5" />
    <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 13h.01M18 13h.01M9 13h6" />
  </svg>
);

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

interface ControlsProps {
  isRecording: boolean;
  isTyping: boolean;
  composing?: boolean;
  onMicToggle: () => void;
  onToggleKeyboard: () => void;
  onFinish: () => void;
  onNext: () => void;
}

export const Controls = ({
  isRecording,
  isTyping,
  composing = false,
  onMicToggle,
  onToggleKeyboard,
  onFinish,
  onNext,
}: ControlsProps): JSX.Element => {
  return (
    <div className={styles.root}>
      <div className={styles.row}>
      {/* Left — Finish entry (secondary, soft tint, no color change on press) */}
      <motion.button
        type="button"
        onClick={onFinish}
        whileTap={{ scale: 0.96, boxShadow: "0 10px 24px rgba(28,43,51,0.16)" }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className={cx("btnReset", "focusRing", styles.sideButton)}
        aria-label="Finish Entry"
        title="Finish Entry"
      >
        <CheckIcon />
      </motion.button>

      {/* Center — Mic (dominant). Always white; recording shown with a gentle
          pulsing pastel ring + soft inner glow, never a heavy fill. */}
      <motion.button
        type="button"
        onClick={onMicToggle}
        whileTap={{ scale: 0.97 }}
        // Recording: slight scale up + softer, larger shadow (still white).
        animate={{
          scale: isRecording ? 1.04 : 1,
          boxShadow: isRecording
            ? "0 16px 38px rgba(28,43,51,0.16)"
            : "0 10px 26px rgba(28,43,51,0.10)",
        }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        aria-label={
          isTyping
            ? "Keyboard input"
            : isRecording
              ? "Pause recording"
              : "Resume recording"
        }
        aria-pressed={isRecording}
        className={cx(
          "btnReset",
          "focusRing",
          styles.micButton,
          isRecording && styles.micButtonRecording,
        )}
      >
        {isRecording && (
          <>
            {/* Thin pastel ring that gently pulses around the circle. */}
            <motion.span
              aria-hidden="true"
              className={styles.micRing}
              initial={{ opacity: 0.4, scale: 1 }}
              animate={{ opacity: [0.35, 0.85, 0.35], scale: [1, 1.12, 1] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            />
            {/* Subtle inner glow in the same pastel. */}
            <motion.span
              aria-hidden="true"
              className={styles.micGlow}
              animate={{ opacity: [0.4, 0.85, 0.4] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            />
          </>
        )}
        {/* Icon sits above the glow/ring. Shows the keyboard glyph while the
            user is in keyboard mode, the mic otherwise. */}
        <span className={styles.micIcon}>
          {isTyping ? <KeyboardIcon /> : <MicIcon />}
        </span>
      </motion.button>

      {/* Right — Next prompt (secondary, soft tint, no color change on press) */}
      <motion.button
        type="button"
        onClick={onNext}
        whileTap={{ scale: 0.96, boxShadow: "0 10px 24px rgba(28,43,51,0.16)" }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className={cx("btnReset", "focusRing", styles.sideButton)}
        aria-label="Next Prompt"
        title="Next Prompt"
      >
        <ForwardIcon />
      </motion.button>
      </div>

      {/* Keyboard toggle — switch between speaking and typing for this turn.
          When recording is paused, tapping the mic resumes and appends. While
          composing (input focused) it slides down and out of the way to give
          the text room. */}
      <AnimatePresence initial={false}>
        {!composing && (
          <motion.button
            key="kb-toggle"
            type="button"
            onClick={onToggleKeyboard}
            aria-pressed={isTyping}
            initial={{ opacity: 0, y: 12, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: 16, height: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className={cx("btnReset", "focusRing", styles.keyboardToggle)}
            title={isTyping ? "Switch Back To Voice" : "Type Instead"}
          >
            {isTyping ? (
              <span className={styles.keyboardToggleIcon}>
                <MicIcon />
              </span>
            ) : (
              <KeyboardIcon />
            )}
            <span>{isTyping ? "Use Voice" : "Type Instead"}</span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};
