import type { JSX } from "react";
import { motion } from "motion/react";
import type { GraphRange } from "./graphModel";

/* RangeToggle — a small segmented control used above the atom graph so the
 * person can choose which span of their life to look at. The set of options is
 * configurable: the Insights screen shows the full range (Today / Week / Month
 * / All time), while a single entry's detail shows just This entry / All time.
 */
export type RangeOption<T extends string = GraphRange> = {
  id: T;
  label: string;
};

export interface RangeToggleProps<T extends string = GraphRange> {
  value: T;
  onChange: (range: T) => void;
  /** Override the choices shown. Defaults to the full time-range set. */
  options?: RangeOption<T>[];
}

const DEFAULT_OPTIONS: RangeOption<GraphRange>[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "all", label: "All time" },
];

export const RangeToggle = <T extends string = GraphRange>({
  value,
  onChange,
  options = DEFAULT_OPTIONS as RangeOption<T>[],
}: RangeToggleProps<T>): JSX.Element => (
  <div className="inline-flex items-center gap-0.5 rounded-full bg-white/70 p-0.5 shadow-[0_4px_14px_rgba(28,43,51,0.06)] backdrop-blur-sm">
    {options.map((opt) => {
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
