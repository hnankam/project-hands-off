# Browser-Compatible Embeddings Service

## Overview

This module provides a **browser-compatible** embedding service for generating vector embeddings in your Chrome extension. It uses [`@huggingface/transformers`](https://github.com/huggingface/transformers.js), which runs entirely in the browser using WebAssembly and ONNX Runtime Web.

## Why Not fastembed?

❌ **fastembed** requires Node.js native bindings (`.node` files) and can't run in browser environments  
✅ **@huggingface/transformers** is pure JavaScript/WebAssembly and works perfectly in Chrome extensions

## Features

- 🌐 **Browser-Compatible**: Runs entirely in the browser using WebAssembly
- 🚀 **Fast**: Efficient inference using ONNX Runtime Web
- 📦 **Multiple Models**: Support for various embedding models
- 🔄 **Batch Processing**: Process multiple texts efficiently
- 💾 **Memory Efficient**: Automatic model management
- 🎯 **Type-Safe**: Full TypeScript support
- 📊 **Similarity Search**: Built-in cosine similarity functions

## Supported Models

| Model | Dimensions | Best For |
|-------|-----------|----------|
| `ALL_MINILM_L6_V2` | 384 | Fast, general-purpose (default) |
| `BGE_SMALL_EN_V1_5` | 384 | English text, good balance |
| `BGE_BASE_EN_V1_5` | 768 | English text, higher quality |
| `MULTILINGUAL_E5_SMALL` | 384 | Multiple languages |

## Installation

Already installed! The package is included in your dependencies:
- `@huggingface/transformers` v3.7.5

## Quick Start

### Basic Usage

```typescript
import { 
  embeddingService, 
  EmbeddingModel,
  generateEmbedding 
} from '@extension/shared';

// Initialize with default model (all-MiniLM-L6-v2)
await embeddingService.initialize();

// Generate embedding for a single text
const embedding = await embeddingService.embed("Hello, world!");
console.log(embedding); // number[] with 384 dimensions

// Or use the helper function
const embedding2 = await generateEmbedding("Another text");
```

### Batch Processing

```typescript
import { embeddingService, generateEmbeddings } from '@extension/shared';

// Initialize once
await embeddingService.initialize();

// Generate embeddings for multiple texts
const texts = [
  "First document",
  "Second document",
  "Third document"
];

const embeddings = await embeddingService.embedBatch(texts);
console.log(embeddings.length); // 3
console.log(embeddings[0].length); // 384

// Or use the helper function with options
const embeddings2 = await generateEmbeddings(texts, {
  batchSize: 10,
  model: EmbeddingModel.BGE_SMALL_EN_V1_5
});
```

### Streaming Embeddings

```typescript
import { embeddingService } from '@extension/shared';

await embeddingService.initialize();

const texts = ["doc1", "doc2", "doc3", ...]; // Large list

// Process with progress
for await (const batch of embeddingService.embedStream(texts, 10)) {
  console.log(`Processed ${batch.length} embeddings`);
  // batch is number[][] containing embeddings for this batch
}
```

## Advanced Usage

### Using Different Models

```typescript
import { embeddingService, EmbeddingModel } from '@extension/shared';

// Initialize with a specific model
await embeddingService.initialize({
  model: EmbeddingModel.BGE_BASE_EN_V1_5,
  normalize: true,
  pooling: 'mean',
  onProgress: (progress) => {
    console.log(`${progress.status}: ${progress.progress}%`);
  }
});

const embedding = await embeddingService.embed("High quality embedding");
```

### Progress Tracking

```typescript
import { embeddingService, EmbeddingModel } from '@extension/shared';

await embeddingService.initialize({
  model: EmbeddingModel.MULTILINGUAL_E5_SMALL,
  onProgress: (progress) => {
    // Show loading UI
    updateLoadingBar(progress.status, progress.progress);
  }
});
```

### Similarity Search

```typescript
import { 
  embeddingService, 
  cosineSimilarity, 
  findSimilar 
} from '@extension/shared';

await embeddingService.initialize();

// Generate embeddings for your documents
const documents = ["doc1", "doc2", "doc3", "doc4", "doc5"];
const docEmbeddings = await embeddingService.embedBatch(documents);

// Generate query embedding
const query = "search query";
const queryEmbedding = await embeddingService.embed(query);

// Find similar documents
const similar = findSimilar(queryEmbedding, docEmbeddings, 3);
console.log(similar);
// [
//   { index: 2, similarity: 0.87 },
//   { index: 0, similarity: 0.65 },
//   { index: 4, similarity: 0.52 }
// ]

// Get the most similar document
const mostSimilar = documents[similar[0].index];

// Or calculate similarity between two embeddings directly
const similarity = cosineSimilarity(embedding1, embedding2);
console.log(`Similarity: ${similarity}`); // 0.0 to 1.0
```

## Integration Examples

### Background Script Example

```typescript
// chrome-extension/src/background/index.ts
import { embeddingService, EmbeddingModel } from '@extension/shared';

// Initialize on extension startup
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Loading embedding model...');
  
  await embeddingService.initialize({
    model: EmbeddingModel.ALL_MINILM_L6_V2,
    onProgress: (progress) => {
      console.log(`Model loading: ${progress.status}`);
    }
  });
  
  console.log('Embedding model ready!');
});

// Generate embeddings when requested
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GENERATE_EMBEDDING') {
    embeddingService.embed(message.text)
      .then(embedding => {
        sendResponse({ success: true, embedding });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async response
  }
});
```

### Content Script Example

```typescript
// pages/content/src/index.ts
import { embeddingService, surrealDB } from '@extension/shared';

// Extract and embed page content
async function embedPageContent() {
  // Initialize embedding service
  if (!embeddingService.isReady()) {
    await embeddingService.initialize();
  }
  
  // Get page text
  const pageText = document.body.innerText;
  const paragraphs = pageText.split('\n').filter(p => p.length > 50);
  
  // Generate embeddings
  const embeddings = await embeddingService.embedBatch(paragraphs.slice(0, 100));
  
  // Store in SurrealDB
  await surrealDB.connect('content_db');
  
  for (let i = 0; i < paragraphs.length; i++) {
    await surrealDB.create('page_content', {
      url: window.location.href,
      text: paragraphs[i],
      embedding: embeddings[i],
      timestamp: new Date().toISOString()
    });
  }
  
  console.log(`Embedded and stored ${paragraphs.length} paragraphs`);
}

// Run when page loads
embedPageContent();
```

### Side Panel with Search

```typescript
// pages/side-panel/src/components/SearchComponent.tsx
import { useState } from 'react';
import { 
  embeddingService, 
  findSimilar, 
  surrealDB 
} from '@extension/shared';

export function SearchComponent() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = async () => {
    setIsLoading(true);
    
    try {
      // Initialize if needed
      if (!embeddingService.isReady()) {
        await embeddingService.initialize();
      }
      
      // Generate query embedding
      const queryEmbedding = await embeddingService.embed(query);
      
      // Get all stored content
      const storedContent = await surrealDB.select('page_content');
      
      // Extract embeddings and find similar
      const embeddings = storedContent.map(item => item.embedding);
      const similar = findSimilar(queryEmbedding, embeddings, 10);
      
      // Get matching content
      const matches = similar.map(({ index, similarity }) => ({
        ...storedContent[index],
        similarity
      }));
      
      setResults(matches);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search content..."
      />
      <button onClick={handleSearch} disabled={isLoading}>
        {isLoading ? 'Searching...' : 'Search'}
      </button>
      
      <div>
        {results.map((result, i) => (
          <div key={i}>
            <p>Similarity: {(result.similarity * 100).toFixed(1)}%</p>
            <p>{result.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### RAG (Retrieval Augmented Generation)

```typescript
import { 
  embeddingService, 
  findSimilar, 
  surrealDB 
} from '@extension/shared';

async function ragQuery(userQuestion: string): Promise<string> {
  // 1. Initialize embedding service
  if (!embeddingService.isReady()) {
    await embeddingService.initialize();
  }
  
  // 2. Embed the question
  const questionEmbedding = await embeddingService.embed(userQuestion);
  
  // 3. Retrieve relevant documents from database
  const allDocs = await surrealDB.select('documents');
  const docEmbeddings = allDocs.map(doc => doc.embedding);
  
  // 4. Find most similar documents
  const relevant = findSimilar(questionEmbedding, docEmbeddings, 3);
  const context = relevant
    .map(({ index }) => allDocs[index].content)
    .join('\n\n');
  
  // 5. Use context with your LLM
  const prompt = `Context:\n${context}\n\nQuestion: ${userQuestion}\n\nAnswer:`;
  
  // Send to your LLM (CopilotKit, OpenAI, etc.)
  const answer = await callLLM(prompt);
  
  return answer;
}
```

## API Reference

### EmbeddingService Class

#### Methods

- `initialize(options?)` - Load and initialize the embedding model
- `embed(text)` - Generate embedding for a single text
- `embedBatch(texts, batchSize?)` - Generate embeddings for multiple texts
- `embedStream(texts, batchSize?)` - Generator function for processing with progress
- `getCurrentModel()` - Get the currently loaded model
- `isModelLoading()` - Check if model is currently loading
- `isReady()` - Check if model is loaded and ready
- `dispose()` - Free up memory by disposing the model

#### EmbeddingOptions

```typescript
interface EmbeddingOptions {
  model?: EmbeddingModel;           // Default: ALL_MINILM_L6_V2
  normalize?: boolean;                // Default: true
  pooling?: 'mean' | 'cls';          // Default: 'mean'
  onProgress?: (progress) => void;   // Progress callback
}
```

### Helper Functions

- `generateEmbedding(text, options?)` - Quick function to generate single embedding
- `generateEmbeddings(texts, options?)` - Quick function to generate multiple embeddings
- `cosineSimilarity(emb1, emb2)` - Calculate similarity between two embeddings
- `findSimilar(query, embeddings, topK?)` - Find most similar embeddings

### Enums

```typescript
enum EmbeddingModel {
  ALL_MINILM_L6_V2,
  BGE_SMALL_EN_V1_5,
  BGE_BASE_EN_V1_5,
  MULTILINGUAL_E5_SMALL
}
```

## Performance Tips

1. **Initialize Once**: Call `initialize()` once at extension startup, not for each embedding
2. **Batch Processing**: Use `embedBatch()` for multiple texts instead of calling `embed()` repeatedly
3. **Choose Right Model**: Smaller models (384d) are faster, larger models (768d) are more accurate
4. **Stream for Progress**: Use `embedStream()` for long lists to show progress
5. **Model Caching**: Models are cached by the browser after first download

## Model Loading Times

First load (needs to download model):
- `ALL_MINILM_L6_V2`: ~30MB, 3-5 seconds
- `BGE_SMALL_EN_V1_5`: ~130MB, 5-10 seconds
- `BGE_BASE_EN_V1_5`: ~420MB, 10-20 seconds

Subsequent loads (cached): < 1 second

## Storage Considerations

### Storing Embeddings in SurrealDB

```typescript
// Define table with embedding field
await surrealDB.query(`
  DEFINE TABLE IF NOT EXISTS embeddings SCHEMALESS;
  DEFINE FIELD text ON embeddings TYPE string;
  DEFINE FIELD embedding ON embeddings TYPE array;
  DEFINE FIELD model ON embeddings TYPE string;
  DEFINE FIELD timestamp ON embeddings TYPE datetime;
`);

// Store embedding
await surrealDB.create('embeddings', {
  text: "Sample text",
  embedding: await embeddingService.embed("Sample text"),
  model: embeddingService.getCurrentModel(),
  timestamp: new Date().toISOString()
});
```

## Troubleshooting

### Model Not Loading

```typescript
// Check if model is loading
if (embeddingService.isModelLoading()) {
  console.log('Model is loading, please wait...');
}

// Check if ready
if (!embeddingService.isReady()) {
  await embeddingService.initialize();
}
```

### Memory Issues

```typescript
// Dispose model when not needed
await embeddingService.dispose();

// Reinitialize when needed again
await embeddingService.initialize();
```

### CORS Errors

Models are loaded from Hugging Face CDN. If you encounter CORS issues, the models will be cached after first successful load.

## Comparison: fastembed vs @xenova/transformers

| Feature | fastembed | @xenova/transformers |
|---------|-----------|----------------------|
| Browser Support | ❌ No (Node.js only) | ✅ Yes |
| Chrome Extension | ❌ No | ✅ Yes |
| Native Dependencies | ✅ Yes (faster) | ❌ No (pure JS/WASM) |
| Model Support | ✅ Many models | ✅ Many models |
| Installation Size | Larger | Smaller |
| First-time Setup | Requires native build | Works out of box |

## Resources

- [Transformers.js Documentation](https://huggingface.co/docs/transformers.js)
- [Transformers.js GitHub](https://github.com/xenova/transformers.js)
- [Hugging Face Models](https://huggingface.co/models?library=transformers.js)
- [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/)

## Next Steps

1. Initialize the embedding service in your background script
2. Start embedding your content for semantic search
3. Combine with SurrealDB to store and retrieve embeddings
4. Build RAG features or semantic search in your extension

---

**Status**: ✅ Ready to use in browser environments  
**Package**: @xenova/transformers v2.17.2  
**Models**: Loaded on-demand from Hugging Face CDN

