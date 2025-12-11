import { resolve } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { makeEntryPointPlugin } from '@extension/hmr';
import { getContentScriptEntries, withPageConfig } from '@extension/vite-config';
import { IS_DEV } from '@extension/env';
import { build } from 'vite';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';

const rootDir = resolve(import.meta.dirname);
const srcDir = resolve(rootDir, 'src');
const matchesDir = resolve(srcDir, 'matches');

// Helper to build Tailwind CSS using postcss API (v4 compatible)
async function buildTailwind(input: string, output: string): Promise<void> {
  const css = await readFile(input, 'utf-8');
  const result = await postcss([tailwindcss()]).process(css, {
    from: input,
    to: output,
  });
  
  // Ensure output directory exists
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, result.css);
  if (result.map) {
    await writeFile(`${output}.map`, result.map.toString());
  }
}

const configs = Object.entries(getContentScriptEntries(matchesDir)).map(([name, entry]) => ({
  name,
  config: withPageConfig({
    mode: IS_DEV ? 'development' : undefined,
    resolve: {
      alias: {
        '@src': srcDir,
      },
    },
    publicDir: resolve(rootDir, 'public'),
    plugins: [IS_DEV && makeEntryPointPlugin()],
    build: {
      lib: {
        name: name,
        formats: ['iife'],
        entry,
        fileName: name,
      },
      outDir: resolve(rootDir, '..', '..', 'dist', 'content-runtime'),
      emptyOutDir: false, // Don't clear outDir to keep all build outputs
    },
  }),
}));

// Add extraction script as a separate build target
const extractionConfig = {
  name: 'extraction',
  config: withPageConfig({
    mode: IS_DEV ? 'development' : undefined,
    resolve: {
      alias: {
        '@src': srcDir,
      },
    },
    build: {
      lib: {
        name: '__extractPageContent',
        formats: ['iife'],
        entry: resolve(srcDir, 'extraction', 'index.ts'),
        fileName: 'extraction',
      },
      rollupOptions: {
        output: {
          extend: true, // Extend window object
          exports: 'default', // Export as default
        },
      },
      outDir: resolve(rootDir, '..', '..', 'dist', 'content-runtime'),
      emptyOutDir: false,
      minify: !IS_DEV,
    },
  }),
};

// Add extraction to configs
configs.push(extractionConfig);

// Build in parallel (faster)
const builds = configs.map(async ({ name, config }) => {
  // Skip CSS build for extraction script (it doesn't need Tailwind)
  if (name !== 'extraction') {
    const folder = resolve(matchesDir, name);
    await buildTailwind(
      resolve(folder, 'index.css'),
      resolve(rootDir, 'dist', name, 'index.css'),
    );
  }
  //@ts-expect-error This is hidden property into vite's resolveConfig()
  config.configFile = false;
  await build(config);
});

await Promise.all(builds);
