import type { JSX } from "react";
import { motion } from "motion/react";

/* ============================================================================
 * BottomNav — the persistent tab bar shown in the main app (after onboarding).
 *
 * Two tabs: the live journaling flow ("Journal") and the saved sessions list
 * ("History"). Icons are hand-written inline SVG using currentColor, matching
 * the rest of the app (no icon library).
 * ==========================================================================*/
export type NavTab = "journal" | "history";

export interface BottomNavProps {
  active: NavTab;
  onSelect: (tab: NavTab) => void;
}

const JournalIcon = ({ active }: { active: boolean }): JSX.Element => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    stroke="currentColor"
    strokeWidth={active ? 2 : 1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M6 4h10a2 2 0 0 1 2 2v13a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
    <path d="M4 8h2M4 12h2M4 16h2" />
    <path d="M9 9h6M9 13h4" />
  </svg>
);

const HistoryIcon = ({ active }: { active: boolean }): JSX.Element => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    stroke="currentColor"
    strokeWidth={active ? 2 : 1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v4h4" />
    <path d="M12 8v4l2.5 2.5" />
  </svg>
);

const TABS: { id: NavTab; label: string; Icon: typeof JournalIcon }[] = [
  { id: "journal", label: "Journal", Icon: JournalIcon },
  { id: "history", label: "History", Icon: HistoryIcon },
];

export const BottomNav = ({ active, onSelect }: BottomNavProps): JSX.Element => (
  <nav
    aria-label="Primary"
    className="absolute inset-x-0 bottom-0 z-20 flex items-stretch justify-around border-t border-[#1c2b33]/8 bg-white/85 px-6 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md"
  >
    {TABS.map(({ id, label, Icon }) => {
      const isActive = active === id;
      return (
        <button
          key={id}
          type="button"
          onClick={() => onSelect(id)}
          aria-current={isActive ? "page" : undefined}
          className="all-[unset] box-border relative flex flex-1 cursor-pointer flex-col items-center gap-1 py-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1c2b33]"
        >
          <span
            className={
              "transition-colors " +
              (isActive ? "text-[#1c2b33]" : "text-[#1c2b33]/35")
            }
          >
            <Icon active={isActive} />
          </span>
          <span
            className={
              "[font-family:'Inter',Helvetica] text-[11px] font-medium tracking-[-0.1px] transition-colors " +
              (isActive ? "text-[#1c2b33]" : "text-[#1c2b33]/40")
            }
          >
            {label}
          </span>
          {isActive && (
            <motion.span
              layoutId="bottom-nav-indicator"
              aria-hidden="true"
              className="absolute -top-[9px] h-[3px] w-7 rounded-full"
              style={{
                background:
                  "linear-gradient(90deg, #c7a6f5 0%, #ec9fc4 52%, #f7b59a 100%)",
              }}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
            />
          )}
        </button>
      );
    })}
  </nav>
);
