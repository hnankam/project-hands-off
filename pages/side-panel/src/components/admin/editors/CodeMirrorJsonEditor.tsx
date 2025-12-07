import React, { useEffect, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState, Compartment } from '@codemirror/state';
import { json } from '@codemirror/lang-json';
import { cn } from '@extension/ui';

// Custom dark theme matching app design
const customDarkTheme = EditorView.theme({
  '&': {
    backgroundColor: '#151C24',
    color: '#e6edf3',
  },
  '.cm-content': {
    caretColor: '#e6edf3',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: '#e6edf3',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: '#3d5a80',
  },
  '.cm-activeLine': {
    backgroundColor: 'transparent',
  },
  '.cm-selectionMatch': {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  '.cm-gutters': {
    backgroundColor: '#0C1117',
    color: '#8b949e',
    border: 'none',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    color: '#8b949e',
  },
}, { dark: true });

// Custom syntax highlighting for JSON in dark mode
const customDarkHighlight = EditorView.theme({
  '.cm-content': {
    color: '#e6edf3',
  },
  '.cm-string': {
    color: '#a5d6ff', // Bright light blue for strings - high contrast
  },
  '.cm-number': {
    color: '#7ee787', // Bright green for numbers - high contrast
  },
  '.cm-bool': {
    color: '#79c0ff', // Bright blue for booleans
  },
  '.cm-null': {
    color: '#ffa657', // Orange for null - stands out
  },
  '.cm-keyword': {
    color: '#ff7b72', // Bright coral for keywords
  },
  '.cm-propertyName': {
    color: '#ffa657', // Bright orange for property names (keys) - highly visible
    fontWeight: '600', // Bold for keys in dark mode
  },
  '.cm-punctuation': {
    color: '#8b949e', // Lighter gray for punctuation - more visible
  },
}, { dark: true });

// Custom light theme for better readability
const customLightTheme = EditorView.theme({
  '&': {
    backgroundColor: '#ffffff',
    color: '#1f2937',
  },
  '.cm-content': {
    caretColor: '#1f2937',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: '#1f2937',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: '#b3d7ff',
  },
  '.cm-activeLine': {
    backgroundColor: 'transparent',
  },
  '.cm-selectionMatch': {
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
  },
  '.cm-gutters': {
    backgroundColor: '#f3f4f6',
    color: '#6b7280',
    border: 'none',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    color: '#9ca3af',
  },
}, { dark: false });

// Custom syntax highlighting for JSON in light mode
const customLightHighlight = EditorView.theme({
  '&.cm-editor.cm-focused': {
    outline: 'none',
  },
  '.cm-content': {
    color: '#1f2937',
  },
  '.cm-string': {
    color: '#059669', // Green for strings (more readable)
  },
  '.cm-number': {
    color: '#0891b2', // Cyan for numbers
  },
  '.cm-bool': {
    color: '#2563eb', // Blue for booleans
  },
  '.cm-null': {
    color: '#7c3aed', // Purple for null
  },
  '.cm-keyword': {
    color: '#db2777', // Pink for keywords
  },
  '.cm-propertyName': {
    color: '#0369a1', // Dark blue for property names (keys)
    fontWeight: '500', // Make keys bold for better readability
  },
  '.cm-punctuation': {
    color: '#6b7280', // Gray for punctuation
  },
}, { dark: false });

export interface CodeMirrorJsonEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  isLight: boolean;
  minHeight?: string;
  maxHeight?: string;
  readOnly?: boolean;
}

/**
 * CodeMirrorJsonEditor Component
 * 
 * A JSON editor using CodeMirror 6 with:
 * - Syntax highlighting
 * - JSON validation
 * - Auto-indentation
 * - Bracket matching
 * - Line numbers
 * - Theme support (light/dark)
 */
export const CodeMirrorJsonEditor: React.FC<CodeMirrorJsonEditorProps> = ({
  value,
  onChange,
  placeholder = '{}',
  isLight,
  minHeight = '100px',
  maxHeight = '300px',
  readOnly = false,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartmentRef = useRef<Compartment | null>(null);
  const readOnlyCompartmentRef = useRef<Compartment | null>(null);

  useEffect(() => {
    if (!editorRef.current) return;

    // Create theme compartment for dynamic theme switching
    const themeCompartment = new Compartment();
    themeCompartmentRef.current = themeCompartment;

    // Create readOnly compartment for dynamic readOnly switching
    const readOnlyCompartment = new Compartment();
    readOnlyCompartmentRef.current = readOnlyCompartment;

    // Create editor state
    const startState = EditorState.create({
      doc: value || '',
      extensions: [
        basicSetup,
        json(),
        themeCompartment.of(isLight ? [customLightTheme, customLightHighlight] : [customDarkTheme, customDarkHighlight]),
        readOnlyCompartment.of(EditorState.readOnly.of(readOnly)),
        EditorView.updateListener.of((update: any) => {
          if (update.docChanged) {
            const newValue = update.state.doc.toString();
            onChange(newValue);
          }
        }),
        EditorView.theme({
          '&': {
            fontSize: '13px',
          },
          '.cm-scroller': {
            fontFamily: "'Courier New', Courier, monospace",
            overflow: 'auto',
          },
          '.cm-content': {
            padding: '4px 0',
          },
          '.cm-line': {
            padding: '0 8px',
          },
        }),
      ],
    });

    // Create editor view
    const view = new EditorView({
      state: startState,
      parent: editorRef.current,
    });

    viewRef.current = view;

    // Cleanup
    return () => {
      view.destroy();
      viewRef.current = null;
      themeCompartmentRef.current = null;
      readOnlyCompartmentRef.current = null;
    };
  }, []); // Only create once

  // Update theme when isLight changes
  useEffect(() => {
    if (viewRef.current && themeCompartmentRef.current) {
      viewRef.current.dispatch({
        effects: themeCompartmentRef.current.reconfigure(
          isLight ? [customLightTheme, customLightHighlight] : [customDarkTheme, customDarkHighlight]
        ),
      });
    }
  }, [isLight]);

  // Update readOnly state when it changes
  useEffect(() => {
    if (viewRef.current && readOnlyCompartmentRef.current) {
      viewRef.current.dispatch({
        effects: readOnlyCompartmentRef.current.reconfigure(
          EditorState.readOnly.of(readOnly)
        ),
      });
    }
  }, [readOnly]);

  // Update content when value changes externally
  useEffect(() => {
    if (viewRef.current && value !== viewRef.current.state.doc.toString()) {
      const transaction = viewRef.current.state.update({
        changes: {
          from: 0,
          to: viewRef.current.state.doc.length,
          insert: value || '',
        },
      });
      viewRef.current.dispatch(transaction);
    }
  }, [value]);

  return (
    <div
      className={cn(
        'codemirror-json-editor border rounded overflow-hidden',
        isLight ? 'border-gray-300 bg-white' : 'border-gray-600 bg-[#151C24]'
      )}
      style={{ maxHeight, minHeight }}
    >
      <div ref={editorRef} />
    </div>
  );
};

export default CodeMirrorJsonEditor;

