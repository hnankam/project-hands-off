import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const rootDir = resolve(import.meta.dirname);
const srcDir = resolve(rootDir, 'src');

export default defineConfig({
  resolve: {
    alias: {
      '@src': srcDir,
    },
  },
  publicDir: resolve(rootDir, 'public'),
  base: '', // Empty base for relative paths (not './')
  build: {
    outDir: resolve(rootDir, '..', '..', 'dist', 'offscreen'),
    minify: 'esbuild', // Fast minification
    sourcemap: false, // Skip sourcemaps for faster builds
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(srcDir, 'index.html'),
      output: {
        // Put all assets at the root level with relative paths
        entryFileNames: 'offscreen.js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
  experimental: {
    renderBuiltUrl(filename, { hostType }) {
      // Force relative paths for all assets
      if (hostType === 'html') {
        return '../' + filename;
      }
      return { relative: true };
    },
  },
  // Optimize dependencies - transformers.js is large
  optimizeDeps: {
    include: ['@huggingface/transformers'],
    esbuildOptions: {
      target: 'esnext',
    },
  },
});

