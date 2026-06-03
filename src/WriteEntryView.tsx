import { useState, type JSX } from "react";
import { motion } from "motion/react";
import { cx } from "./cx";
import styles from "./WriteEntryView.module.css";

/* ============================================================================
 * WriteEntryView — full-page free-writing journaling experience.
 *
 * The user writes freely on a clean page. When done, they tap "Reflect" which
 * takes their written text through the same reflection pipeline as a voice
 * entry.
 * ==========================================================================*/
export interface WriteEntryViewProps {
  onReflect: (text: string) => void;
  name?: string;
}

export const WriteEntryView = ({
  onReflect,
  name,
}: WriteEntryViewProps): JSX.Element => {
  const [text, setText] = useState("");

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const canReflect = wordCount >= 3;

  return (
    <motion.div
      key="write-entry"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={styles.root}
    >
      {/* Background */}
      <div aria-hidden="true" className={styles.bg} />

      {/* Header */}
      <div className={styles.header}>
        <p className={styles.eyebrow}>Free Write</p>
        <h1 className={styles.title}>
          {name ? `What's on your mind, ${name}?` : "What's on your mind?"}
        </h1>
      </div>

      {/* Writing area */}
      <div className={styles.writeArea}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
          placeholder="Start writing… Let your thoughts flow freely. There's no right or wrong way to do this."
          className={styles.textarea}
        />
      </div>

      {/* Footer */}
      <div className={styles.footer}>
        <span className={styles.wordCount}>
          {wordCount} {wordCount === 1 ? "word" : "words"}
        </span>

        <button
          type="button"
          onClick={() => onReflect(text)}
          disabled={!canReflect}
          className={cx(
            "btnReset",
            styles.reflectBtn,
            !canReflect && styles.reflectBtnDisabled,
          )}
          aria-label="Reflect"
        >
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
          <span className={styles.reflectBtnLabel}>Reflect</span>
        </button>
      </div>
    </motion.div>
  );
};
