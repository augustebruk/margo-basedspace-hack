import type { JSX } from "react";
import { motion, type Variants } from "motion/react";
import image305 from "./assets/image-305.png";
import { cx } from "./cx";
import styles from "./BulbAvatar.module.css";

/**
 * The three visual states of the bulb (the "AI" avatar).
 * - idle:           before the entry starts — very gentle breathing.
 * - aiSpeaking:     the AI is talking — pronounced breathing + glow pulse.
 * - personSpeaking: the AI is listening — calm, slow, soft steady halo.
 */
export type BulbState = "idle" | "aiSpeaking" | "personSpeaking";

// Scale ("breathing") animation for the bulb itself.
const bulbVariants: Variants = {
  idle: {
    scale: [1, 1.02, 1],
    transition: { duration: 5, repeat: Infinity, ease: "easeInOut" },
  },
  aiSpeaking: {
    scale: [0.95, 1, 0.95],
    transition: { duration: 2.4, repeat: Infinity, ease: "easeInOut" },
  },
  personSpeaking: {
    scale: [1, 1.008, 1],
    transition: { duration: 6, repeat: Infinity, ease: "easeInOut" },
  },
};

// Soft gradient halo behind the bulb. Pulses hardest while the AI speaks.
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
  size = 232,
  className,
}: BulbAvatarProps): JSX.Element => {
  return (
    <div
      className={cx(styles.root, className)}
      style={{ width: size, height: size }}
    >
      {/* Gradient glow / halo (matches the bulb + button gradient colors). */}
      <motion.div
        aria-hidden="true"
        className={styles.glow}
        variants={glowVariants}
        animate={state}
      />

      {/* The bulb image itself. The image is rounded directly (not just
          clipped by the parent) so iOS Safari doesn't leak its square corners
          while the parent is mid scale-transform — which showed up on prod as
          faint rectangular nubs at the top of the orb. */}
      <motion.div
        aria-hidden="true"
        className={styles.bulb}
        style={{ width: size, height: size }}
        variants={bulbVariants}
        animate={state}
      >
        <img className={styles.image} alt="" src={image305} />
      </motion.div>
    </div>
  );
};
