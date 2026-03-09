import { Extension } from '@tiptap/core';

interface EnterToSendOptions {
  onSend: () => void;
  canSend: () => boolean;
}

export const EnterToSend = Extension.create<EnterToSendOptions>({
  name: 'enterToSend',

  addOptions() {
    return {
      onSend: () => {},
      canSend: () => true,
    };
  },

  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { onSend, canSend } = this.options;
        
        // Enter = send message (if can send)
        if (canSend()) {
          onSend();
          return true; // Prevent default
        }
        // If can't send, create new paragraph (allows input rules to work)
        return false;
      },
      'Shift-Enter': () => {
        // When inside a list, split the list item to create a new list item (bullet/number)
        if (this.editor.isActive('bulletList') || this.editor.isActive('orderedList')) {
          if (this.editor.commands.splitListItem('listItem')) {
            return true;
          }
        }
        // Otherwise, new paragraph (allows markdown input rules to work on the new line)
        this.editor.commands.splitBlock();
        return true; // Prevent default hard break
      },
      'Mod-Enter': () => {
        // Cmd/Ctrl+Enter = hard break (for when you really want <br>)
        this.editor.commands.setHardBreak();
        return true;
      },
    };
  },
});

