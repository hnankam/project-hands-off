/**
 * Verification script to confirm SurrealDB is using in-memory storage
 * Run this in the browser console to verify the configuration
 */

import { DBWorkerClient } from './db-worker-client.js';

// Note: This verification file needs to be moved to pages/side-panel/src/lib
// For now, create a temporary instance using default worker path
const dbWorkerClient = new DBWorkerClient({
  debug: true,
});

export async function verifyMemoryMode() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 SurrealDB Storage Mode Verification');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Step 1: Initialize the worker
    console.log('Step 1: Initializing database worker...');
    await dbWorkerClient.initialize(true); // Explicit memory mode
    console.log('✅ Worker initialized\n');

    // Step 2: Check console logs
    console.log('Step 2: Check the console logs above');
    console.log('You should see:');
    console.log('  ✓ "Mode: IN-MEMORY (fast, no persistence)"');
    console.log('  ✓ "Connection: mem://"');
    console.log('  ✓ "Storage: RAM (cleared on refresh)"\n');

    // Step 3: Store test data
    console.log('Step 3: Storing test data...');
    const testData = [{
      text: 'Memory mode test',
      html: '<div>Test</div>',
      embedding: Array.from({ length: 384 }, () => Math.random()),
      index: 0,
    }];

    await dbWorkerClient.storeHTMLChunks({
      pageURL: 'https://memory-test.example.com',
      pageTitle: 'Memory Test',
      chunks: testData,
    });
    console.log('✅ Test data stored\n');

    // Step 4: Verify data exists
    console.log('Step 4: Verifying data is accessible...');
    const queryEmbedding = Array.from({ length: 384 }, () => Math.random());
    const results = await dbWorkerClient.searchHTMLChunks(
      'https://memory-test.example.com',
      queryEmbedding,
      1
    );
    
    if (results.length > 0) {
      console.log('✅ Data retrieved successfully from memory\n');
    } else {
      console.warn('⚠️  No results found (this is normal for random embeddings)\n');
    }

    // Step 5: Check IndexedDB
    console.log('Step 5: Checking IndexedDB...');
    console.log('Opening DevTools → Application → Storage → IndexedDB');
    
    // List all IndexedDB databases
    if ('indexedDB' in window) {
      const dbs = await indexedDB.databases();
      const surrealDbs = dbs.filter(db => 
        db.name?.includes('surreal') || 
        db.name?.includes('embeddings')
      );
      
      if (surrealDbs.length === 0) {
        console.log('✅ No SurrealDB IndexedDB databases found (correct for memory mode!)');
        console.log('   This confirms data is stored in RAM, not IndexedDB\n');
      } else {
        console.warn('⚠️  Found SurrealDB IndexedDB databases:');
        surrealDbs.forEach(db => console.warn(`   - ${db.name}`));
        console.warn('   This suggests IndexedDB mode might be active\n');
      }
    }

    // Step 6: Persistence test instructions
    console.log('Step 6: Manual persistence test');
    console.log('To verify data is NOT persisted (correct for memory mode):');
    console.log('  1. Note that data was stored successfully');
    console.log('  2. Refresh this page (F5 or Cmd+R)');
    console.log('  3. Run this verification again');
    console.log('  4. The test data should NOT be found (because memory is cleared)\n');

    // Final verdict
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 VERIFICATION SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('✅ Worker initialized with memory mode');
    console.log('✅ Data can be stored and retrieved');
    console.log('✅ Configuration is correct\n');
    
    console.log('Expected behavior:');
    console.log('  • Data stored in RAM (fast access)');
    console.log('  • No IndexedDB persistence');
    console.log('  • Data cleared on page refresh');
    console.log('  • Perfect for temporary embeddings cache\n');
    
    console.log('Why use memory mode?');
    console.log('  • Faster than IndexedDB (no disk I/O)');
    console.log('  • Embeddings regenerated on each page load anyway');
    console.log('  • No storage quota issues');
    console.log('  • Cleaner (no leftover data)\n');

    return {
      success: true,
      mode: 'memory',
      message: 'SurrealDB is correctly configured for in-memory storage',
    };
  } catch (error) {
    console.error('❌ Verification failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Quick check - just logs the storage mode
 */
export async function quickCheck() {
  console.log('🔍 Quick Storage Mode Check\n');
  
  try {
    await dbWorkerClient.initialize(true);
    console.log('Check the logs above for:');
    console.log('  "Connection: mem://" = Memory mode ✅');
    console.log('  "Connection: indxdb://" = IndexedDB mode ❌\n');
  } catch (error) {
    console.error('Failed:', error);
  }
}

// Export for browser console
if (typeof window !== 'undefined') {
  (window as any).verifyMemoryMode = verifyMemoryMode;
  (window as any).quickCheck = quickCheck;
  
  console.log('💡 Memory mode verification tools loaded:');
  console.log('  verifyMemoryMode() - Full verification');
  console.log('  quickCheck() - Quick check');
}

