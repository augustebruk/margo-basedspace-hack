/* ============================================================================
 * Small display helpers shared by the History list + entry detail views.
 * ==========================================================================*/

/** "Today", "Yesterday", or a short date like "Mar 14". */
export function formatDay(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const startOf = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayMs = 86_400_000;
  const diffDays = Math.round((startOf(now) - startOf(date)) / dayMs);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";

  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** Local time like "7:42 PM". */
export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** A compact duration label, e.g. "4 min" or "45 sec". */
export function formatDuration(durationMs: number): string {
  const totalSec = Math.max(0, Math.round(durationMs / 1000));
  if (totalSec < 60) return `${totalSec} sec`;
  const min = Math.round(totalSec / 60);
  return `${min} min`;
}
