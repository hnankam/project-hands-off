import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/postcss';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Monorepo root — fallback Tailwind scan uses `base`; cwd alone only sees `pages/web`. */
const repoRoot = path.resolve(__dirname, '../..');

export default {
  plugins: [
    tailwindcss({
      base: repoRoot,
    }),
  ],
};
