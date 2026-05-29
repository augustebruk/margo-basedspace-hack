import type { JSX } from "react";

// Brand mark color — dark slate, matching the provided logo.
const MARK = "#33444d";

/**
 * margo logo — a small rounded "face" icon + the lowercase wordmark.
 *
 * Reproduced on-brand (icon as inline SVG, wordmark in the rounded Baloo 2
 * font). To use the exact original asset instead, drop the SVG/PNG into
 * `src/assets` and swap the markup below.
 */
export const MargoLogo = ({
  className,
}: {
  className?: string;
}): JSX.Element => {
  return (
    <div
      role="img"
      aria-label="margo"
      className={`flex items-center gap-[7px] ${className ?? ""}`}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
      >
        {/* Rounded squircle */}
        <path
          d="M16 1.5c5.6 0 8.4 0 10.9 1.3a9.3 9.3 0 0 1 4.3 4.3C32.5 9.6 32.5 12.4 32.5 16s0 6.4-1.3 8.9a9.3 9.3 0 0 1-4.3 4.3C24.4 30.5 21.6 30.5 16 30.5s-8.4 0-10.9-1.3a9.3 9.3 0 0 1-4.3-4.3C-.5 22.4-.5 19.6-.5 16s0-6.4 1.3-8.9A9.3 9.3 0 0 1 5.1 2.8C7.6 1.5 10.4 1.5 16 1.5Z"
          fill={MARK}
        />
        {/* Friendly closed "eyes" */}
        <path
          d="M11 13.5c.9-1 2.3-1 3.2 0M17.8 13.5c.9-1 2.3-1 3.2 0"
          stroke="#fff"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        {/* Soft smile */}
        <path
          d="M12.4 19c1.1 1.4 4.1 1.4 5.2 0"
          stroke="#fff"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
      <span
        className="[font-family:'Baloo_2','Inter',Helvetica] text-[20px] font-semibold lowercase leading-none tracking-[-0.2px]"
        style={{ color: MARK }}
      >
        margo
      </span>
    </div>
  );
};
