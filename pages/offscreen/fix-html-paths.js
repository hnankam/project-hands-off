/**
 * Post-build script to fix HTML paths in the offscreen document
 * Vite generates absolute paths which don't work in Chrome extensions
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const htmlPath = resolve(__dirname, '../../dist/offscreen/src/index.html');

console.log('[fix-html-paths] Fixing offscreen HTML paths...');

try {
  let html = readFileSync(htmlPath, 'utf-8');
  
  // Replace absolute paths with relative paths
  // Match: src="/assets/index-HASH.js" or src="/offscreen.js"
  html = html.replace(/src="\/assets\/[^"]+\.js"/g, 'src="../offscreen.js"');
  html = html.replace(/src="\/offscreen\.js"/g, 'src="../offscreen.js"');
  
  writeFileSync(htmlPath, html);
  console.log('[fix-html-paths] ✅ Fixed HTML paths to use relative paths');
} catch (error) {
  console.error('[fix-html-paths] ❌ Error fixing HTML paths:', error.message);
  process.exit(1);
}

