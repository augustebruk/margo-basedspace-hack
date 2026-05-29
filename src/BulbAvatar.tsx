import type { JSX } from "react";
import { motion, type Variants } from "motion/react";
import image305 from "./assets/image-305.png";

/**
 * The three visual states of the bulb (the "AI" avatar).
 * - idle:           before the entry starts — very gentle breathing.
 * - aiSpeaking:     the AI is talking — pronounced breathing + glow pulse.
 * - personSpeaking: the AI is listening — calm, slow, soft steady halo.
 */
export type BulbState = "idle" | "aiSpeaking" | "personSpeaking";

// Scale ("breathing") animation for the bulb itself.
// Tweak the `duration` values to make a state feel faster / calmer.
const bulbVariants: Variants = {
  idle: {
    scale: [1, 1.02, 1],
    transition: { duration: 5, repeat: Infinity, ease: "easeInOut" },
  },
  aiSpeaking: {
    // Spec: smooth 0.95 → 1 → 0.95 breathing while the AI speaks.
    scale: [0.95, 1, 0.95],
    transition: { duration: 2.4, repeat: Infinity, ease: "easeInOut" },
  },
  personSpeaking: {
    // Calmer than AI speaking: almost no scale, very slow drift.
    scale: [1, 1.008, 1],
    transition: { duration: 6, repeat: Infinity, ease: "easeInOut" },
  },
};

// Soft gradient halo behind the bulb. It pulses with the gradient colors when
// the AI speaks, and settles into a gentle steady glow while listening.
const glowVariants: Variants = {
  idle: {
    opacity: [0.2, 0.32, 0.2],
    scale: [1, 1.05, 1],
    transition: { duration: 5, repeat: Infinity, ease: "easeInOut" },
  },
  aiSpeaking: {
    opacity: [0.35, 0.75, 0.35],
    scale: [1, 1.14, 1],
    transition: { duration: 2.4, repeat: Infinity, ease: "easeInOut" },
  },
  personSpeaking: {
    opacity: [0.28, 0.45, 0.28],
    scale: [1, 1.05, 1],
    transition: { duration: 5, repeat: Infinity, ease: "easeInOut" },
  },
};

interface BulbAvatarProps {
  state: BulbState;
  /** Diameter in px. Defaults to the design size. */
  size?: number;
  className?: string;
}

export const BulbAvatar = ({
  state,
  size = 235,
  className,
}: BulbAvatarProps): JSX.Element => {
  return (
    <div
      className={`relative flex items-center justify-center ${className ?? ""}`}
      style={{ width: size, height: size }}
    >
      {/* Gradient glow / halo (matches the bulb + button gradient colors). */}
      <motion.div
        aria-hidden="true"
        className="absolute inset-0 rounded-full blur-2xl bg-[linear-gradient(135deg,rgba(244,231,255,1)_0%,rgba(253,221,222,1)_100%)]"
        variants={glowVariants}
        animate={state}
      />

      {/* The bulb image itself. */}
      <motion.div
        aria-hidden="true"
        className="relative overflow-hidden rounded-full bg-white"
        style={{ width: size, height: size }}
        variants={bulbVariants}
        animate={state}
      >
        <img className="h-full w-full object-cover" alt="" src={image305} />
      </motion.div>
    </div>
  );
};
