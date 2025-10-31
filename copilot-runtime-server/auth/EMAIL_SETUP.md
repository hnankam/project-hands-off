# Email Invitation Setup

This document explains how to configure email sending for organization invitations.

## Quick Start (Development)

By default, invitations are logged to the console in development mode. No setup required!

## Production Setup

Choose one of the following email providers:

### Option 1: Resend (Recommended)

1. Sign up at [resend.com](https://resend.com)
2. Get your API key
3. Install the package:
   ```bash
   npm install resend
   ```
4. Set environment variables in `.env`:
   ```env
   EMAIL_PROVIDER=resend
   RESEND_API_KEY=re_xxxxxxxxxxxxx
   EMAIL_FROM=noreply@yourdomain.com
   EMAIL_FROM_NAME="Your App Name"
   FRONTEND_URL=https://yourapp.com
   ```

### Option 2: SendGrid

1. Sign up at [sendgrid.com](https://sendgrid.com)
2. Get your API key
3. Install the package:
   ```bash
   npm install @sendgrid/mail
   ```
4. Set environment variables in `.env`:
   ```env
   EMAIL_PROVIDER=sendgrid
   SENDGRID_API_KEY=SG.xxxxxxxxxxxxx
   EMAIL_FROM=noreply@yourdomain.com
   EMAIL_FROM_NAME="Your App Name"
   FRONTEND_URL=https://yourapp.com
   ```

### Option 3: AWS SES

1. Set up AWS SES and verify your domain
2. Get your AWS credentials
3. Install the package:
   ```bash
   npm install @aws-sdk/client-ses
   ```
4. Set environment variables in `.env`:
   ```env
   EMAIL_PROVIDER=ses
   AWS_ACCESS_KEY_ID=AKIA...
   AWS_SECRET_ACCESS_KEY=...
   AWS_REGION=us-east-1
   EMAIL_FROM=noreply@yourdomain.com
   EMAIL_FROM_NAME="Your App Name"
   FRONTEND_URL=https://yourapp.com
   ```

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `EMAIL_PROVIDER` | Email service to use | No | `console` |
| `EMAIL_FROM` | Sender email address | Yes (production) | `noreply@yourapp.com` |
| `EMAIL_FROM_NAME` | Sender display name | No | `Your App` |
| `FRONTEND_URL` | Frontend URL for invitation links | Yes (production) | `http://localhost:3000` |
| `RESEND_API_KEY` | Resend API key | Yes (if using Resend) | - |
| `SENDGRID_API_KEY` | SendGrid API key | Yes (if using SendGrid) | - |
| `AWS_ACCESS_KEY_ID` | AWS access key | Yes (if using SES) | - |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | Yes (if using SES) | - |
| `AWS_REGION` | AWS region | Yes (if using SES) | `us-east-1` |

## Customizing Email Templates

Edit `/auth/email.js` to customize the email HTML and text content.

The invitation email includes:
- Organization name
- Inviter's name
- Clickable invitation link
- Plain text fallback

## Testing

1. **Development Mode**: Emails are logged to the console
   ```env
   EMAIL_PROVIDER=console
   ```

2. **Production Testing**: Use your email service's test/sandbox mode

## Troubleshooting

### Emails not being sent

1. Check server logs for errors
2. Verify environment variables are set correctly
3. Check email provider API credentials
4. Verify sender email is authorized with your provider

### Invitation link not working

1. Verify `FRONTEND_URL` is set correctly
2. Check that your frontend has an accept-invitation route
3. Ensure invitation ID is being passed correctly

### "From: undefined" in logs

This will be fixed when you restart the server after updating the code. The data structure from Better Auth will be logged and we can adjust the mapping if needed.

