import { useState, type JSX } from "react";
import { motion } from "motion/react";

/* ============================================================================
 * WriteEntryView — full-page free-writing journaling experience.
 *
 * The user writes freely on a clean page. When done, they tap "Reflect" which
 * takes their written text through the same reflection pipeline as a voice
 * entry.
 * ==========================================================================*/
export interface WriteEntryViewProps {
  onReflect: (text: string) => void;
  name?: string;
}

export const WriteEntryView = ({
  onReflect,
  name,
}: WriteEntryViewProps): JSX.Element => {
  const [text, setText] = useState("");

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const canReflect = wordCount >= 3;

  return (
    <motion.div
      key="write-entry"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="relative flex h-full w-full flex-col"
    >
      {/* Background */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(160deg, #f6eeff 0%, #fdf1f3 48%, #fef6f1 100%)",
        }}
      />

      {/* Header */}
      <div className="px-5 pt-12 pb-2">
        <p className="[font-family:'Inter',Helvetica] text-[12px] font-medium uppercase tracking-[1.4px] text-[#1c2b33]/40">
          Free Write
        </p>
        <h1 className="mt-1 [font-family:'Inter',Helvetica] text-[24px] font-medium leading-[1.25] tracking-[-0.4px] text-[#1c2b33]">
          {name ? `What's on your mind, ${name}?` : "What's on your mind?"}
        </h1>
      </div>

      {/* Writing area */}
      <div className="min-h-0 flex-1 px-5 pb-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
          placeholder="Start writing… Let your thoughts flow freely. There's no right or wrong way to do this."
          className="h-full w-full resize-none rounded-[20px] border border-[#e7e2ef] bg-white/80 p-4 [font-family:'Inter',Helvetica] text-[15px] leading-[24px] text-[#1c2b33] placeholder:text-[#1c2b33]/30 focus:border-[#c7a6f5] focus:outline-none focus:ring-2 focus:ring-[#c7a6f5]/20"
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2">
        <span className="[font-family:'Inter',Helvetica] text-[12px] font-medium text-[#1c2b33]/35">
          {wordCount} {wordCount === 1 ? "word" : "words"}
        </span>

        <button
          type="button"
          onClick={() => onReflect(text)}
          disabled={!canReflect}
          className={
            "all-[unset] box-border inline-flex h-11 cursor-pointer items-center gap-2 rounded-full px-5 text-white shadow-[0_14px_34px_rgba(199,166,245,0.45)] transition-all " +
            (canReflect
              ? "hover:scale-[1.03]"
              : "cursor-default opacity-40")
          }
          style={{
            background:
              "linear-gradient(90deg, #c7a6f5 0%, #ec9fc4 52%, #f7b59a 100%)",
          }}
          aria-label="Reflect"
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
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
          <span className="[font-family:'Inter',Helvetica] text-[14px] font-semibold tracking-[-0.2px]">
            Reflect
          </span>
        </button>
      </div>
    </motion.div>
  );
};
