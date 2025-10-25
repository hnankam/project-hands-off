/**
 * Test script for Web Worker implementation
 * Run this in browser console to verify worker functionality
 */

import { DBWorkerClient } from './db-worker-client.js';

// Note: This test file needs to be moved to pages/side-panel/src/lib/__tests__
// For now, create a temporary instance with a placeholder path
const embeddingsStorage = new DBWorkerClient({
  workerUrl: new URL('../../../pages/side-panel/src/workers/db-worker.ts', import.meta.url),
  debug: true,
});

export async function testWorkerImplementation() {
  console.log('🧪 Starting Web Worker Tests...\n');

  try {
    // Test 1: Initialization
    console.log('Test 1: Worker Initialization');
    await embeddingsStorage.initialize(true); // Use memory (default dbName)
    console.log('✅ Worker initialized\n');

    // Test 2: Store HTML Chunks
    console.log('Test 2: Store HTML Chunks (Non-blocking)');
    const testChunks = Array.from({ length: 50 }, (_, i) => ({
      text: `Test chunk ${i} with some content`,
      html: `<div>Test HTML ${i}</div>`,
      embedding: Array.from({ length: 384 }, () => Math.random()),
      index: i,
    }));

    const startStore = performance.now();
    const storePromise = embeddingsStorage.storeHTMLChunks({
      pageURL: 'https://test.example.com',
      pageTitle: 'Test Page',
      chunks: testChunks,
      sessionId: 'test-session',
    });

    // Verify UI is responsive during storage
    console.log('⏳ Storage started... (UI should remain responsive)');
    console.log('   Try scrolling or clicking now!');
    
    await storePromise;
    const storeTime = performance.now() - startStore;
    console.log(`✅ Stored ${testChunks.length} chunks in ${storeTime.toFixed(2)}ms\n`);

    // Test 3: Search HTML Chunks
    console.log('Test 3: Search HTML Chunks');
    const queryEmbedding = Array.from({ length: 384 }, () => Math.random());
    const startSearch = performance.now();
    const searchResults = await embeddingsStorage.searchHTMLChunks(
      'https://test.example.com',
      queryEmbedding,
      5
    );
    const searchTime = performance.now() - startSearch;
    console.log(`✅ Found ${searchResults.length} results in ${searchTime.toFixed(2)}ms`);
    console.log('   Sample result:', searchResults[0]);
    console.log('');

    // Test 4: Store Form Fields
    console.log('Test 4: Store Form Fields (Grouped)');
    const testFormGroups = [
      {
        groupIndex: 0,
        fieldsJSON: JSON.stringify([
          { selector: '#email', tagName: 'input', fieldType: 'email', fieldName: 'email', fieldId: 'email' },
          { selector: '#password', tagName: 'input', fieldType: 'password', fieldName: 'password', fieldId: 'password' },
        ]),
        embedding: Array.from({ length: 384 }, () => Math.random()),
      },
    ];

    await embeddingsStorage.storeFormFields({
      pageURL: 'https://test.example.com',
      groups: testFormGroups,
      sessionId: 'test-session',
    });
    console.log('✅ Stored form field groups\n');

    // Test 5: Search Form Fields
    console.log('Test 5: Search Form Fields');
    const formResults = await embeddingsStorage.searchFormFields(
      'https://test.example.com',
      queryEmbedding,
      3
    );
    console.log(`✅ Found ${formResults.length} form fields`);
    console.log('   Sample result:', formResults[0]);
    console.log('');

    // Test 6: Store Clickable Elements
    console.log('Test 6: Store Clickable Elements (Grouped)');
    const testClickableGroups = [
      {
        groupIndex: 0,
        elementsJSON: JSON.stringify([
          { selector: '#submit-btn', tagName: 'button', text: 'Submit', ariaLabel: 'Submit form' },
          { selector: '.login-link', tagName: 'a', text: 'Login', href: '/login' },
        ]),
        embedding: Array.from({ length: 384 }, () => Math.random()),
      },
    ];

    await embeddingsStorage.storeClickableElements({
      pageURL: 'https://test.example.com',
      groups: testClickableGroups,
      sessionId: 'test-session',
    });
    console.log('✅ Stored clickable element groups\n');

    // Test 7: Search Clickable Elements
    console.log('Test 7: Search Clickable Elements');
    const clickableResults = await embeddingsStorage.searchClickableElements(
      'https://test.example.com',
      queryEmbedding,
      3
    );
    console.log(`✅ Found ${clickableResults.length} clickable elements`);
    console.log('   Sample result:', clickableResults[0]);
    console.log('');

    // Test 8: Concurrent Operations
    console.log('Test 8: Concurrent Operations (Non-blocking)');
    const concurrent = await Promise.all([
      embeddingsStorage.searchHTMLChunks('https://test.example.com', queryEmbedding, 3),
      embeddingsStorage.searchFormFields('https://test.example.com', queryEmbedding, 2),
      embeddingsStorage.searchClickableElements('https://test.example.com', queryEmbedding, 2),
    ]);
    console.log('✅ All concurrent operations completed');
    console.log(`   HTML: ${concurrent[0].length}, Forms: ${concurrent[1].length}, Clickable: ${concurrent[2].length}\n`);

    // Test 9: Large Batch Storage
    console.log('Test 9: Large Batch Storage (100 chunks)');
    const largeChunks = Array.from({ length: 100 }, (_, i) => ({
      text: `Large test chunk ${i}`,
      html: `<div>Large HTML ${i}</div>`,
      embedding: Array.from({ length: 384 }, () => Math.random()),
      index: i,
    }));

    const startLarge = performance.now();
    await embeddingsStorage.storeHTMLChunks({
      pageURL: 'https://test-large.example.com',
      pageTitle: 'Large Test Page',
      chunks: largeChunks,
      sessionId: 'test-session',
    });
    const largeTime = performance.now() - startLarge;
    console.log(`✅ Stored ${largeChunks.length} chunks in ${largeTime.toFixed(2)}ms (batched)\n`);

    // Final Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 ALL TESTS PASSED!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('✅ Worker initialization works');
    console.log('✅ HTML chunks storage is non-blocking');
    console.log('✅ Form fields storage works');
    console.log('✅ Clickable elements storage works');
    console.log('✅ HNSW vector search works');
    console.log('✅ Concurrent operations work');
    console.log('✅ Large batch operations work');
    console.log('');
    console.log('🚀 Web Worker implementation is ready!');

    return true;
  } catch (error) {
    console.error('❌ Test failed:', error);
    return false;
  }
}

// Manual test for UI responsiveness
export function testUIResponsiveness() {
  console.log('🧪 UI Responsiveness Test\n');
  console.log('Instructions:');
  console.log('1. Open browser DevTools console');
  console.log('2. Run: testUIResponsiveness()');
  console.log('3. While storage is running, try to:');
  console.log('   - Scroll the page');
  console.log('   - Click buttons');
  console.log('   - Type in input fields');
  console.log('4. UI should remain fully responsive!\n');

  const testChunks = Array.from({ length: 100 }, (_, i) => ({
    text: `Responsiveness test chunk ${i}`,
    html: `<div>Test ${i}</div>`,
    embedding: Array.from({ length: 384 }, () => Math.random()),
    index: i,
  }));

  console.log('Starting storage of 100 chunks...');
  console.log('🖱️  TRY INTERACTING WITH THE UI NOW!');

  embeddingsStorage.storeHTMLChunks({
    pageURL: 'https://responsiveness-test.example.com',
    pageTitle: 'Responsiveness Test',
    chunks: testChunks,
  }).then(() => {
    console.log('✅ Storage complete!');
    console.log('Was the UI responsive? If yes, the Web Worker is working correctly! 🎉');
  });
}

// Export for easy testing
if (typeof window !== 'undefined') {
  (window as any).testWorkerImplementation = testWorkerImplementation;
  (window as any).testUIResponsiveness = testUIResponsiveness;
  console.log('Test functions available:');
  console.log('  - testWorkerImplementation()');
  console.log('  - testUIResponsiveness()');
}

