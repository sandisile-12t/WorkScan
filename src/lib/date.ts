/** Helpers for working with local calendar dates as `YYYY-MM-DD` strings. */

const pad = (n: number) => String(n).padStart(2, '0');

export const toDateKey = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const todayKey = (): string => toDateKey(new Date());

/** Parses `YYYY-MM-DD` into a local `Date` at midnight. */
export const fromDateKey = (key: string): Date => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};

export const addDays = (key: string, days: number): string => {
  const date = fromDateKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
};

export const formatLongDate = (key: string): string =>
  fromDateKey(key).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

export const formatShortDate = (key: string): string =>
  fromDateKey(key).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });

export const formatTime = (iso: string | null | undefined): string => {
  if (!iso) return '--:--';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
};

/** Decimal hours worked between two ISO timestamps, rounded to 2dp. */
export const hoursBetween = (checkIn: string | null, checkOut: string | null): number | null => {
  if (!checkIn || !checkOut) return null;
  const diff = (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 3_600_000;
  if (Number.isNaN(diff) || diff < 0) return null;
  return Math.round(diff * 100) / 100;
};

export const formatHours = (hours: number | null): string => {
  if (hours === null) return '--';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
};

/** Inclusive list of date keys from `from` to `to`. */
export const dateRange = (from: string, to: string): string[] => {
  const keys: string[] = [];
  let cursor = from;
  let guard = 0;
  while (cursor <= to && guard < 400) {
    keys.push(cursor);
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return keys;
};
