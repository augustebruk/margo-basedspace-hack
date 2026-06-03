import type { JSX } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cx } from "./cx";
import styles from "./HomeMenu.module.css";

/* ============================================================================
 * HomeMenu — the modal opened from the bottom-left button on the home screen.
 * Offers the secondary destinations that don't warrant a dedicated home-screen
 * icon: Insights and Preferences.
 * ==========================================================================*/
export type HomeMenuAction = "insights" | "preferences";

export interface HomeMenuProps {
  open: boolean;
  onClose: () => void;
  onSelect: (action: HomeMenuAction) => void;
}

const EASE = [0.22, 1, 0.36, 1] as const;

const MENU_ITEMS: { id: HomeMenuAction; label: string; icon: JSX.Element }[] = [
  {
    id: "insights",
    label: "Insights",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 20h20" />
        <path d="M5 20V10" />
        <path d="M9 20V4" />
        <path d="M13 20v-8" />
        <path d="M17 20V8" />
        <path d="M21 20v-5" />
      </svg>
    ),
  },
  {
    id: "preferences",
    label: "Preferences",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

export const HomeMenu = ({
  open,
  onClose,
  onSelect,
}: HomeMenuProps): JSX.Element => (
  <AnimatePresence>
    {open && (
      <>
        {/* Backdrop */}
        <motion.div
          key="home-menu-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className={styles.backdrop}
        />

        {/* Menu panel — slides up from the bottom-left, near its trigger. */}
        <motion.div
          key="home-menu-panel"
          initial={{ opacity: 0, y: 40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 30, scale: 0.97 }}
          transition={{ duration: 0.28, ease: EASE }}
          onClick={onClose}
          className={styles.overlay}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={styles.panel}
          >
            {MENU_ITEMS.map(({ id, label, icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  onClose();
                  onSelect(id);
                }}
                className={cx("btnReset", "focusRing", styles.item)}
              >
                <span className={styles.itemIcon}>{icon}</span>
                <span className={styles.itemLabel}>{label}</span>
              </button>
            ))}
          </div>
        </motion.div>
      </>
    )}
  </AnimatePresence>
);
