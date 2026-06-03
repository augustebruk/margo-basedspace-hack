import { useState, type JSX } from "react";
import { AnimatePresence, motion } from "motion/react";

/* ============================================================================
 * BottomNav — floating pill navigation bar at the bottom of the screen.
 *
 * Three icons:
 *   1. Back arrow — always navigates to the previous page.
 *   2. Home (center) — goes to the home/entry screen.
 *   3. Burger menu — opens a modal with: Past Entries, Insights, Write An Entry.
 * ==========================================================================*/
export type MenuAction = "history" | "insights" | "write";

export interface BottomNavProps {
  onBack: () => void;
  onHome: () => void;
  onMenuAction: (action: MenuAction) => void;
  /** Hide the back arrow when there's nowhere to go back to. */
  canGoBack?: boolean;
}

const EASE = [0.22, 1, 0.36, 1] as const;

const MENU_ITEMS: { id: MenuAction; label: string; icon: JSX.Element }[] = [
  {
    id: "write",
    label: "Type An Entry",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
  },
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
    id: "history",
    label: "Past Entries",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v4h4" />
        <path d="M12 8v4l2.5 2.5" />
      </svg>
    ),
  },
];

export const BottomNav = ({
  onBack,
  onHome,
  onMenuAction,
  canGoBack = true,
}: BottomNavProps): JSX.Element => {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      {/* The floating pill bar */}
      <nav
        aria-label="Primary"
        className="pointer-events-auto flex items-center gap-1 rounded-full bg-white/90 px-2 py-1.5 shadow-[0_8px_30px_rgba(28,43,51,0.12)] backdrop-blur-md"
      >
        {/* Back */}
        <button
          type="button"
          onClick={onBack}
          disabled={!canGoBack}
          aria-label="Go Back"
          className={
            "all-[unset] box-border flex h-11 w-11 cursor-pointer items-center justify-center rounded-full transition-colors " +
            (canGoBack
              ? "text-[#1c2b33]/70 hover:bg-[#1c2b33]/5 hover:text-[#1c2b33]"
              : "cursor-default text-[#1c2b33]/20")
          }
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 6-6 6 6 6" />
          </svg>
        </button>

        {/* Home (center, emphasized) */}
        <button
          type="button"
          onClick={onHome}
          aria-label="Home"
          className="all-[unset] box-border flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-[#1c2b33] text-white shadow-[0_4px_12px_rgba(28,43,51,0.2)] transition-transform hover:scale-105"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
          </svg>
        </button>

        {/* Burger menu */}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Menu"
          aria-expanded={menuOpen}
          className="all-[unset] box-border flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-[#1c2b33]/70 transition-colors hover:bg-[#1c2b33]/5 hover:text-[#1c2b33]"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
      </nav>

      {/* Menu modal overlay */}
      <AnimatePresence>
        {menuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="menu-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMenuOpen(false)}
              className="pointer-events-auto absolute inset-0 z-40 bg-black/20 backdrop-blur-[2px]"
            />

            {/* Menu panel */}
            <motion.div
              key="menu-panel"
              initial={{ opacity: 0, y: 40, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.97 }}
              transition={{ duration: 0.28, ease: EASE }}
              onClick={() => setMenuOpen(false)}
              className="pointer-events-auto absolute inset-0 z-50 flex items-end justify-center px-6 pb-[max(6rem,calc(env(safe-area-inset-bottom)+5rem))]"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="flex w-full max-w-[320px] flex-col gap-1 rounded-[20px] bg-white/95 p-2 shadow-[0_16px_48px_rgba(28,43,51,0.18)] backdrop-blur-lg"
              >
                {MENU_ITEMS.map(({ id, label, icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onMenuAction(id);
                    }}
                    className="all-[unset] box-border flex w-full cursor-pointer items-center gap-3 rounded-[14px] px-4 py-3.5 text-[#1c2b33]/80 transition-colors hover:bg-[#f6eeff] hover:text-[#1c2b33]"
                  >
                    <span className="shrink-0 text-[#1c2b33]/55">{icon}</span>
                    <span className="[font-family:'Inter',Helvetica] text-[15px] font-medium">
                      {label}
                    </span>
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
