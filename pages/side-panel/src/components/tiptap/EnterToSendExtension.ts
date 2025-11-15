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
        
        // Shift+Enter = new line (default behavior)
        // Enter alone = send message
        if (canSend()) {
          onSend();
          return true; // Prevent default
        }
        return false; // Allow default (new line)
      },
      'Shift-Enter': () => {
        // Always allow new line with Shift+Enter
        return false;
      },
    };
  },
});

