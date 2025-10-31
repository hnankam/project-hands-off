/**
 * Accept Invitation Page Component
 * 
 * Combines invitation display with login/signup to allow users to:
 * 1. View invitation details
 * 2. Login or signup
 * 3. Automatically accept invitation after authentication
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import authClient from '../lib/auth-client';
import { cn } from '@extension/ui';

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

export default function AcceptInvitationPage({ invitationId, onSuccess }: AcceptInvitationPageProps) {
  const { signIn, signUp, session } = useAuth();
  
  // UI state
  const [isSignUp, setIsSignUp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Invitation state
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [invitationLoading, setInvitationLoading] = useState(true);
  const [invitationError, setInvitationError] = useState<string | null>(null);
  
  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Load invitation details
  useEffect(() => {
    loadInvitation();
  }, [invitationId]);

  // Auto-accept invitation if user is already logged in
  useEffect(() => {
    if (session && invitation) {
      handleAutoAccept();
    }
  }, [session, invitation]);

  const loadInvitation = async () => {
    setInvitationLoading(true);
    setInvitationError(null);

    try {
      const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${baseURL}/api/invitations/${invitationId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load invitation');
      }

      setInvitation(data.invitation);
      // Pre-fill email field
      setEmail(data.invitation.email);
    } catch (err: any) {
      setInvitationError(err.message || 'Failed to load invitation');
    } finally {
      setInvitationLoading(false);
    }
  };

  const handleAutoAccept = async () => {
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
  };

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
      
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
      setIsLoading(false);
    }
  };

  const acceptInvitation = async () => {
    if (!invitation) return;

    setIsLoading(true);
    setError(null);

    try {
      const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${baseURL}/api/invitations/${invitationId}/accept`, {
        method: 'POST',
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to accept invitation');
      }

      setSuccess(`Successfully joined ${invitation.organization.name}!`);
      
      // Wait a moment before calling onSuccess
      setTimeout(() => {
        onSuccess?.();
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to accept invitation');
    } finally {
      setIsLoading(false);
    }
  };

  const rejectInvitation = async () => {
    if (!invitation || !confirm('Are you sure you want to decline this invitation?')) return;

    setIsLoading(true);

    try {
      const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${baseURL}/api/invitations/${invitationId}/reject`, {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reject invitation');
      }

      setSuccess('Invitation declined');
      
      setTimeout(() => {
        onSuccess?.();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to reject invitation');
    } finally {
      setIsLoading(false);
    }
  };

  // Loading invitation
  if (invitationLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading invitation...</p>
        </div>
      </div>
    );
  }

  // Invitation error
  if (invitationError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
        <div className="w-full max-w-md">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 text-center">
            <div className="text-6xl mb-4">❌</div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Invitation Not Found
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {invitationError}
            </p>
            <button
              onClick={onSuccess}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 dark:from-gray-900 dark:to-gray-800 p-4">
        <div className="w-full max-w-md">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 text-center">
            <div className="text-6xl mb-4">🎉</div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Welcome to {invitation.organization.name}!
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              You've successfully joined as a <strong>{invitation.role}</strong>.
            </p>
            <div className="flex justify-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
            </div>
            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
              Redirecting you now...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="w-full max-w-md">
        {/* Invitation Card */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl shadow-xl p-6 mb-6 text-white">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              {invitation.organization.logo ? (
                <img
                  src={invitation.organization.logo}
                  alt={invitation.organization.name}
                  className="w-16 h-16 rounded-lg bg-white/20"
                />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-white/20 flex items-center justify-center text-2xl font-bold">
                  {invitation.organization.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-medium text-blue-100 mb-1">You're invited to join</h2>
              <h1 className="text-xl font-bold mb-2 truncate">{invitation.organization.name}</h1>
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="px-2 py-1 bg-white/20 rounded">
                  Role: <strong>{invitation.role}</strong>
                </span>
                <span className="px-2 py-1 bg-white/20 rounded truncate max-w-full">
                  By: {invitation.inviter.name || invitation.inviter.email}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Login/Signup Form */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
          {/* Header */}
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {isSignUp ? 'Create Account' : 'Sign In'}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {isSignUp 
                ? `Sign up with ${invitation.email} to accept the invitation`
                : `Sign in to accept your invitation to ${invitation.organization.name}`
              }
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <p className="text-sm text-green-800 dark:text-green-200">{success}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name field (only for sign up) */}
            {isSignUp && (
              <div>
                <label
                  htmlFor="name"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Full Name
                </label>
                <input
                  id="name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white transition-colors"
                  placeholder="John Doe"
                />
              </div>
            )}

            {/* Email field (pre-filled and readonly) */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                readOnly
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 cursor-not-allowed"
                title="Email is fixed to match the invitation"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                You must use this email to accept the invitation
              </p>
            </div>

            {/* Password field */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white transition-colors"
                placeholder="••••••••"
                minLength={8}
              />
              {isSignUp && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Must be at least 8 characters
                </p>
              )}
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span className="flex items-center justify-center">
                  <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  {isSignUp ? 'Creating account & accepting...' : 'Signing in & accepting...'}
                </span>
              ) : (
                `${isSignUp ? 'Sign Up' : 'Sign In'} & Accept Invitation`
              )}
            </button>
          </form>

          {/* Toggle between sign in and sign up */}
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError(null);
              }}
              className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
            >
              {isSignUp
                ? 'Already have an account? Sign in'
                : "Don't have an account? Sign up"}
            </button>
          </div>

          {/* Decline invitation */}
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700 text-center">
            <button
              type="button"
              onClick={rejectInvitation}
              disabled={isLoading}
              className="text-sm text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Decline invitation
            </button>
          </div>
        </div>

        {/* Expiry notice */}
        <p className="mt-4 text-center text-xs text-gray-500 dark:text-gray-400">
          This invitation expires on {new Date(invitation.expiresAt).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}

