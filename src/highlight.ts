/* ============================================================================
 * Phrase highlighting for the Mirror Moment.
 *
 * The model is asked to return `highlightPhrases` as verbatim substrings of the
 * transcript, but LLMs paraphrase and STT/punctuation differ — so matching is
 * tolerant: case- and whitespace-insensitive, with a fuzzy closest-span
 * fallback. Phrases that can't be located are simply skipped (never break the
 * render).
 * ==========================================================================*/
export interface HighlightSegment {
  text: string;
  highlight: boolean;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").replace(/[^\w\s]/g, "").trim();
}

/**
 * Find the [start, end) index range in `text` that best matches `phrase`.
 * Returns null if no reasonable match is found.
 */
function locatePhrase(text: string, phrase: string): [number, number] | null {
  const normText = normalize(text);
  const normPhrase = normalize(phrase);
  if (!normPhrase) return null;

  // Map normalized-string indices back to original-string indices.
  const map: number[] = [];
  let prevSpace = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const isWord = /[\w]/.test(ch);
    const isSpace = /\s/.test(ch);
    if (isWord) {
      map.push(i);
      prevSpace = false;
    } else if (isSpace) {
      if (!prevSpace && map.length > 0) {
        map.push(i);
        prevSpace = true;
      }
    }
    // punctuation is dropped in normalize, so skip it here
  }

  // Direct (normalized) substring match.
  let idx = normText.indexOf(normPhrase);
  if (idx === -1) {
    // Fuzzy fallback: try matching the first ~4 words of the phrase.
    const words = normPhrase.split(" ");
    for (let take = Math.min(4, words.length); take >= 2 && idx === -1; take--) {
      idx = normText.indexOf(words.slice(0, take).join(" "));
      if (idx !== -1) {
        const endNorm = idx + words.slice(0, take).join(" ").length;
        return spanToOriginal(map, text, idx, endNorm);
      }
    }
    return null;
  }

  return spanToOriginal(map, text, idx, idx + normPhrase.length);
}

function spanToOriginal(
  map: number[],
  text: string,
  startNorm: number,
  endNorm: number,
): [number, number] | null {
  if (startNorm >= map.length) return null;
  const start = map[startNorm];
  const lastNorm = Math.min(endNorm - 1, map.length - 1);
  const end = map[lastNorm] + 1;
  if (start == null || end == null || end <= start) return null;
  return [start, Math.min(end, text.length)];
}

/**
 * Split `text` into ordered segments, marking the spans that match any of
 * `phrases` as highlighted. Overlapping matches are merged.
 */
export function highlightPhrases(
  text: string,
  phrases: string[],
): HighlightSegment[] {
  if (!text) return [];
  const ranges: Array<[number, number]> = [];
  for (const phrase of phrases) {
    const r = locatePhrase(text, phrase);
    if (r) ranges.push(r);
  }
  if (ranges.length === 0) return [{ text, highlight: false }];

  // Sort + merge overlapping/adjacent ranges.
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [s, e] of ranges) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) {
      last[1] = Math.max(last[1], e);
    } else {
      merged.push([s, e]);
    }
  }

  const segments: HighlightSegment[] = [];
  let cursor = 0;
  for (const [s, e] of merged) {
    if (s > cursor) segments.push({ text: text.slice(cursor, s), highlight: false });
    segments.push({ text: text.slice(s, e), highlight: true });
    cursor = e;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), highlight: false });
  }
  return segments;
}
