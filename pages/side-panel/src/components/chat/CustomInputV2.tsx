/**
 * Custom Input Component for CopilotKit V2
 * 
 * A wrapper around CopilotChatInput that uses CustomTiptapTextArea.
 * 
 * Features:
 * - Tiptap rich text editor with markdown support
 * - Code block syntax highlighting
 * - Slash commands (/)
 * - Mentions (@)
 * - Link auto-detection
 * - Enter to send
 * - File paste handling
 * 
 * IMPORTANT: CopilotKit's renderSlot function checks `typeof slot === "function"`,
 * but React forwardRef components have `typeof === "object"`. To work around this,
 * we wrap the forwardRef component in a regular function component.
 */
import React from 'react';
import { CopilotChatInput, type CopilotChatInputProps } from '@copilotkitnext/react';
import { CustomTiptapTextArea } from './CustomTiptapTextArea';
import { useCopilotChatContext } from '../../hooks/copilotkit';

/**
 * CustomTiptapTextAreaSlotInner - The actual forwardRef component for Tiptap
 */
const CustomTiptapTextAreaSlotInner = React.forwardRef<
  HTMLDivElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>((textareaProps, ref) => {
  const { placeholder: propsPlaceholder, ...restProps } = textareaProps;
  const context = useCopilotChatContext();
  
  const handleSubmit = React.useCallback((value: string) => {
    // Don't submit here - CopilotKit handles it via onKeyDown
  }, []);
  
  return (
    <CustomTiptapTextArea
      {...restProps}
      ref={ref}
      isInputEnabled={true}
      isRunning={false}
      onSubmitMessage={handleSubmit}
      onFilesPicked={() => {}}
      placeholder={propsPlaceholder || context.labels?.chatInputPlaceholder || 'Type a message...'}
    />
  );
});

CustomTiptapTextAreaSlotInner.displayName = 'CustomTiptapTextAreaSlotInner';

/**
 * CustomTiptapTextAreaSlot - Wrapper function (typeof === "function")
 * This works around CopilotKit's renderSlot treating forwardRef as objects
 */
function CustomTiptapTextAreaSlot(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: React.Ref<HTMLDivElement> }) {
  const { ref, ...restProps } = props;
  return <CustomTiptapTextAreaSlotInner ref={ref} {...restProps} />;
}

/**
 * CustomInputV2 - Main input component
 * 
 * Renders CopilotChatInput with our custom textarea slot.
 * Matches the type signature of CopilotChatInput for the input slot.
 */
function CustomInputV2Component(props: CopilotChatInputProps) {
  return (
    <CopilotChatInput
      {...props}
      textArea={CustomTiptapTextAreaSlot as any}
    />
  );
}

CustomInputV2Component.displayName = 'CustomInputV2';

/**
 * Export CustomInputV2 with namespace properties from CopilotChatInput
 * This makes it compatible with the input slot type: typeof CopilotChatInput
 */
export const CustomInputV2 = Object.assign(CustomInputV2Component, {
  SendButton: CopilotChatInput.SendButton,
  ToolbarButton: CopilotChatInput.ToolbarButton,
  StartTranscribeButton: CopilotChatInput.StartTranscribeButton,
  CancelTranscribeButton: CopilotChatInput.CancelTranscribeButton,
  FinishTranscribeButton: CopilotChatInput.FinishTranscribeButton,
  AddMenuButton: CopilotChatInput.AddMenuButton,
  TextArea: CustomTiptapTextAreaSlot as any,  // Using Tiptap editor
  AudioRecorder: CopilotChatInput.AudioRecorder,
});

// CustomInputV2 is ready to use with CopilotChat

export default CustomInputV2;
