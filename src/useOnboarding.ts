import { useCallback, useState } from "react";

/* ============================================================================
 * Onboarding persistence — remembers the captured name and whether the user
 * has finished their First Mirror Moment, so returning users skip onboarding.
 *
 * Backed by localStorage (frontend-only prototype). Swap for a real user
 * profile/backend later.
 * ==========================================================================*/
const NAME_KEY = "margo:name";
const COMPLETE_KEY = "margo:onboardingComplete";

function readName(): string {
  try {
    const stored = localStorage.getItem(NAME_KEY);
    if (stored) return stored;
  } catch {
    // ignore (private mode / storage disabled) — fall through to default
  }
  // When onboarding is skipped (e.g. prod demos), there's no captured name, so
  // fall back to a configurable default. VITE_-prefixed for the client bundle.
  if (import.meta.env.VITE_SKIP_ONBOARDING === "1") {
    return import.meta.env.VITE_DEFAULT_NAME ?? "";
  }
  return "";
}

function readComplete(): boolean {
  // Allow skipping onboarding entirely via build-time env flag (handy for
  // demos/dev). VITE_-prefixed so it's available in the client bundle.
  if (import.meta.env.VITE_SKIP_ONBOARDING === "1") {
    return true;
  }
  try {
    return localStorage.getItem(COMPLETE_KEY) === "1";
  } catch {
    return false;
  }
}

interface UseOnboardingResult {
  name: string;
  onboardingComplete: boolean;
  setName: (name: string) => void;
  completeOnboarding: () => void;
  reset: () => void;
}

export function useOnboarding(): UseOnboardingResult {
  const [name, setNameState] = useState<string>(readName);
  const [onboardingComplete, setComplete] = useState<boolean>(readComplete);

  const setName = useCallback((next: string) => {
    const value = next.trim();
    setNameState(value);
    try {
      localStorage.setItem(NAME_KEY, value);
    } catch {
      // ignore (private mode / storage disabled)
    }
  }, []);

  const completeOnboarding = useCallback(() => {
    setComplete(true);
    try {
      localStorage.setItem(COMPLETE_KEY, "1");
    } catch {
      // ignore
    }
  }, []);

  const reset = useCallback(() => {
    setComplete(false);
    setNameState("");
    try {
      localStorage.removeItem(COMPLETE_KEY);
      localStorage.removeItem(NAME_KEY);
    } catch {
      // ignore
    }
  }, []);

  return { name, onboardingComplete, setName, completeOnboarding, reset };
}
