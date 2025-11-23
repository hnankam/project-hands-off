/**
 * Email Service for Organization Invitations
 * 
 * This module handles sending invitation emails to users.
 * Configure your email provider in the environment variables.
 */

import { config } from 'dotenv';
config();

// Email configuration
const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || 'console'; // 'console', 'resend', 'sendgrid', 'ses'
const EMAIL_FROM = process.env.EMAIL_FROM || 'onboarding@handsoff.dev';
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || 'Hands-Off';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3001';

// Validate email provider configuration
const VALID_PROVIDERS = ['console', 'resend', 'sendgrid', 'ses'];
if (!VALID_PROVIDERS.includes(EMAIL_PROVIDER)) {
  console.warn(`Invalid EMAIL_PROVIDER: ${EMAIL_PROVIDER}. Falling back to 'console'.`);
}

/**
 * Generate email content for organization invitation
 */
function generateInvitationEmail(email, organization, inviter, invitationLink) {
  const inviterName = inviter.user?.name || inviter.email;
  const subject = `You've been invited to join ${organization.name}`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .container {
          background-color: #f9f9f9;
          border-radius: 8px;
          padding: 30px;
          margin: 20px 0;
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
        }
        .button {
          display: inline-block;
          padding: 12px 30px;
          background-color: #2563eb;
          color: white !important;
          text-decoration: none;
          border-radius: 6px;
          font-weight: 600;
          margin: 20px 0;
        }
        .button:hover {
          background-color: #1d4ed8;
        }
        .footer {
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
          font-size: 12px;
          color: #6b7280;
          text-align: center;
        }
        .code {
          background-color: #f3f4f6;
          padding: 2px 6px;
          border-radius: 4px;
          font-family: monospace;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎉 You're Invited!</h1>
        </div>
        
        <p>Hi there,</p>
        
        <p>
          <strong>${inviterName}</strong> has invited you to join 
          <strong>${organization.name}</strong>.
        </p>
        
        <p>
          Click the button below to accept the invitation and get started:
        </p>
        
        <div style="text-align: center;">
          <a href="${invitationLink}" class="button">Accept Invitation</a>
        </div>
        
        <p style="font-size: 14px; color: #6b7280;">
          Or copy and paste this link in your browser:<br>
          <span class="code">${invitationLink}</span>
        </p>
        
        <div class="footer">
          <p>
            This invitation was sent to ${email}.<br>
            If you didn't expect this invitation, you can safely ignore this email.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  const text = `
You've been invited to join ${organization.name}!

${inviterName} has invited you to collaborate.

Accept your invitation by visiting:
${invitationLink}

If you didn't expect this invitation, you can safely ignore this email.
  `.trim();
  
  return { subject, html, text };
}

/**
 * Send organization invitation email
 * @param {Object} data - Invitation data from Better Auth
 * @param {string} data.email - Recipient email address
 * @param {Object} data.organization - Organization details
 * @param {string} data.organization.name - Organization name
 * @param {Object} data.inviter - Inviter details
 * @param {string} data.inviter.email - Inviter email
 * @param {string} data.inviter.user.name - Inviter name
 * @param {string} data.id - Invitation ID
 */
export async function sendOrganizationInvitation(data) {
  const { email, organization, inviter, id } = data;
  
  if (!email || !organization?.name || !id) {
    throw new Error('Missing required invitation data: email, organization.name, or id');
  }
  
  // Construct the invitation link
  const invitationLink = `${FRONTEND_URL}/accept-invitation/${id}`;
  
  // Generate email content
  const { subject, html, text } = generateInvitationEmail(email, organization, inviter, invitationLink);
  const inviterName = inviter.user?.name || inviter.email;

  try {
    switch (EMAIL_PROVIDER) {
      case 'resend':
        await sendWithResend(email, subject, html, text);
        break;
      
      case 'sendgrid':
        await sendWithSendGrid(email, subject, html, text);
        break;
      
      case 'ses':
        await sendWithSES(email, subject, html, text);
        break;
      
      case 'console':
      default:
        // Development mode - log to console
        logInvitationToConsole(email, inviterName, organization.name, subject, invitationLink);
        break;
    }
    
    return { success: true };
  } catch (error) {
    console.error('Failed to send invitation email:', error);
    throw error;
  }
}

/**
 * Log invitation email to console (development mode)
 */
function logInvitationToConsole(to, from, orgName, subject, link) {
  console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║                      INVITATION EMAIL (Dev Mode)                           ║
╠════════════════════════════════════════════════════════════════════════════╣
║ To: ${to.padEnd(70)}║
║ From: ${from.padEnd(67)}║
║ Organization: ${orgName.padEnd(59)}║
╠════════════════════════════════════════════════════════════════════════════╣
║ Subject: ${subject.padEnd(64)}║
╠════════════════════════════════════════════════════════════════════════════╣
║                                                                            ║
║ Click to accept invitation:                                                ║
║ ${link.padEnd(74)}║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝
  `);
}

/**
 * Send email using Resend
 * Install: npm install resend
 * Set: EMAIL_PROVIDER=resend, RESEND_API_KEY=your_key
 */
async function sendWithResend(to, subject, html, text) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY environment variable is required for Resend provider');
  }
  
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  
  const emailData = {
    from: `${EMAIL_FROM_NAME} <${EMAIL_FROM}>`,
    to,
    subject,
    html,
    text,
  };
  
  const response = await resend.emails.send(emailData);
  
  // Check for errors in the response
  if (response.error) {
    throw new Error(`Resend API Error: ${response.error.message} (${response.error.name})`);
  }
  
  return response;
}

/**
 * Send email using SendGrid
 * Install: npm install @sendgrid/mail
 * Set: EMAIL_PROVIDER=sendgrid, SENDGRID_API_KEY=your_key
 */
async function sendWithSendGrid(to, subject, html, text) {
  if (!process.env.SENDGRID_API_KEY) {
    throw new Error('SENDGRID_API_KEY environment variable is required for SendGrid provider');
  }
  
  const sgMail = await import('@sendgrid/mail');
  sgMail.default.setApiKey(process.env.SENDGRID_API_KEY);
  
  await sgMail.default.send({
    from: {
      email: EMAIL_FROM,
      name: EMAIL_FROM_NAME,
    },
    to,
    subject,
    html,
    text,
  });
}

/**
 * Send email using AWS SES
 * Install: npm install @aws-sdk/client-ses
 * Set: EMAIL_PROVIDER=ses, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
 */
async function sendWithSES(to, subject, html, text) {
  const { SESClient, SendEmailCommand } = await import('@aws-sdk/client-ses');
  
  const client = new SESClient({
    region: process.env.AWS_REGION || 'us-east-1',
  });
  
  const command = new SendEmailCommand({
    Source: `${EMAIL_FROM_NAME} <${EMAIL_FROM}>`,
    Destination: {
      ToAddresses: [to],
    },
    Message: {
      Subject: {
        Data: subject,
      },
      Body: {
        Html: {
          Data: html,
        },
        Text: {
          Data: text,
        },
      },
    },
  });
  
  await client.send(command);
}

