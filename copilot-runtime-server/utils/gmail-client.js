/**
 * Gmail API Client Utility
 * Handles Gmail API operations with OAuth2 authentication
 */

import fetch from 'node-fetch';

/**
 * Fetch user's Gmail emails
 * @param {string} accessToken - OAuth2 access token
 * @param {object} options - Query options
 * @returns {Promise<object>} List of emails
 */
export async function fetchGmailEmails(accessToken, options = {}) {
  const {
    maxResults = 50,
    query = '',
    pageToken = null,
  } = options;

  try {
    const params = new URLSearchParams({
      maxResults: maxResults.toString(),
    });
    
    if (query) params.append('q', query);
    if (pageToken) params.append('pageToken', pageToken);

    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gmail API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    
    // Fetch detailed info for each message using metadata format (lighter, avoids rate limits)
    if (data.messages && data.messages.length > 0) {
      const detailedMessages = await Promise.all(
        data.messages.map(msg => fetchGmailMessage(accessToken, msg.id, 'metadata'))
      );
      return {
        messages: detailedMessages.filter(m => m !== null),
        nextPageToken: data.nextPageToken,
        resultSizeEstimate: data.resultSizeEstimate,
      };
    }

    return {
      messages: [],
      nextPageToken: null,
      resultSizeEstimate: 0,
    };
  } catch (error) {
    console.error('[Gmail Client] Error fetching emails:', error);
    throw error;
  }
}

/**
 * Fetch all messages in a Gmail thread
 * @param {string} accessToken - OAuth2 access token
 * @param {string} threadId - Gmail thread ID
 * @returns {Promise<object>} Thread with all messages
 */
export async function fetchGmailThread(accessToken, threadId) {
  try {
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gmail API error: ${response.status} - ${error}`);
    }

    const thread = await response.json();
    
    // Process all messages in the thread
    const messages = (thread.messages || []).map(msg => {
      const headers = msg.payload?.headers || [];
      const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
      
      return {
        id: msg.id,
        threadId: msg.threadId,
        labelIds: msg.labelIds || [],
        subject: getHeader('Subject'),
        from: getHeader('From'),
        to: getHeader('To'),
        date: getHeader('Date'),
        messageId: getHeader('Message-ID'),
        snippet: msg.snippet || '',
        body: extractEmailBody(msg.payload),
        internalDate: msg.internalDate,
        sizeEstimate: msg.sizeEstimate,
      };
    });
    
    // Sort by date (oldest first for thread context)
    messages.sort((a, b) => parseInt(a.internalDate) - parseInt(b.internalDate));
    
    return {
      id: thread.id,
      snippet: thread.snippet,
      historyId: thread.historyId,
      messages,
      messageCount: messages.length,
    };
  } catch (error) {
    console.error('[Gmail Client] Error fetching thread:', error);
    throw error;
  }
}

/**
 * Fetch a single Gmail message by ID
 * @param {string} accessToken - OAuth2 access token
 * @param {string} messageId - Gmail message ID
 * @param {string} format - Format for the message (metadata, full)
 * @returns {Promise<object|null>} Message details
 */
export async function fetchGmailMessage(accessToken, messageId, format = 'full') {
  try {
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=${format}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error(`[Gmail Client] Error fetching message ${messageId}:`, error);
      return null;
    }

    const message = await response.json();
    
    // Extract useful fields
    const headers = message.payload?.headers || [];
    const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
    
    const subject = getHeader('Subject');
    const from = getHeader('From');
    const to = getHeader('To');
    const date = getHeader('Date');
    const messageId_header = getHeader('Message-ID');
    
    // Extract snippet and body (only if full format)
    let snippet = message.snippet || '';
    let body = format === 'full' ? extractEmailBody(message.payload) : '';
    
    return {
      id: message.id,
      threadId: message.threadId,
      labelIds: message.labelIds || [],
      subject,
      from,
      to,
      date,
      messageId: messageId_header,
      snippet,
      body,
      internalDate: message.internalDate,
      sizeEstimate: message.sizeEstimate,
    };
  } catch (error) {
    console.error('[Gmail Client] Error fetching message:', error);
    return null;
  }
}

/**
 * Extract email body from Gmail message payload
 * @param {object} payload - Gmail message payload
 * @returns {string} Email body text
 */
function extractEmailBody(payload) {
  if (!payload) return '';
  
  // Check if body data exists directly
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  
  // Check parts for text/plain or text/html
  if (payload.parts && payload.parts.length > 0) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    
    // Fallback to HTML if no plain text
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    
    // Check nested parts (multipart)
    for (const part of payload.parts) {
      if (part.parts) {
        const nestedBody = extractEmailBody(part);
        if (nestedBody) return nestedBody;
      }
    }
  }
  
  return '';
}

/**
 * Decode base64url encoded string
 * @param {string} str - Base64url encoded string
 * @returns {string} Decoded string
 */
function decodeBase64Url(str) {
  try {
    // Convert base64url to base64
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    // Pad with = if needed
    while (base64.length % 4) {
      base64 += '=';
    }
    return Buffer.from(base64, 'base64').toString('utf-8');
  } catch (error) {
    console.error('[Gmail Client] Error decoding base64:', error);
    return '';
  }
}

/**
 * Get user's Gmail profile
 * @param {string} accessToken - OAuth2 access token
 * @returns {Promise<object>} User profile
 */
export async function fetchGmailProfile(accessToken) {
  try {
    const response = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/profile',
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Gmail API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[Gmail Client] Error fetching profile:', error);
    throw error;
  }
}

/**
 * Convert Gmail message to .eml format
 * @param {object} message - Gmail message object
 * @returns {string} Email in .eml format
 */
export function convertToEmlFormat(message) {
  const lines = [];
  
  // Add headers
  lines.push(`From: ${message.from}`);
  lines.push(`To: ${message.to}`);
  lines.push(`Subject: ${message.subject}`);
  lines.push(`Date: ${message.date}`);
  if (message.messageId) {
    lines.push(`Message-ID: ${message.messageId}`);
  }
  lines.push('');
  
  // Add body
  lines.push(message.body || message.snippet);
  
  return lines.join('\n');
}

/**
 * Convert Gmail message to readable text format
 * @param {object} message - Gmail message object
 * @returns {string} Formatted email text
 */
export function convertToTextFormat(message) {
  const lines = [];
  
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`📧 EMAIL`);
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push(`From: ${message.from}`);
  lines.push(`To: ${message.to}`);
  lines.push(`Subject: ${message.subject}`);
  lines.push(`Date: ${message.date}`);
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('MESSAGE CONTENT:');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push(message.body || message.snippet);
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  return lines.join('\n');
}

/**
 * Convert Gmail thread to readable text format (all messages in chronological order)
 * @param {object} thread - Gmail thread object with messages array
 * @returns {string} Formatted thread text
 */
export function convertThreadToTextFormat(thread) {
  const lines = [];
  
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`📧 EMAIL THREAD (${thread.messageCount} messages)`);
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  
  thread.messages.forEach((message, index) => {
    if (index > 0) {
      lines.push('');
      lines.push('─────────────────────────────────────────────────────────────────────');
      lines.push(`MESSAGE ${index + 1} OF ${thread.messageCount}`);
      lines.push('─────────────────────────────────────────────────────────────────────');
      lines.push('');
    }
    
    lines.push(`From: ${message.from}`);
    lines.push(`To: ${message.to}`);
    lines.push(`Subject: ${message.subject}`);
    lines.push(`Date: ${message.date}`);
    lines.push('');
    lines.push(message.body || message.snippet);
    
    if (index === thread.messageCount - 1) {
      lines.push('');
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }
  });
  
  return lines.join('\n');
}

