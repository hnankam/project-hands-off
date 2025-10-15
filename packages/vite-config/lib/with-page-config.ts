import env, { IS_DEV, IS_PROD } from '@extension/env';
import { watchRebuildPlugin } from '@extension/hmr';
import react from '@vitejs/plugin-react-swc';
import deepmerge from 'deepmerge';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import type { UserConfig } from 'vite';

export const watchOption = IS_DEV
  ? {
      chokidar: {
        awaitWriteFinish: {
          stabilityThreshold: 500,
          pollInterval: 100,
        },
        // Ignore node_modules and common non-source files to reduce watch load
        ignored: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
        // Use native fsevents on macOS for better performance
        usePolling: false,
      },
    }
  : undefined;

export const withPageConfig = (config: UserConfig) =>
  defineConfig(
    deepmerge(
      {
        define: {
          'process.env': env,
        },
        base: '',
        plugins: [react(), IS_DEV && watchRebuildPlugin({ refresh: true }), nodePolyfills()],
        optimizeDeps: {
          exclude: ['@surrealdb/wasm'],
          esbuildOptions: {
            target: 'esnext',
          },
          // Force pre-bundling to speed up subsequent dev server starts
          force: false,
        },
        // Improve caching for faster rebuilds
        cacheDir: 'node_modules/.vite',
        esbuild: {
          supported: {
            'top-level-await': true,
          },
        },
        build: {
          sourcemap: false, // Disable source maps for faster builds
          minify: IS_PROD,
          reportCompressedSize: IS_PROD,
          emptyOutDir: IS_PROD,
          watch: watchOption,
          rollupOptions: {
            external: ['chrome'],
          },
          // Optimize dev builds for speed
          ...(IS_DEV && {
            target: 'esnext',
            chunkSizeWarningLimit: 10000, // Suppress warnings in dev
          }),
        },
      },
      config,
    ),
  );
