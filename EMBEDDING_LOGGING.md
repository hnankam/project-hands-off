# Embedding System - Comprehensive Logging

## Overview

Added detailed logging throughout the embedding system to track when embedding occurs, show sample results, and monitor performance. The logs use clear visual separators and emojis for easy identification.

## Log Locations

### 1. EmbeddingWorkerManager (`EmbeddingWorkerManager.ts`)

#### Single Text Embedding (`embed()`)

**Example Log Output:**
```
[EmbeddingWorkerManager] 🔄 Requesting embedding for text (length: 1234)
[EmbeddingWorkerManager]    Text preview: This is a sample text that shows the beginning of the content...
[EmbeddingWorkerManager] ✅ Embedding generated in 45.23 ms
[EmbeddingWorkerManager]    Dimensions: 384
[EmbeddingWorkerManager]    Sample values: 0.1234, 0.5678, -0.2345, 0.8901, 0.3456...
[EmbeddingWorkerManager]    Magnitude: 1.0000
```

**Information Logged:**
- Text length
- Text preview (first 100 chars)
- Generation time
- Embedding dimensions
- Sample embedding values (first 5)
- Vector magnitude (for normalization verification)

#### Batch Embeddings (`embedBatch()`)

**Example Log Output:**
```
[EmbeddingWorkerManager] 🔄 Requesting batch embeddings
[EmbeddingWorkerManager]    Batch size: 8 texts
[EmbeddingWorkerManager]    Total chars: 25,432
[EmbeddingWorkerManager]    Avg chars/text: 3,179
[EmbeddingWorkerManager]    First text preview: Chunk 1 content goes here with lots of information about the page...
[EmbeddingWorkerManager] ✅ Batch embeddings generated in 234.56 ms
[EmbeddingWorkerManager]    Performance: 34.11 embeddings/sec
[EmbeddingWorkerManager]    Generated: 8 embeddings
[EmbeddingWorkerManager]    Dimensions: 384
[EmbeddingWorkerManager]    First embedding sample: 0.2341, 0.6789, -0.1234, 0.9876, 0.4567...
```

**Information Logged:**
- Batch size (number of texts)
- Total character count
- Average characters per text
- Preview of first text
- Total generation time
- Performance metric (embeddings/second)
- Dimensions of embeddings
- Sample from first embedding

#### Page Content Embedding (`embedPageContent()`)

**Example Log Output:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[EmbeddingWorkerManager] 📄 EMBEDDING PAGE CONTENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[EmbeddingWorkerManager]    Page URL: https://example.com/page
[EmbeddingWorkerManager]    Page title: Example Page Title
[EmbeddingWorkerManager]    Text length: 15,234 chars
[EmbeddingWorkerManager]    HTML length: 45,678 chars
[EmbeddingWorkerManager]    Chunk size: 5,000 chars
[EmbeddingWorkerManager]    Strategy: Multi-chunk (estimated: 4 chunks)
[EmbeddingWorkerManager]    Actual chunks: 4
[EmbeddingWorkerManager]    Chunk sizes: 5000, 5000, 4234, 1000 chars
[EmbeddingWorkerManager]    First chunk preview: Welcome to our website. This is the main content area...
[EmbeddingWorkerManager]    Generating full-page embedding (truncated to 5000 chars)...
[EmbeddingWorkerManager] ✅ Page embedding complete in 456.78 ms
[EmbeddingWorkerManager]    Total chunks: 4
[EmbeddingWorkerManager]    Full embedding dimensions: 384
[EmbeddingWorkerManager]    Full embedding sample: 0.3214, 0.7891, -0.0987, 0.5432, 0.6789...
[EmbeddingWorkerManager]    Performance: 33,354 chars/sec
[EmbeddingWorkerManager]    Avg time per chunk: 114.20 ms
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Information Logged:**
- Page URL and title
- Text and HTML lengths
- Chunking strategy (single vs multi-chunk)
- Estimated and actual chunk counts
- Individual chunk sizes
- Preview of first chunk
- Total processing time
- Performance metrics (chars/sec, time per chunk)
- Full embedding sample

### 2. ChatSessionContainer (`ChatSessionContainer.tsx`)

#### Auto-Embedding Trigger

**Example Log Output:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[ChatSessionContainer] 🚀 AUTO-EMBEDDING TRIGGERED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[ChatSessionContainer]    Trigger: Page content changed
[ChatSessionContainer]    Page URL: https://example.com/page
[ChatSessionContainer]    Page title: Example Page Title
[ChatSessionContainer]    Session ID: session_abc123
[ChatSessionContainer]    Timestamp: 2025-10-15T14:30:45.123Z

[... EmbeddingWorkerManager logs appear here ...]

[ChatSessionContainer] ✅ AUTO-EMBEDDING COMPLETE
[ChatSessionContainer]    Full embedding dimensions: 384
[ChatSessionContainer]    Full embedding sample: 0.3214, 0.7891, -0.0987, 0.5432, 0.6789...
[ChatSessionContainer]    Chunks generated: 4
[ChatSessionContainer]    First chunk text length: 5000 chars
[ChatSessionContainer]    First chunk HTML length: 15234 chars
[ChatSessionContainer]    First chunk embedding sample: 0.1234, 0.5678, -0.2345, 0.8901, 0.3456...
[ChatSessionContainer]    Storing in SurrealDB (in-memory)...
[ChatSessionContainer] ✅ Embeddings stored in SurrealDB
[ChatSessionContainer]    Storage type: In-memory
[ChatSessionContainer]    Record ID: session_abc123
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Information Logged:**
- Trigger reason (page content changed)
- Page metadata (URL, title)
- Session ID
- Timestamp
- Full embedding details
- Chunk statistics
- First chunk details (text, HTML, embedding sample)
- SurrealDB storage confirmation

#### Skip Scenarios

**Example Log Outputs:**

```
[ChatSessionContainer] ⏸️  Auto-embedding skipped: No page content
```

```
[ChatSessionContainer] ⏸️  Auto-embedding skipped: Worker not initialized
```

```
[ChatSessionContainer] ⏸️  Auto-embedding skipped: Already processing
```

```
[ChatSessionContainer] ⏸️  Auto-embedding skipped: Content already embedded
[ChatSessionContainer]    Last embedding: 2025-10-15T14:30:45.123Z
[ChatSessionContainer]    Content fetched: 2025-10-15T14:28:30.456Z
```

### 3. SemanticSearchManager (`SemanticSearchManager.ts`)

#### Page Content Search

**Example Log Output:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[SemanticSearchManager] 🔍 SEARCHING PAGE CONTENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[SemanticSearchManager]    Query: login form
[SemanticSearchManager]    Top K: 3
[SemanticSearchManager]    Available chunks: 8
[SemanticSearchManager]    Generating query embedding...
[SemanticSearchManager]    Query embedding: 0.4123, 0.6789, -0.2345, 0.9012, 0.3456...
[SemanticSearchManager]    Calculating similarities...
[SemanticSearchManager] ✅ Search complete in 78.45 ms
[SemanticSearchManager]    Results found: 3
[SemanticSearchManager]    Top similarities: 0.876, 0.823, 0.751
[SemanticSearchManager]    Best match preview: Login to your account Username Password Remember me Forgot password? Sign in...
[SemanticSearchManager]    Best match HTML length: 2345 chars
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Information Logged:**
- Search query
- Top K value
- Available chunks count
- Query embedding sample
- Search time
- Number of results
- Similarity scores
- Best match preview
- Best match HTML length

## Log Icons Guide

- 🚀 **Auto-embedding triggered** - Major event start
- 🔄 **Processing** - Operation in progress
- ✅ **Success** - Operation completed successfully
- ❌ **Error** - Operation failed
- ⚠️  **Warning** - Non-critical issue
- ⏸️  **Skipped** - Operation was skipped
- 📄 **Page content** - Page-related operation
- 🔍 **Search** - Search operation

## Log Separators

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Used to clearly separate major operations in the console for easier reading.

## Performance Metrics

### Timing Information
- **Generation time**: Time to create embeddings
- **Search time**: Time to find similar content
- **Performance rates**: embeddings/sec, chars/sec

### Sample Data
- **Embedding samples**: First 5 values of each embedding vector
- **Text previews**: First 80-150 characters
- **Magnitude**: Vector magnitude for normalization verification

## Use Cases

### 1. Debugging Embedding Generation
Look for the `📄 EMBEDDING PAGE CONTENT` logs to see:
- When embedding occurs
- How many chunks are created
- Time taken for each operation
- Sample embedding values

### 2. Monitoring Auto-Embedding
Look for the `🚀 AUTO-EMBEDDING TRIGGERED` logs to verify:
- Auto-embedding is working on page refresh
- Correct page is being embedded
- Embeddings are stored in SurrealDB

### 3. Debugging Search
Look for the `🔍 SEARCHING PAGE CONTENT` logs to see:
- Search queries from the agent
- Similarity scores
- Which content is being returned
- Search performance

### 4. Troubleshooting Skips
Look for `⏸️ Auto-embedding skipped` logs to understand:
- Why embedding isn't running
- What conditions are not met
- Timing issues with content fetch

## Example Complete Flow

```
# Page loads/refreshes
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[ChatSessionContainer] 🚀 AUTO-EMBEDDING TRIGGERED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[ChatSessionContainer]    Trigger: Page content changed
[ChatSessionContainer]    Page URL: https://example.com/login
[ChatSessionContainer]    Page title: Login - Example Site
[ChatSessionContainer]    Session ID: session_xyz789
[ChatSessionContainer]    Timestamp: 2025-10-15T15:45:30.123Z

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[EmbeddingWorkerManager] 📄 EMBEDDING PAGE CONTENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[EmbeddingWorkerManager]    Page URL: https://example.com/login
[EmbeddingWorkerManager]    Page title: Login - Example Site
[EmbeddingWorkerManager]    Text length: 3,456 chars
[EmbeddingWorkerManager]    HTML length: 12,345 chars
[EmbeddingWorkerManager]    Chunk size: 5,000 chars
[EmbeddingWorkerManager]    Strategy: Single chunk (text fits in one piece)
[EmbeddingWorkerManager]    Text preview: Login to your account Welcome back! Please enter your credentials...

[EmbeddingWorkerManager] 🔄 Requesting embedding for text (length: 3456)
[EmbeddingWorkerManager]    Text preview: Login to your account Welcome back! Please enter your credentials...
[EmbeddingWorkerManager] ✅ Embedding generated in 89.12 ms
[EmbeddingWorkerManager]    Dimensions: 384
[EmbeddingWorkerManager]    Sample values: 0.2134, 0.6543, -0.1234, 0.8765, 0.4321...
[EmbeddingWorkerManager]    Magnitude: 1.0000

[EmbeddingWorkerManager] ✅ Page embedding complete in 92.45 ms
[EmbeddingWorkerManager]    Chunks: 1
[EmbeddingWorkerManager]    Embedding dimensions: 384
[EmbeddingWorkerManager]    Sample embedding: 0.2134, 0.6543, -0.1234, 0.8765, 0.4321...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[ChatSessionContainer] ✅ AUTO-EMBEDDING COMPLETE
[ChatSessionContainer]    Full embedding dimensions: 384
[ChatSessionContainer]    Full embedding sample: 0.2134, 0.6543, -0.1234, 0.8765, 0.4321...
[ChatSessionContainer]    Chunks generated: 1
[ChatSessionContainer]    First chunk text length: 3456 chars
[ChatSessionContainer]    First chunk HTML length: 12345 chars
[ChatSessionContainer]    First chunk embedding sample: 0.2134, 0.6543, -0.1234, 0.8765, 0.4321...
[ChatSessionContainer]    Storing in SurrealDB (in-memory)...
[ChatSessionContainer] ✅ Embeddings stored in SurrealDB
[ChatSessionContainer]    Storage type: In-memory
[ChatSessionContainer]    Record ID: session_xyz789
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Agent searches for content
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[SemanticSearchManager] 🔍 SEARCHING PAGE CONTENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[SemanticSearchManager]    Query: find the login form
[SemanticSearchManager]    Top K: 3
[SemanticSearchManager]    Available chunks: 1
[SemanticSearchManager]    Generating query embedding...

[EmbeddingWorkerManager] 🔄 Requesting embedding for text (length: 19)
[EmbeddingWorkerManager]    Text preview: find the login form
[EmbeddingWorkerManager] ✅ Embedding generated in 45.67 ms
[EmbeddingWorkerManager]    Dimensions: 384
[EmbeddingWorkerManager]    Sample values: 0.3214, 0.7654, -0.2341, 0.8901, 0.5432...
[EmbeddingWorkerManager]    Magnitude: 1.0000

[SemanticSearchManager]    Query embedding: 0.3214, 0.7654, -0.2341, 0.8901, 0.5432...
[SemanticSearchManager]    Calculating similarities...
[SemanticSearchManager] ✅ Search complete in 52.34 ms
[SemanticSearchManager]    Results found: 1
[SemanticSearchManager]    Top similarities: 0.892
[SemanticSearchManager]    Best match preview: Login to your account Welcome back! Please enter your credentials Username...
[SemanticSearchManager]    Best match HTML length: 12345 chars
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Benefits

1. **Easy Debugging**: Visual separators and emojis make logs easy to scan
2. **Performance Monitoring**: Timing and rate metrics show bottlenecks
3. **Verification**: Sample values confirm embeddings are generated correctly
4. **Troubleshooting**: Skip reasons help diagnose why embedding isn't running
5. **Agent Behavior**: Search logs show what the agent is looking for

## Best Practices

1. **Filter Logs**: Use browser console filters like `[EmbeddingWorkerManager]` to focus on specific components
2. **Check Timing**: Look for unusually slow operations that might need optimization
3. **Verify Samples**: Embedding values should be roughly between -1 and 1, with magnitude close to 1.0
4. **Monitor Skips**: Too many skips might indicate a timing issue with content fetching
5. **Track Searches**: Agent search queries reveal how it's trying to understand the page

---

**Date**: October 15, 2025  
**Status**: ✅ Complete  
**Components Logged**: EmbeddingWorkerManager, ChatSessionContainer, SemanticSearchManager  
**Log Level**: Detailed with performance metrics

