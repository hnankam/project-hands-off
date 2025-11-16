import { resolve } from 'node:path';
import { withPageConfig } from '@extension/vite-config';

const rootDir = resolve(import.meta.dirname);
const srcDir = resolve(rootDir, 'src');

export default withPageConfig({
  resolve: {
    alias: {
      '@src': srcDir,
      // Ensure single React instance
      'react': resolve(rootDir, '../../node_modules/react'),
      'react-dom': resolve(rootDir, '../../node_modules/react-dom'),
    },
    dedupe: ['react', 'react-dom'], // Force dedupe of React
  },
  publicDir: resolve(rootDir, 'public'),
  build: {
    outDir: resolve(rootDir, '..', '..', 'dist', 'side-panel'),
    minify: 'esbuild', // Fast minification (default but explicit)
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
      // Exclude transformers.js - it's loaded in background script only
      external: [
        '@huggingface/transformers',
        'onnxruntime-web',
        'onnxruntime-common',
      ],
    },
    copyPublicDir: true,
  },
  // Don't pre-bundle transformers - side panel doesn't use it anymore
  optimizeDeps: {
    include: ['react', 'react-dom', 'mermaid'],
    exclude: ['@huggingface/transformers', 'onnxruntime-web', 'onnxruntime-common'],
    esbuildOptions: {
      target: 'esnext',
    },
  },
});
