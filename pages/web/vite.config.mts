import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { withPageConfig } from '@extension/vite-config';

const rootDir = resolve(import.meta.dirname);
const sidePanelSrc = resolve(rootDir, '../side-panel/src');

/** Same `version` as the extension manifest (`chrome-extension/manifest.ts` → package.json). */
const extensionManifestVersion = JSON.parse(
  readFileSync(resolve(rootDir, '../../chrome-extension/package.json'), 'utf8'),
).version as string;

export default withPageConfig({
  define: {
    __HANDS_OFF_APP_VERSION__: JSON.stringify(extensionManifestVersion),
  },
  resolve: {
    alias: {
      '@src': sidePanelSrc,
      react: resolve(rootDir, '../../node_modules/react'),
      'react-dom': resolve(rootDir, '../../node_modules/react-dom'),
    },
    dedupe: ['react', 'react-dom'],
  },
  base: '/',
  publicDir: resolve(rootDir, '../side-panel/public'),
  server: {
    port: 5174,
    strictPort: false,
    // Same-origin `/api` + `/health` → runtime so session cookies work (avoids cross-port 401 on CopilotKit).
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/health': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
  preview: {
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/health': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
  build: {
    outDir: resolve(rootDir, '..', '..', 'dist', 'web'),
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
      external: ['@huggingface/transformers', 'onnxruntime-web', 'onnxruntime-common'],
    },
    copyPublicDir: true,
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'mermaid'],
    exclude: ['@huggingface/transformers', 'onnxruntime-web', 'onnxruntime-common'],
    esbuildOptions: {
      target: 'esnext',
    },
  },
});
