/**
 * SSO Page Component
 * 
 * Handles SSO authentication flow for enterprise identity providers.
 * This page is opened in a popup window from the extension and initiates
 * the SSO flow using the Better Auth client.
 */

import * as React from 'react';
import { useEffect, useState } from 'react';
import { useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';
import { cn } from '@extension/ui';
import { signInWithSSODirect } from '../lib/auth-client';

interface SSOPageProps {
  email: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export default function SSOPage({ email, onSuccess, onError }: SSOPageProps) {
  const { isLight } = useStorage(themeStorage);
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Extract domain from email for display
  const domain = email.split('@')[1] || 'your organization';

  useEffect(() => {
    const startSSO = async () => {
      if (!email || !email.includes('@')) {
        setStatus('error');
        setErrorMessage('Invalid email address provided');
        onError?.('Invalid email address provided');
        return;
      }

      try {
        setStatus('loading');
        setErrorMessage('');
        
        const result = await signInWithSSODirect(email);
        
        if (result.error) {
          setStatus('error');
          setErrorMessage(result.error);
          onError?.(result.error);
        } else {
          // SSO redirect will happen automatically
          onSuccess?.();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Authentication failed';
        setStatus('error');
        setErrorMessage(message);
        onError?.(message);
      }
    };

    startSSO();
  }, [email, onSuccess, onError]);

  const handleRetry = () => {
    setStatus('loading');
    setErrorMessage('');
    window.location.reload();
  };

  const handleClose = () => {
    window.close();
  };

  return (
    <div
      className={cn(
        'min-h-screen flex flex-col items-center justify-center p-4 transition-colors duration-300',
        isLight ? 'bg-gray-100' : 'bg-[#151C24]'
      )}
    >
      <div
        className={cn(
          'w-full max-w-sm rounded-2xl p-8 text-center backdrop-blur-md transition-all duration-300',
          isLight ? 'bg-white shadow-lg' : 'bg-white/5'
        )}
      >
        {/* Badge */}
        <div className="flex justify-center mb-6">
          <span
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide',
              isLight ? 'bg-blue-500/10 text-blue-600' : 'bg-white/10 text-blue-200'
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            Enterprise SSO
          </span>
        </div>

        {/* Icon / Spinner */}
        <div className="flex justify-center mb-5">
          {status === 'loading' ? (
            <div className="relative w-12 h-12">
              <div
                className={cn(
                  'w-12 h-12 rounded-full border-[3px] animate-spin',
                  isLight 
                    ? 'border-gray-200 border-t-blue-600' 
                    : 'border-white/10 border-t-blue-500'
                )}
              />
            </div>
          ) : (
            <div className={cn('p-3 rounded-full', isLight ? 'bg-red-100' : 'bg-red-500/20')}>
              <svg className={cn('w-8 h-8', isLight ? 'text-red-600' : 'text-red-400')} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          )}
        </div>

        {/* Title */}
        <h1
          className={cn(
            'text-lg font-semibold tracking-tight mb-2',
            isLight ? 'text-slate-900' : 'text-white'
          )}
        >
          {status === 'loading'
            ? 'Signing in with SSO...'
            : 'Authentication Failed'}
        </h1>

        {/* Subtitle */}
        <p
          className={cn(
            'text-sm leading-relaxed',
            isLight ? 'text-slate-600' : 'text-slate-300'
          )}
        >
          {status === 'loading'
            ? `Redirecting to ${domain} identity provider...`
            : `Unable to connect to ${domain}.`}
        </p>

        {/* Email info */}
        {status === 'loading' && (
          <div className={cn(
            'mt-4 px-3 py-2 rounded-lg text-sm',
            isLight ? 'bg-gray-100 text-gray-700' : 'bg-white/5 text-gray-300'
          )}>
            {email}
          </div>
        )}

        {/* Error Message */}
        {status === 'error' && errorMessage && (
          <div
            className={cn(
              'mt-4 p-3 rounded-lg text-sm',
              isLight
                ? 'bg-red-50 text-red-600'
                : 'bg-red-500/10 text-red-400'
            )}
          >
            {errorMessage}
          </div>
        )}

        {/* Buttons */}
        {status === 'error' && (
          <div className="mt-6 space-y-3">
            <button
              onClick={handleRetry}
              className={cn(
                'w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors',
                'bg-blue-600 text-white hover:bg-blue-700',
                'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
                isLight ? 'focus:ring-offset-white' : 'focus:ring-offset-[#151C24]'
              )}
            >
              Try Again
            </button>
            <button
              onClick={handleClose}
              className={cn(
                'w-full rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                isLight
                  ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10'
              )}
            >
              Close Window
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

