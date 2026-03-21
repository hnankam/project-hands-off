import { withUI } from '@extension/ui';

/**
 * Scan the shared side-panel source (via @src alias) plus this package’s entry files.
 * Without ../side-panel/src, Tailwind generates almost no utilities → unstyled web app.
 */
export default withUI({
  content: ['index.html', 'src/**/*.{tsx,ts}', '../side-panel/index.html', '../side-panel/src/**/*.{tsx,ts}'],
});
