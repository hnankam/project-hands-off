import '@src/Options.css';
import { useState, useEffect, useCallback } from 'react';
import { useStorage, withErrorBoundary, withSuspense } from '@extension/shared';
import { themeStorage, apiConfigStorage } from '@extension/storage';
import { cn, ErrorDisplay, LoadingSpinner } from '@extension/ui';

const DEFAULT_API_URL = process.env.CEB_API_URL || 'http://localhost:3001';
const DEFAULT_BACKEND_URL = process.env.CEB_BACKEND_URL || 'http://localhost:8001';

const isValidUrl = (value: string): boolean => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const Options = () => {
  const { isLight } = useStorage(themeStorage);
  const { apiUrl: storedApiUrl, backendUrl: storedBackendUrl } = useStorage(apiConfigStorage);

  const [apiUrl, setApiUrl] = useState('');
  const [backendUrl, setBackendUrl] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', !isLight);
  }, [isLight]);

  useEffect(() => {
    setApiUrl(storedApiUrl || '');
    setBackendUrl(storedBackendUrl || '');
  }, [storedApiUrl, storedBackendUrl]);

  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(null), 4000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [feedback]);

  const handleSave = useCallback(async () => {
    const trimmedApi = apiUrl.trim();
    const trimmedBackend = backendUrl.trim();

    if (trimmedApi && !isValidUrl(trimmedApi)) {
      setFeedback({ type: 'error', message: 'API Server URL is not a valid URL.' });
      return;
    }
    if (trimmedBackend && !isValidUrl(trimmedBackend)) {
      setFeedback({ type: 'error', message: 'Backend Server URL is not a valid URL.' });
      return;
    }

    setIsSaving(true);
    try {
      await apiConfigStorage.setApiUrl(trimmedApi);
      await apiConfigStorage.setBackendUrl(trimmedBackend);
      setFeedback({ type: 'success', message: 'Settings saved. Reopen the extension panel to apply changes.' });
    } catch {
      setFeedback({ type: 'error', message: 'Failed to save settings.' });
    } finally {
      setIsSaving(false);
    }
  }, [apiUrl, backendUrl]);

  const handleReset = useCallback(async () => {
    setIsSaving(true);
    try {
      await apiConfigStorage.resetToDefaults();
      setApiUrl('');
      setBackendUrl('');
      setFeedback({ type: 'success', message: 'Reset to defaults. Reopen the extension panel to apply changes.' });
    } catch {
      setFeedback({ type: 'error', message: 'Failed to reset settings.' });
    } finally {
      setIsSaving(false);
    }
  }, []);

  return (
    <div
      className={cn(
        'min-h-screen flex flex-col overflow-hidden transition-colors duration-300',
        isLight ? 'bg-gray-100' : 'bg-[#151C24]',
      )}>
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="mx-auto flex min-h-full max-w-6xl items-start justify-center px-4 pt-24 pb-10 sm:pt-24 sm:pb-16">
          <div
            className={cn(
              'relative w-full max-w-md overflow-hidden rounded-2xl backdrop-blur-md transition-all duration-300',
              isLight ? 'bg-white' : 'bg-white/5',
            )}>
            <div className="relative px-7 pb-7 pt-9 sm:px-8 sm:pb-8 sm:pt-10">
              {/* Logo */}
              <div className="flex justify-center">
                <img
                  src={chrome.runtime.getURL('icon-128.png')}
                  className="h-12 w-12 rounded-lg"
                  alt="Hands-Off"
                />
              </div>

              {/* Header */}
              <div className="mt-5 text-center">
                <h1
                  className={cn(
                    'text-lg font-semibold tracking-tight sm:text-xl',
                    isLight ? 'text-slate-900' : 'text-white',
                  )}>
                  Extension Settings
                </h1>
                <p
                  className={cn(
                    'mt-1.5 text-sm leading-relaxed',
                    isLight ? 'text-slate-600' : 'text-slate-300',
                  )}>
                  Configure the API server URLs. Leave blank to use the built-in defaults.
                </p>
              </div>

              {/* Feedback Message */}
              {feedback && (
                <div
                  className={cn(
                    'mt-5 flex items-start gap-3 rounded-md px-3 py-2.5 text-xs',
                    feedback.type === 'success'
                      ? isLight ? 'bg-green-50 text-green-700' : 'bg-green-900/20 text-green-300'
                      : isLight ? 'bg-red-50 text-red-700' : 'bg-red-900/20 text-red-300',
                  )}>
                  <svg className="h-4 w-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                    {feedback.type === 'success' ? (
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                        clipRule="evenodd"
                      />
                    ) : (
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.5a.75.75 0 10-1.5 0v4a.75.75 0 001.5 0v-4zm0 6.5a.75.75 0 10-1.5 0 .75.75 0 001.5 0z"
                        clipRule="evenodd"
                      />
                    )}
                  </svg>
                  <div className="flex-1">
                    <p>{feedback.message}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFeedback(null)}
                    className={cn(
                      'rounded-md p-0.5 transition-colors',
                      feedback.type === 'success'
                        ? isLight ? 'text-green-500 hover:bg-green-100' : 'text-green-300 hover:bg-green-900/30'
                        : isLight ? 'text-red-500 hover:bg-red-100' : 'text-red-300 hover:bg-red-900/30',
                    )}
                    aria-label="Dismiss message">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}

              {/* Form */}
              <div className="mt-5 space-y-3">
                {/* API Server URL */}
                <div className="space-y-1">
                  <label
                    htmlFor="apiUrl"
                    className={cn(
                      'block text-xs font-medium',
                      isLight ? 'text-gray-700' : 'text-gray-300',
                    )}>
                    API Server URL
                  </label>
                  <input
                    id="apiUrl"
                    type="url"
                    value={apiUrl}
                    onChange={e => setApiUrl(e.target.value)}
                    className={cn(
                      'w-full py-1.5 px-2.5 text-sm border rounded-md outline-none focus:ring-1 focus:ring-blue-500 transition-colors',
                      isLight
                        ? 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-400'
                        : 'bg-[#151C24] border-gray-600 text-white placeholder:text-gray-500',
                    )}
                    placeholder={DEFAULT_API_URL}
                  />
                  <p className={cn('text-[11px]', isLight ? 'text-gray-400' : 'text-gray-500')}>
                    Copilot Runtime server (Node.js). Default: {DEFAULT_API_URL}
                  </p>
                </div>

                {/* Backend Server URL */}
                <div className="space-y-1">
                  <label
                    htmlFor="backendUrl"
                    className={cn(
                      'block text-xs font-medium',
                      isLight ? 'text-gray-700' : 'text-gray-300',
                    )}>
                    Backend Server URL
                  </label>
                  <input
                    id="backendUrl"
                    type="url"
                    value={backendUrl}
                    onChange={e => setBackendUrl(e.target.value)}
                    className={cn(
                      'w-full py-1.5 px-2.5 text-sm border rounded-md outline-none focus:ring-1 focus:ring-blue-500 transition-colors',
                      isLight
                        ? 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-400'
                        : 'bg-[#151C24] border-gray-600 text-white placeholder:text-gray-500',
                    )}
                    placeholder={DEFAULT_BACKEND_URL}
                  />
                  <p className={cn('text-[11px]', isLight ? 'text-gray-400' : 'text-gray-500')}>
                    Pydantic agent backend (Python). Default: {DEFAULT_BACKEND_URL}
                  </p>
                </div>

                {/* Buttons */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                    className={cn(
                      'flex-1 rounded-md px-4 py-1.5 text-sm font-medium text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1',
                      isLight ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-500 hover:bg-blue-600',
                      isSaving && 'cursor-not-allowed opacity-70',
                    )}>
                    {isSaving ? 'Saving...' : 'Save Settings'}
                  </button>
                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={isSaving}
                    className={cn(
                      'rounded-md px-4 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1',
                      isLight
                        ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300'
                        : 'bg-white/10 text-gray-300 hover:bg-white/15 border border-gray-600',
                      isSaving && 'cursor-not-allowed opacity-70',
                    )}>
                    Reset to Defaults
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default withErrorBoundary(withSuspense(Options, <LoadingSpinner />), ErrorDisplay);
