import type { JSX } from "react";
import { motion, type Variants } from "motion/react";
import image305 from "./assets/image-305.png";

/**
 * Visual states of the bulb (the "AI" avatar):
 * - idle:           very slow, subtle gradient movement + minimal breathing.
 * - aiSpeaking:     most dynamic — faster color flow + pulsing glow.
 * - personSpeaking: calmer than aiSpeaking — gentle ripples / soft pulses.
 */
export type BulbState = "idle" | "aiSpeaking" | "personSpeaking";

// Scale "breathing" of the whole sphere.
const sphereVariants: Variants = {
  idle: {
    scale: [1, 1.02, 1],
    transition: { duration: 6, repeat: Infinity, ease: "easeInOut" },
  },
  aiSpeaking: {
    scale: [0.95, 1, 0.95],
    transition: { duration: 2.4, repeat: Infinity, ease: "easeInOut" },
  },
  personSpeaking: {
    scale: [1, 1.012, 1],
    transition: { duration: 5, repeat: Infinity, ease: "easeInOut" },
  },
};

// Outer gradient glow / halo. Pulses hardest while the AI speaks.
const glowVariants: Variants = {
  idle: {
    opacity: [0.16, 0.28, 0.16],
    scale: [1, 1.05, 1],
    transition: { duration: 6, repeat: Infinity, ease: "easeInOut" },
  },
  aiSpeaking: {
    opacity: [0.4, 0.85, 0.4],
    scale: [1, 1.16, 1],
    transition: { duration: 2.2, repeat: Infinity, ease: "easeInOut" },
  },
  personSpeaking: {
    opacity: [0.28, 0.5, 0.28],
    scale: [1, 1.07, 1],
    transition: { duration: 4.5, repeat: Infinity, ease: "easeInOut" },
  },
};

// Rotating conic layer — drives the "color swirl"/mixing. Faster = AI speaking.
const swirlVariants: Variants = {
  idle: { rotate: 360, transition: { duration: 42, repeat: Infinity, ease: "linear" } },
  aiSpeaking: { rotate: 360, transition: { duration: 12, repeat: Infinity, ease: "linear" } },
  personSpeaking: { rotate: 360, transition: { duration: 24, repeat: Infinity, ease: "linear" } },
};

// Drifting color blobs. Bigger travel + faster = more flow (AI speaking).
const blobAVariants: Variants = {
  idle: {
    x: [-6, 6, -6],
    y: [5, -5, 5],
    scale: [1, 1.06, 1],
    transition: { duration: 13, repeat: Infinity, ease: "easeInOut" },
  },
  aiSpeaking: {
    x: [-22, 22, -22],
    y: [16, -16, 16],
    scale: [1, 1.22, 1],
    transition: { duration: 4.5, repeat: Infinity, ease: "easeInOut" },
  },
  personSpeaking: {
    x: [-10, 10, -10],
    y: [8, -8, 8],
    scale: [1, 1.1, 1],
    transition: { duration: 7.5, repeat: Infinity, ease: "easeInOut" },
  },
};

const blobBVariants: Variants = {
  idle: {
    x: [5, -5, 5],
    y: [-6, 6, -6],
    scale: [1.04, 1, 1.04],
    transition: { duration: 15, repeat: Infinity, ease: "easeInOut" },
  },
  aiSpeaking: {
    x: [18, -18, 18],
    y: [-14, 14, -14],
    scale: [1.18, 1, 1.18],
    transition: { duration: 5, repeat: Infinity, ease: "easeInOut" },
  },
  personSpeaking: {
    x: [9, -9, 9],
    y: [-7, 7, -7],
    scale: [1.08, 1, 1.08],
    transition: { duration: 8, repeat: Infinity, ease: "easeInOut" },
  },
};

const blobCVariants: Variants = {
  idle: {
    x: [3, -4, 3],
    y: [-3, 4, -3],
    scale: [1, 1.05, 1],
    transition: { duration: 17, repeat: Infinity, ease: "easeInOut" },
  },
  aiSpeaking: {
    x: [12, -14, 12],
    y: [-12, 12, -12],
    scale: [1, 1.2, 1],
    transition: { duration: 5.5, repeat: Infinity, ease: "easeInOut" },
  },
  personSpeaking: {
    x: [6, -7, 6],
    y: [-6, 6, -6],
    scale: [1, 1.1, 1],
    transition: { duration: 9, repeat: Infinity, ease: "easeInOut" },
  },
};

interface BulbAvatarProps {
  /** Drives the animation variants. */
  visualState: BulbState;
  /** Diameter in px. Defaults to the design size. */
  size?: number;
  className?: string;
}

export const BulbAvatar = ({
  visualState,
  size = 232,
  className,
}: BulbAvatarProps): JSX.Element => {
  return (
    <div
      className={`relative flex items-center justify-center ${className ?? ""}`}
      style={{ width: size, height: size }}
    >
      {/* Outer gradient glow / halo. */}
      <motion.div
        aria-hidden="true"
        className="absolute inset-0 rounded-full blur-2xl bg-[linear-gradient(135deg,rgba(244,231,255,1)_0%,rgba(253,221,222,1)_100%)]"
        variants={glowVariants}
        animate={visualState}
      />

      {/* The sphere. Color layers move inside the clipped circle. */}
      <motion.div
        aria-hidden="true"
        className="relative overflow-hidden rounded-full bg-white"
        style={{ width: size, height: size }}
        variants={sphereVariants}
        animate={visualState}
      >
        {/* Faint base image keeps a little grain/texture. */}
        <img
          className="absolute inset-0 h-full w-full object-cover opacity-40"
          alt=""
          src={image305}
        />

        {/* Rotating conic gradient — color swirl / mixing. */}
        <motion.div
          className="absolute inset-[-20%] blur-2xl opacity-60"
          style={{
            background:
              "conic-gradient(from 0deg, #fde7ff, #fddde1, #d6e4ff, #f4e7ff, #ffe3ec, #fde7ff)",
          }}
          variants={swirlVariants}
          animate={visualState}
        />

        {/* Drifting color blobs. */}
        <motion.div
          className="absolute inset-0 blur-2xl"
          style={{
            background:
              "radial-gradient(circle at 35% 35%, rgba(253,221,222,0.92) 0%, rgba(253,221,222,0) 60%)",
          }}
          variants={blobAVariants}
          animate={visualState}
        />
        <motion.div
          className="absolute inset-0 blur-2xl"
          style={{
            background:
              "radial-gradient(circle at 65% 60%, rgba(229,213,255,0.92) 0%, rgba(229,213,255,0) 60%)",
          }}
          variants={blobBVariants}
          animate={visualState}
        />
        <motion.div
          className="absolute inset-0 blur-xl"
          style={{
            background:
              "radial-gradient(circle at 55% 75%, rgba(214,228,255,0.85) 0%, rgba(214,228,255,0) 60%)",
          }}
          variants={blobCVariants}
          animate={visualState}
        />

        {/* Soft top highlight for a little dimension. */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_38%_30%,rgba(255,255,255,0.5)_0%,rgba(255,255,255,0)_45%)]" />
      </motion.div>
    </div>
  );
};
