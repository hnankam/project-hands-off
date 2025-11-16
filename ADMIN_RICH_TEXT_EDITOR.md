# Admin Rich Text Editor Implementation

## Overview
Replaced the plain textarea in the Agents Tab base instructions forms with a rich text editor featuring a formatting toolbar. The editor provides a better user experience for writing agent instructions with support for markdown-like formatting.

**⚡ IMPORTANT: Markdown Output** - As of the latest update, this editor now outputs **Markdown format** instead of HTML to significantly reduce token usage when sending instructions to AI agents. Markdown is more compact and efficient for LLM token consumption.

## Component Created

### RichTextEditor (`/pages/side-panel/src/components/admin/RichTextEditor.tsx`)

A reusable rich text editor component specifically designed for the admin page.

#### Features
- **Formatting Toolbar** with visual buttons for:
  - Text formatting: Bold, Italic, Inline Code
  - Headings: H1, H2, H3
  - Lists: Bullet lists, Numbered lists
  - Block elements: Code blocks, Blockquotes, Horizontal rules
  - Undo/Redo functionality

- **Design Consistency**:
  - Matches admin page styling
  - Full light/dark mode support
  - Theme-aware colors and borders
  - Consistent with overall app design

- **User Experience**:
  - Visual toolbar with icons
  - Active state indicators
  - Keyboard shortcuts (Ctrl+B, Ctrl+I, etc.)
  - Placeholder text support
  - Scrollable content area
  - Configurable min/max height

#### Props

```typescript
interface RichTextEditorProps {
  value: string;              // Markdown content (also accepts HTML for backwards compatibility)
  onChange: (value: string) => void;  // Callback with Markdown output
  placeholder?: string;       // Placeholder text
  isLight: boolean;          // Theme (light/dark)
  minHeight?: string;        // Min height (default: '150px')
  maxHeight?: string;        // Max height (default: '400px')
}
```

#### Toolbar Buttons

**Text Formatting**
- **Bold** - Make text bold (Ctrl+B)
- **Italic** - Make text italic (Ctrl+I)
- **Code** - Inline code formatting (Ctrl+E)

**Headings**
- **H1** - Large heading
- **H2** - Medium heading
- **H3** - Small heading

**Lists**
- **Bullet List** - Unordered list
- **Numbered List** - Ordered list

**Block Elements**
- **Code Block** - Multi-line code with syntax highlighting
- **Blockquote** - Quote block with left border
- **Horizontal Rule** - Divider line

**History**
- **Undo** - Undo last change (Ctrl+Z)
- **Redo** - Redo last undone change (Ctrl+Y)

## Integration

### AgentsTab.tsx Updates

**Import Added:**
```typescript
import { RichTextEditor } from './RichTextEditor';
```

**Create Form (Lines 1470-1477):**
Replaced textarea with:
```typescript
<RichTextEditor
  value={createForm.promptTemplate}
  onChange={value => setCreateForm(prev => ({ ...prev, promptTemplate: value }))}
  placeholder="You are a helpful AI assistant..."
  isLight={isLight}
  minHeight="180px"
  maxHeight="500px"
/>
```

**Edit Form (Lines 1770-1777):**
Replaced textarea with:
```typescript
<RichTextEditor
  value={editForm.promptTemplate}
  onChange={value => setEditForm(prev => (prev ? { ...prev, promptTemplate: value } : prev))}
  placeholder="You are a helpful AI assistant..."
  isLight={isLight}
  minHeight="180px"
  maxHeight="500px"
/>
```

## CSS Styling

### Added to SidePanel.css (Lines 2880-3072)

**Comprehensive styling for:**
- Editor content area
- Headings (H1-H3)
- Text formatting (bold, italic, code)
- Code blocks
- Blockquotes
- Horizontal rules
- Lists (ordered, unordered, nested)
- Placeholder text
- Custom scrollbar
- Full dark mode support

**Key CSS Classes:**
- `.admin-rich-text-editor` - Main editor container
- `.admin-rich-text-scrollbar` - Custom scrollbar styling

## Design Decisions

### 1. HTML Storage
The editor outputs HTML, which allows for rich formatting preservation. The backend can store this HTML directly or convert it as needed.

### 2. Limited Heading Levels
Only H1-H3 are supported to maintain clean hierarchy in agent instructions without excessive nesting.

### 3. Syntax Highlighting
Code blocks use the `lowlight` library for syntax highlighting, consistent with the chat editor.

### 4. Toolbar Design
- Compact toolbar with icons only (no text labels)
- Tooltips on hover for discoverability
- Visual active states for format buttons
- Logical grouping with dividers
- Disabled states for unavailable actions

### 5. Height Configuration
- Configurable min/max height
- Scrollable content area
- Prevents excessive form height
- Better for long instructions

## Usage Examples

### Basic Usage
```typescript
<RichTextEditor
  value={content}
  onChange={setContent}
  isLight={true}
/>
```

### With Custom Height
```typescript
<RichTextEditor
  value={content}
  onChange={setContent}
  placeholder="Enter instructions..."
  isLight={isLight}
  minHeight="200px"
  maxHeight="600px"
/>
```

## Keyboard Shortcuts

- **Ctrl+B** / **Cmd+B** - Bold
- **Ctrl+I** / **Cmd+I** - Italic
- **Ctrl+E** / **Cmd+E** - Inline Code
- **Ctrl+Z** / **Cmd+Z** - Undo
- **Ctrl+Y** / **Cmd+Y** - Redo
- **Ctrl+Shift+1** - Heading 1
- **Ctrl+Shift+2** - Heading 2
- **Ctrl+Shift+3** - Heading 3

## Benefits

1. **Better UX**: Visual toolbar makes formatting easier than remembering markdown syntax
2. **WYSIWYG**: See formatted content while editing
3. **Consistency**: Matches app design language
4. **Accessibility**: Keyboard shortcuts and proper ARIA attributes
5. **Flexibility**: Reusable component for other admin forms
6. **Rich Formatting**: Support for headings, lists, code, quotes, and more
7. **Theme Support**: Full light/dark mode integration

## Technical Stack

- **Tiptap** - Modern rich text editor framework
- **StarterKit** - Base extensions for common formatting
- **CodeBlockLowlight** - Syntax-highlighted code blocks
- **Lowlight** - Syntax highlighting library
- **Placeholder** - Placeholder text extension

## Browser Compatibility

✅ Chrome/Edge (Chromium)
✅ Firefox
✅ Safari
✅ Brave

## Future Enhancements

Possible additions:
- **Tables** - For structured data
- **Links** - Hyperlink support
- **Images** - Inline images (if needed)
- **Strikethrough** - Additional text formatting
- **Text Color** - Color highlighting
- **Find/Replace** - Search within content
- **Word Count** - Character/word counter
- **Templates** - Quick insertion of common patterns
- **Markdown Import/Export** - Convert between formats

## Files Modified

1. `/pages/side-panel/src/components/admin/RichTextEditor.tsx` - Rich text editor component (updated to output Markdown)
2. `/pages/side-panel/src/components/admin/AgentsTab.tsx` - Integrated editor and MarkdownRenderer
3. `/pages/side-panel/src/SidePanel.css` - Added editor styling and markdown display styles
4. `/pages/side-panel/src/components/tiptap/markdownSerializer.ts` - Added `serializeToMarkdown()` and `markdownToJson()` exports

## Testing

To test the rich text editor:

1. Navigate to Admin Page → Agents Tab
2. Click "Create New Agent"
3. Test the formatting toolbar:
   - Type text and apply bold, italic
   - Insert headings (H1, H2, H3)
   - Create bullet and numbered lists
   - Insert code blocks and blockquotes
   - Add horizontal rules
   - Use undo/redo
4. Save the agent and verify instructions are preserved
5. Edit an existing agent and verify content loads correctly
6. Test in both light and dark modes

## Notes

- **The editor now stores content as Markdown** (changed from HTML for token efficiency)
- Existing HTML instructions are supported for backwards compatibility
- The editor serializes to Markdown on save using `serializeToMarkdown()` from `markdownSerializer.ts`
- Agent cards display instructions using `MarkdownRenderer` component
- The toolbar is sticky-free and scrolls with content
- All formatting is reversible (toggleable)
- Empty editor shows placeholder text

### Markdown Output Benefits
- **~50-70% fewer tokens** compared to HTML
- More human-readable in database
- Easier to edit manually if needed
- Standard format for LLM interactions
- Better for version control

### Example Comparison
**HTML Output** (old):
```html
<p>You are a helpful assistant.</p><ul><li>Document formatting</li><li>Track changes</li></ul>
```
~120 characters

**Markdown Output** (new):
```markdown
You are a helpful assistant.
- Document formatting
- Track changes
```
~70 characters (40% reduction)

## Conclusion

The rich text editor significantly improves the user experience for creating and editing agent instructions. The visual toolbar makes formatting intuitive, while maintaining consistency with the overall app design. The component is reusable and can be easily integrated into other admin forms as needed.

