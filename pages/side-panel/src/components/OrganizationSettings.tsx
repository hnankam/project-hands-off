/**
 * Organization Settings Component
 * 
 * Manage organization settings, members, and invitations.
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { authClient } from '../lib/auth-client';

interface Member {
  id: string;
  userId: string;
  email: string;
  role: string[];
  createdAt: string;
}

interface Invitation {
  id: string;
  email: string;
  role: string[];
  status: string;
  expiresAt: string;
}

export default function OrganizationSettings() {
  const { organization, member } = useAuth();
  const [activeTab, setActiveTab] = useState<'members' | 'invitations'>('members');
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);

  useEffect(() => {
    if (organization) {
      loadMembers();
      loadInvitations();
    }
  }, [organization]);

  const loadMembers = async () => {
    if (!organization) return;

    try {
      setIsLoading(true);
      const result = await authClient.organization.listMembers({
        query: {
          organizationId: organization.id,
        },
      });

      if (result.data) {
        const raw = result.data as any;
        const list = Array.isArray(raw)
          ? raw
          : Array.isArray(raw?.members)
          ? raw.members
          : Array.isArray(raw?.items)
          ? raw.items
          : [];
        setMembers(list as Member[]);
      } else {
        setMembers([]);
      }
    } catch (error) {
      console.error('Error loading members:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadInvitations = async () => {
    if (!organization) return;

    try {
      const result = await authClient.organization.listInvitations({
        query: {
          organizationId: organization.id,
        },
      });

      if (result.data) {
        const raw = result.data as any;
        const list = Array.isArray(raw)
          ? raw
          : Array.isArray(raw?.invitations)
          ? raw.invitations
          : Array.isArray(raw?.items)
          ? raw.items
          : [];
        setInvitations(list as Invitation[]);
      } else {
        setInvitations([]);
      }
    } catch (error) {
      console.error('Error loading invitations:', error);
    }
  };

  const memberRoles = Array.isArray(member?.role) ? member.role : member?.role ? [member.role] : [];
  const isAdmin = memberRoles.includes('admin') || memberRoles.includes('owner');

  if (!organization) {
    return (
      <div className="p-4 text-center text-gray-500 dark:text-gray-400">
        Select an organization to manage settings
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          {organization.name}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">{organization.slug}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-gray-200 dark:border-gray-700 mb-4">
        <button
          onClick={() => setActiveTab('members')}
          className={`pb-2 px-1 text-sm font-medium transition-colors ${
            activeTab === 'members'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          }`}
        >
          Members
        </button>
        <button
          onClick={() => setActiveTab('invitations')}
          className={`pb-2 px-1 text-sm font-medium transition-colors ${
            activeTab === 'invitations'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          }`}
        >
          Invitations
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'members' ? (
        <div>
          {isAdmin && (
            <button
              onClick={() => setShowInviteModal(true)}
              className="mb-4 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
            >
              Invite Member
            </button>
          )}

          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full"></div>
            </div>
          ) : (
            <div className="space-y-2">
              {members.map((m) => {
                const roles = Array.isArray(m.role) ? m.role : [m.role].filter(Boolean);
                return (
                  <div
                    key={m.id}
                    className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg flex items-center justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {m.email}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {roles.join(', ')}
                      </p>
                    </div>
                    {isAdmin && !roles.includes('owner') && (
                      <button className="text-xs text-red-600 hover:text-red-700 dark:text-red-400">
                        Remove
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {invitations.length === 0 ? (
            <p className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
              No pending invitations
            </p>
          ) : (
            invitations.map((inv) => {
              const roles = Array.isArray(inv.role) ? inv.role : [inv.role].filter(Boolean);
              return (
                <div
                  key={inv.id}
                  className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {inv.email}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {inv.status} • {roles.join(', ')}
                    </p>
                  </div>
                  {isAdmin && inv.status === 'pending' && (
                    <button className="text-xs text-red-600 hover:text-red-700 dark:text-red-400">
                      Cancel
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {showInviteModal && (
        <InviteMemberModal
          organizationId={organization.id}
          onClose={() => setShowInviteModal(false)}
          onSuccess={() => {
            setShowInviteModal(false);
            loadInvitations();
          }}
        />
      )}
    </div>
  );
}

interface InviteMemberModalProps {
  organizationId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function InviteMemberModal({ organizationId, onClose, onSuccess }: InviteMemberModalProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Array<'member' | 'admin' | 'owner'>>(['member']);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const result = await authClient.organization.inviteMember({
        email,
        role,
        organizationId,
      });

      if (result.error) {
        setError(result.error.message || 'Failed to send invitation');
      } else {
        onSuccess();
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
          Invite Member
        </h2>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="[email protected]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Role
            </label>
            <select
              value={role[0]}
            onChange={(e) => setRole([e.target.value as 'member' | 'admin' | 'owner'])}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors disabled:cursor-not-allowed"
            >
              {isLoading ? 'Sending...' : 'Send Invitation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

