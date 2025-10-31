/**
 * User Menu Component
 * 
 * Displays user info, organization selector, and logout button.
 */

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import OrganizationSelector from './OrganizationSelector';
import TeamManager from './TeamManager';
import OrganizationSettings from './OrganizationSettings';

interface UserMenuProps {
  isLight: boolean;
}

export default function UserMenu({ isLight }: UserMenuProps) {
  const { user, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<'teams' | 'settings' | null>(null);

  if (!user) return null;

  const handleSignOut = async () => {
    await signOut();
    setIsOpen(false);
  };

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors ${
            isLight
              ? 'hover:bg-gray-100 text-gray-700'
              : 'hover:bg-gray-700 text-gray-200'
          }`}
          title={user.email}
        >
          {/* User avatar */}
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-semibold">
            {user.name?.charAt(0).toUpperCase() || user.email.charAt(0).toUpperCase()}
          </div>
          {/* Chevron */}
          <svg
            className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Dropdown Menu */}
        {isOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            
            {/* Menu */}
            <div
              className={`absolute right-0 top-full mt-2 w-64 rounded-lg shadow-lg border z-50 ${
                isLight
                  ? 'bg-white border-gray-200'
                  : 'bg-gray-800 border-gray-700'
              }`}
            >
              {/* User Info */}
              <div className={`px-4 py-3 border-b ${isLight ? 'border-gray-200' : 'border-gray-700'}`}>
                <p className={`text-sm font-medium ${isLight ? 'text-gray-900' : 'text-white'}`}>
                  {user.name}
                </p>
                <p className={`text-xs ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>
                  {user.email}
                </p>
              </div>

              {/* Organization Selector */}
              <div className={`px-2 py-2 border-b ${isLight ? 'border-gray-200' : 'border-gray-700'}`}>
                <OrganizationSelector />
              </div>

              {/* Menu Items */}
              <div className="py-1">
                <button
                  onClick={() => {
                    setActiveModal('teams');
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center gap-2 ${
                    isLight
                      ? 'hover:bg-gray-50 text-gray-700'
                      : 'hover:bg-gray-700 text-gray-200'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                  </svg>
                  Teams
                </button>

                <button
                  onClick={() => {
                    setActiveModal('settings');
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center gap-2 ${
                    isLight
                      ? 'hover:bg-gray-50 text-gray-700'
                      : 'hover:bg-gray-700 text-gray-200'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Organization Settings
                </button>
              </div>

              {/* Sign Out */}
              <div className={`border-t ${isLight ? 'border-gray-200' : 'border-gray-700'}`}>
                <button
                  onClick={handleSignOut}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center gap-2 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 ${
                    isLight ? 'hover:bg-gray-50' : 'hover:bg-gray-700'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                  Sign Out
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      {activeModal === 'teams' && (
        <Modal isLight={isLight} onClose={() => setActiveModal(null)}>
          <TeamManager />
        </Modal>
      )}

      {activeModal === 'settings' && (
        <Modal isLight={isLight} onClose={() => setActiveModal(null)}>
          <OrganizationSettings />
        </Modal>
      )}
    </>
  );
}

interface ModalProps {
  isLight: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

function Modal({ isLight, onClose, children }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div
        className={`relative w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-xl shadow-2xl ${
          isLight
            ? 'bg-white border border-gray-200'
            : 'bg-gray-800 border border-gray-700'
        }`}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className={`absolute top-4 right-4 p-2 rounded-lg transition-colors ${
            isLight
              ? 'hover:bg-gray-100 text-gray-500'
              : 'hover:bg-gray-700 text-gray-400'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {children}
      </div>
    </div>
  );
}

