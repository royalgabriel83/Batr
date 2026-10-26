const DAY_MS = 24 * 60 * 60 * 1000;
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * How long ago an offer was published, for cards (owner, 2026-10-17):
 * "Today", "Yesterday", "3 days ago", "2 weeks ago", then the date.
 * Counted in whole 24-hour periods so the server and the browser agree
 * whatever their time zones.
 */
export function postedAge(publishedAt: string | null, now: Date = new Date()): string | null {
  if (!publishedAt) return null;
  const published = new Date(publishedAt);
  if (Number.isNaN(published.getTime())) return null;
  const days = Math.max(0, Math.floor((now.getTime() - published.getTime()) / DAY_MS));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 14) return `${String(days)} days ago`;
  if (days < 60) return `${String(Math.floor(days / 7))} weeks ago`;
  return dateFormat.format(published);
}

const monthFormat = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

/** "2026-10" → "October 2026". */
export function memberSinceLabel(yearMonth: string | null): string | null {
  if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) return null;
  return monthFormat.format(new Date(`${yearMonth}-01T00:00:00Z`));
}
