import type { JSX } from "react";
import { motion, type Variants } from "motion/react";
import type { Entry } from "./useEntries";
import { formatDay, formatTime } from "./entryFormat";
import { cx } from "./cx";
import styles from "./HistoryView.module.css";

/* ============================================================================
 * HistoryView — the "Past Entries" tab. A scrollable list of full-width cards,
 * most recent on top, each showing the date + time and a short AI-generated
 * topic. Tapping a card opens its detail (duration, transcript, reflection).
 * ==========================================================================*/
export interface HistoryViewProps {
  entries: Entry[];
  onOpenEntry: (id: string) => void;
  onBack: () => void;
}

const EASE = [0.22, 1, 0.36, 1] as const;

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
};

const EmptyState = (): JSX.Element => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, ease: EASE }}
    className={styles.empty}
  >
    <span
      aria-hidden="true"
      className={styles.emptyIcon}
    >
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#1c2b33"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v4h4" />
        <path d="M12 8v4l2.5 2.5" />
      </svg>
    </span>
    <p className={styles.emptyTitle}>
      No entries yet
    </p>
    <p className={styles.emptyText}>
      Finish your first journaling session and it'll show up here — date, topic,
      and the full reflection.
    </p>
  </motion.div>
);

export const HistoryView = ({
  entries,
  onOpenEntry,
  onBack,
}: HistoryViewProps): JSX.Element => (
  <motion.div
    key="history"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.4, ease: "easeOut" }}
    className={styles.root}
  >
    {/* Same washed-out pastel orb background as the other screens. */}
    <div
      aria-hidden="true"
      className={styles.bg}
    />

    {/* Header */}
    <div className={styles.header}>
      <button
        type="button"
        onClick={onBack}
        className={cx("btnReset", "focusRing", styles.backButton)}
        aria-label="Back home"
      >
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m15 6-6 6 6 6" />
        </svg>
        Home
      </button>
      <h1 className={styles.title}>
        Past entries
      </h1>
      <p className={styles.subtitle}>
        {entries.length > 0
          ? `${entries.length} ${entries.length === 1 ? "session" : "sessions"}`
          : "Your journaling history"}
      </p>
    </div>

    {entries.length === 0 ? (
      <EmptyState />
    ) : (
      <motion.ul
        variants={container}
        initial="hidden"
        animate="show"
        className={styles.list}
      >
        {entries.map((entry) => (
          <motion.li key={entry.id} variants={item} className={styles.listItem}>
            <button
              type="button"
              onClick={() => onOpenEntry(entry.id)}
              className={cx("btnReset", "focusRing", styles.card)}
            >
              <div className={styles.cardMeta}>
                <span>{formatDay(entry.createdAt)}</span>
                <span aria-hidden="true">·</span>
                <span className={styles.cardTime}>
                  {formatTime(entry.createdAt)}
                </span>
              </div>
              <div className={styles.cardRow}>
                <p className={styles.cardTopic}>
                  {entry.topic}
                </p>
                <svg
                  aria-hidden="true"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#1c2b33"
                  strokeOpacity={0.3}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={styles.cardChevron}
                >
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </div>
            </button>
          </motion.li>
        ))}
      </motion.ul>
    )}
  </motion.div>
);
