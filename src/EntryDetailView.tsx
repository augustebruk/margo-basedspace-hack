import { useMemo, useState, type JSX } from "react";
import { motion, type Variants } from "motion/react";
import { EntryGraph } from "./EntryGraph";
import { RangeToggle } from "./RangeToggle";
import { PatternTags } from "./PatternTags";
import { buildAggregatedGraph } from "./graphModel";
import type { Entry } from "./useEntries";
import { formatDay, formatDuration, formatTime } from "./entryFormat";
import { cx } from "./cx";
import styles from "./EntryDetailView.module.css";

/* ============================================================================
 * EntryDetailView — a single past entry. Top: session stats (duration in
 * minutes + word count). Middle: the transcribed conversation (no audio is
 * ever stored). Bottom: the same reflection sections shown after a live
 * session — patterns, the connection graph, and next steps.
 * ==========================================================================*/
export interface EntryDetailViewProps {
  entry: Entry;
  /** All saved entries, to rebuild the cumulative map as of this entry. */
  allEntries: Entry[];
  onBack: () => void;
  /** Permanently remove this entry. */
  onDelete: () => void;
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
  <p className={styles.sectionTitle}>
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
  <div className={styles.stat}>
    <span className={styles.statValue}>
      {value}
    </span>
    <span className={styles.statLabel}>
      {label}
    </span>
  </div>
);

export const EntryDetailView = ({
  entry,
  allEntries,
  onBack,
  onDelete,
}: EntryDetailViewProps): JSX.Element => {
  const turns = useMemo(
    () => parseTranscript(entry.transcript),
    [entry.transcript],
  );
  const { reflection } = entry;
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // The map can be viewed two ways: just THIS entry's own graph, or the
  // cumulative all-time map as of this entry. Both treat this entry's date as
  // "now" so its own nodes light up purple. In the "all time" view the wider
  // life map is built as a grey backdrop and only the threads this entry
  // touched (the same ones the "This entry" view lights up) stay purple.
  const [mapScope, setMapScope] = useState<"entry" | "all">("entry");
  const aggregated = useMemo(() => {
    if (mapScope === "entry") {
      const own = allEntries.filter((e) => e.createdAt === entry.createdAt);
      return buildAggregatedGraph(own, "all", { now: entry.createdAt });
    }
    const upTo = allEntries.filter((e) => e.createdAt <= entry.createdAt);
    return buildAggregatedGraph(upTo, "all", {
      now: entry.createdAt,
      highlightRange: "today",
    });
  }, [allEntries, entry.createdAt, mapScope]);

  return (
    <motion.div
      key="history-detail"
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.35, ease: EASE }}
      className={styles.root}
    >
      {/* Same washed-out pastel orb background as the reflection screen. */}
      <div
        aria-hidden="true"
        className={styles.bg}
      />

      {/* Header with a back affordance + date/time. */}
      <div className={styles.header}>
        <button
          type="button"
          onClick={onBack}
          className={cx("btnReset", "focusRing", styles.backButton)}
          aria-label="Back To Past Entries"
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
          Past Entries
        </button>
        <p className={styles.dateLine}>
          {formatDay(entry.createdAt)} · {formatTime(entry.createdAt)}
        </p>
        <h1 className={styles.topic}>
          {entry.topic}
        </h1>
      </div>

      {/* Scrollable body (min-h-0 so it scrolls under the nav). */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className={styles.body}
      >
        {/* Session stats — duration + words spoken. */}
        <motion.div variants={item} className={styles.stats}>
          <Stat value={formatDuration(entry.durationMs)} label="Length" />
          <Stat value={entry.wordCount.toLocaleString()} label="Words" />
        </motion.div>

        {/* Reflection — the spoken reframe. */}
        {reflection.summary && (
          <motion.section variants={item} className={styles.section}>
            <SectionTitle>Reflection</SectionTitle>
            <p className={styles.reflectionText}>
              {reflection.summary}
            </p>
          </motion.section>
        )}

        {/* Patterns + the living atom graph — same as the live reflection. */}
        <motion.section variants={item} className={styles.section}>
          <SectionTitle>Patterns</SectionTitle>
          {reflection.patterns.length > 0 && (
            <PatternTags
              patterns={reflection.patterns}
              graph={aggregated}
              range="all"
            />
          )}

          <div className={styles.mapHeader}>
            <SectionTitle>Your map</SectionTitle>
            <RangeToggle
              value={mapScope}
              onChange={setMapScope}
              options={[
                { id: "entry", label: "This entry" },
                { id: "all", label: "All time" },
              ]}
            />
          </div>
          {aggregated.grewTodayCount > 0 && (
            <p className={styles.grewNote}>
              <span className={styles.grewCount}>
                {aggregated.grewTodayCount} new{" "}
                {aggregated.grewTodayCount === 1 ? "thread" : "threads"}
              </span>{" "}
              grew from this entry — the purple nodes. Tap any node to see what
              you said and how it connects.
            </p>
          )}
          {/* Full-bleed, on the background — no card. */}
          <div className={styles.graphWrap}>
            <EntryGraph graph={aggregated} range="all" height={220} />
          </div>
        </motion.section>

        {/* Next steps. */}
        {reflection.nextSteps.length > 0 && (
          <motion.section variants={item} className={styles.section}>
            <SectionTitle>Next steps</SectionTitle>
            <ul className={styles.stepsList}>
              {reflection.nextSteps.map((step, i) => (
                <li key={i} className={styles.stepItem}>
                  <div className={styles.stepRow}>
                    <span
                      aria-hidden="true"
                      className={styles.stepDot}
                    />
                    <span className={styles.stepText}>
                      {step}
                    </span>
                  </div>
                  {entry.nextStepResponses?.[i]?.trim() && (
                    <div className={styles.stepResponse}>
                      <p className={styles.stepResponseText}>
                        {entry.nextStepResponses[i]}
                      </p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </motion.section>
        )}

        {/* Transcribed conversation. */}
        <motion.section variants={item} className={styles.section}>
          <SectionTitle>Transcript</SectionTitle>
          {turns.length > 0 ? (
            <div className={styles.turns}>
              {turns.map((turn, i) => (
                <div key={i} className={styles.turn}>
                  {turn.question && (
                    <p className={styles.turnQuestion}>
                      {turn.question}
                    </p>
                  )}
                  {turn.answer && (
                    <p className={styles.turnAnswer}>
                      {turn.answer}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.transcriptEmpty}>
              No transcript was captured for this session.
            </p>
          )}
        </motion.section>

        {/* Delete this entry. Two-tap confirm so it isn't triggered by accident. */}
        <motion.section variants={item} className={styles.deleteSection}>
          {confirmingDelete ? (
            <div className={styles.confirmWrap}>
              <p className={styles.confirmText}>
                Delete this entry? This can't be undone.
              </p>
              <div className={styles.confirmRow}>
                <button
                  type="button"
                  onClick={onDelete}
                  className={cx("btnReset", "focusRing", styles.confirmDelete)}
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className={cx("btnReset", "focusRing", styles.confirmCancel)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className={cx("btnReset", "focusRing", styles.deleteTrigger)}
              aria-label="Delete this entry"
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
                <path d="M3 6h18" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
              </svg>
              Delete Entry
            </button>
          )}
        </motion.section>
      </motion.div>
    </motion.div>
  );
};
