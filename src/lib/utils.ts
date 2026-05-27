/**
 * Format a date to YYYY-MM-DD string in Asia/Jerusalem timezone for consistent date grouping
 */
export function formatDate(date: Date): string {
  const parts = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  return parts;
}

/**
 * Get today's date string in YYYY-MM-DD format
 */
export function getToday(): string {
  return formatDate(new Date());
}

/**
 * Format a timestamp to a human-readable Hebrew-friendly string
 */
export function formatTimestamp(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('he-IL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * Format a date to a display-friendly Hebrew string
 */
export function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('he-IL', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Check if a verification is still valid based on the interval
 */
export function isVerificationValid(
  verificationTimestamp: Date | string,
  intervalHours: number
): boolean {
  const verTime = typeof verificationTimestamp === 'string'
    ? new Date(verificationTimestamp)
    : verificationTimestamp;
  const now = new Date();
  const diffMs = now.getTime() - verTime.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  return diffHours < intervalHours;
}
