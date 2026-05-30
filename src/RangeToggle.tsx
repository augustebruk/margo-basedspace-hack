import type { JSX } from "react";
import { motion } from "motion/react";
import type { GraphRange } from "./graphModel";

/* RangeToggle — a small Week / Month segmented control used above the atom
 * graph so the person can choose which span of their life to look at. */
export interface RangeToggleProps {
  value: GraphRange;
  onChange: (range: GraphRange) => void;
}

const OPTIONS: { id: GraphRange; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "all", label: "All time" },
];

export const RangeToggle = ({
  value,
  onChange,
}: RangeToggleProps): JSX.Element => (
  <div className="inline-flex items-center gap-0.5 rounded-full bg-white/70 p-0.5 shadow-[0_4px_14px_rgba(28,43,51,0.06)] backdrop-blur-sm">
    {OPTIONS.map((opt) => {
      const active = opt.id === value;
      return (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className="relative box-border cursor-pointer rounded-full px-3 py-1.5 [font-family:'Inter',Helvetica] text-[12px] font-semibold tracking-[-0.1px] transition-colors"
          style={{ color: active ? "#ffffff" : "rgba(28,43,51,0.5)" }}
        >
          {active && (
            <motion.span
              layoutId="range-toggle-pill"
              className="absolute inset-0 rounded-full"
              style={{
                background:
                  "linear-gradient(90deg, #c7a6f5 0%, #ec9fc4 100%)",
              }}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
            />
          )}
          <span className="relative z-10">{opt.label}</span>
        </button>
      );
    })}
  </div>
);
