import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Margo's spoken voice via the server-side ElevenLabs TTS proxy (`/api/tts`).
 *
 * Design notes (see the onboarding plan):
 *   • `unlock()` plays a tiny silent clip on the first user gesture so the
 *     browser's autoplay policy lets subsequent `speak()` calls play audio.
 *   • `prefetch(text)` warms a line's audio ahead of time (e.g. the name +
 *     first-yap prompts during the entrance) so playback feels instant.
 *   • `speak(text)` resolves when playback finishes. If TTS is unconfigured or
 *     fails, it falls back to a timed silent no-op estimated from the text
 *     length, so the conversational flow never blocks (the line still shows on
 *     screen as text).
 *   • After speech ends the caller should wait a brief beat before opening the
 *     mic so Margo's own voice never bleeds into the transcript.
 */
const TTS_ENDPOINT = "/api/tts";

// A 100ms silent MP3 used to satisfy the autoplay-unlock gesture.
const SILENT_MP3 =
  "data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQxAADB8AhSmxhIIEVCSiJrDCQBTcu3UrAIwUdkRgQbFAZC1CQEwTJ9mjRvBA4UOLD8nKVOWfh+UlK3z/177OXrfOdKl7pyn3Xf//WreyTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV";

interface UseMargoVoiceResult {
  /** Speak a line; resolves when playback finishes (or after a timed fallback). */
  speak: (text: string) => Promise<void>;
  /** Warm a line's audio ahead of time so the next speak() is instant. */
  prefetch: (text: string) => void;
  /** Unlock browser audio on a user gesture (call once on the entrance tap). */
  unlock: () => void;
  /** Stop any in-flight playback immediately. */
  stop: () => void;
  /** True while a line is currently playing. */
  speaking: boolean;
}

// Rough spoken duration for the silent fallback: ~165 wpm + a little padding.
function estimateSpeechMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(12000, Math.max(1200, (words / 165) * 60_000 + 400));
}

export function useMargoVoice(): UseMargoVoiceResult {
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // text -> object URL of the fetched audio (lets prefetch hide latency).
  const cacheRef = useRef<Map<string, Promise<string | null>>>(new Map());
  const ttsAvailableRef = useRef(true);

  const fetchAudioUrl = useCallback((text: string): Promise<string | null> => {
    const key = text.trim();
    const existing = cacheRef.current.get(key);
    if (existing) return existing;

    const p = (async (): Promise<string | null> => {
      try {
        const res = await fetch(TTS_ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: key }),
        });
        if (!res.ok) {
          // 501 = key not configured: stop trying for the rest of the session.
          if (res.status === 501) ttsAvailableRef.current = false;
          return null;
        }
        const blob = await res.blob();
        return URL.createObjectURL(blob);
      } catch {
        return null;
      }
    })();

    cacheRef.current.set(key, p);
    return p;
  }, []);

  const prefetch = useCallback(
    (text: string) => {
      if (!ttsAvailableRef.current || !text.trim()) return;
      void fetchAudioUrl(text);
    },
    [fetchAudioUrl],
  );

  const unlock = useCallback(() => {
    try {
      const a = new Audio(SILENT_MP3);
      a.volume = 0;
      void a.play().catch(() => undefined);
    } catch {
      // Ignore — playback unlock is best-effort.
    }
  }, []);

  const stop = useCallback(() => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
      audioRef.current = null;
    }
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    async (text: string): Promise<void> => {
      const key = text.trim();
      if (!key) return;

      const url = ttsAvailableRef.current ? await fetchAudioUrl(key) : null;

      // Fallback: no audio available — hold for an estimated read duration so
      // the flow's pacing stays conversational, then resolve.
      if (!url) {
        setSpeaking(true);
        await new Promise<void>((r) => setTimeout(r, estimateSpeechMs(key)));
        setSpeaking(false);
        return;
      }

      setSpeaking(true);
      await new Promise<void>((resolve) => {
        const audio = new Audio(url);
        audioRef.current = audio;
        const done = () => {
          if (audioRef.current === audio) audioRef.current = null;
          resolve();
        };
        audio.onended = done;
        audio.onerror = done;
        audio.play().catch(() => {
          // Autoplay blocked or playback failed — fall back to a timed hold.
          setTimeout(done, estimateSpeechMs(key));
        });
      });
      setSpeaking(false);
    },
    [fetchAudioUrl],
  );

  // Revoke any object URLs we created on unmount.
  useEffect(() => {
    const cache = cacheRef.current;
    return () => {
      audioRef.current?.pause();
      cache.forEach((p) => {
        void p.then((url) => {
          if (url) URL.revokeObjectURL(url);
        });
      });
    };
  }, []);

  return { speak, prefetch, unlock, stop, speaking };
}
