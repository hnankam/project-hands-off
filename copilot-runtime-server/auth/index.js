/**
 * Better Auth Configuration
 * 
 * This file configures Better Auth with the organization plugin for
 * multi-tenant organization and team management.
 * 
 * Features:
 * - Email/password authentication
 * - Social login (Google, GitHub)
 * - Organization and team management
 * - Forgot password flow (email-based)
 * - Admin password reset capability
 */

import { betterAuth } from "better-auth";
import { organization, admin } from "better-auth/plugins";
import { defaultAc } from "better-auth/plugins/organization/access";
import { getPool } from '../config/database.js';
import { sendOrganizationInvitation, sendPasswordResetEmail } from './email.js';

// Helper to check if user is admin/owner in an organization
async function isAdminOrOwner(userId, organizationId) {
  try {
    const pool = getPool();
    const result = await pool.query(
      'SELECT role FROM member WHERE "organizationId" = $1 AND "userId" = $2',
      [organizationId, userId]
    );
    
    if (result.rows.length > 0) {
      const roles = Array.isArray(result.rows[0].role) ? result.rows[0].role : [result.rows[0].role];
      return roles.includes('owner') || roles.includes('admin');
    }
  } catch (err) {
    console.error('[Auth] Error checking member role:', err);
  }
  return false;
}

// Helper to create team member using direct database access
async function addUserToTeam(teamId, userId) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO "teamMember" (id, "teamId", "userId", "createdAt") VALUES ($1, $2, $3, $4)`,
    [crypto.randomUUID(), teamId, userId, new Date()]
  );
}

/**
 * Initialize Better Auth with organization plugin
 * Uses the shared database pool to avoid connection conflicts
 */
export const auth = betterAuth({
  database: getPool(),
  
  // Email/password authentication with forgot password support
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // Set to true in production
    
    // Forgot password configuration
    sendResetPassword: async ({ user, url, token }) => {
      // Generate our custom reset link that shows the instruction page
      const baseUrl = process.env.BETTER_AUTH_URL || process.env.BASE_URL || 'http://localhost:3001';
      const customResetLink = `${baseUrl}/api/auth/reset-password?token=${token}`;
      
      // Send password reset email with our custom link
      await sendPasswordResetEmail({
        email: user.email,
        name: user.name,
        resetLink: customResetLink,
        token,
      });
    },
    
    // Password reset token expiration (1 hour)
    resetPasswordTokenExpiresIn: 60 * 60, // 1 hour in seconds
  },
  
  // Social login providers
  socialProviders: {
    // Google OAuth
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      enabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    },
    // Microsoft OAuth (Azure AD / Microsoft Entra ID)
    microsoft: {
      clientId: process.env.MICROSOFT_CLIENT_ID || '',
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
      enabled: !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),
      // Optional: restrict to specific tenant (default: 'common' for multi-tenant)
      tenantId: process.env.MICROSOFT_TENANT_ID || 'common',
    },
    // GitHub OAuth
    github: {
      clientId: process.env.GITHUB_CLIENT_ID || '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
      enabled: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
    },
  },
  
  // Session configuration
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day (refresh session after 1 day of activity)
  },
  
  // Base URL for callbacks and redirects (uses BETTER_AUTH_URL env var)
  baseURL: process.env.BETTER_AUTH_URL || process.env.BASE_URL || "http://localhost:3001",
  
  // Trust proxy for production deployments
  trustedOrigins: process.env.CORS_ORIGINS ? 
    process.env.CORS_ORIGINS.split(',').map(o => o.trim()) : 
    [
      "http://localhost:3000",
      "chrome-extension://onppliipgpejpnnmafbljnkdigmofncb"
    ],
  
  // Advanced session options
  advanced: {
    cookiePrefix: "better_auth",
    crossSubDomainCookies: {
      enabled: false,
    },
    // Chrome extension compatible cookies
    useSecureCookies: false, // Set to false for localhost development
    generateSessionToken: () => {
      return crypto.randomUUID();
    },
    // Disable CSRF for Chrome extensions (they can't be subject to CSRF attacks)
    disableCSRFCheck: true,
  },
  
  // Plugins configuration
  plugins: [
    // Admin plugin for user management (password reset, etc.)
    admin({
      // Default role is 'user' - admins are managed via organization roles
      defaultRole: 'user',
    }),
    
    // Organization plugin for multi-tenant support
    organization({
      // Enable teams functionality
      teams: {
        enabled: true,
        maximumTeams: 100, // Optional: limit teams per organization
        allowRemovingAllTeams: false, // Optional: prevent removing the last team
      },
      
      // Access control configuration - use statement-based AC
      ac: {
        ...defaultAc,
        statements: [
          // Allow organization owners and admins to list team members even if not in the team
          {
            action: "team:listMembers",
            effect: "allow",
            condition: async ({ session, organization }) => {
              if (!organization || !session?.user) return false;
              return await isAdminOrOwner(session.user.id, organization.id);
            },
          },
        ],
      },
      
      // Allow users to create organizations
      allowUserToCreateOrganization: async (user) => {
        // By default, all authenticated users can create organizations
        // You can add custom logic here (e.g., check subscription plan)
        return true;
      },
      
      // Organization creation hooks
      organizationHooks: {
        // Before creating an organization
        beforeCreateOrganization: async ({ organization, user }) => {          
          // You can modify organization data here
          return {
            data: {
              ...organization,
              metadata: {
                ...organization.metadata,
                createdBy: user.id,
                createdAt: new Date().toISOString(),
              },
            },
          };
        },
        
        // Note: Better Auth automatically creates a team with the organization's name
        // and adds the creator to it when teams are enabled. No need for custom afterCreate hook.
        
        // Before updating an organization
        beforeUpdateOrganization: async ({ organization, user, member }) => {
          // console.log(`User ${user.email} is updating organization: ${organization.name}`);
          return { data: organization };
        },
        
        // After updating an organization
        afterUpdateOrganization: async ({ organization, user, member }) => {
          // console.log(`Organization updated: ${organization.name}`);
        },
      },
      
      // Member hooks
      memberHooks: {
        // Before adding a member
        beforeAddMember: async ({ member, user, organization }) => {
          return { data: member };
        },
        
        // After adding a member
        afterAddMember: async (params) => {
          const { member, user, organization } = params;          
          // Note: Team assignment is now handled by the invite process
          // The frontend must specify which team to add the member to
          // This ensures single-team membership is enforced at invitation time
        },
        
        // Before removing a member
        beforeRemoveMember: async ({ member, user, organization }) => {
          return { data: member };
        },
        
        // After removing a member
        afterRemoveMember: async ({ member, user, organization }) => {
        },
      },
      
      // Invitation hooks
      invitationHooks: {
        // Before sending an invitation
        beforeSendInvitation: async ({ invitation, user, organization }) => {
          return { data: invitation };
        },
        
        // After sending an invitation - email is sent via sendInvitationEmail below
        afterSendInvitation: async ({ invitation, user, organization }) => {
        },
      },
      
      // Team hooks
      teamHooks: {
        // After creating a team
        afterCreateTeam: async (params) => {
          const { team, user, organization } = params;
                    
          try {
            // Automatically add the team creator as a team member
            await addUserToTeam(team.id, user.id);
          } catch (error) {
            console.error('Error adding creator to team:', error);
          }
        },
        
        // Before removing a team
        beforeRemoveTeam: async ({ team, user, organization }) => {
          return { data: team };
        },
        
        // After removing a team
        afterRemoveTeam: async ({ team, user, organization }) => {
        },
      },
      
      // IMPORTANT: Do not override 'ac' and 'roles' with custom resource maps here.
      // We rely on Better Auth's built-in default access control and roles.
      
      // Send invitation email function
      sendInvitationEmail: async (data) => {
        
        try {
          await sendOrganizationInvitation(data);
          return { success: true };
        } catch (error) {
          console.error('Failed to send invitation email:', error.message);
          // Don't throw - we don't want to block the invitation creation
          return { success: false, error: error.message };
        }
      },
    }),
  ],
});

/**
 * Get the auth instance (for use in other modules)
 */
export default auth;

