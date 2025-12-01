/**
 * Reset Password Page Component
 *
 * Handles password reset flow when user clicks on the reset link from email.
 * Validates the token and allows the user to set a new password.
 */

import React, { useState, useEffect } from 'react';
import { useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';
import { cn } from '@extension/ui';
import { AUTO_DISMISS_DELAYS } from '../constants/ui';
import { resetPasswordWithToken } from '../lib/auth-client';

interface ResetPasswordPageProps {
  token: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function ResetPasswordPage({ token, onSuccess, onCancel }: ResetPasswordPageProps) {
  const { isLight } = useStorage(themeStorage);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Form state
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Auto-dismiss error after 15 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError(null);
      }, AUTO_DISMISS_DELAYS.errorLong);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [error]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    // Validate passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Validate password length
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);

    try {
      const result = await resetPasswordWithToken(token, password);
      
      if (result.error) {
        setError(result.error);
      } else {
        setSuccessMessage('Password reset successfully! You can now sign in with your new password.');
        // Redirect to login after a short delay
        setTimeout(() => {
          onSuccess();
        }, 2000);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className={cn(
        'min-h-screen flex flex-col overflow-hidden transition-colors duration-300',
        isLight ? 'bg-gray-100' : 'bg-[#151C24]',
      )}>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full max-w-6xl items-start justify-center px-4 pt-24 pb-10 sm:pt-24 sm:pb-16">
          <div
            className={cn(
              'relative w-full max-w-md overflow-hidden rounded-2xl backdrop-blur-md transition-all duration-300',
              isLight ? 'bg-white' : 'bg-white/5',
            )}>

            <div className="relative px-7 pb-7 pt-9 sm:px-8 sm:pb-8 sm:pt-10">
              <div className="flex justify-center">
                <span
                  className={cn(
                    'inline-flex items-center gap-2 rounded-lg px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide',
                    isLight ? 'bg-blue-500/10 text-blue-600' : 'bg-white/10 text-blue-200',
                  )}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  Project Hands-Off
                </span>
              </div>

              <div className="mt-5 text-center">
                <div className="flex justify-center mb-4">
                  <div
                    className={cn(
                      'w-16 h-16 rounded-full flex items-center justify-center',
                      isLight ? 'bg-blue-100' : 'bg-blue-900/30',
                    )}>
                    <svg
                      className={cn('w-8 h-8', isLight ? 'text-blue-600' : 'text-blue-400')}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                      />
                    </svg>
                  </div>
                </div>
                <h1
                  className={cn(
                    'text-lg font-semibold tracking-tight sm:text-xl',
                    isLight ? 'text-slate-900' : 'text-white',
                  )}>
                  Set your new password
                </h1>
                <p
                  className={cn(
                    'mt-1.5 text-sm leading-relaxed',
                    isLight ? 'text-slate-600' : 'text-slate-300',
                  )}>
                  Enter a new password below to secure your account.
                </p>
              </div>

              {/* Success Message */}
              {successMessage && (
                <div
                  className={cn(
                    'mt-5 flex items-start gap-3 rounded-md px-3 py-2.5 text-xs',
                    isLight ? 'bg-green-50 text-green-700' : 'bg-green-900/20 text-green-300',
                  )}>
                  <svg className="h-4 w-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div className="flex-1">
                    <p>{successMessage}</p>
                  </div>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div
                  className={cn(
                    'mt-5 flex items-start gap-3 rounded-md px-3 py-2.5 text-xs',
                    isLight ? 'bg-red-50 text-red-700' : 'bg-red-900/20 text-red-300',
                  )}>
                  <svg className="h-4 w-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.5a.75.75 0 10-1.5 0v4a.75.75 0 001.5 0v-4zm0 6.5a.75.75 0 10-1.5 0 .75.75 0 001.5 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div className="flex-1">
                    <p>{error}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setError(null)}
                    className={cn(
                      'rounded-md p-0.5 transition-colors',
                      isLight ? 'text-red-500 hover:bg-red-100' : 'text-red-300 hover:bg-red-900/30',
                    )}
                    aria-label="Dismiss error">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}

              {!successMessage && (
                <form onSubmit={handleSubmit} className="mt-5 space-y-3" noValidate>
                  {/* New Password */}
                  <div className="space-y-1">
                    <label
                      htmlFor="password"
                      className={cn(
                        'block text-xs font-medium',
                        isLight ? 'text-gray-700' : 'text-gray-300',
                      )}>
                      New password
                    </label>
                    <div className="relative">
                      <span
                        className={cn(
                          'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center',
                          isLight ? 'text-gray-400' : 'text-gray-500',
                        )}>
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15 11.25V7.5a3 3 0 00-6 0v3.75"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6.75 11.25h10.5a1.5 1.5 0 011.5 1.5v6a1.5 1.5 0 01-1.5 1.5H6.75a1.5 1.5 0 01-1.5-1.5v-6a1.5 1.5 0 011.5-1.5z"
                          />
                        </svg>
                      </span>
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={cn(
                          'w-full py-1.5 pl-9 pr-9 text-sm border rounded-md outline-none focus:ring-1 focus:ring-blue-500 transition-colors',
                          isLight ? 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-400' : 'bg-[#151C24] border-gray-600 text-white placeholder:text-gray-500',
                        )}
                        placeholder="Create a secure password"
                        minLength={8}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className={cn(
                          'absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                          isLight ? 'text-gray-400 hover:bg-gray-100 hover:text-gray-600' : 'text-gray-500 hover:bg-gray-700 hover:text-gray-300',
                        )}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        aria-pressed={showPassword}>
                        {showPassword ? (
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223C5.283 6.69 7.39 5 12 5c4.61 0 6.717 1.69 8.02 3.223C21.328 9.66 22 11.243 22 12c0 .757-.672 2.34-1.98 3.777C18.717 17.31 16.61 19 12 19c-4.61 0-6.717-1.69-8.02-3.223C2.672 14.34 2 12.757 2 12c0-.757.672-2.34 1.98-3.777" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.98 4.98l14.04 14.04" />
                          </svg>
                        ) : (
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.644C3.423 8.14 7.067 5 12 5c4.934 0 8.578 3.14 9.964 6.678.07.197.07.415 0 .612C20.578 15.86 16.934 19 12 19c-4.934 0-8.578-3.14-9.964-6.678z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        )}
                      </button>
                    </div>
                    <p className={cn('text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
                      Use at least 8 characters, including a number and symbol.
                    </p>
                  </div>

                  {/* Confirm Password */}
                  <div className="space-y-1">
                    <label
                      htmlFor="confirmPassword"
                      className={cn(
                        'block text-xs font-medium',
                        isLight ? 'text-gray-700' : 'text-gray-300',
                      )}>
                      Confirm new password
                    </label>
                    <div className="relative">
                      <span
                        className={cn(
                          'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center',
                          isLight ? 'text-gray-400' : 'text-gray-500',
                        )}>
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      </span>
                      <input
                        id="confirmPassword"
                        type={showConfirmPassword ? 'text' : 'password'}
                        required
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className={cn(
                          'w-full py-1.5 pl-9 pr-9 text-sm border rounded-md outline-none focus:ring-1 focus:ring-blue-500 transition-colors',
                          isLight ? 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-400' : 'bg-[#151C24] border-gray-600 text-white placeholder:text-gray-500',
                          password && confirmPassword && password !== confirmPassword && 'border-red-500 focus:ring-red-500',
                        )}
                        placeholder="Re-enter your password"
                        minLength={8}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        className={cn(
                          'absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                          isLight ? 'text-gray-400 hover:bg-gray-100 hover:text-gray-600' : 'text-gray-500 hover:bg-gray-700 hover:text-gray-300',
                        )}
                        aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                        aria-pressed={showConfirmPassword}>
                        {showConfirmPassword ? (
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223C5.283 6.69 7.39 5 12 5c4.61 0 6.717 1.69 8.02 3.223C21.328 9.66 22 11.243 22 12c0 .757-.672 2.34-1.98 3.777C18.717 17.31 16.61 19 12 19c-4.61 0-6.717-1.69-8.02-3.223C2.672 14.34 2 12.757 2 12c0-.757.672-2.34 1.98-3.777" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.98 4.98l14.04 14.04" />
                          </svg>
                        ) : (
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.644C3.423 8.14 7.067 5 12 5c4.934 0 8.578 3.14 9.964 6.678.07.197.07.415 0 .612C20.578 15.86 16.934 19 12 19c-4.934 0-8.578-3.14-9.964-6.678z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        )}
                      </button>
                    </div>
                    {password && confirmPassword && password !== confirmPassword && (
                      <p className={cn('text-xs', isLight ? 'text-red-600' : 'text-red-400')}>
                        Passwords do not match
                      </p>
                    )}
                  </div>

                  <div className="pt-2 space-y-2">
                    <button
                      type="submit"
                      disabled={isLoading || !password || !confirmPassword || password !== confirmPassword}
                      className={cn(
                        'w-full rounded-md px-4 py-1.5 text-sm font-medium text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1',
                        isLight
                          ? 'bg-blue-600 hover:bg-blue-700'
                          : 'bg-blue-500 hover:bg-blue-600',
                        (isLoading || !password || !confirmPassword || password !== confirmPassword) && 'cursor-not-allowed opacity-70',
                      )}>
                      {isLoading ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            />
                          </svg>
                          Resetting password...
                        </span>
                      ) : (
                        'Reset password'
                      )}
                    </button>
                    
                    <button
                      type="button"
                      onClick={onCancel}
                      className={cn(
                        'w-full rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
                        isLight
                          ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          : 'bg-gray-800 text-gray-300 hover:bg-gray-700',
                      )}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>

      <div
        className={cn(
          'border-t px-4 py-3 text-center text-xs transition-colors',
          isLight ? 'border-gray-200 bg-gray-50 text-gray-600' : 'border-white/10 text-slate-400',
        )}>
        By continuing, you agree to our{' '}
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          className={cn(
            'font-medium transition-colors',
            isLight ? 'text-blue-600 hover:text-blue-700' : 'text-blue-300 hover:text-blue-200',
          )}>
          Terms of Service
        </a>{' '}
        and{' '}
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          className={cn(
            'font-medium transition-colors',
            isLight ? 'text-blue-600 hover:text-blue-700' : 'text-blue-300 hover:text-blue-200',
          )}>
          Privacy Policy
        </a>
      </div>
    </div>
  );
}

