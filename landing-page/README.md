# Invitation Landing Page

This is a simple, standalone landing page that handles invitation acceptance for your browser extension.

## 🎯 Purpose

Email links **cannot directly open browser extensions**. This landing page:
1. Checks if the extension is installed
2. Shows invitation details
3. Opens the extension (if installed) or prompts to install

## 📋 Features

- ✅ Beautiful, responsive UI
- ✅ Detects if extension is installed
- ✅ Auto-opens extension when available
- ✅ Shows "Install Extension" prompt when needed
- ✅ Loads invitation details from your API
- ✅ Stores invitation ID for post-install flow
- ✅ Fully standalone (no build process required)

## 🚀 Quick Setup

### 1. Configure the Page

Open `accept-invitation.html` and update the `CONFIG` object at the top:

```javascript
const CONFIG = {
  // Your Chrome extension ID
  EXTENSION_ID: 'abcdefghijklmnopqrstuvwxyz123456',
  
  // Your Chrome Web Store URL
  WEBSTORE_URL: 'https://chrome.google.com/webstore/detail/YOUR_EXTENSION_ID',
  
  // Your backend API URL
  API_URL: 'http://localhost:3001',  // Change to your production URL
  
  // Your app name
  APP_NAME: 'Your App Name'
};
```

### 2. Deploy the Page

#### Option A: Static Hosting (Vercel, Netlify, GitHub Pages)

The page is a single HTML file - just deploy it!

**Vercel:**
```bash
npm install -g vercel
cd landing-page
vercel
```

**Netlify:**
Drag and drop the `landing-page` folder to Netlify dashboard.

**GitHub Pages:**
1. Push to GitHub
2. Enable GitHub Pages in repo settings
3. Set source to the `landing-page` folder

#### Option B: Custom Server (Node.js, Apache, Nginx)

Simply serve the HTML file at the `/accept-invitation/:id` route.

**Express Example:**
```javascript
app.get('/accept-invitation/:id', (req, res) => {
  res.sendFile(__dirname + '/landing-page/accept-invitation.html');
});
```

**Nginx Example:**
```nginx
location ~ ^/accept-invitation/(.+)$ {
  try_files /landing-page/accept-invitation.html =404;
}
```

### 3. Update Email Template

In `/copilot-runtime-server/auth/email.js`, the invitation link already uses:
```javascript
const invitationLink = `${FRONTEND_URL}/accept-invitation/${id}`;
```

Set your `FRONTEND_URL` environment variable to where you deployed this page:
```env
FRONTEND_URL=https://yourapp.com
```

### 4. Configure Extension

Add external messaging to your extension's `manifest.json`:

```json
{
  "externally_connectable": {
    "matches": [
      "https://yourapp.com/*",
      "https://*.yourapp.com/*"
    ]
  }
}
```

Add a message listener to your extension (background script or service worker):

```javascript
chrome.runtime.onMessageExternal.addListener(
  (request, sender, sendResponse) => {
    if (request.type === 'CHECK_INSTALLED') {
      sendResponse({ installed: true });
    }
    return true;
  }
);
```

## 🔄 Flow Diagram

```
User receives email
       ↓
Clicks invitation link
       ↓
Landing page loads (accept-invitation.html)
       ↓
Fetches invitation details from API
       ↓
    ┌──────────────────┐
    │ Extension check  │
    └─────┬────────┬───┘
          │        │
    Installed   Not Installed
          │        │
          ↓        ↓
    Opens     Shows install
    Extension  prompt
          │        │
          ↓        └─→ User installs
    Accept page        │
                       ↓
                   User logs in
                       │
                       ↓
                   Auto-detects
                   pending invitation
```

## 🎨 Customization

### Change Colors

Update the CSS in `<style>` section:

```css
body {
  background: linear-gradient(135deg, #YOUR_COLOR_1 0%, #YOUR_COLOR_2 100%);
}

.button {
  background: #YOUR_PRIMARY_COLOR;
}
```

### Add Logo

Add your logo to the page:

```html
<div class="container">
  <img src="your-logo.png" alt="Logo" style="width: 100px; margin-bottom: 20px;">
  <div id="app">
    ...
  </div>
</div>
```

### Change Layout

The page is fully self-contained - edit the HTML directly to customize.

## 🧪 Testing

### Test Locally

1. Open `accept-invitation.html` in a browser
2. Add `?test=inv_123` to URL to simulate an invitation ID
3. Check browser console for messages

### Test with Backend

1. Start your backend server
2. Send a real invitation from the admin panel
3. Copy the invitation ID from the email/console
4. Visit: `http://localhost:8000/accept-invitation/{invitationId}`

### Test Extension Detection

1. Install your extension
2. Open the landing page
3. Should auto-detect and show "Open Extension" button

## 🔧 Troubleshooting

### "Failed to load invitation"
- Check that `API_URL` is correct
- Verify invitation ID is valid
- Check CORS settings on your backend

### Extension not detected
- Verify `EXTENSION_ID` is correct
- Check `externally_connectable` in manifest.json
- Ensure extension is installed and enabled
- Check browser console for errors

### Extension doesn't open
- Chrome security may block auto-opening
- User may need to click "Open Extension" button
- Verify extension URL format is correct

## 🌐 Production Checklist

- [ ] Update `EXTENSION_ID` in CONFIG
- [ ] Update `WEBSTORE_URL` in CONFIG
- [ ] Update `API_URL` to production URL
- [ ] Update `APP_NAME` to your app name
- [ ] Deploy to production hosting
- [ ] Update `FRONTEND_URL` in backend `.env`
- [ ] Test end-to-end flow
- [ ] Enable HTTPS (required for extension messaging)
- [ ] Test with real invitation emails
- [ ] Add analytics tracking (optional)

## 📱 Mobile/Other Browsers

This page is designed for Chrome extensions. For other browsers:
- Show a message: "This feature requires Chrome"
- Provide alternative: "Use our web app instead"
- Or build browser-specific versions

## 🔐 Security Notes

- No sensitive data is stored in the landing page
- Invitation validation happens on the backend
- Extension messaging uses Chrome's secure messaging API
- Always use HTTPS in production

## 📚 Related Documentation

- [INVITATION_SYSTEM.md](../INVITATION_SYSTEM.md) - Complete system overview
- [INVITATIONS_API.md](../copilot-runtime-server/routes/INVITATIONS_API.md) - API reference
- [EMAIL_SETUP.md](../copilot-runtime-server/auth/EMAIL_SETUP.md) - Email configuration

---

**Questions?** Check the main documentation or create an issue!

