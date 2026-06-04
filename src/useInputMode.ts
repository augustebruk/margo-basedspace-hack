import { useCallback, useState } from "react";

/* ============================================================================
 * Input-mode persistence — remembers whether the user last journaled by
 * voice (mic) or keyboard, so the next entry (and every subsequent choice on
 * the main flow) defaults to the same modality.
 *
 * Backed by localStorage (frontend-only prototype), matching `useOnboarding`.
 * ==========================================================================*/
export type InputMode = "voice" | "keyboard";

const INPUT_MODE_KEY = "margo:inputMode";
const DEFAULT_MODE: InputMode = "voice";

function readMode(): InputMode {
  try {
    const stored = localStorage.getItem(INPUT_MODE_KEY);
    if (stored === "voice" || stored === "keyboard") return stored;
  } catch {
    // ignore (private mode / storage disabled) — fall through to default
  }
  return DEFAULT_MODE;
}

interface UseInputModeResult {
  inputMode: InputMode;
  setInputMode: (mode: InputMode) => void;
}

export function useInputMode(): UseInputModeResult {
  const [inputMode, setModeState] = useState<InputMode>(readMode);

  const setInputMode = useCallback((mode: InputMode) => {
    setModeState((prev) => {
      if (prev === mode) return prev;
      try {
        localStorage.setItem(INPUT_MODE_KEY, mode);
      } catch {
        // ignore (private mode / storage disabled)
      }
      return mode;
    });
  }, []);

  return { inputMode, setInputMode };
}
