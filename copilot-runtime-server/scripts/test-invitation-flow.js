#!/usr/bin/env node
/**
 * Test Invitation Flow
 * 
 * This script demonstrates how to interact with the invitation endpoints.
 * Run this after sending an invitation to test the flow.
 * 
 * Usage:
 *   node scripts/test-invitation-flow.js <invitationId>
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

async function testInvitationFlow(invitationId) {
  console.log('🧪 Testing Invitation Flow\n');
  console.log(`Invitation ID: ${invitationId}\n`);

  // Step 1: Get invitation details
  console.log('📋 Step 1: Getting invitation details...');
  try {
    const response = await fetch(`${BASE_URL}/api/invitations/${invitationId}`);
    const data = await response.json();
    
    if (!response.ok) {
      console.error('❌ Failed to get invitation:', data.error);
      return;
    }
    
    console.log('✅ Invitation found!');
    console.log(`   Email: ${data.invitation.email}`);
    console.log(`   Organization: ${data.invitation.organization.name}`);
    console.log(`   Role: ${data.invitation.role}`);
    console.log(`   Status: ${data.invitation.status}`);
    console.log(`   Expires: ${new Date(data.invitation.expiresAt).toLocaleString()}\n`);
    
    // Step 2: Test rejection (optional - uncomment to test)
    // console.log('🚫 Step 2: Testing rejection...');
    // const rejectResponse = await fetch(`${BASE_URL}/api/invitations/${invitationId}/reject`, {
    //   method: 'POST',
    // });
    // const rejectData = await rejectResponse.json();
    // console.log(rejectResponse.ok ? '✅ Invitation rejected!' : `❌ ${rejectData.error}\n`);
    
    // Step 3: Get user's pending invitations
    console.log('📬 Step 2: Getting all pending invitations for this user...');
    const userEmail = data.invitation.email;
    const userInvitationsResponse = await fetch(
      `${BASE_URL}/api/invitations/user/${encodeURIComponent(userEmail)}`
    );
    const userInvitationsData = await userInvitationsResponse.json();
    
    if (userInvitationsResponse.ok) {
      console.log(`✅ Found ${userInvitationsData.count} pending invitation(s)\n`);
      userInvitationsData.invitations.forEach((inv, index) => {
        console.log(`   ${index + 1}. ${inv.organization.name} (${inv.role})`);
      });
    } else {
      console.log(`❌ ${userInvitationsData.error}`);
    }
    
    console.log('\n📝 Next Steps:');
    console.log('   1. User must log in with the invited email address');
    console.log('   2. Call POST /api/invitations/:id/accept with session cookie');
    console.log('   3. User will be added to the organization');
    console.log('\n💡 Tip: Use the browser extension to complete the acceptance flow!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Get invitation ID from command line
const invitationId = process.argv[2];

if (!invitationId) {
  console.error('❌ Please provide an invitation ID');
  console.log('Usage: node scripts/test-invitation-flow.js <invitationId>');
  process.exit(1);
}

// Run the test
testInvitationFlow(invitationId);

