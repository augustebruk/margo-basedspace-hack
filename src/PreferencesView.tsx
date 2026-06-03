import { useState, type JSX } from "react";
import { motion } from "motion/react";
import { cx } from "./cx";
import styles from "./PreferencesView.module.css";

/* ============================================================================
 * PreferencesView — lightweight settings page. For now it only lets the person
 * edit the name Margo uses for them (persisted via useOnboarding).
 * ==========================================================================*/
export interface PreferencesViewProps {
  name: string;
  onSaveName: (name: string) => void;
  onBack: () => void;
}

export const PreferencesView = ({
  name,
  onSaveName,
  onBack,
}: PreferencesViewProps): JSX.Element => {
  const [draft, setDraft] = useState(name);
  const [saved, setSaved] = useState(false);

  const trimmed = draft.trim();
  const dirty = trimmed !== name.trim();
  const canSave = trimmed.length > 0 && dirty;

  const handleSave = () => {
    if (!canSave) return;
    onSaveName(trimmed);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  return (
    <motion.div
      key="preferences"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={styles.root}
    >
      {/* Same washed-out pastel background as the other screens. */}
      <div aria-hidden="true" className={styles.bg} />

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
        <h1 className={styles.title}>Preferences</h1>
      </div>

      {/* Body */}
      <div className={styles.body}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Your name</span>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
            }}
            placeholder="What should Margo call you?"
            className={styles.input}
            autoComplete="off"
          />
          <span className={styles.fieldHint}>
            This is the name Margo uses when she talks to you.
          </span>
        </label>

        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className={cx(
            "btnReset",
            styles.saveBtn,
            !canSave && styles.saveBtnDisabled,
          )}
          aria-label="Save name"
        >
          {saved ? "Saved" : "Save"}
        </button>
      </div>
    </motion.div>
  );
};
