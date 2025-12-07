/**
 * Thinking Block Parsing Utilities
 * 
 * Functions for parsing and extracting thinking content from AI responses.
 * Handles <think> and <thinking> tags, distinguishing structural tags from
 * mentioned-as-text tags.
 */

// ========== Types ==========

export interface ThinkingContent {
  thinking: string;
  rest: string;
}

/**
 * Represents a section of content - either thinking or content
 * Used to preserve interleaved structure (thinking1, output1, thinking2, output2, etc.)
 */
export interface ContentSection {
  type: 'thinking' | 'content';
  content: string;
}

// ========== Helper Functions ==========

/**
 * Check if a position in text is inside a code block (fenced with ```)
 * Scans from the beginning of the text to the given position
 */
function isInsideCodeBlock(text: string, position: number): boolean {
  const textBefore = text.slice(0, position);
  
  // Find all code fence markers (```) before this position
  // A code fence is ``` at the start of a line (possibly with language identifier)
  const fencePattern = /^```/gm;
  let fenceCount = 0;
  let match;
  
  while ((match = fencePattern.exec(textBefore)) !== null) {
    fenceCount++;
  }
  
  // Odd number of fences = inside a code block
  return fenceCount % 2 === 1;
}

/**
 * Check if a position in text is inside inline code (single backticks)
 * Only checks the local context, not the entire document
 */
function isInsideInlineCode(text: string, position: number): boolean {
  // Look at a reasonable window before the position
  const windowStart = Math.max(0, position - 200);
  const beforeTag = text.slice(windowStart, position);
  
  // Don't count triple backticks as single backticks
  // Replace ``` with placeholder to avoid counting them
  const withoutFences = beforeTag.replace(/```/g, '   ');
  
  // Count remaining single/double backticks
  const backtickCount = (withoutFences.match(/`/g) || []).length;
  return backtickCount % 2 === 1;
}

/**
 * Check if a <think> tag at a given position is a structural tag (block opener)
 * vs a mentioned-as-text tag (being discussed in content)
 * 
 * Structural tags are:
 * - At the start of the string, or
 * - Preceded by a newline (possibly with whitespace), or
 * - Preceded by } (end of JSON object)
 * - After a code fence closes (```)
 * - After a previous </think> tag
 * 
 * Mentioned-as-text tags are:
 * - Inside code blocks (```)
 * - Inside inline code (`<think>`)
 * - Inside quotes being discussed
 * - In the middle of a sentence
 */
function isStructuralThinkTag(text: string, tagStart: number): boolean {
  // At the very start of text
  if (tagStart === 0) return true;
  
  // Check if inside a fenced code block - NOT structural
  if (isInsideCodeBlock(text, tagStart)) return false;
  
  // Check if inside inline code - NOT structural
  if (isInsideInlineCode(text, tagStart)) return false;
  
  // Get context before the tag
  const beforeTag = text.slice(Math.max(0, tagStart - 100), tagStart);
  
  // Check the immediate preceding character(s)
  const trimmedBefore = beforeTag.trimEnd();
  if (trimmedBefore.length === 0) return true;
  
  const lastChar = trimmedBefore[trimmedBefore.length - 1];
  
  // Structural if preceded by:
  // - newline (\n)
  // - closing brace (}) - end of JSON
  // - quote (") - might be end of string
  // - closing angle bracket (>) - end of previous </think> tag
  // - backtick (`) - end of code fence or inline code
  if (lastChar === '\n' || lastChar === '}' || lastChar === '"' || lastChar === '>' || lastChar === '`') {
    return true;
  }
  
  // Check if preceded by whitespace that follows a newline
  const lines = beforeTag.split('\n');
  if (lines.length > 1) {
    const lastLine = lines[lines.length - 1];
    if (lastLine.trim() === '') return true;
  }
  
  return false;
}

// ========== Main Parsing Functions ==========

/**
 * Parse content into ordered sections (thinking and content blocks interleaved)
 * This preserves the structure: thinking1 -> output1 -> thinking2 -> output2
 * 
 * Only matches <think> tags that are structural separators, ignoring tags
 * that are mentioned as text within content (e.g., inside backticks or quotes)
 */
export function parseContentIntoSections(text: string): ContentSection[] {
  if (!text) return [];
  
  const sections: ContentSection[] = [];
  const thinkRegex = /<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/gi;
  let lastIndex = 0;
  let match;
  
  while ((match = thinkRegex.exec(text)) !== null) {
    // Check if this is a structural tag or mentioned-as-text
    if (!isStructuralThinkTag(text, match.index)) {
      // This tag is mentioned as text, skip it as a section boundary
      continue;
    }
    
    // Add any content before this thinking block
    const beforeContent = text.slice(lastIndex, match.index).trim();
    if (beforeContent) {
      sections.push({ type: 'content', content: beforeContent });
    }
    
    // Add the thinking block
    const thinkContent = match[1].trim();
    if (thinkContent) {
      sections.push({ type: 'thinking', content: thinkContent });
    }
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add any remaining content after the last thinking block
  const afterContent = text.slice(lastIndex).trim();
  if (afterContent) {
    sections.push({ type: 'content', content: afterContent });
  }
  
  // Clean up any orphaned/trailing think tags from all content sections
  // This handles cases where tags are malformed or partially matched
  return sections.map(section => {
    if (section.type === 'content') {
      let cleaned = section.content
        // Remove orphaned opening tags
        .replace(/<think(?:ing)?>\s*/gi, '')
        // Remove orphaned closing tags
        .replace(/\s*<\/think(?:ing)?>/gi, '')
        .trim();
      return { ...section, content: cleaned };
    }
    return section;
  }).filter(section => section.content.length > 0);
}

/**
 * Extract thinking content from text that contains <think>...</think> or <thinking>...</thinking> tags
 * This is the legacy function that combines all thinking into one block.
 * For preserving interleaved structure, use parseContentIntoSections instead.
 * 
 * Only matches structural think tags, ignoring tags mentioned as text.
 */
export function extractThinkingContent(text: string): ThinkingContent {
  if (!text) return { thinking: '', rest: text || '' };
  
  const sections = parseContentIntoSections(text);
  
  const thinkingSections = sections
    .filter(s => s.type === 'thinking')
    .map(s => s.content);
  
  const contentSections = sections
    .filter(s => s.type === 'content')
    .map(s => s.content);
  
  return {
    thinking: thinkingSections.join('\n\n'),
    rest: contentSections.join('\n\n'),
  };
}

