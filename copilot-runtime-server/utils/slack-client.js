/**
 * Slack API Client Utility
 * Handles Slack API operations with OAuth2 authentication
 */

import fetch from 'node-fetch';

/**
 * Fetch user's Slack conversations (channels, DMs, groups)
 * @param {string} accessToken - OAuth2 access token
 * @param {object} options - Query options
 * @returns {Promise<object>} List of conversations
 */
export async function fetchSlackConversations(accessToken, options = {}) {
  const {
    types = 'public_channel,private_channel,mpim,im',
    limit = 100,
    cursor = null,
  } = options;

  try {
    const params = new URLSearchParams({
      types,
      limit: limit.toString(),
    });
    
    if (cursor) params.append('cursor', cursor);

    const response = await fetch(
      `https://slack.com/api/conversations.list?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Slack API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    
    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`);
    }

    return {
      channels: data.channels || [],
      nextCursor: data.response_metadata?.next_cursor || null,
    };
  } catch (error) {
    console.error('[Slack Client] Error fetching conversations:', error);
    throw error;
  }
}

/**
 * Fetch messages from a Slack conversation
 * @param {string} accessToken - OAuth2 access token
 * @param {string} channelId - Channel/conversation ID
 * @param {object} options - Query options
 * @returns {Promise<object>} List of messages
 */
export async function fetchSlackMessages(accessToken, channelId, options = {}) {
  const {
    limit = 50,
    cursor = null,
    oldest = null,
    latest = null,
  } = options;

  try {
    const params = new URLSearchParams({
      channel: channelId,
      limit: limit.toString(),
    });
    
    if (cursor) params.append('cursor', cursor);
    if (oldest) params.append('oldest', oldest);
    if (latest) params.append('latest', latest);

    const response = await fetch(
      `https://slack.com/api/conversations.history?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Slack API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    
    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`);
    }

    return {
      messages: data.messages || [],
      hasMore: data.has_more || false,
      nextCursor: data.response_metadata?.next_cursor || null,
    };
  } catch (error) {
    console.error('[Slack Client] Error fetching messages:', error);
    throw error;
  }
}

/**
 * Fetch recent messages across all conversations
 * @param {string} accessToken - OAuth2 access token
 * @param {number} limit - Number of messages to fetch per channel
 * @returns {Promise<Array>} List of messages with channel context
 */
export async function fetchRecentSlackMessages(accessToken, limit = 10) {
  try {
    // First, get all conversations
    const { channels } = await fetchSlackConversations(accessToken, { limit: 20 });
    
    // Fetch recent messages from each channel
    const messagesPromises = channels.map(async (channel) => {
      try {
        const { messages } = await fetchSlackMessages(accessToken, channel.id, { limit });
        
        return messages.map(msg => ({
          ...msg,
          channelId: channel.id,
          channelName: channel.name || 'Direct Message',
          channelType: channel.is_channel ? 'channel' : (channel.is_group ? 'group' : 'dm'),
        }));
      } catch (error) {
        console.error(`[Slack Client] Error fetching messages for channel ${channel.id}:`, error);
        return [];
      }
    });

    const messagesArrays = await Promise.all(messagesPromises);
    const allMessages = messagesArrays.flat();
    
    // Sort by timestamp (descending)
    allMessages.sort((a, b) => parseFloat(b.ts) - parseFloat(a.ts));
    
    return allMessages.slice(0, limit * 5); // Return top N messages
  } catch (error) {
    console.error('[Slack Client] Error fetching recent messages:', error);
    throw error;
  }
}

/**
 * Get user info
 * @param {string} accessToken - OAuth2 access token
 * @param {string} userId - User ID
 * @returns {Promise<object>} User info
 */
export async function fetchSlackUser(accessToken, userId) {
  try {
    const response = await fetch(
      `https://slack.com/api/users.info?user=${userId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Slack API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`);
    }

    return data.user;
  } catch (error) {
    console.error('[Slack Client] Error fetching user:', error);
    return { real_name: 'Unknown User', name: 'unknown' };
  }
}

/**
 * Get workspace info
 * @param {string} accessToken - OAuth2 access token
 * @returns {Promise<object>} Workspace info
 */
export async function fetchSlackWorkspace(accessToken) {
  try {
    const response = await fetch(
      'https://slack.com/api/team.info',
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Slack API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`);
    }

    return data.team;
  } catch (error) {
    console.error('[Slack Client] Error fetching workspace:', error);
    throw error;
  }
}

/**
 * Search Slack messages
 * @param {string} accessToken - OAuth2 access token
 * @param {string} query - Search query
 * @param {object} options - Search options
 * @returns {Promise<object>} Search results
 */
export async function searchSlackMessages(accessToken, query, options = {}) {
  const {
    count = 20,
    sort = 'timestamp',
    sortDir = 'desc',
  } = options;

  try {
    const params = new URLSearchParams({
      query,
      count: count.toString(),
      sort,
      sort_dir: sortDir,
    });

    const response = await fetch(
      `https://slack.com/api/search.messages?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Slack API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`);
    }

    return {
      messages: data.messages?.matches || [],
      total: data.messages?.total || 0,
    };
  } catch (error) {
    console.error('[Slack Client] Error searching messages:', error);
    throw error;
  }
}

/**
 * Convert Slack message to readable text format
 * @param {object} message - Slack message object
 * @param {string} channelName - Channel name
 * @param {string} userName - User name
 * @returns {string} Formatted message text
 */
export function convertToTextFormat(message, channelName = 'Unknown Channel', userName = 'Unknown User') {
  const lines = [];
  
  lines.push('========================================================================');
  lines.push(`SLACK MESSAGE`);
  lines.push('========================================================================');
  lines.push('');
  lines.push(`Channel: #${channelName}`);
  lines.push(`From: ${userName}`);
  lines.push(`Timestamp: ${formatSlackTimestamp(message.ts)}`);
  
  if (message.thread_ts && message.thread_ts !== message.ts) {
    lines.push(`Thread Reply: Yes`);
  }
  
  lines.push('');
  lines.push('========================================================================');
  lines.push('MESSAGE CONTENT:');
  lines.push('========================================================================');
  lines.push('');
  lines.push(message.text || '[No text content]');
  
  // Add attachments info if present
  if (message.attachments && message.attachments.length > 0) {
    lines.push('');
    lines.push('Attachments:');
    message.attachments.forEach((att, idx) => {
      lines.push(`  ${idx + 1}. ${att.title || att.fallback || 'Attachment'}`);
      if (att.text) {
        lines.push(`     ${att.text.substring(0, 100)}${att.text.length > 100 ? '...' : ''}`);
      }
    });
  }
  
  // Add files info if present
  if (message.files && message.files.length > 0) {
    lines.push('');
    lines.push('Files:');
    message.files.forEach((file, idx) => {
      lines.push(`  ${idx + 1}. ${file.name} (${file.mimetype || 'unknown type'})`);
    });
  }
  
  lines.push('');
  lines.push('========================================================================');
  
  return lines.join('\n');
}

/**
 * Format Slack timestamp to readable date
 * @param {string} ts - Slack timestamp (epoch.microseconds)
 * @returns {string} Formatted date
 */
function formatSlackTimestamp(ts) {
  const timestamp = parseFloat(ts) * 1000; // Convert to milliseconds
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Get a formatted filename for a Slack message
 * @param {object} message - Slack message object
 * @param {string} channelName - Channel name
 * @returns {string} Filename
 */
export function getMessageFilename(message, channelName) {
  const timestamp = formatSlackTimestamp(message.ts).replace(/[/:,\s]/g, '-');
  const preview = (message.text || 'message').substring(0, 30).replace(/[^a-zA-Z0-9-_]/g, '_');
  return `slack-${channelName}-${timestamp}-${preview}.txt`;
}

/**
 * Fetch all replies in a Slack thread
 * @param {string} accessToken - OAuth2 access token
 * @param {string} channelId - Channel ID
 * @param {string} threadTs - Thread timestamp (parent message timestamp)
 * @returns {Promise<object>} Thread replies
 */
export async function fetchSlackThreadReplies(accessToken, channelId, threadTs) {
  try {
    const params = new URLSearchParams({
      channel: channelId,
      ts: threadTs,
    });

    const response = await fetch(
      `https://slack.com/api/conversations.replies?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Slack API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    
    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`);
    }

    return {
      messages: data.messages || [],
      hasMore: data.has_more || false,
    };
  } catch (error) {
    console.error('[Slack Client] Error fetching thread replies:', error);
    throw error;
  }
}

/**
 * Convert an entire Slack thread to readable text format
 * @param {Array} messages - Array of thread messages
 * @param {string} channelName - Channel name
 * @returns {string} Formatted thread text
 */
export function convertThreadToTextFormat(messages, channelName = 'Unknown Channel') {
  const lines = [];
  
  lines.push('========================================================================');
  lines.push(`SLACK THREAD (${messages.length} messages)`);
  lines.push('========================================================================');
  lines.push('');
  lines.push(`Channel: #${channelName}`);
  lines.push('');
  
  messages.forEach((message, index) => {
    const isParent = index === 0;
    lines.push('========================================================================');
    lines.push(`${isParent ? 'PARENT MESSAGE' : `REPLY ${index}`}`);
    lines.push('========================================================================');
    lines.push('');
    lines.push(`Timestamp: ${formatSlackTimestamp(message.ts)}`);
    lines.push('');
    lines.push('MESSAGE CONTENT:');
    lines.push(message.text || '[No text content]');
    
    // Add attachments info if present
    if (message.attachments && message.attachments.length > 0) {
      lines.push('');
      lines.push('Attachments:');
      message.attachments.forEach((att, idx) => {
        lines.push(`  ${idx + 1}. ${att.title || att.fallback || 'Attachment'}`);
        if (att.text) {
          lines.push(`     ${att.text.substring(0, 100)}${att.text.length > 100 ? '...' : ''}`);
        }
      });
    }
    
    // Add files info if present
    if (message.files && message.files.length > 0) {
      lines.push('');
      lines.push('Files:');
      message.files.forEach((file, idx) => {
        lines.push(`  ${idx + 1}. ${file.name} (${file.mimetype || 'unknown type'})`);
      });
    }
    
    lines.push('');
  });
  
  lines.push('========================================================================');
  
  return lines.join('\n');
}

/**
 * Download a Slack file
 * @param {string} accessToken - OAuth2 access token
 * @param {object} file - Slack file object
 * @returns {Promise<Buffer>} File buffer
 */
export async function downloadSlackFile(accessToken, file) {
  try {
    // Get fresh file info from Slack API to get non-expired download URL
    // Slack's url_private URLs can expire, so we need to fetch fresh ones
    console.log(`[Slack Client] Fetching fresh file info for: ${file.name} (ID: ${file.id})`);
    
    const fileInfoResponse = await fetch(
      `https://slack.com/api/files.info?file=${file.id}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!fileInfoResponse.ok) {
      throw new Error(`Failed to fetch file info: ${fileInfoResponse.status}`);
    }

    const fileInfoData = await fileInfoResponse.json();
    
    if (!fileInfoData.ok) {
      console.error(`[Slack Client] File info error:`, fileInfoData.error);
      throw new Error(`Slack API error: ${fileInfoData.error}`);
    }

    const freshFile = fileInfoData.file;
    const downloadUrl = freshFile.url_private_download || freshFile.url_private;
    
    if (!downloadUrl) {
      throw new Error('No download URL available for file');
    }

    console.log(`[Slack Client] Got fresh URL, downloading file: ${file.name}`);

    const response = await fetch(downloadUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Slack Client] File download failed: ${response.status} - ${errorText}`);
      throw new Error(`Failed to download file: ${response.status}`);
    }

    // Check Content-Type to ensure we got the actual file, not an HTML error page
    const contentType = response.headers.get('content-type');
    console.log(`[Slack Client] Response Content-Type: ${contentType}`);
    
    // Get buffer from response - node-fetch returns Buffer
    // Use arrayBuffer() then convert to Buffer to ensure binary integrity
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    console.log(`[Slack Client] Successfully downloaded ${buffer.length} bytes for ${file.name}`);
    console.log(`[Slack Client] Buffer type: ${typeof buffer}, isBuffer: ${Buffer.isBuffer(buffer)}`);
    console.log(`[Slack Client] First 10 bytes (hex):`, buffer.slice(0, 10).toString('hex'));
    
    // Check if we got HTML instead of the actual file
    const firstBytes = buffer.slice(0, 15).toString('utf8');
    if (firstBytes.includes('<!DOCTYPE') || firstBytes.includes('<html')) {
      console.error(`[Slack Client] ERROR: Received HTML instead of file content!`);
      console.error(`[Slack Client] First 200 chars:`, buffer.slice(0, 200).toString('utf8'));
      throw new Error('Slack returned HTML instead of file content. The file URL may be invalid or expired.');
    }
    
    return buffer;
  } catch (error) {
    console.error('[Slack Client] Error downloading file:', error);
    throw error;
  }
}

/**
 * Get thread filename
 * @param {object} parentMessage - Parent message object
 * @param {string} channelName - Channel name
 * @param {number} replyCount - Number of replies
 * @returns {string} Filename
 */
export function getThreadFilename(parentMessage, channelName, replyCount) {
  const timestamp = formatSlackTimestamp(parentMessage.ts).replace(/[/:,\s]/g, '-');
  const preview = (parentMessage.text || 'thread').substring(0, 30).replace(/[^a-zA-Z0-9-_]/g, '_');
  return `slack-thread-${channelName}-${timestamp}-${replyCount}-replies-${preview}.txt`;
}

