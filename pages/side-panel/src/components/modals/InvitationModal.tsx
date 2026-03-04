/**
 * @fileoverview Invitation Modal Component
 * 
 * Modal for entering and validating organization invitation IDs.
 * Validates the invitation ID against the API before proceeding.
 */

import * as React from 'react';
import { useState, useCallback } from 'react';
import { cn } from '@extension/ui';
import { Modal } from './Modal';
import { API_CONFIG } from '../../constants';

export interface InvitationModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  
  /** Called when the modal should close */
  onClose: () => void;
  
  /** Called when a valid invitation ID is submitted */
  onSubmit: (invitationId: string) => void;
  
  /** Light/dark theme */
  isLight: boolean;
  
  /** API base URL */
  apiBaseUrl?: string;
}

export const InvitationModal: React.FC<InvitationModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isLight,
  apiBaseUrl = API_CONFIG.BASE_URL,
}) => {
  const [invitationId, setInvitationId] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  
  // Reset state when modal closes
  const handleClose = useCallback(() => {
    setInvitationId('');
    setValidationError(null);
    setIsValidating(false);
    onClose();
  }, [onClose]);
  
  // Validate and submit invitation ID
  const handleSubmit = useCallback(async () => {
    const trimmedId = invitationId.trim();
    
    if (!trimmedId) return;
    
    setIsValidating(true);
    setValidationError(null);
    
    try {
      // Validate invitation by fetching it
      const response = await fetch(`${apiBaseUrl}/api/invitations/${trimmedId}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Invitation not found');
      }
      
      // Invitation is valid, proceed
      onSubmit(trimmedId);
      handleClose();
    } catch (err: any) {
      setValidationError(err.message || 'Failed to validate invitation');
    } finally {
      setIsValidating(false);
    }
  }, [invitationId, apiBaseUrl, onSubmit, handleClose]);
  
  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && invitationId.trim() && !isValidating) {
      handleSubmit();
    }
  };
  
  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Enter Invitation ID"
      isLight={isLight}
      disableEscapeKey={isValidating}
      disableBackdropClick={isValidating}
      footer={
        <>
          <button
            onClick={handleClose}
            disabled={isValidating}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              isLight
                ? 'bg-gray-200 hover:bg-gray-300'
                : 'bg-gray-700 hover:bg-gray-600',
              isValidating && 'opacity-50 cursor-not-allowed',
            )}
            style={{ color: isLight ? '#374151' : '#bcc1c7' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!invitationId.trim() || isValidating}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-2',
              'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {isValidating && (
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            )}
            {isValidating ? 'Validating...' : 'Continue'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {/* Error message */}
        {validationError && (
          <div
            className={cn(
              'flex items-start gap-3 rounded-md px-3 py-2.5 text-xs',
              isLight ? 'bg-red-50 text-red-700' : 'bg-red-900/20 text-red-300',
            )}
          >
            <svg className="h-4 w-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.5a.75.75 0 10-1.5 0v4a.75.75 0 001.5 0v-4zm0 6.5a.75.75 0 10-1.5 0 .75.75 0 001.5 0z"
                clipRule="evenodd"
              />
            </svg>
            <div className="flex-1">
              <p>{validationError}</p>
            </div>
            <button
              type="button"
              onClick={() => setValidationError(null)}
              className={cn(
                'rounded-md p-0.5 transition-colors',
                isLight ? 'text-red-500 hover:bg-red-100' : 'text-red-300 hover:bg-red-900/30',
              )}
              aria-label="Dismiss error"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        
        {/* Input field */}
        <div className="space-y-1">
          <label
            htmlFor="invitationId"
            className={cn(
              'block text-xs font-medium',
              isLight ? 'text-gray-700' : 'text-gray-300',
            )}
          >
            Invitation ID
          </label>
          <input
            id="invitationId"
            type="text"
            value={invitationId}
            onChange={(e) => setInvitationId(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter invitation ID"
            autoFocus
            disabled={isValidating}
            className={cn(
              'w-full px-2.5 py-1.5 text-sm border rounded-md outline-none focus:ring-1 focus:ring-blue-500 transition-colors',
              isLight ? 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-400' : 'bg-[#151C24] border-gray-600 text-white placeholder:text-gray-500',
              isValidating && 'opacity-60 cursor-not-allowed',
            )}
          />
          <p className={cn('text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
            Enter the invitation ID you received to join an organization
          </p>
        </div>
      </div>
    </Modal>
  );
};

