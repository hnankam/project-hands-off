/**
 * Accept Invitation Page Component
 * 
 * Combines invitation display with login/signup to allow users to:
 * 1. View invitation details
 * 2. Login or signup
 * 3. Automatically accept invitation after authentication
 */

import * as React from 'react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { cn } from '@extension/ui';
import { useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';
import { API_CONFIG } from '../constants';

// ============================================================================
// CONSTANTS
// ============================================================================

const API_BASE_URL = API_CONFIG.BASE_URL;
const REDIRECT_DELAYS = {
  afterAccept: 2000,
  afterDecline: 1500,
} as const;
const PASSWORD_MIN_LENGTH = 8;

// ============================================================================
// TYPES
// ============================================================================

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  organization: {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
  };
  inviter: {
    email: string;
    name: string | null;
  };
  expiresAt: string;
  createdAt: string;
}

interface AcceptInvitationPageProps {
  invitationId: string;
  onSuccess?: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function AcceptInvitationPage({ invitationId, onSuccess }: AcceptInvitationPageProps) {
  const { signIn, signUp, session } = useAuth();
  const { isLight } = useStorage(themeStorage);
  
  // Refs for cleanup
  const isMounted = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // UI state
  const [isSignUp, setIsSignUp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [declineModalOpen, setDeclineModalOpen] = useState(false);
  
  // Invitation state
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [invitationLoading, setInvitationLoading] = useState(true);
  const [invitationError, setInvitationError] = useState<string | null>(null);
  
  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Cleanup on unmount
  useEffect(() => {
    isMounted.current = true;
    
    return () => {
      isMounted.current = false;
      // Cancel any pending fetch requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      // Clear any pending timeouts
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Accept invitation helper
  const acceptInvitation = useCallback(async () => {
    if (!invitation) return;

    setIsLoading(true);
    setError(null);

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(`${API_BASE_URL}/api/invitations/${invitationId}/accept`, {
        method: 'POST',
        credentials: 'include',
        signal: abortControllerRef.current.signal,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to accept invitation');
      }

      if (isMounted.current) {
        setSuccess(`Successfully joined ${invitation.organization.name}!`);
      }
      
      // Wait a moment before calling onSuccess
      timeoutRef.current = setTimeout(() => {
        if (isMounted.current) {
          onSuccess?.();
        }
      }, REDIRECT_DELAYS.afterAccept);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      if (isMounted.current) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to accept invitation';
        setError(errorMessage);
    }
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
      }
    }
  }, [invitation, invitationId, onSuccess]);

  // Load invitation details
  const loadInvitation = useCallback(async () => {
    setInvitationLoading(true);
    setInvitationError(null);

    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(`${API_BASE_URL}/api/invitations/${invitationId}`, {
        signal: abortControllerRef.current.signal,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Invitation with ID ${invitationId} not found`);
      }

      if (isMounted.current) {
      setInvitation(data.invitation);
      setEmail(data.invitation.email);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Request was aborted, ignore
        return;
      }
      if (isMounted.current) {
        const errorMessage = err instanceof Error ? err.message : `Invitation with ID ${invitationId} not found`;
        setInvitationError(errorMessage);
      }
    } finally {
      if (isMounted.current) {
      setInvitationLoading(false);
    }
    }
  }, [invitationId]);

  // Load invitation on mount
  useEffect(() => {
    loadInvitation();
  }, [loadInvitation]);

  // Auto-accept invitation if user is already logged in
  const handleAutoAccept = useCallback(async () => {
    if (!session || !invitation) return;

    // Check if logged-in email matches invitation email
    if (session.user.email !== invitation.email) {
      setError(
        `This invitation is for ${invitation.email}. You're logged in as ${session.user.email}. Please log out and sign in with the correct email.`
      );
      return;
    }

    // Auto-accept the invitation
    await acceptInvitation();
  }, [session, invitation, acceptInvitation]);

  useEffect(() => {
    if (session && invitation) {
      handleAutoAccept();
    }
  }, [session, invitation, handleAutoAccept]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsLoading(true);

    try {
      // Validate email matches invitation
      if (invitation && email.toLowerCase() !== invitation.email.toLowerCase()) {
        setError(`You must sign in with ${invitation.email} to accept this invitation`);
        setIsLoading(false);
        return;
      }

      // Sign in or sign up
      let result;
      if (isSignUp) {
        result = await signUp(name, email, password);
      } else {
        result = await signIn(email, password);
      }

      if (result.error) {
        setError(result.error);
        setIsLoading(false);
        return;
      }

      // After successful auth, accept invitation
      // Note: The useEffect will trigger auto-accept when session updates
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
      setIsLoading(false);
    }
  };

  const handleDeclineClick = () => {
    setDeclineModalOpen(true);
  };

  const handleConfirmDecline = async () => {
    if (!invitation) return;

    setDeclineModalOpen(false);
    setIsLoading(true);

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(`${API_BASE_URL}/api/invitations/${invitationId}/reject`, {
        method: 'POST',
        signal: abortControllerRef.current.signal,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reject invitation');
      }

      if (isMounted.current) {
      setSuccess('Invitation declined');
      }
      
      // Redirect to login page after a brief delay
      timeoutRef.current = setTimeout(() => {
        if (isMounted.current) {
        onSuccess?.();
        }
      }, REDIRECT_DELAYS.afterDecline);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      if (isMounted.current) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to reject invitation';
        setError(errorMessage);
      }
    } finally {
      if (isMounted.current) {
      setIsLoading(false);
      }
    }
  };

  // Loading invitation
  if (invitationLoading) {
    return (
      <div
        className={cn(
          'min-h-screen flex flex-col overflow-hidden transition-colors duration-300',
          isLight ? 'bg-gray-100' : 'bg-[#151C24]',
        )}>
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto flex min-h-full max-w-6xl items-start justify-center px-4 pt-24 pb-10 sm:pt-24 sm:pb-16">
            <div className="w-full max-w-md">
              <div
                className={cn(
                  'relative w-full overflow-hidden rounded-2xl backdrop-blur-md transition-all duration-300',
                  isLight ? 'bg-white' : 'bg-white/5',
                )}>
                <div className="relative px-7 pb-7 pt-9 sm:px-8 sm:pb-8 sm:pt-10">
                  {/* Loading Animation */}
                  <div className="flex flex-col items-center justify-center py-12">
                    <div className="relative h-16 w-16">
                      <div className={cn(
                        'absolute h-16 w-16 rounded-full border-4 animate-spin',
                        isLight ? 'border-gray-200' : 'border-gray-700'
                      )}>
                        <div className={cn(
                          'absolute -top-1 left-1/2 -ml-2 h-4 w-4 rounded-full',
                          isLight ? 'bg-blue-600' : 'bg-blue-400'
                        )} />
                      </div>
                    </div>
                    <p className={cn('mt-6 text-sm font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>
                      Loading invitation
                    </p>
                    <p className={cn('mt-1.5 text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
                      Please wait a moment...
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Invitation error
  if (invitationError) {
    return (
      <div
        className={cn(
          'min-h-screen flex items-center justify-center transition-colors duration-300',
          isLight ? 'bg-gray-100' : 'bg-[#151C24]',
        )}>
        <div className="w-full max-w-md px-4">
          <div
            className={cn(
              'rounded-2xl shadow-xl p-8 text-center backdrop-blur-md transition-all duration-300',
              isLight ? 'bg-white' : 'bg-white/5',
            )}>
            <div className="text-6xl mb-4">❌</div>
            <h1
              className={cn(
                'text-2xl font-bold mb-4',
                isLight ? 'text-gray-900' : 'text-white',
              )}>
              Invitation Not Found
            </h1>
            <p className={cn('mb-6', isLight ? 'text-gray-600' : 'text-slate-300')}>
              {invitationError}
            </p>
            <button
              onClick={onSuccess}
              className={cn(
                'px-6 py-3 rounded-lg font-medium transition-colors text-white',
                isLight ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-500 hover:bg-blue-600',
              )}
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!invitation) return null;

  // Success state (after accepting)
  if (success && success.includes('Successfully joined')) {
    return (
      <div
        className={cn(
          'min-h-screen flex flex-col overflow-hidden transition-colors duration-300',
          isLight ? 'bg-gray-100' : 'bg-[#151C24]',
        )}>
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto flex min-h-full max-w-6xl items-start justify-center px-4 pt-24 pb-10 sm:pt-24 sm:pb-16">
            <div className="w-full max-w-md">
              <div
                className={cn(
                  'relative w-full overflow-hidden rounded-2xl backdrop-blur-md transition-all duration-300',
                  isLight ? 'bg-white' : 'bg-white/5',
                )}>
                <div className="relative px-7 pb-7 pt-9 sm:px-8 sm:pb-8 sm:pt-10">
                  {/* Badge */}
                  <div className="flex justify-center">
                    <span
                      className={cn(
                        'inline-flex items-center gap-2 rounded-lg px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide',
                        isLight ? 'bg-green-500/10 text-green-600' : 'bg-green-900/30 text-green-400',
                      )}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      Success
                    </span>
                  </div>

                  {/* Success Icon & Message */}
                  <div className="mt-5 text-center">
                    <div className="flex justify-center mb-4">
                      <div className="text-6xl">🎉</div>
                    </div>
                    <h1
                      className={cn(
                        'text-lg font-semibold tracking-tight sm:text-xl',
                        isLight ? 'text-slate-900' : 'text-white',
                      )}>
                      Welcome to {invitation.organization.name}!
                    </h1>
                    <p
                      className={cn(
                        'mt-1.5 text-sm leading-relaxed',
                        isLight ? 'text-slate-600' : 'text-slate-300',
                      )}>
                      You've successfully joined as a <strong>{invitation.role}</strong>.
                    </p>
                  </div>

                  {/* Loading Spinner */}
                  <div className="mt-6 flex flex-col items-center gap-3">
                    <div className="relative h-12 w-12">
                      <div className={cn(
                        'absolute h-12 w-12 rounded-full border-4 animate-spin',
                        isLight ? 'border-gray-200' : 'border-gray-700'
                      )}>
                        <div className={cn(
                          'absolute -top-1 left-1/2 -ml-1.5 h-3 w-3 rounded-full',
                          isLight ? 'bg-green-600' : 'bg-green-400'
                        )} />
                      </div>
                    </div>
                    <p className={cn('text-sm font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>
                      Redirecting you now
                    </p>
                    <p className={cn('text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
                      Setting up your workspace...
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className={cn(
            'border-t px-4 py-3 text-center text-xs transition-colors',
            isLight ? 'border-gray-200 bg-gray-50 text-gray-600' : 'border-white/10 text-slate-400',
          )}>
          By accepting this invitation, you agree to our{' '}
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

  return (
    <div
      className={cn(
        'min-h-screen flex flex-col overflow-hidden transition-colors duration-300',
        isLight ? 'bg-gray-100' : 'bg-[#151C24]',
      )}>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full max-w-6xl items-start justify-center px-4 pt-12 pb-10 sm:pt-16 sm:pb-16">
          <div className="w-full max-w-md">
            {/* Login/Signup Form */}
        <div
          className={cn(
            'relative w-full overflow-hidden rounded-2xl backdrop-blur-md transition-all duration-300',
            isLight ? 'bg-white' : 'bg-white/5',
          )}>
          
          <div className="relative px-7 pb-7 pt-9 sm:px-8 sm:pb-8 sm:pt-10">
            {/* Badge */}
            <div className="flex justify-center">
              <span
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide',
                  isLight ? 'bg-blue-500/10 text-blue-600' : 'bg-white/10 text-blue-200',
                )}>
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                Invitation
              </span>
            </div>

            {/* Header */}
            <div className="mt-5 text-center">
              <h1
                className={cn(
                  'text-lg font-semibold tracking-tight sm:text-xl',
                  isLight ? 'text-slate-900' : 'text-white',
                )}>
                Join {invitation.organization.name}
              </h1>
              <p
                className={cn(
                  'mt-1.5 text-sm leading-relaxed',
                  isLight ? 'text-slate-600' : 'text-slate-300',
                )}>
                {isSignUp 
                  ? `Create your account to accept the invitation`
                  : `Sign in to accept your invitation`
                }
              </p>
            </div>

            {/* Sign in / Sign up toggle */}
            <div
              className={cn(
                'mx-auto mt-4 flex w-full max-w-xs rounded-lg p-1 text-xs font-medium transition-colors',
                isLight ? 'bg-gray-100' : 'bg-[#151C24]',
              )}>
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(false);
                  setError(null);
                  setShowPassword(false);
                }}
                className={cn(
                  'flex-1 rounded-md px-3 py-1.5 transition-all',
                  !isSignUp
                    ? isLight
                      ? 'bg-white text-gray-900 shadow-md'
                      : 'bg-[#2D3748] text-white shadow-lg'
                    : isLight
                      ? 'text-gray-600 hover:text-gray-900'
                      : 'text-gray-400 hover:text-gray-200',
                )}>
                Sign in
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(true);
                  setError(null);
                  setShowPassword(false);
                }}
                className={cn(
                  'flex-1 rounded-md px-3 py-1.5 transition-all',
                  isSignUp
                    ? isLight
                      ? 'bg-white text-gray-900 shadow-md'
                      : 'bg-[#2D3748] text-white shadow-lg'
                    : isLight
                      ? 'text-gray-600 hover:text-gray-900'
                      : 'text-gray-400 hover:text-gray-200',
                )}>
                Sign up
              </button>
            </div>

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

            {/* Success Message */}
            {success && (
              <div
                className={cn(
                  'mt-5 flex items-start gap-3 rounded-md px-3 py-2.5 text-xs',
                  isLight ? 'bg-green-50 text-green-700' : 'bg-green-900/20 text-green-300',
                )}>
                <svg className="h-4 w-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                </svg>
                <div className="flex-1">
                  <p>{success}</p>
                </div>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="mt-5 space-y-3" noValidate>
              {/* Name field (only for sign up) */}
              {isSignUp && (
                <div className="space-y-1">
                  <label
                    htmlFor="name"
                    className={cn(
                      'block text-xs font-medium',
                      isLight ? 'text-gray-700' : 'text-gray-300',
                    )}>
                    Full name
                  </label>
                  <input
                    id="name"
                    type="text"
                    required
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={cn(
                      'w-full px-2.5 py-1.5 text-sm border rounded-md outline-none focus:ring-1 focus:ring-blue-500 transition-colors',
                      isLight ? 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-400' : 'bg-[#151C24] border-gray-600 text-white placeholder:text-gray-500',
                    )}
                    placeholder="John Doe"
                  />
                </div>
              )}

              {/* Email field (pre-filled and readonly) */}
              <div className="space-y-1">
                <label
                  htmlFor="email"
                  className={cn(
                    'block text-xs font-medium',
                    isLight ? 'text-gray-700' : 'text-gray-300',
                  )}>
                  Email address (invitation)
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
                        d="M4.5 4.5h15a1.5 1.5 0 011.5 1.5v12a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 18V6a1.5 1.5 0 011.5-1.5zm0 0L12 12.75 19.5 4.5"
                      />
                    </svg>
                  </span>
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    readOnly
                    className={cn(
                      'w-full py-1.5 pl-9 pr-2.5 text-sm border rounded-md outline-none cursor-not-allowed opacity-75',
                      isLight ? 'bg-gray-50 border-gray-300 text-gray-700' : 'bg-[#0D1117] border-gray-600 text-gray-400',
                    )}
                    title="Email is fixed to match the invitation"
                  />
                </div>
                <p className={cn('text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
                  You must use this email to accept the invitation
                </p>
              </div>

              {/* Password field */}
              <div className="space-y-1">
                <label
                  htmlFor="password"
                  className={cn(
                    'block text-xs font-medium',
                    isLight ? 'text-gray-700' : 'text-gray-300',
                  )}>
                  Password
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
                    autoComplete={isSignUp ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={cn(
                      'w-full py-1.5 pl-9 pr-9 text-sm border rounded-md outline-none focus:ring-1 focus:ring-blue-500 transition-colors',
                      isLight ? 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-400' : 'bg-[#151C24] border-gray-600 text-white placeholder:text-gray-500',
                    )}
                    placeholder={isSignUp ? 'Create a secure password' : 'Enter your password'}
                    minLength={PASSWORD_MIN_LENGTH}
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
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M3.98 8.223C5.283 6.69 7.39 5 12 5c4.61 0 6.717 1.69 8.02 3.223C21.328 9.66 22 11.243 22 12c0 .757-.672 2.34-1.98 3.777C18.717 17.31 16.61 19 12 19c-4.61 0-6.717-1.69-8.02-3.223C2.672 14.34 2 12.757 2 12c0-.757.672-2.34 1.98-3.777"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.98 4.98l14.04 14.04" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M2.036 12.322a1.012 1.012 0 010-.644C3.423 8.14 7.067 5 12 5c4.934 0 8.578 3.14 9.964 6.678.07.197.07.415 0 .612C20.578 15.86 16.934 19 12 19c-4.934 0-8.578-3.14-9.964-6.678z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                    )}
                  </button>
                </div>
                {isSignUp && (
                  <p className={cn('text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
                    Use at least {PASSWORD_MIN_LENGTH} characters, including a number and symbol.
                  </p>
                )}
              </div>

              {/* Submit button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className={cn(
                    'w-full rounded-md px-4 py-1.5 text-sm font-medium text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1',
                    isLight
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'bg-blue-500 hover:bg-blue-600',
                    isLoading && 'cursor-not-allowed opacity-70',
                  )}>
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      {isSignUp ? 'Creating account...' : 'Signing in...'}
                    </span>
                  ) : (
                    `${isSignUp ? 'Accept & Create account' : 'Accept & Sign in'}`
                  )}
                </button>
              </div>
            </form>

            {/* Decline invitation link */}
            <div className="mt-4 text-center text-xs sm:text-sm">
              <button
                type="button"
                onClick={handleDeclineClick}
                disabled={isLoading}
                className={cn(
                  'font-medium underline-offset-4 transition-colors hover:underline disabled:opacity-50 disabled:cursor-not-allowed',
                  isLight ? 'text-gray-600 hover:text-gray-800' : 'text-gray-400 hover:text-gray-200',
                )}>
                Decline this invitation
              </button>
            </div>
          </div>
        </div>

        {/* Invitation details */}
        <p className={cn('mt-4 text-center text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
          Invited by <strong>{invitation.inviter.name || invitation.inviter.email}</strong> as <strong>{invitation.role}</strong> • Expires {new Date(invitation.expiresAt).toLocaleDateString()}
        </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        className={cn(
          'border-t px-4 py-3 text-center text-xs transition-colors',
          isLight ? 'border-gray-200 bg-gray-50 text-gray-600' : 'border-white/10 text-slate-400',
        )}>
        By accepting this invitation, you agree to our{' '}
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

      {/* Decline Invitation Confirmation Modal */}
      <>
        {/* Backdrop */}
        {declineModalOpen && (
          <div
            className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm"
            onClick={() => setDeclineModalOpen(false)}
          />
        )}

        {/* Modal */}
        <div
          className={cn(
            'fixed inset-0 z-[10001] flex items-center justify-center p-4 transition-opacity',
            declineModalOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          )}
        >
          <div
            className={cn(
              'w-full max-w-sm rounded-lg shadow-xl',
              isLight ? 'border border-gray-200 bg-gray-50' : 'border border-gray-700 bg-[#151C24]',
            )}
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div
              className={cn(
                'flex items-center justify-between border-b px-3 py-2',
                isLight ? 'border-gray-200' : 'border-gray-700',
              )}>
              <h2 className={cn('text-sm font-semibold', isLight ? 'text-gray-700' : 'text-gray-300')}>
                Decline Invitation
              </h2>
              <button
                onClick={() => setDeclineModalOpen(false)}
                className={cn(
                  'rounded-md p-0.5 transition-colors',
                  isLight
                    ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                    : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200',
                )}>
                <svg
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="space-y-3 px-3 py-4">
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full',
                    isLight ? 'bg-red-100' : 'bg-red-900/30',
                  )}>
                  <svg
                    className={cn('h-3.5 w-3.5', isLight ? 'text-red-600' : 'text-red-400')}
                    fill="currentColor"
                    viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                  </svg>
                </div>

                <div className="flex-1">
                  <p className={cn('text-sm font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>
                    Decline invitation to {invitation?.organization.name}?
                  </p>
                  <p className={cn('mt-1 text-xs', isLight ? 'text-gray-600' : 'text-gray-400')}>
                    You won't be able to join this organization with this invitation link. The inviter will need to send you a new invitation if you change your mind.
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div
              className={cn(
                'flex items-center justify-end gap-2 border-t px-3 py-2',
                isLight ? 'border-gray-200' : 'border-gray-700',
              )}>
              <button
                onClick={() => setDeclineModalOpen(false)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  isLight
                    ? 'bg-gray-200 hover:bg-gray-300'
                    : 'bg-gray-700 hover:bg-gray-600',
                )}
                style={{ color: isLight ? '#374151' : '#bcc1c7' }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDecline}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  'bg-red-600 text-white hover:bg-red-700',
                )}>
                Decline Invitation
              </button>
            </div>
          </div>
        </div>
      </>
    </div>
  );
}
