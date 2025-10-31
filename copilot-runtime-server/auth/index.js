/**
 * Better Auth Configuration
 * 
 * This file configures Better Auth with the organization plugin for
 * multi-tenant organization and team management.
 */

import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { defaultAc } from "better-auth/plugins/organization/access";
import { getPool } from '../config/database.js';
import { sendOrganizationInvitation } from './email.js';

/**
 * Initialize Better Auth with organization plugin
 * Uses the shared database pool to avoid connection conflicts
 */
export const auth = betterAuth({
  database: getPool(),
  
  // Email/password authentication
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // Set to true in production
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
  
  // Organization plugin configuration
  plugins: [
    organization({
      // Enable teams functionality
      teams: {
        enabled: true,
        maximumTeams: 10, // Optional: limit teams per organization
        allowRemovingAllTeams: false, // Optional: prevent removing the last team
      },
      
      // Debug: Log to confirm plugin is loaded
      ...(() => {
        console.log('🔧 Organization plugin loaded with team hooks');
        return {};
      })(),
      
      // Access control configuration - use statement-based AC
      ac: {
        ...defaultAc,
        statements: [
          // Allow organization owners and admins to list team members even if not in the team
          {
            action: "team:listMembers",
            effect: "allow",
            condition: async ({ session, organization }) => {
              console.log('[ACL Statement] team:listMembers check:', {
                sessionUser: session?.user?.id,
                orgId: organization?.id
              });
              
              // Get the organization member info for this user
              if (organization && session?.user) {
                try {
                  const pool = getPool();
                  const result = await pool.query(
                    'SELECT role FROM members WHERE organization_id = $1 AND user_id = $2',
                    [organization.id, session.user.id]
                  );
                  
                  if (result.rows.length > 0) {
                    const roles = Array.isArray(result.rows[0].role) ? result.rows[0].role : [result.rows[0].role];
                    console.log('[ACL Statement] User roles:', roles);
                    
                    if (roles.includes('owner') || roles.includes('admin')) {
                      console.log('[ACL Statement] ✅ Admin/Owner access granted');
                      return true;
                    }
                  }
                } catch (err) {
                  console.error('[ACL Statement] Error checking member role:', err);
                }
              }
              
              console.log('[ACL Statement] ❌ Not admin/owner or error occurred');
              return false;
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
          console.log(`User ${user.email} is creating organization: ${organization.name}`);
          
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
        
        // After creating an organization
        afterCreateOrganization: async ({ organization, member, user, context }) => {
          console.log(`Organization created: ${organization.name} (${organization.id})`);
          console.log(`Creator ${user.email} added as member with role: ${member.role}`);
          
          try {
            // Create a default team for the organization
            const defaultTeam = await context.adapter.create({
              model: 'team',
              data: {
                id: crypto.randomUUID(),
                name: 'Default Team',
                organizationId: organization.id,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            });
            
            console.log(`✅ Default team created: ${defaultTeam.name} (${defaultTeam.id})`);
            
            // Add the organization creator to the default team
            await context.adapter.create({
              model: 'teamMember',
              data: {
                id: crypto.randomUUID(),
                teamId: defaultTeam.id,
                userId: user.id,
                createdAt: new Date(),
              },
            });
            
            console.log(`✅ User ${user.email} added to default team`);
          } catch (error) {
            console.error('❌ Error creating default team or adding member:', error);
          }
        },
        
        // Before updating an organization
        beforeUpdateOrganization: async ({ organization, user, member }) => {
          console.log(`User ${user.email} is updating organization: ${organization.name}`);
          return { data: organization };
        },
        
        // After updating an organization
        afterUpdateOrganization: async ({ organization, user, member }) => {
          console.log(`Organization updated: ${organization.name}`);
        },
      },
      
      // Member hooks
      memberHooks: {
        // Before adding a member
        beforeAddMember: async ({ member, user, organization }) => {
          console.log(`Adding member to organization: ${organization.name}`);
          return { data: member };
        },
        
        // After adding a member
        afterAddMember: async ({ member, user, organization, context }) => {
          console.log(`Member added: ${member.email || member.userId} to ${organization.name}`);
          
          // Note: Team assignment is now handled by the invite process
          // The frontend must specify which team to add the member to
          // This ensures single-team membership is enforced at invitation time
        },
        
        // Before removing a member
        beforeRemoveMember: async ({ member, user, organization }) => {
          console.log(`Removing member from organization: ${organization.name}`);
          return { data: member };
        },
        
        // After removing a member
        afterRemoveMember: async ({ member, user, organization }) => {
          console.log(`Member removed from ${organization.name}`);
        },
      },
      
      // Invitation hooks
      invitationHooks: {
        // Before sending an invitation
        beforeSendInvitation: async ({ invitation, user, organization }) => {
          console.log(`Sending invitation to ${invitation.email} for ${organization.name}`);
          return { data: invitation };
        },
        
        // After sending an invitation
        afterSendInvitation: async ({ invitation, user, organization }) => {
          console.log(`Invitation sent to ${invitation.email}`);
          // Send invitation email here
        },
      },
      
      // Team hooks
      teamHooks: {
        // After creating a team
        afterCreateTeam: async ({ team, user, organization, context }) => {
          console.log(`Team created: ${team.name} (${team.id}) in ${organization.name}`);
          console.log(`Creator: ${user.email} (${user.id})`);
          
          try {
            // Automatically add the team creator as a team member
            await context.adapter.create({
              model: 'teamMember',
              data: {
                id: crypto.randomUUID(),
                teamId: team.id,
                userId: user.id,
                createdAt: new Date(),
              },
            });
            
            console.log(`✅ User ${user.email} automatically added to team ${team.name}`);
          } catch (error) {
            console.error('❌ Error adding creator to team:', error);
          }
        },
        
        // Before removing a team
        beforeRemoveTeam: async ({ team, user, organization }) => {
          console.log(`Removing team: ${team.name} from ${organization.name}`);
          return { data: team };
        },
        
        // After removing a team
        afterRemoveTeam: async ({ team, user, organization }) => {
          console.log(`Team ${team.name} removed from ${organization.name}`);
        },
      },
      
      // IMPORTANT: Do not override 'ac' and 'roles' with custom resource maps here.
      // We rely on Better Auth's built-in default access control and roles.
      
      // Send invitation email function
      sendInvitationEmail: async (data) => {
        // Log the data we receive from Better Auth for debugging
        console.log('📧 sendInvitationEmail called with data:', JSON.stringify(data, null, 2));
        
        try {
          // Call our email service
          await sendOrganizationInvitation(data);
          return { success: true };
        } catch (error) {
          console.error('❌ Failed to send invitation email:', error);
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

