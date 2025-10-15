# Embeddings Integration for Chrome Extension

## Overview

Successfully integrated **browser-compatible** vector embeddings using `@huggingface/transformers`. This replaces `fastembed` which only works in Node.js environments.

## Why the Change?

❌ **fastembed** - Requires Node.js native bindings, cannot run in browser  
✅ **@huggingface/transformers** - Pure JavaScript/WebAssembly, perfect for Chrome extensions

## What Was Added

### 1. Package Installation

**Removed:**
- `fastembed` v2.0.0 (Node.js only)

**Added:**
- `@huggingface/transformers` v3.7.5 (browser-compatible)

### 2. Embedding Service Module

Created `packages/shared/lib/embeddings/embedding-service.ts`:
- `EmbeddingService` class for model management
- Support for multiple embedding models
- Batch processing capabilities
- Streaming embeddings with progress
- Cosine similarity and search utilities

### 3. Documentation

Complete documentation at `packages/shared/lib/embeddings/README.md`

## Supported Models

| Model | Dimensions | Download Size | Best For |
|-------|-----------|---------------|----------|
| ALL_MINILM_L6_V2 | 384 | ~30MB | Fast, general-purpose ⭐ |
| BGE_SMALL_EN_V1_5 | 384 | ~130MB | English text, balanced |
| BGE_BASE_EN_V1_5 | 768 | ~420MB | High quality English |
| MULTILINGUAL_E5_SMALL | 384 | ~80MB | Multiple languages |

## Quick Start

### Basic Usage

```typescript
import { embeddingService, EmbeddingModel } from '@extension/shared';

// Initialize (once at extension startup)
await embeddingService.initialize({
  model: EmbeddingModel.ALL_MINILM_L6_V2,
  onProgress: (progress) => {
    console.log(`Loading: ${progress.status}`);
  }
});

// Generate embedding
const embedding = await embeddingService.embed("Your text here");
console.log(embedding); // number[] with 384 dimensions
```

### Batch Processing

```typescript
import { embeddingService } from '@extension/shared';

const texts = ["text1", "text2", "text3"];
const embeddings = await embeddingService.embedBatch(texts);
// Returns: number[][] - array of embeddings
```

### Semantic Search

```typescript
import { 
  embeddingService, 
  findSimilar, 
  cosineSimilarity 
} from '@extension/shared';

// Embed documents
const docs = ["doc1", "doc2", "doc3"];
const docEmbeddings = await embeddingService.embedBatch(docs);

// Embed query
const query = "search term";
const queryEmbedding = await embeddingService.embed(query);

// Find similar documents
const results = findSimilar(queryEmbedding, docEmbeddings, 3);
// Returns: [{ index: 0, similarity: 0.85 }, ...]
```

## Integration with SurrealDB

Perfect combination for RAG (Retrieval Augmented Generation):

```typescript
import { embeddingService, surrealDB } from '@extension/shared';

// 1. Initialize both services
await embeddingService.initialize();
await surrealDB.connect('rag_db');
await surrealDB.query(`
  DEFINE TABLE documents SCHEMALESS;
  DEFINE FIELD content ON documents TYPE string;
  DEFINE FIELD embedding ON documents TYPE array;
`);

// 2. Store documents with embeddings
async function storeDocument(content: string) {
  const embedding = await embeddingService.embed(content);
  await surrealDB.create('documents', {
    content,
    embedding,
    timestamp: new Date().toISOString()
  });
}

// 3. Search documents
async function searchDocuments(query: string, topK = 5) {
  const queryEmbedding = await embeddingService.embed(query);
  const allDocs = await surrealDB.select('documents');
  
  const docEmbeddings = allDocs.map(doc => doc.embedding);
  const similar = findSimilar(queryEmbedding, docEmbeddings, topK);
  
  return similar.map(({ index, similarity }) => ({
    ...allDocs[index],
    similarity
  }));
}
```

## Use Cases

### 1. Semantic Search Over Downloaded Content
```typescript
// Content script: Download and embed pages
const pageText = document.body.innerText;
const embedding = await embeddingService.embed(pageText);
await surrealDB.create('pages', {
  url: window.location.href,
  content: pageText,
  embedding,
  timestamp: new Date().toISOString()
});

// Side panel: Search
const results = await searchDocuments(userQuery);
```

### 2. Message Similarity Detection
```typescript
// Detect duplicate or similar messages
const newMessage = "New message text";
const newEmbedding = await embeddingService.embed(newMessage);

const allMessages = await surrealDB.select('messages');
const similarities = allMessages.map(msg => ({
  message: msg,
  similarity: cosineSimilarity(newEmbedding, msg.embedding)
}));

const duplicates = similarities.filter(s => s.similarity > 0.9);
```

### 3. Content Recommendation
```typescript
// Recommend similar content based on user's current page
const currentPageEmbedding = await embeddingService.embed(currentPageText);
const storedPages = await surrealDB.select('pages');
const recommendations = findSimilar(
  currentPageEmbedding,
  storedPages.map(p => p.embedding),
  5
);
```

### 4. RAG for Chatbot
```typescript
async function answerQuestion(question: string) {
  // 1. Embed question
  const questionEmbedding = await embeddingService.embed(question);
  
  // 2. Find relevant context
  const docs = await surrealDB.select('knowledge_base');
  const relevant = findSimilar(
    questionEmbedding,
    docs.map(d => d.embedding),
    3
  );
  
  // 3. Build context
  const context = relevant
    .map(({ index }) => docs[index].content)
    .join('\n\n');
  
  // 4. Send to LLM with context
  return await callLLM(`Context: ${context}\n\nQ: ${question}\nA:`);
}
```

## File Structure

```
packages/shared/
├── lib/
│   ├── embeddings/
│   │   ├── embedding-service.ts    # Main service
│   │   └── README.md               # Full documentation
│   └── db/
│       ├── surreal-db.ts           # Database service
│       └── README.md
└── index.mts                       # Exports both services
```

## Performance

### Model Loading (First Time)
- ALL_MINILM_L6_V2: ~3-5 seconds (30MB download)
- BGE_SMALL_EN_V1_5: ~5-10 seconds (130MB download)
- Subsequent loads: < 1 second (cached)

### Embedding Generation
- Single text: ~10-50ms
- Batch of 100 texts: ~1-3 seconds
- Depends on text length and model size

### Memory Usage
- Model in memory: ~100-500MB depending on model
- Can call `embeddingService.dispose()` to free memory

## Best Practices

1. **Initialize Once**: Load model at extension startup
   ```typescript
   chrome.runtime.onInstalled.addListener(async () => {
     await embeddingService.initialize();
   });
   ```

2. **Batch When Possible**: More efficient than individual calls
   ```typescript
   // Good ✅
   const embeddings = await embeddingService.embedBatch(texts);
   
   // Avoid ❌
   for (const text of texts) {
     await embeddingService.embed(text);
   }
   ```

3. **Show Progress**: Model loading takes time
   ```typescript
   await embeddingService.initialize({
     onProgress: (p) => updateUI(p.status, p.progress)
   });
   ```

4. **Store Embeddings**: Don't regenerate unnecessarily
   ```typescript
   // Store with content
   await surrealDB.create('content', {
     text: content,
     embedding: await embeddingService.embed(content),
     cached: true
   });
   ```

5. **Choose Right Model**: Balance speed vs quality
   - Fast: `ALL_MINILM_L6_V2` (384 dimensions)
   - Quality: `BGE_BASE_EN_V1_5` (768 dimensions)

## API Summary

### Initialization
```typescript
await embeddingService.initialize({
  model: EmbeddingModel.ALL_MINILM_L6_V2,
  normalize: true,
  pooling: 'mean',
  onProgress: (progress) => { }
});
```

### Embedding Generation
```typescript
// Single
const embedding = await embeddingService.embed(text);

// Batch
const embeddings = await embeddingService.embedBatch(texts, batchSize);

// Stream (with progress)
for await (const batch of embeddingService.embedStream(texts, 10)) {
  // Process batch
}
```

### Similarity & Search
```typescript
// Calculate similarity
const sim = cosineSimilarity(embedding1, embedding2); // 0.0 to 1.0

// Find similar
const results = findSimilar(queryEmbedding, allEmbeddings, topK);
// Returns: [{ index, similarity }, ...]
```

### Utility Methods
```typescript
embeddingService.isReady()          // Check if loaded
embeddingService.isModelLoading()   // Check if loading
embeddingService.getCurrentModel()  // Get current model
await embeddingService.dispose()    // Free memory
```

## Example: Complete RAG System

```typescript
import { 
  embeddingService, 
  surrealDB, 
  findSimilar,
  EmbeddingModel 
} from '@extension/shared';

class RAGSystem {
  async initialize() {
    // Initialize services
    await embeddingService.initialize({
      model: EmbeddingModel.ALL_MINILM_L6_V2,
      onProgress: (p) => console.log(p.status)
    });
    
    await surrealDB.connect('rag_db');
    
    // Setup schema
    await surrealDB.query(`
      DEFINE TABLE documents SCHEMALESS;
      DEFINE FIELD content ON documents TYPE string;
      DEFINE FIELD embedding ON documents TYPE array;
      DEFINE FIELD source ON documents TYPE string;
      DEFINE FIELD timestamp ON documents TYPE datetime;
      DEFINE INDEX idx_timestamp ON documents FIELDS timestamp;
    `);
  }
  
  async addDocument(content: string, source: string) {
    const embedding = await embeddingService.embed(content);
    await surrealDB.create('documents', {
      content,
      embedding,
      source,
      timestamp: new Date().toISOString()
    });
  }
  
  async addDocuments(documents: Array<{ content: string; source: string }>) {
    const contents = documents.map(d => d.content);
    const embeddings = await embeddingService.embedBatch(contents);
    
    for (let i = 0; i < documents.length; i++) {
      await surrealDB.create('documents', {
        ...documents[i],
        embedding: embeddings[i],
        timestamp: new Date().toISOString()
      });
    }
  }
  
  async search(query: string, topK = 5) {
    const queryEmbedding = await embeddingService.embed(query);
    const docs = await surrealDB.select('documents');
    
    const results = findSimilar(
      queryEmbedding,
      docs.map(d => d.embedding),
      topK
    );
    
    return results.map(({ index, similarity }) => ({
      content: docs[index].content,
      source: docs[index].source,
      similarity,
      timestamp: docs[index].timestamp
    }));
  }
  
  async answerQuestion(question: string, llmFunction: Function) {
    // Get relevant context
    const relevant = await this.search(question, 3);
    const context = relevant
      .map(r => `[${r.source}] ${r.content}`)
      .join('\n\n');
    
    // Generate answer with LLM
    const prompt = `
Context from knowledge base:
${context}

Question: ${question}

Answer based on the context provided:`;
    
    return await llmFunction(prompt);
  }
}

// Usage
const rag = new RAGSystem();
await rag.initialize();
await rag.addDocument("Document content", "source.pdf");
const results = await rag.search("user query");
const answer = await rag.answerQuestion("What is...?", callLLM);
```

## Troubleshooting

### "Model not initialized"
```typescript
// Always initialize first
if (!embeddingService.isReady()) {
  await embeddingService.initialize();
}
```

### Slow Initial Load
Models are downloaded on first use. Subsequent loads are instant (cached by browser).

### Memory Issues
```typescript
// Dispose when not needed
await embeddingService.dispose();

// Reinitialize when needed
await embeddingService.initialize();
```

## Migration from vectordb.js

You also have `@themaximalist/vectordb.js` installed. The embedding service works great with it:

```typescript
import { embeddingService } from '@extension/shared';
import VectorDB from '@themaximalist/vectordb.js';

// Use our embedding service with VectorDB
await embeddingService.initialize();

const db = new VectorDB({
  embeddings: async (text) => {
    return await embeddingService.embed(text);
  }
});

await db.add("document text");
const results = await db.search("query");
```

## Resources

- [Full Documentation](./packages/shared/lib/embeddings/README.md)
- [Transformers.js Docs](https://huggingface.co/docs/transformers.js)
- [GitHub Repository](https://github.com/huggingface/transformers.js)
- [Available Models](https://huggingface.co/models?library=transformers.js)

---

**Status**: ✅ Ready to use in Chrome extension  
**Package**: @huggingface/transformers v3.7.5  
**Integration Date**: October 15, 2025

