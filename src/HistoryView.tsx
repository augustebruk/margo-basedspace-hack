import type { JSX } from "react";
import { motion, type Variants } from "motion/react";
import type { Entry } from "./useEntries";
import { formatDay, formatTime } from "./entryFormat";

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
    className="flex flex-1 flex-col items-center justify-center px-8 text-center"
  >
    <span
      aria-hidden="true"
      className="mb-5 flex h-16 w-16 items-center justify-center rounded-full"
      style={{
        background:
          "linear-gradient(135deg, rgba(244,231,255,1) 0%, rgba(253,221,222,1) 100%)",
      }}
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
    <p className="[font-family:'Inter',Helvetica] text-[19px] font-medium tracking-[-0.3px] text-[#1c2b33]">
      No entries yet
    </p>
    <p className="mt-1.5 max-w-[260px] [font-family:'Inter',Helvetica] text-[14px] font-normal leading-[21px] text-[#1c2b33]/55">
      Finish your first journaling session and it'll show up here — date, topic,
      and the full reflection.
    </p>
  </motion.div>
);

export const HistoryView = ({
  entries,
  onOpenEntry,
}: HistoryViewProps): JSX.Element => (
  <motion.div
    key="history"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.4, ease: "easeOut" }}
    className="relative flex h-full w-full flex-col"
  >
    {/* Same washed-out pastel orb background as the other screens. */}
    <div
      aria-hidden="true"
      className="absolute inset-0 -z-10"
      style={{
        background:
          "linear-gradient(160deg, #f6eeff 0%, #fdf1f3 48%, #fef6f1 100%)",
      }}
    />

    {/* Header */}
    <div className="px-5 pt-14 pb-3">
      <h1 className="[font-family:'Inter',Helvetica] text-[28px] font-medium leading-[1.2] tracking-[-0.5px] text-[#1c2b33]">
        Past entries
      </h1>
      <p className="mt-1 [font-family:'Inter',Helvetica] text-[14px] font-normal leading-[20px] text-[#1c2b33]/55">
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
        className="min-h-0 flex-1 overflow-y-auto px-5 pb-24"
      >
        {entries.map((entry) => (
          <motion.li key={entry.id} variants={item} className="mb-3">
            <button
              type="button"
              onClick={() => onOpenEntry(entry.id)}
              className="all-[unset] box-border flex w-full cursor-pointer flex-col gap-2 rounded-[20px] border border-white/70 bg-white/75 p-4 text-left shadow-[0_8px_28px_rgba(28,43,51,0.05)] transition-colors hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1c2b33]"
            >
              <div className="flex items-center gap-1.5 [font-family:'Inter',Helvetica] text-[12px] font-medium uppercase tracking-[1.2px] text-[#1c2b33]/40">
                <span>{formatDay(entry.createdAt)}</span>
                <span aria-hidden="true">·</span>
                <span className="normal-case tracking-[0.2px]">
                  {formatTime(entry.createdAt)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="[font-family:'Inter',Helvetica] text-[17px] font-medium leading-[1.3] tracking-[-0.2px] text-[#1c2b33]">
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
                  className="shrink-0"
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
