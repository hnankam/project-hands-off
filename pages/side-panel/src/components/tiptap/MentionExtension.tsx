import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { ReactRenderer } from '@tiptap/react';
import { SuggestionOptions, SuggestionProps } from '@tiptap/suggestion';
import tippy, { Instance as TippyInstance } from 'tippy.js';

export interface MentionSuggestion {
  id: string;
  label: string;
  avatar?: string;
  type?: 'user' | 'agent' | 'file' | 'variable';
}

interface MentionListProps {
  items: MentionSuggestion[];
  command: (item: MentionSuggestion) => void;
}

interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const MentionList = forwardRef<MentionListRef, MentionListProps>((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectItem = (index: number) => {
    const item = props.items[index];
    if (item) {
      props.command(item);
    }
  };

  const upHandler = () => {
    setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length);
  };

  const downHandler = () => {
    setSelectedIndex((selectedIndex + 1) % props.items.length);
  };

  const enterHandler = () => {
    selectItem(selectedIndex);
  };

  useEffect(() => setSelectedIndex(0), [props.items]);

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

  const getTypeIcon = (type?: string) => {
    switch (type) {
      case 'agent':
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z" />
            <path d="M12 6v6l4 2" />
          </svg>
        );
      case 'file':
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
            <polyline points="13 2 13 9 20 9" />
          </svg>
        );
      case 'variable':
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 7V4h16v3" />
            <path d="M9 20h6" />
            <path d="M12 4v16" />
          </svg>
        );
      default: // user
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        );
    }
  };

  return (
    <div className="mention-list">
      <div>
        {props.items.length > 0 ? (
          props.items.map((item, index) => (
            <button
              key={item.id}
              className={`mention-item ${index === selectedIndex ? 'selected' : ''}`}
              onClick={() => selectItem(index)}
              type="button"
            >
              <span className="mention-icon">{getTypeIcon(item.type)}</span>
              <span className="mention-label">{item.label}</span>
            </button>
          ))
        ) : (
          <div className="mention-empty">No results</div>
        )}
      </div>
    </div>
  );
});

MentionList.displayName = 'MentionList';

export const createMentionSuggestion = (
  suggestions: MentionSuggestion[]
): Omit<SuggestionOptions, 'editor'> => {
  return {
    char: '@',
    startOfLine: false,
    items: ({ query }: { query: string }) => {
      return suggestions
        .filter((item) =>
          item.label.toLowerCase().includes(query.toLowerCase())
        )
        .slice(0, 10);
    },
    render: () => {
      let component: ReactRenderer<MentionListRef, MentionListProps>;
      let popup: TippyInstance[];

      return {
        onStart: (props: SuggestionProps) => {
          component = new ReactRenderer(MentionList, {
            props,
            editor: props.editor,
          });

          if (!props.clientRect) {
            return;
          }

          popup = tippy('body', {
            getReferenceClientRect: props.clientRect as any,
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
        onUpdate(props: SuggestionProps) {
          component.updateProps(props);

          if (!props.clientRect) {
            return;
          }

          popup[0].setProps({
            getReferenceClientRect: props.clientRect as any,
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
  };
};

