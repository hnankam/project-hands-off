/**
 * Login Page Component
 * 
 * Provides email/password authentication for users.
 */

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useStorage } from '@extension/shared';
import { exampleThemeStorage } from '@extension/storage';
import { cn } from '@extension/ui';

export default function LoginPage() {
  const { signIn, signUp } = useAuth();
  const { isLight } = useStorage(exampleThemeStorage);
  const [isSignUp, setIsSignUp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      let result;
      if (isSignUp) {
        result = await signUp(name, email, password);
      } else {
        result = await signIn(email, password);
      }

      if (result.error) {
        setError(result.error);
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn('flex flex-col h-screen overflow-hidden', isLight ? 'bg-white' : 'bg-[#151C24]')}>
      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="w-full max-w-sm">
            {/* Welcome Section */}
            <div className="mb-6 text-center">
              {/* App Logo */}
              <div className="flex justify-center mb-4">
                <img
                  src="/icon-128.png"
                  alt="Project Hands-Off"
                  className="w-20 h-20"
                />
              </div>
              
              <p className={cn('text-sm', isLight ? 'text-gray-600' : 'text-gray-400')}>
                {isSignUp ? 'Sign up to get started' : 'Sign in to continue'}
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div
                className={cn(
                  'mb-4 p-3 rounded-lg text-sm flex items-start justify-between gap-3',
                  isLight ? 'bg-red-50 text-red-700' : 'bg-red-900/20 text-red-400',
                )}>
                <div className="flex-1 flex items-start gap-2">
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>{error}</span>
                </div>
                <button
                  onClick={() => setError(null)}
                  className={cn(
                    'flex-shrink-0 p-0.5 rounded transition-colors',
                    isLight ? 'text-red-500 hover:bg-red-100' : 'text-red-400 hover:bg-red-900/40',
                  )}
                  title="Dismiss">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Name field (only for sign up) */}
              {isSignUp && (
                <div>
                  <label
                    htmlFor="name"
                    className={cn('block text-xs font-medium mb-1.5', isLight ? 'text-gray-700' : 'text-gray-300')}>
                    Full Name
                  </label>
                  <input
                    id="name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={cn(
                      'w-full px-3 py-2 text-xs border rounded focus:ring-1 focus:ring-blue-500 outline-none',
                      isLight
                        ? 'bg-white border-gray-300 text-gray-900'
                        : 'bg-[#151C24] border-gray-600 text-white',
                    )}
                    placeholder="John Doe"
                  />
                </div>
              )}

              {/* Email field */}
              <div>
                <label
                  htmlFor="email"
                  className={cn('block text-xs font-medium mb-1.5', isLight ? 'text-gray-700' : 'text-gray-300')}>
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={cn(
                    'w-full px-3 py-2 text-xs border rounded focus:ring-1 focus:ring-blue-500 outline-none',
                    isLight
                      ? 'bg-white border-gray-300 text-gray-900'
                      : 'bg-[#151C24] border-gray-600 text-white',
                  )}
                  placeholder="[email protected]"
                />
              </div>

              {/* Password field */}
              <div>
                <label
                  htmlFor="password"
                  className={cn('block text-xs font-medium mb-1.5', isLight ? 'text-gray-700' : 'text-gray-300')}>
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={cn(
                    'w-full px-3 py-2 text-xs border rounded focus:ring-1 focus:ring-blue-500 outline-none',
                    isLight
                      ? 'bg-white border-gray-300 text-gray-900'
                      : 'bg-[#151C24] border-gray-600 text-white',
                  )}
                  placeholder="••••••••"
                  minLength={8}
                />
                {isSignUp && (
                  <p className={cn('mt-1 text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
                    Must be at least 8 characters
                  </p>
                )}
              </div>

              {/* Submit button */}
              <button
                type="submit"
                disabled={isLoading}
                className={cn(
                  'w-full px-4 py-2 text-xs rounded transition-colors font-medium',
                  isLight ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-blue-500 text-white hover:bg-blue-600',
                  isLoading && 'opacity-50 cursor-not-allowed',
                )}>
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg
                      className="animate-spin h-4 w-4"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {isSignUp ? 'Creating account...' : 'Signing in...'}
                  </span>
                ) : isSignUp ? (
                  'Create Account'
                ) : (
                  'Sign In'
                )}
              </button>
            </form>

            {/* Toggle between sign in and sign up */}
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError(null);
                }}
                className={cn(
                  'text-xs font-medium transition-colors',
                  isLight
                    ? 'text-blue-600 hover:text-blue-700'
                    : 'text-blue-400 hover:text-blue-300',
                )}>
                {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        className={cn(
          'flex-shrink-0 border-t',
          isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#151C24]',
        )}>
        <div className="px-4 py-1.5">
          <p className={cn('text-xs text-center', isLight ? 'text-gray-500' : 'text-gray-400')}>
            By continuing, you agree to our{' '}
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className={cn(
                'font-medium transition-colors',
                isLight ? 'text-blue-600 hover:text-blue-700' : 'text-blue-400 hover:text-blue-300',
              )}>
              Terms of Service
            </a>
            {' '}and{' '}
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className={cn(
                'font-medium transition-colors',
                isLight ? 'text-blue-600 hover:text-blue-700' : 'text-blue-400 hover:text-blue-300',
              )}>
              Privacy Policy
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

