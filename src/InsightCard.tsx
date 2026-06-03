import type { JSX } from "react";
import { motion } from "motion/react";
import type { Insight } from "./useInsight";
import styles from "./InsightCard.module.css";

/* ============================================================================
 * InsightCard — the onboarding "Pattern Reveal" wow moment.
 *
 * Slides up from the bottom with a soft pastel glow pulse. White/pastel to
 * match the rest of the app. Driven by the Claude-generated `Insight`.
 * ==========================================================================*/
const EASE = [0.22, 1, 0.36, 1] as const;

interface InsightCardProps {
  insight: Insight;
}

export const InsightCard = ({ insight }: InsightCardProps): JSX.Element => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 64 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: EASE }}
      className={styles.root}
    >
      <div className={styles.card}>
        {/* Soft pastel glow that fades out toward the edges so the card melts
            into the (white) background instead of reading as a hard-edged box.
            No border / drop shadow / opaque fill = no visible corners. */}
        <motion.div
          aria-hidden="true"
          className={styles.glow}
          animate={{ opacity: [0.45, 0.7, 0.45], scale: [1, 1.04, 1] }}
          transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
        />

        <div className={styles.body}>
        {/* Header */}
        <div className={styles.header}>
          <span
            aria-hidden="true"
            className={styles.headerIcon}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7c5cbf" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 3-6.7" />
              <path d="M3 4v4h4" />
            </svg>
          </span>
          <span className={styles.eyebrow}>
            Pattern Reveal
          </span>
        </div>

        {/* Core question */}
        <div className={styles.coreBlock}>
          <p className={styles.summaryLine}>
            {insight.summaryLine}
          </p>
          <p className={styles.coreQuestion}>
            “{insight.coreQuestion}”
          </p>
        </div>

        {/* Triggers */}
        {insight.triggers.length > 0 && (
          <div className={styles.triggers}>
            <p className={styles.triggersLabel}>
              This shows up when
            </p>
            <ul className={styles.triggersList}>
              {insight.triggers.map((t, i) => (
                <li key={i} className={styles.triggerItem}>
                  <span
                    aria-hidden="true"
                    className={styles.triggerBullet}
                  />
                  <span className={styles.triggerText}>
                    {t}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Margo asks */}
        <div className={styles.margoBlock}>
          <p className={styles.margoLabel}>
            Margo asks
          </p>
          <p className={styles.margoQuestion}>
            “{insight.margoQuestion}”
          </p>
        </div>
        </div>
      </div>
    </motion.div>
  );
};
