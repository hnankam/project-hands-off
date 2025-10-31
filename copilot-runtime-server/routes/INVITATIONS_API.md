# Invitations API

Custom endpoints for managing organization invitations in the browser extension.

## Base URL

```
http://localhost:3001/api/invitations
```

## Endpoints

### 1. Get Invitation Details

Get details about a specific invitation by ID.

```http
GET /api/invitations/:invitationId
```

**Parameters:**
- `invitationId` (path) - The invitation ID from the email link

**Response:**
```json
{
  "success": true,
  "invitation": {
    "id": "inv_123",
    "email": "user@example.com",
    "role": "member",
    "status": "pending",
    "organization": {
      "id": "org_123",
      "name": "Acme Corp",
      "slug": "acme-corp",
      "logo": null
    },
    "inviter": {
      "email": "admin@acme.com",
      "name": "Admin User"
    },
    "expiresAt": "2024-01-15T00:00:00Z",
    "createdAt": "2024-01-01T00:00:00Z"
  }
}
```

**Error Responses:**

404 - Invitation not found:
```json
{
  "success": false,
  "error": "Invitation not found"
}
```

410 - Invitation expired:
```json
{
  "success": false,
  "error": "Invitation has expired",
  "invitation": {
    "id": "inv_123",
    "status": "expired",
    "organizationName": "Acme Corp"
  }
}
```

410 - Invitation already used:
```json
{
  "success": false,
  "error": "Invitation has already been used",
  "invitation": {
    "id": "inv_123",
    "status": "accepted",
    "organizationName": "Acme Corp"
  }
}
```

---

### 2. Accept Invitation

Accept an organization invitation. User must be authenticated.

```http
POST /api/invitations/:invitationId/accept
```

**Authentication:**
- Requires valid session cookie (`better_auth.session_token`)
- The authenticated user's email must match the invitation email

**Parameters:**
- `invitationId` (path) - The invitation ID to accept

**Response:**
```json
{
  "success": true,
  "message": "Invitation accepted successfully",
  "organization": {
    "id": "org_123",
    "role": "member"
  }
}
```

**Error Responses:**

401 - Not authenticated:
```json
{
  "success": false,
  "error": "You must be logged in to accept an invitation"
}
```

403 - Email mismatch:
```json
{
  "success": false,
  "error": "This invitation is for a different email address",
  "expected": "user@example.com",
  "actual": "different@example.com"
}
```

404 - Invitation not found:
```json
{
  "success": false,
  "error": "Invitation not found"
}
```

410 - Invitation expired or used:
```json
{
  "success": false,
  "error": "Invitation has expired"
}
```

---

### 3. Reject Invitation

Reject an organization invitation.

```http
POST /api/invitations/:invitationId/reject
```

**Parameters:**
- `invitationId` (path) - The invitation ID to reject

**Response:**
```json
{
  "success": true,
  "message": "Invitation rejected successfully"
}
```

**Error Responses:**

404 - Invitation not found:
```json
{
  "success": false,
  "error": "Invitation not found"
}
```

410 - Already processed:
```json
{
  "success": false,
  "error": "Invitation has already been processed",
  "status": "accepted"
}
```

---

### 4. Get User's Pending Invitations

Get all pending invitations for a user's email address.

```http
GET /api/invitations/user/:email
```

**Parameters:**
- `email` (path) - The user's email address

**Response:**
```json
{
  "success": true,
  "invitations": [
    {
      "id": "inv_123",
      "email": "user@example.com",
      "role": "member",
      "organization": {
        "id": "org_123",
        "name": "Acme Corp",
        "slug": "acme-corp",
        "logo": null
      },
      "inviter": {
        "email": "admin@acme.com",
        "name": "Admin User"
      },
      "expiresAt": "2024-01-15T00:00:00Z",
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ],
  "count": 1
}
```

## Integration with Browser Extension

### Flow 1: Accept Invitation from Email

1. User receives email with invitation link: `https://yourapp.com/accept-invitation/{invitationId}`
2. Extension intercepts the route or provides a UI
3. Extension calls `GET /api/invitations/:invitationId` to get details
4. Extension shows invitation details to user
5. If user accepts, call `POST /api/invitations/:invitationId/accept`
6. Extension redirects to organization page

### Flow 2: Show Pending Invitations on Login

1. User logs in to extension
2. Extension calls `GET /api/invitations/user/{email}` with user's email
3. Extension shows badge or notification if invitations exist
4. User can accept/reject from within extension

### Flow 3: Reject Invitation

1. User views invitation details
2. User clicks "Reject" button
3. Extension calls `POST /api/invitations/:invitationId/reject`
4. Invitation is marked as rejected

## Example: Extension Code

```typescript
// Get invitation details
async function getInvitationDetails(invitationId: string) {
  const response = await fetch(
    `http://localhost:3001/api/invitations/${invitationId}`
  );
  return response.json();
}

// Accept invitation
async function acceptInvitation(invitationId: string) {
  const response = await fetch(
    `http://localhost:3001/api/invitations/${invitationId}/accept`,
    {
      method: 'POST',
      credentials: 'include', // Important: include cookies
    }
  );
  return response.json();
}

// Reject invitation
async function rejectInvitation(invitationId: string) {
  const response = await fetch(
    `http://localhost:3001/api/invitations/${invitationId}/reject`,
    {
      method: 'POST',
    }
  );
  return response.json();
}

// Get user's pending invitations
async function getPendingInvitations(email: string) {
  const response = await fetch(
    `http://localhost:3001/api/invitations/user/${encodeURIComponent(email)}`
  );
  return response.json();
}
```

## Security Considerations

1. **Email Verification**: The accept endpoint verifies that the logged-in user's email matches the invitation email
2. **Expiration**: Invitations have an expiration date that is checked before acceptance
3. **Single Use**: Invitations can only be accepted once
4. **Authentication**: Accepting requires a valid session
5. **Rejection**: Anyone with the invitation ID can reject (useful for spam prevention)

## Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Human readable error message",
  "message": "Technical error details (optional)"
}
```

Always check the `success` field to determine if the request succeeded.

