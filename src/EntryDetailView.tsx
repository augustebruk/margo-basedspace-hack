import { useMemo, type JSX } from "react";
import { motion, type Variants } from "motion/react";
import { EntryGraph } from "./EntryGraph";
import type { Entry } from "./useEntries";
import { formatDay, formatDuration, formatTime } from "./entryFormat";

/* ============================================================================
 * EntryDetailView — a single past entry. Top: session stats (duration in
 * minutes + word count). Middle: the transcribed conversation (no audio is
 * ever stored). Bottom: the same reflection sections shown after a live
 * session — patterns, the connection graph, and next steps.
 * ==========================================================================*/
export interface EntryDetailViewProps {
  entry: Entry;
  onBack: () => void;
}

const EASE = [0.22, 1, 0.36, 1] as const;

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.04 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
};

interface Turn {
  question: string;
  answer: string;
}

/**
 * Parse the stored transcript ("Q: …\nA: …" turns separated by blank lines)
 * back into a list of prompt/answer pairs for display. Tolerant of stray
 * formatting — any chunk without an explicit "A:" is treated as a raw answer.
 */
function parseTranscript(transcript: string): Turn[] {
  return transcript
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const qMatch = block.match(/^Q:\s*([\s\S]*?)(?:\n\s*A:\s*([\s\S]*))?$/);
      if (qMatch && qMatch[2] !== undefined) {
        return { question: qMatch[1].trim(), answer: qMatch[2].trim() };
      }
      const aOnly = block.replace(/^A:\s*/, "").trim();
      return { question: "", answer: aOnly };
    })
    .filter((t) => t.answer || t.question);
}

const SectionTitle = ({ children }: { children: string }): JSX.Element => (
  <p className="[font-family:'Inter',Helvetica] text-[12px] font-medium uppercase tracking-[1.4px] text-[#1c2b33]/40">
    {children}
  </p>
);

const Stat = ({
  value,
  label,
}: {
  value: string;
  label: string;
}): JSX.Element => (
  <div className="flex flex-1 flex-col items-center gap-0.5 rounded-[16px] bg-white/70 px-3 py-3">
    <span className="[font-family:'Inter',Helvetica] text-[22px] font-semibold tracking-[-0.4px] text-[#1c2b33]">
      {value}
    </span>
    <span className="[font-family:'Inter',Helvetica] text-[12px] font-normal uppercase tracking-[0.8px] text-[#1c2b33]/45">
      {label}
    </span>
  </div>
);

export const EntryDetailView = ({
  entry,
  onBack,
}: EntryDetailViewProps): JSX.Element => {
  const turns = useMemo(
    () => parseTranscript(entry.transcript),
    [entry.transcript],
  );
  const { reflection } = entry;

  return (
    <motion.div
      key="history-detail"
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.35, ease: EASE }}
      className="relative flex h-full w-full flex-col"
    >
      {/* Same washed-out pastel orb background as the reflection screen. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(160deg, #f6eeff 0%, #fdf1f3 48%, #fef6f1 100%)",
        }}
      />

      {/* Header with a back affordance + date/time. */}
      <div className="px-5 pt-12 pb-3">
        <button
          type="button"
          onClick={onBack}
          className="all-[unset] box-border mb-3 inline-flex cursor-pointer items-center gap-1.5 [font-family:'Inter',Helvetica] text-[14px] font-medium text-[#1c2b33]/55 hover:text-[#1c2b33]/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1c2b33]"
          aria-label="Back to past entries"
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
          Past entries
        </button>
        <p className="[font-family:'Inter',Helvetica] text-[12px] font-medium uppercase tracking-[1.2px] text-[#1c2b33]/40">
          {formatDay(entry.createdAt)} · {formatTime(entry.createdAt)}
        </p>
        <h1 className="mt-1 [font-family:'Inter',Helvetica] text-[26px] font-medium leading-[1.2] tracking-[-0.5px] text-[#1c2b33]">
          {entry.topic}
        </h1>
      </div>

      {/* Scrollable body (min-h-0 so it scrolls under the nav). */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="min-h-0 flex-1 overflow-y-auto px-5 pb-24"
      >
        {/* Session stats — duration + words spoken. */}
        <motion.div variants={item} className="flex gap-2.5">
          <Stat value={formatDuration(entry.durationMs)} label="Length" />
          <Stat value={entry.wordCount.toLocaleString()} label="Words" />
        </motion.div>

        {/* Transcribed conversation. */}
        <motion.section variants={item} className="mt-7 flex flex-col gap-3">
          <SectionTitle>Transcript</SectionTitle>
          {turns.length > 0 ? (
            <div className="flex flex-col gap-4">
              {turns.map((turn, i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  {turn.question && (
                    <p className="[font-family:'Inter',Helvetica] text-[14px] font-medium leading-[20px] text-[#a07ee0]">
                      {turn.question}
                    </p>
                  )}
                  {turn.answer && (
                    <p className="rounded-[16px] bg-white/70 px-4 py-3 [font-family:'Inter',Helvetica] text-[15px] font-normal leading-[23px] text-[#1c2b33]">
                      {turn.answer}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="[font-family:'Inter',Helvetica] text-[14px] font-normal leading-[21px] text-[#1c2b33]/50">
              No transcript was captured for this session.
            </p>
          )}
        </motion.section>

        {/* Reflection — the spoken reframe. */}
        {reflection.summary && (
          <motion.section variants={item} className="mt-8 flex flex-col gap-3">
            <SectionTitle>Reflection</SectionTitle>
            <p className="[font-family:'Inter',Helvetica] text-[18px] font-normal leading-[1.5] tracking-[-0.2px] text-[#1c2b33]">
              {reflection.summary}
            </p>
          </motion.section>
        )}

        {/* Patterns + connection graph — same as the live reflection screen. */}
        <motion.section variants={item} className="mt-8 flex flex-col gap-3">
          <SectionTitle>Patterns</SectionTitle>
          {reflection.patterns.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {reflection.patterns.map((p) => (
                <span
                  key={p.label}
                  className="inline-flex items-baseline gap-1.5 rounded-full bg-[rgba(244,231,255,0.5)] px-3.5 py-1.5"
                >
                  <span className="[font-family:'Inter',Helvetica] text-[13px] font-medium text-[#1c2b33]/80">
                    {p.label}
                  </span>
                  {p.recurrenceLabel && (
                    <span className="[font-family:'Inter',Helvetica] text-[11px] font-normal text-[#1c2b33]/40">
                      · {p.recurrenceLabel}
                    </span>
                  )}
                </span>
              ))}
            </div>
          )}

          <div className="mt-1 overflow-hidden rounded-[20px] bg-white p-1.5 shadow-[0_8px_28px_rgba(28,43,51,0.05)]">
            <EntryGraph title={`${formatDay(entry.createdAt)}'s entry`} height={240} />
          </div>
        </motion.section>

        {/* Next steps. */}
        {reflection.nextSteps.length > 0 && (
          <motion.section variants={item} className="mt-8 flex flex-col gap-3">
            <SectionTitle>Next steps</SectionTitle>
            <ul className="flex flex-col gap-2">
              {reflection.nextSteps.map((step, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span
                    aria-hidden="true"
                    className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[linear-gradient(135deg,#c7a6f5,#f7a8c5)]"
                  />
                  <span className="[font-family:'Inter',Helvetica] text-[14px] font-normal leading-[21px] text-[#1c2b33]/75">
                    {step}
                  </span>
                </li>
              ))}
            </ul>
          </motion.section>
        )}
      </motion.div>
    </motion.div>
  );
};
