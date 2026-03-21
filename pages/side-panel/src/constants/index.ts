/**
 * Constants for the Side Panel
 * Centralized location for all magic numbers and configuration values
 */

import { isExtensionContext } from '@extension/platform';

export const TIMING_CONSTANTS = {
  // Cache and content management
  CACHE_TTL: 30 * 1000, // 30 seconds
  MAX_CACHE_SIZE: 5,

  // Debouncing and delays
  DEBOUNCE_DELAY: 500, // 500ms for message saving
  AUTO_FOCUS_DELAY: 100, // 100ms for input focus
  CONTENT_FETCH_DELAY: 300, // 300ms for content fetching
  TAB_CHANGE_DELAY: 200, // 200ms for tab change handling
  URL_CHANGE_DELAY: 500, // 500ms for URL change debouncing

  // Auto-refresh timers
  AUTO_REFRESH_ACTIVE_PANEL: 500, // 500ms for active panel
  AUTO_REFRESH_INACTIVE_PANEL: 8000, // 8 seconds for inactive panel
  AUTO_REFRESH_CHECK_INTERVAL: 1000, // 1 second check interval

  // Message persistence
  AUTO_RESTORE_DELAY: 30, // 30ms for message restoration (reduced from 50ms)
  MESSAGE_PERSISTENCE_DELAY: 500, // 500ms for debounced saving
} as const;

export const UI_CONSTANTS = {
  // Scrollbar dimensions
  SCROLLBAR_WIDTH: 6,
  SCROLLBAR_THUMB_RADIUS: 3,

  // Session tabs
  SESSION_TAB_MIN_WIDTH: 80,
  SESSION_TAB_MAX_WIDTH: 200,

  // Status indicators
  STALE_INDICATOR_PING_SIZE: 2,
  CONTENT_STATUS_ICON_SIZE: 3,

  // CopilotKit styling
  COPIOLITKIT_FONT_SIZE: 14,
  COPIOLITKIT_LINE_HEIGHT: 1.4,
  COPIOLITKIT_SUGGESTION_FONT_SIZE: 0.6,
  COPIOLITKIT_SUGGESTION_PADDING: 5,
  COPIOLITKIT_INPUT_ICON_SIZE: 14,
} as const;

export const STORAGE_CONSTANTS = {
  // Chrome storage keys
  CHAT_STORAGE_KEY: 'copilot-chat-messages',
  SESSION_STORAGE_KEY: 'copilot-sessions',
  THEME_STORAGE_KEY: 'copilot-theme',

  // Storage limits
  MAX_MESSAGES_PER_SESSION: 1000,
  MAX_SESSIONS: 50,
  MAX_STORAGE_SIZE: 5 * 1024 * 1024, // 5MB
} as const;

export const ACTION_CONSTANTS = {
  // Element interaction
  CURSOR_AUTO_HIDE_DELAY: 5 * 60 * 1000, // 5 minutes
  CLICK_RIPPLE_DURATION: 600,
  DRAG_ANIMATION_DURATION: 300,

  // Screenshot settings
  DEFAULT_SCREENSHOT_FORMAT: 'png' as const,
  DEFAULT_JPEG_QUALITY: 90,
  MAX_SCREENSHOT_SIZE: 10 * 1024 * 1024, // 10MB

  // Form input
  DEFAULT_TYPING_SPEED: 50, // milliseconds per character
  MAX_INPUT_LENGTH: 10000,
} as const;

export const ERROR_MESSAGES = {
  // Tab and content errors
  NO_TAB_ACCESS: 'Unable to access current tab',
  NO_CONTENT: 'No page content available',
  CONTENT_FETCH_FAILED: 'Failed to fetch page content',

  // Element interaction errors
  ELEMENT_NOT_FOUND: 'Element not found with selector',
  INVALID_SELECTOR: 'Invalid CSS selector syntax',
  ELEMENT_NOT_VISIBLE: 'Element is not visible',
  ELEMENT_NOT_INTERACTABLE: 'Element is not interactable',

  // Storage errors
  STORAGE_QUOTA_EXCEEDED: 'Storage quota exceeded',
  STORAGE_ACCESS_DENIED: 'Storage access denied',
  MESSAGE_SAVE_FAILED: 'Failed to save messages',
  MESSAGE_LOAD_FAILED: 'Failed to load messages',

  // Network errors
  NETWORK_ERROR: 'Network error occurred',
  TIMEOUT_ERROR: 'Request timed out',
  SERVER_ERROR: 'Server error occurred',
} as const;

export const DEBUG_CONSTANTS = {
  // Debug logging
  ENABLE_VERBOSE_LOGGING: process.env.NODE_ENV === 'development',
  LOG_LEVEL: process.env.NODE_ENV === 'development' ? 'debug' : 'error',

  // Performance monitoring
  ENABLE_PERFORMANCE_MONITORING: process.env.NODE_ENV === 'development',
  PERFORMANCE_THRESHOLD: 100, // milliseconds
} as const;

// Theme colors
export const THEME_COLORS = {
  LIGHT: {
    BACKGROUND: '#ffffff',
    SURFACE: '#f9fafb',
    BORDER: '#e5e7eb',
    TEXT_PRIMARY: '#0C1117',
    TEXT_SECONDARY: '#6b7280',
    ACCENT: '#3b82f6',
    SUCCESS: '#10b981',
    WARNING: '#f59e0b',
    ERROR: '#ef4444',
  },
  DARK: {
    BACKGROUND: '#0C1117',
    SURFACE: '#1f2937',
    BORDER: '#374151',
    TEXT_PRIMARY: '#f9fafb',
    TEXT_SECONDARY: '#9ca3af',
    ACCENT: '#60a5fa',
    SUCCESS: '#34d399',
    WARNING: '#fbbf24',
    ERROR: '#f87171',
  },
} as const;

// API configuration
// Defaults come from build-time env vars; runtime overrides via apiConfigStorage (Options page)
let _apiUrlOverride: string | null = null;
let _backendUrlOverride: string | null = null;
/** When true, BASE_URL resolves to the page origin so `/api/*` hits the Vite/nginx proxy (first-party cookies). */
let _sameOriginApi = false;

const DEFAULT_API_URL = process.env.CEB_API_URL || 'http://localhost:3001';
const DEFAULT_BACKEND_URL = process.env.CEB_BACKEND_URL || 'http://localhost:8001';

/**
 * Call once on app startup (from SidePanel) after reading apiConfigStorage.
 * Passing empty strings clears the override and falls back to build-time defaults.
 *
 * Web + Vite dev: if stored URL is empty or the default local runtime, use same-origin `/api/*`
 * (see `pages/web/vite.config.mts` proxy) so Better Auth cookies are first-party and CopilotKit stops 401ing.
 */
export function initApiConfig(apiUrl: string, backendUrl: string) {
  const trimmed = (apiUrl || '').replace(/\/+$/, '');
  const useSameOrigin =
    !isExtensionContext() &&
    typeof import.meta !== 'undefined' &&
    !!import.meta.env?.DEV &&
    (!trimmed || trimmed === 'http://localhost:3001' || trimmed === 'http://127.0.0.1:3001');

  _sameOriginApi = useSameOrigin;
  _apiUrlOverride = useSameOrigin ? null : apiUrl || null;
  _backendUrlOverride = backendUrl || null;
}

function sameOriginApiBase(): string {
  return typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'http://localhost:5174';
}

/**
 * Build an absolute URL for fetch/new URL (e.g. appending search params).
 */
export function buildApiUrl(path: string): URL {
  const p = path.startsWith('/') ? path : `/${path}`;
  if (_sameOriginApi) {
    return new URL(p, sameOriginApiBase());
  }
  const base = (_apiUrlOverride || DEFAULT_API_URL).replace(/\/+$/, '');
  return new URL(`${base}${p}`);
}

export const API_CONFIG = {
  get BASE_URL(): string {
    if (_sameOriginApi) return sameOriginApiBase();
    return _apiUrlOverride || DEFAULT_API_URL;
  },
  get BACKEND_URL(): string {
    return _backendUrlOverride || DEFAULT_BACKEND_URL;
  },
  ENDPOINTS: {
    CONFIG: '/api/config',
    CONFIG_AGENTS: '/api/config/agents',
    CONFIG_MODELS: '/api/config/models',
    CONFIG_DEFAULTS: '/api/config/defaults',
  },
  CACHE_TTL: 5 * 60 * 1000, // 5 minutes for config cache
};

// CopilotKit configuration
export const COPIOLITKIT_CONFIG = {
  get RUNTIME_URL(): string {
    const base = API_CONFIG.BASE_URL.replace(/\/+$/, '');
    return `${base}/api/copilotkit`;
  },
  PUBLIC_API_KEY: 'ck_pub_c94e406d9327510d0463f3dbe3c1f2e8',
  PUBLIC_LICENSE_KEY: 'ck_pub_c94e406d9327510d0463f3dbe3c1f2e8',
  MAX_SUGGESTIONS: 3,
  ENABLE_IMAGE_UPLOADS: true,
  ENABLE_AUDIO_TRANSCRIPTION: true,
  ENABLE_TEXT_TO_SPEECH: true,
  ENABLE_FIREBASE_UPLOADS: true,
  FIREBASE: {
    apiKey: 'AIzaSyA8gy_pM2D8A80jX4bUuhwkAuRHupNrYNE',
    authDomain: 'adbe-gcp0814.firebaseapp.com',
    projectId: 'adbe-gcp0814',
    storageBucket: 'adbe-gcp0814.firebasestorage.app',
    messagingSenderId: '1095327983558',
    appId: '1:1095327983558:web:7178975fca572f8fe534c7',
  } as any,
};

// Ably Pub/Sub configuration for real-time usage streaming
export const ABLY_CONFIG = {
  // API key for subscribing to real-time usage updates
  // Get this from your Ably dashboard: https://ably.com/accounts
  API_KEY: 'kmzefw.9jSK0A:SEvImH9LfyiVKLSu6VyOCF19CGk44ddzu_brdkvd1Sk',
} as const;
