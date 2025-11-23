/**
 * @fileoverview Text sanitization utilities
 */

export const sanitizeText = (text: string | null | undefined, options = {
  trimLines: true,
  collapseSpaces: true,
  collapseNewlines: true,
  maxNewlines: 2,
  trim: true,
  removeZeroWidth: true,
  normalizeUnicode: true
}): string => {
  if (!text) return '';
  
  let result = text;
  
  // Remove zero-width characters if enabled
  if (options.removeZeroWidth) {
    result = result.replace(/[\u200B-\u200D\uFEFF]/g, '');
  }
  
  // Normalize Unicode whitespace to regular spaces if enabled
  if (options.normalizeUnicode) {
    result = result.replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ');
  }
  
  // Replace tabs with spaces
  result = result.replace(/\t/g, ' ');
  
  // Collapse multiple spaces into single space (if enabled)
  if (options.collapseSpaces) {
    result = result.replace(/ {2,}/g, ' ');
  }
  
  // Trim each line (if enabled)
  if (options.trimLines) {
    result = result.split('\n').map(line => line.trim()).join('\n');
  }
  
  // Collapse multiple newlines (if enabled)
  if (options.collapseNewlines) {
    const pattern = new RegExp(`\\n{${options.maxNewlines + 1},}`, 'g');
    result = result.replace(pattern, '\n'.repeat(options.maxNewlines));
  }
  
  // Trim leading/trailing whitespace (if enabled)
  if (options.trim) {
    result = result.trim();
  }
  
  return result;
};

