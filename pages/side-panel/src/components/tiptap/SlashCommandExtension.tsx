import { Extension } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import Suggestion, { SuggestionOptions } from '@tiptap/suggestion';
import tippy, { Instance as TippyInstance } from 'tippy.js';
import * as React from 'react';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';

export interface SlashCommand {
  title: string;
  description: string;
  icon: string;
  command: ({ editor, range }: any) => void;
}

interface SlashCommandListProps {
  items: SlashCommand[];
  command: (item: SlashCommand) => void;
}

interface SlashCommandsListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const SlashCommandsList = forwardRef<SlashCommandsListRef, SlashCommandListProps>((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectItem = (index: number) => {
    const item = props.items[index];
    if (item && item.title !== 'separator') {
      props.command(item);
    }
  };

  const findNextSelectableIndex = (currentIndex: number, direction: 'up' | 'down'): number => {
    const step = direction === 'up' ? -1 : 1;
    let newIndex = (currentIndex + step + props.items.length) % props.items.length;
    let attempts = 0;
    
    // Skip separators
    while (props.items[newIndex]?.title === 'separator' && attempts < props.items.length) {
      newIndex = (newIndex + step + props.items.length) % props.items.length;
      attempts++;
    }
    
    return newIndex;
  };

  const upHandler = () => {
    setSelectedIndex(prev => findNextSelectableIndex(prev, 'up'));
  };

  const downHandler = () => {
    setSelectedIndex(prev => findNextSelectableIndex(prev, 'down'));
  };

  const enterHandler = () => {
    selectItem(selectedIndex);
  };

  useEffect(() => {
    // Initialize to first non-separator item
    const firstSelectableIndex = props.items.findIndex(item => item.title !== 'separator');
    setSelectedIndex(firstSelectableIndex >= 0 ? firstSelectableIndex : 0);
  }, [props.items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === 'ArrowUp') {
        upHandler();
        return true;
      }
      if (event.key === 'ArrowDown') {
        downHandler();
        return true;
      }
      if (event.key === 'Enter') {
        enterHandler();
        return true;
      }
      return false;
    },
  }));

  return (
    <div className="slash-command-list">
      <div>
        {props.items.length > 0 ? (
          props.items.map((item, index) => {
            // Render separator
            if (item.title === 'separator') {
              return <div key={index} className="slash-command-separator" />;
            }
            
            return (
              <button
                key={index}
                className={`slash-command-item ${index === selectedIndex && item.title !== 'separator' ? 'selected' : ''}`}
                onClick={() => selectItem(index)}
                type="button"
              >
                <span 
                  className="slash-command-icon" 
                  dangerouslySetInnerHTML={{ __html: item.icon }}
                />
                <div className="slash-command-content">
                  <div className="slash-command-title">{item.title}</div>
                  {item.description && (
                    <div className="slash-command-description">{item.description}</div>
                  )}
                </div>
              </button>
            );
          })
        ) : (
          <div className="slash-command-empty">No results</div>
        )}
      </div>
    </div>
  );
});

SlashCommandsList.displayName = 'SlashCommandsList';

export const createSlashCommandExtension = (commands: SlashCommand[]) => {
  return Extension.create({
    name: 'slashCommands',

    addOptions() {
      return {
        suggestion: {
          char: '/',
          startOfLine: false,
          command: ({ editor, range, props }: any) => {
            props.command({ editor, range });
          },
        } as Partial<SuggestionOptions>,
      };
    },

    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          ...this.options.suggestion,
          items: ({ query }: { query: string }) => {
            if (!query) {
              // Show all commands including separator when no query
              return commands;
            }
            // Filter out separators and match query
            return commands.filter((item) =>
              item.title !== 'separator' && 
              item.title.toLowerCase().includes(query.toLowerCase())
            );
          },
          render: () => {
            let component: ReactRenderer<SlashCommandsListRef, SlashCommandListProps>;
            let popup: TippyInstance[];

            return {
              onStart: (props: any) => {
                component = new ReactRenderer(SlashCommandsList, {
                  props,
                  editor: props.editor,
                });

                if (!props.clientRect) {
                  return;
                }

                popup = tippy('body', {
                  getReferenceClientRect: props.clientRect,
                  appendTo: () => document.body,
                  content: component.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: 'manual',
                  placement: 'top-start',
                  animation: false,
                  duration: 0,
                });
              },
              onUpdate(props: any) {
                component.updateProps(props);

                if (!props.clientRect) {
                  return;
                }

                popup[0].setProps({
                  getReferenceClientRect: props.clientRect,
                });
              },
              onKeyDown(props: any) {
                if (props.event.key === 'Escape') {
                  popup[0].hide();
                  return true;
                }
                return component.ref?.onKeyDown(props) ?? false;
              },
              onExit() {
                popup[0].destroy();
                component.destroy();
              },
            };
          },
        }),
      ];
    },
  });
};

