import type { JSX } from "react";
import { motion } from "motion/react";
import type { Insight } from "./useInsight";

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
      className="relative w-full isolate"
    >
      <div className="relative rounded-[26px]">
        {/* Soft pastel glow that fades out toward the edges so the card melts
            into the (white) background instead of reading as a hard-edged box.
            No border / drop shadow / opaque fill = no visible corners. */}
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-6 blur-2xl bg-[radial-gradient(120%_120%_at_50%_40%,rgba(244,231,255,0.9)_0%,rgba(253,221,222,0.7)_45%,rgba(255,255,255,0)_72%)]"
          animate={{ opacity: [0.45, 0.7, 0.45], scale: [1, 1.04, 1] }}
          transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
        />

        <div className="relative flex flex-col gap-5 px-6 py-6">
        {/* Header */}
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-[linear-gradient(135deg,rgba(244,231,255,1)_0%,rgba(253,221,222,1)_100%)]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7c5cbf" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 3-6.7" />
              <path d="M3 4v4h4" />
            </svg>
          </span>
          <span className="[font-family:'Inter',Helvetica] text-[12px] font-medium uppercase tracking-[1.4px] text-[#1c2b33]/45">
            Pattern Reveal
          </span>
        </div>

        {/* Core question */}
        <div className="flex flex-col gap-1.5">
          <p className="[font-family:'Inter',Helvetica] text-[13px] font-normal text-[#1c2b33]/55">
            {insight.summaryLine}
          </p>
          <p className="[font-family:'Inter',Helvetica] text-[26px] font-medium leading-[1.25] tracking-[-0.5px] text-[#1c2b33]">
            “{insight.coreQuestion}”
          </p>
        </div>

        {/* Triggers */}
        {insight.triggers.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <p className="[font-family:'Inter',Helvetica] text-[12px] font-medium uppercase tracking-[1.2px] text-[#1c2b33]/40">
              This shows up when
            </p>
            <ul className="flex flex-col gap-2">
              {insight.triggers.map((t, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span
                    aria-hidden="true"
                    className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[linear-gradient(135deg,#c7a6f5,#f7a8c5)]"
                  />
                  <span className="[font-family:'Inter',Helvetica] text-[14px] font-normal leading-[21px] text-[#1c2b33]/75">
                    {t}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Margo asks */}
        <div className="flex flex-col gap-1.5 rounded-[18px] bg-[rgba(244,231,255,0.45)] px-4 py-3.5">
          <p className="[font-family:'Inter',Helvetica] text-[12px] font-medium uppercase tracking-[1.2px] text-[#1c2b33]/40">
            Margo asks
          </p>
          <p className="[font-family:'Inter',Helvetica] text-[16px] font-normal leading-[1.4] tracking-[-0.2px] text-[#1c2b33]/85">
            “{insight.margoQuestion}”
          </p>
        </div>
        </div>
      </div>
    </motion.div>
  );
};
