import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class', // Enable class-based dark mode instead of media query
  theme: {
    extend: {},
  },
  plugins: [],
} as Omit<Config, 'content'>;
