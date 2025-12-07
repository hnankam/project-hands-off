/**
 * Markdown and Content Formatting Utilities
 * 
 * Functions for formatting tool call arguments, results, and step content
 * for proper markdown rendering in the GraphStateCard.
 */

// ========== Constants ==========

/** Known programming languages for code block detection */
const KNOWN_LANGUAGES = new Set([
  'python', 'javascript', 'typescript', 'java', 'c', 'cpp', 'c++', 'csharp', 'c#',
  'go', 'rust', 'ruby', 'php', 'swift', 'kotlin', 'scala', 'r', 'perl', 'lua',
  'bash', 'shell', 'sh', 'zsh', 'powershell', 'ps1', 'cmd', 'bat',
  'sql', 'mysql', 'postgresql', 'sqlite',
  'html', 'css', 'scss', 'sass', 'less',
  'json', 'yaml', 'yml', 'xml', 'toml', 'ini', 'csv',
  'markdown', 'md', 'mermaid', 'graphql', 'regex',
  'dockerfile', 'makefile', 'cmake',
  'text', 'plaintext', 'txt'
]);

// ========== Image Helpers ==========

/** Extract image URLs from markdown content */
export const extractImageUrls = (content: string): string[] => {
  const imgRegex = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/g;
  const urls: string[] = [];
  let match;
  while ((match = imgRegex.exec(content)) !== null) {
    urls.push(match[1]);
  }
  return urls;
};

/** Remove image markdown from content (for separate rendering) */
export const removeImageMarkdown = (content: string): string => {
  return content.replace(/!\[.*?\]\(https?:\/\/[^\s)]+\)/g, '').trim();
};

// ========== Language Detection ==========

/**
 * Extract language from first line if it's a language identifier
 * Handles pydantic-ai CodeExecutionTool format where language is on first line
 */
export const extractLanguageFromFirstLine = (code: string): { language: string; cleanCode: string } => {
  const normalizedCode = code.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalizedCode.split('\n');
  
  if (lines.length > 0) {
    const firstLine = lines[0].trim();
    const firstLineLower = firstLine.toLowerCase();
    
    const isKnownLanguage = KNOWN_LANGUAGES.has(firstLineLower);
    const matchesPattern = /^[a-z][a-z0-9+#_\-\.]*$/i.test(firstLine);
    
    // First line is ONLY a language identifier (must be a known language)
    if (isKnownLanguage && matchesPattern) {
      return {
        language: firstLineLower,
        cleanCode: lines.slice(1).join('\n')
      };
    }
  }
  return { language: '', cleanCode: code };
};

// ========== Tool Call Formatting ==========

/**
 * Format tool call arguments for markdown rendering
 * Parses JSON and formats code execution tools specially with code blocks
 */
export const formatToolArgsAsMarkdown = (toolName: string, args: string): string => {
  const normalizedToolName = toolName.toLowerCase();
  const isCodeTool = normalizedToolName.includes('code') || 
                     normalizedToolName.includes('execute') ||
                     normalizedToolName.includes('python');
  
  try {
    const parsed = JSON.parse(args);
    
    // Get code from various possible field names
    const rawCode = parsed.python_code || parsed.code || parsed.source || parsed.script || parsed.content;
    
    if (rawCode) {
      // First check for explicit language field
      let language = parsed.language?.toLowerCase() || parsed.lang?.toLowerCase() || '';
      let code = rawCode;
      
      // If no explicit language, check if first line is a language identifier
      if (!language) {
        const extracted = extractLanguageFromFirstLine(rawCode);
        if (extracted.language) {
          language = extracted.language;
          code = extracted.cleanCode;
        } else if (parsed.python_code) {
          language = 'python';
        } else if (isCodeTool) {
          language = 'python';
        }
      }
      
      return '```' + (language || 'text') + '\n' + code + '\n```';
    }
    
    // For other tools with JSON args, pretty-print as JSON code block
    return '```json\n' + JSON.stringify(parsed, null, 2) + '\n```';
  } catch {
    // If not valid JSON, check for language on first line
    const extracted = extractLanguageFromFirstLine(args);
    if (extracted.language) {
      return '```' + extracted.language + '\n' + extracted.cleanCode + '\n```';
    }
    // Default to python for code tools
    const language = isCodeTool ? 'python' : 'text';
    return '```' + language + '\n' + args + '\n```';
  }
};

/**
 * Format tool call results for markdown rendering
 * Handles JSON output with language prefix (e.g., "json\n{...}")
 */
export const formatToolResultAsMarkdown = (_toolName: string, result: string): string => {
  if (!result) return '';
  
  // Check if result already contains markdown code blocks
  if (result.includes('```')) {
    return result;
  }
  
  // Try to parse as JSON first
  try {
    const parsed = JSON.parse(result);
    // If it's valid JSON, format it nicely
    return '```json\n' + JSON.stringify(parsed, null, 2) + '\n```';
  } catch {
    // Not JSON, check for language prefix
    const extracted = extractLanguageFromFirstLine(result);
    if (extracted.language) {
      return '```' + extracted.language + '\n' + extracted.cleanCode + '\n```';
    }
    
    // Check if content looks like JSON (starts with { or [)
    const trimmed = result.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return '```json\n' + result + '\n```';
    }
    
    // Return as-is (might be plain text or already formatted)
    return result;
  }
};

// ========== Content Preprocessing ==========

/**
 * Preprocess content to wrap code blocks with detected language
 * Handles content that starts with a language identifier on its own line
 */
export const preprocessContentWithLanguageDetection = (content: string): string => {
  if (!content) return content;
  
  // Check if content already has markdown code blocks
  if (content.includes('```')) {
    return content;
  }
  
  // Try to extract language from first line
  const { language, cleanCode } = extractLanguageFromFirstLine(content);
  
  if (language && cleanCode.trim()) {
    // Wrap in proper code block with detected language
    return `\`\`\`${language}\n${cleanCode}\n\`\`\``;
  }
  
  return content;
};

// ========== Code Execution Formatting ==========

/**
 * Format code execution result for markdown rendering
 * Handles structured CodeExecutionOutput from the backend
 */
export const formatCodeResultAsMarkdown = (result: string): string => {
  try {
    const parsed = JSON.parse(result);
    
    // Check if it's a CodeExecutionOutput structure
    if (parsed.code !== undefined) {
      const parts: string[] = [];
      
      // Get language from explicit field
      let language = parsed.language?.toLowerCase() || '';
      let code = parsed.code || '';
      
      // ALWAYS check if code has language on first line (pydantic-ai CodeExecutionTool format)
      const extracted = extractLanguageFromFirstLine(code);
      if (extracted.language) {
        if (!language || language === 'text' || language === extracted.language) {
          language = extracted.language;
        }
        code = extracted.cleanCode;
      }
      
      // Default to python for code execution if still no language
      if (!language) {
        language = 'python';
      }
      
      // Add the code block with proper language
      if (code) {
        const codeBlock = `**Code:**\n\n\`\`\`${language}\n${code}\n\`\`\``;
        parts.push(codeBlock);
      }
      
      // Add the output with status indicator
      if (parsed.success === true) {
        if (parsed.output) {
          parts.push(`**✓ Output:**\n\n${parsed.output}`);
        } else {
          parts.push(`**✓ Executed successfully** *(no output)*`);
        }
      } else if (parsed.success === false) {
        // Show error
        if (parsed.error_message) {
          parts.push(`**✗ Error:**\n\n${parsed.error_message}`);
        } else if (parsed.output) {
          // Sometimes error info is in output when success is false
          parts.push(`**✗ Output:**\n\n${parsed.output}`);
        } else {
          parts.push(`**✗ Execution failed** *(no error message)*`);
        }
      } else {
        // No explicit success field - just show output if present
        if (parsed.output) {
          parts.push(`**Output:**\n\n${parsed.output}`);
        }
        if (parsed.error_message) {
          parts.push(`**Error:**\n\n${parsed.error_message}`);
        }
      }
      
      return parts.join('\n\n');
    }
    
    // For other JSON results, just return as formatted JSON
    return `\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\``;
  } catch {
    // Not JSON - check if it starts with a language identifier
    return preprocessContentWithLanguageDetection(result);
  }
};

// ========== Step Result Formatting ==========

/**
 * General purpose content formatter for graph step results
 * Handles code blocks, JSON, and content that starts with language identifiers
 */
export const formatStepResultAsMarkdown = (content: string): string => {
  if (!content) return content;
  
  // Check if already has markdown code blocks
  if (content.includes('```')) {
    return content;
  }
  
  // Try to parse as JSON
  try {
    const parsed = JSON.parse(content);
    
    // If it's a JSON string, check if it starts with a language identifier
    if (typeof parsed === 'string') {
      return preprocessContentWithLanguageDetection(parsed);
    }
    // If it's a number or boolean, return as-is
    if (typeof parsed === 'number' || typeof parsed === 'boolean') {
      return content;
    }
    // Wrap objects/arrays in JSON code block
    return `\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\``;
  } catch {
    // Not JSON - check if starts with language identifier
    return preprocessContentWithLanguageDetection(content);
  }
};

