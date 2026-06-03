import type { JSX } from "react";
import { motion } from "motion/react";
import type { GraphRange } from "./graphModel";
import { cx } from "./cx";
import styles from "./RangeToggle.module.css";

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
  <div className={styles.root}>
    {options.map((opt) => {
      const active = opt.id === value;
      return (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={cx(
            "btnReset",
            styles.option,
            active && styles.optionActive,
          )}
        >
          {active && (
            <motion.span
              layoutId="range-toggle-pill"
              className={styles.pill}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
            />
          )}
          <span className={styles.optionLabel}>{opt.label}</span>
        </button>
      );
    })}
  </div>
);
