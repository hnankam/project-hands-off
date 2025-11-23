/**
 * @fileoverview Text sanitization utilities
 * 
 * Provides consistent text sanitization across the extension for normalizing
 * whitespace, removing special characters, and cleaning text content.
 * 
 * @module background/utils/sanitization
 */

import type { TextSanitizationOptions } from '../types/index.js';

/**
 * Default sanitization options
 */
const DEFAULT_OPTIONS: Required<TextSanitizationOptions> = {
  trimLines: true,
  collapseSpaces: true,
  collapseNewlines: true,
  maxNewlines: 2,
  trim: true,
  removeZeroWidth: true,
  normalizeUnicode: true,
};

/**
 * Sanitize text by normalizing whitespace and removing special characters
 * 
 * @param text - Text to sanitize
 * @param options - Sanitization options
 * @returns Sanitized text
 * 
 * @example
 * const clean = sanitizeText('Hello    World\n\n\n', { maxNewlines: 1 });
 * // Returns: 'Hello World\n'
 */
export function sanitizeText(
  text: string | null | undefined,
  options: TextSanitizationOptions = {}
): string {
  if (!text) return '';
  
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let result = text;
  
  // Remove zero-width characters
  if (opts.removeZeroWidth) {
    result = result.replace(/[\u200B-\u200D\uFEFF]/g, '');
  }
  
  // Normalize Unicode whitespace to regular spaces
  if (opts.normalizeUnicode) {
    result = result.replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ');
  }
  
  // Replace tabs with spaces
  result = result.replace(/\t/g, ' ');
  
  // Collapse multiple spaces into single space
  if (opts.collapseSpaces) {
    result = result.replace(/ {2,}/g, ' ');
  }
  
  // Trim each line
  if (opts.trimLines) {
    result = result.split('\n').map(line => line.trim()).join('\n');
  }
  
  // Collapse multiple newlines
  if (opts.collapseNewlines) {
    const pattern = new RegExp(`\\n{${opts.maxNewlines + 1},}`, 'g');
    result = result.replace(pattern, '\n'.repeat(opts.maxNewlines));
  }
  
  // Trim leading/trailing whitespace
  if (opts.trim) {
    result = result.trim();
  }
  
  return result;
}

