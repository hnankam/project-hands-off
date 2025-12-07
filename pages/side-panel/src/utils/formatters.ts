/**
 * Formatting Utilities
 * 
 * Shared formatting functions for consistent data display across the application.
 */

/**
 * Formats a number using compact notation (e.g., 1.2K, 3.4M)
 */
export const formatNumber = (value: number): string => {
  if (!Number.isFinite(value) || value === 0) {
    return '0';
  }
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
};

/**
 * Formats a timestamp as relative time (e.g., "2h ago", "3d ago")
 */
export const formatRelativeTime = (timestamp: number | null | undefined): string => {
  if (!timestamp) {
    return 'just now';
  }

  const diff = Date.now() - timestamp;
  if (diff < 0) {
    return 'just now';
  }

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d ago`;
  }

  const weeks = Math.floor(days / 7);
  if (weeks < 5) {
    return `${weeks}w ago`;
  }

  const months = Math.floor(days / 30);
  if (months < 12) {
    return `${months}mo ago`;
  }

  const years = Math.floor(days / 365);
  return `${years}y ago`;
};

/**
 * Formats a timestamp as a localized date string
 */
export const formatTimestamp = (timestamp: number | null | undefined): string => {
  if (!timestamp) {
    return '—';
  }
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Formats a full date with time
 */
export const formatFullDate = (date: Date | string | number): string => {
  const d = new Date(date);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Formats a date as a short date (e.g., "Jan 15")
 */
export const formatShortDate = (date: Date | string | number): string => {
  const d = new Date(date);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
};

/**
 * Prettifies a label by replacing dashes/underscores with spaces and capitalizing words
 */
export const prettifyLabel = (value?: string | null): string => {
  if (!value) {
    return '—';
  }
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase());
};

/**
 * Truncates a string to a maximum length with ellipsis
 */
export const truncate = (str: string, maxLength: number): string => {
  if (str.length <= maxLength) {
    return str;
  }
  return `${str.slice(0, maxLength - 1)}…`;
};

/**
 * Formats bytes into human-readable size
 */
export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

/**
 * Formats a percentage value
 */
export const formatPercentage = (value: number, decimals = 0): string => {
  return `${value.toFixed(decimals)}%`;
};

/**
 * Creates an empty usage snapshot
 */
export const createEmptyUsage = () => ({
  request: 0,
  response: 0,
  total: 0,
  requestCount: 0,
});

/**
 * Extracts timestamp from a session ID (pattern: session_<timestamp>)
 */
export const getSessionCreatedTimestamp = (sessionId: string): number => {
  const match = sessionId.match(/(\d{13})/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return Date.now();
};

