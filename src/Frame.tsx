import type { JSX } from "react";
import image305 from "./assets/image-305.png";

const legalLinks = [
  { label: "Terms of Service", href: "#terms" },
  { label: "Privacy Policy", href: "#privacy" },
];

export const Frame = (): JSX.Element => {
  return (
    <main className="flex min-h-dvh w-full items-stretch justify-center bg-[#f3f3f3]">
      <section
        className="flex min-h-dvh w-full max-w-[420px] flex-col items-center bg-white px-6 pt-[14vh] pb-[max(2rem,env(safe-area-inset-bottom))] relative"
        aria-labelledby="activate-agent-title"
      >
        <h1
          id="activate-agent-title"
          className="relative w-fit [font-family:'Inter-Regular',Helvetica] font-normal text-[#1c2b33] text-[22px] text-center tracking-[-0.44px] leading-[22px] whitespace-nowrap overflow-hidden text-ellipsis [display:-webkit-box] [-webkit-line-clamp:1] [-webkit-box-orient:vertical]"
        >
          Activate Agent
        </h1>

        {/* Flexible spacer keeps the blob vertically centered between the
            title and the Continue button, matching the mobile mockup. */}
        <div className="flex w-full flex-1 items-center justify-center">
          <div
            className="relative w-36 h-36 bg-white rounded-[200px] overflow-hidden"
            aria-hidden="true"
          >
            <img
              className="absolute top-[calc(50.00%_-_72px)] left-[calc(50.00%_-_72px)] w-36 h-36 object-cover"
              alt=""
              src={image305}
            />
          </div>
        </div>

        <button
          type="button"
          className="all-[unset] box-border inline-flex items-center justify-center gap-2.5 px-[72px] py-3.5 relative rounded-[100px] bg-[linear-gradient(90deg,rgba(244,231,255,1)_0%,rgba(253,221,222,1)_100%)] cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1c2b33]"
          aria-label="Continue"
        >
          <span className="relative [font-family:'Inter-Regular',Helvetica] font-normal text-[#1c2b33] text-lg text-center tracking-[-0.36px] leading-[22px] whitespace-nowrap overflow-hidden text-ellipsis [display:-webkit-box] [-webkit-line-clamp:1] [-webkit-box-orient:vertical]">
            Continue
          </span>
        </button>

        {/* Smaller spacer so the legal copy settles at the very bottom while
            keeping a comfortable gap above it, as in the screenshot. */}
        <div className="w-full flex-[0_0_110px]" />

        <p className="relative self-stretch [font-family:'Inter-Regular',Helvetica] font-normal text-transparent text-base text-center tracking-[-0.32px] leading-[22px]">
          <span className="text-[#1c2b33b8] tracking-[-0.05px]">
            By tapping &apos;Continue&apos; and using our app, you&apos;re
            agreeing to our{" "}
          </span>
          <a
            href={legalLinks[0].href}
            className="text-[#00b2ff] tracking-[-0.05px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00b2ff] rounded-sm"
          >
            {legalLinks[0].label}
          </a>
          <span className="text-[#1c2b33b8] tracking-[-0.05px]"> and </span>
          <a
            href={legalLinks[1].href}
            className="text-[#00b2ff] tracking-[-0.05px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00b2ff] rounded-sm"
          >
            {legalLinks[1].label}
          </a>
        </p>
      </section>
    </main>
  );
};
