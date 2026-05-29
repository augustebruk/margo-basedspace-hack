import type { JSX } from "react";
import { motion } from "motion/react";

/* -------------------------------------------------------------------------- */
/* Icons (inline SVG so we don't pull in an icon dependency)                  */
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

/* -------------------------------------------------------------------------- */
/* Bottom control bar                                                         */
/* -------------------------------------------------------------------------- */

// Shared circular button look (soft shadow + faint gradient matching the bulb).
const sideButtonClass =
  "all-[unset] box-border flex h-14 w-14 cursor-pointer items-center justify-center rounded-full " +
  "bg-[linear-gradient(135deg,rgba(244,231,255,0.55)_0%,rgba(253,221,222,0.55)_100%)] text-[#1c2b33] " +
  "shadow-[0_8px_22px_rgba(28,43,51,0.12)] " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1c2b33]";

interface ControlsProps {
  isRecording: boolean;
  onMicToggle: () => void;
  onFinish: () => void;
  onNext: () => void;
}

export const Controls = ({
  isRecording,
  onMicToggle,
  onFinish,
  onNext,
}: ControlsProps): JSX.Element => {
  return (
    <div className="flex w-full items-center justify-center gap-9 pb-[env(safe-area-inset-bottom)]">
      {/* Left — Finish entry */}
      <motion.button
        type="button"
        onClick={onFinish}
        whileTap={{ scale: 0.95 }}
        className={sideButtonClass}
        aria-label="Finish entry"
        title="Finish entry"
      >
        <CheckIcon />
      </motion.button>

      {/* Center — Mic (dominant, larger). Pulsing glow while recording. */}
      <div className="relative flex items-center justify-center">
        {isRecording && (
          <motion.span
            aria-hidden="true"
            className="absolute h-[72px] w-[72px] rounded-full bg-[linear-gradient(135deg,rgba(244,231,255,1)_0%,rgba(253,221,222,1)_100%)] blur-md"
            animate={{ opacity: [0.45, 0.85, 0.45], scale: [1, 1.28, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
        <motion.button
          type="button"
          onClick={onMicToggle}
          whileTap={{ scale: 0.95 }}
          aria-label={isRecording ? "Stop recording" : "Start recording"}
          aria-pressed={isRecording}
          className={
            "all-[unset] box-border relative flex h-[72px] w-[72px] cursor-pointer items-center justify-center rounded-full " +
            "text-[#1c2b33] shadow-[0_10px_28px_rgba(28,43,51,0.18)] transition-colors " +
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1c2b33] " +
            (isRecording
              ? // Recording: filled gradient circle, icon highlighted.
                "bg-[linear-gradient(135deg,rgba(244,231,255,1)_0%,rgba(253,221,222,1)_100%)]"
              : // Idle: soft, light surface.
                "bg-white")
          }
        >
          <MicIcon />
        </motion.button>
      </div>

      {/* Right — Next prompt */}
      <motion.button
        type="button"
        onClick={onNext}
        whileTap={{ scale: 0.95 }}
        className={sideButtonClass}
        aria-label="Next prompt"
        title="Next prompt"
      >
        <ForwardIcon />
      </motion.button>
    </div>
  );
};
