# ConfirmationCard Component

## Overview

The `ConfirmationCard` is a dedicated React component that provides a consistent, app-aligned UI for user confirmation dialogs in the human-in-the-loop workflow.

## Location

`/pages/side-panel/src/components/ConfirmationCard.tsx`

## Design Philosophy

The component follows the established patterns in the codebase:
- **Matches TaskProgressCard** - Similar card styling, borders, and spacing
- **Matches ActionStatus** - Similar color scheme and typography
- **Theme-reactive** - Reads from storage, automatically updates on theme change
- **Clean & minimal** - Focused UI without unnecessary decoration

## Props Interface

```typescript
export interface ConfirmationCardProps {
  actionDescription: string;      // What action needs confirmation
  status: 'executing' | 'complete' | string;  // Current state
  respond?: (response: { confirmed: boolean }) => void;  // Callback for user choice
  result?: { confirmed: boolean };  // Result after user responds
}
```

## Visual Design

### Confirmation State (status: 'executing')

```
┌──────────────────────────────────────────────┐
│  (i)  Confirmation Required                  │
│       Do you want to [actionDescription]?    │
├──────────────────────────────────────────────┤
│                      [ Cancel ]  [ Confirm ] │
└──────────────────────────────────────────────┘
```

**Elements:**
- Circular blue icon background with "i" symbol
- Bold title "Confirmation Required"
- Description text with action details
- **Border separator** between content and footer
- **Right-aligned buttons** in footer
  - **Cancel:** Gray background (left)
  - **Confirm:** Blue background, white text (right)

**Pattern:** Matches SessionsPage modal design exactly
- Border-top separator before buttons
- `justify-end` for button alignment
- `gap-2` (8px) between buttons
- Buttons with `px-3 py-1.5` padding
- Footer with `px-3 py-2` padding

### Complete State (status: 'complete')

```
┌──────────────────────────────────────────────┐
│  (i)  Confirmation Required                  │
│       Do you want to [actionDescription]?    │
├──────────────────────────────────────────────┤
│  ✓ You confirmed this action                 │
└──────────────────────────────────────────────┘
```
or
```
┌──────────────────────────────────────────────┐
│  (i)  Confirmation Required                  │
│       Do you want to [actionDescription]?    │
├──────────────────────────────────────────────┤
│  ✗ You cancelled this action                 │
└──────────────────────────────────────────────┘
```

**Key Design:**
- **Question persists:** Original question remains visible
- **Icon unchanged:** Blue question mark icon stays
- **Footer updates:** Buttons replaced with result message
- **Context preserved:** Users can see what was asked when revisiting chat

**Elements in footer:**
- Green checkmark or red X icon (16x16px)
- Colored result text (green for confirmed, red for cancelled)
- Left-aligned (not right-aligned like buttons)

## Styling

### Colors (Light Mode)
- **Card Background:** `rgba(249, 250, 251, 0.5)` (gray-50 at 50% opacity) - **subtle, semi-transparent**
- **Border:** `rgba(229, 231, 235, 0.5)` (gray-200 at 50% opacity) - **subtle, semi-transparent**
- **Text:** `#1f2937` (gray-800)
- **Muted Text:** `#6b7280` (gray-500)
- **Icon Circle (Confirm):** `#dbeafe` (blue-100)
- **Icon Circle (Success):** `#d1fae5` (green-100)
- **Icon Circle (Error):** `#fee2e2` (red-100)
- **Confirm Button:** `#2563eb` (blue-600)
- **Confirm Hover:** `#1d4ed8` (blue-700)
- **Cancel Button:** `#e5e7eb` (gray-200) background, `#374151` (gray-700) text
- **Cancel Hover:** `#d1d5db` (gray-300)

### Colors (Dark Mode)
- **Card Background:** `rgba(21, 28, 36, 0.5)` (dark gray at 50% opacity) - **subtle, semi-transparent**
- **Border:** `rgba(55, 65, 81, 0.5)` (gray-700 at 50% opacity) - **subtle, semi-transparent**
- **Text:** `#f3f4f6` (gray-100)
- **Muted Text:** `#9ca3af` (gray-400)
- **Icon Circle (Confirm):** `rgba(37, 99, 235, 0.2)` (blue transparent)
- **Icon Circle (Success):** `rgba(16, 185, 129, 0.2)` (green transparent)
- **Icon Circle (Error):** `rgba(239, 68, 68, 0.2)` (red transparent)
- **Confirm Button:** `#2563eb` (blue-600)
- **Confirm Hover:** `#1d4ed8` (blue-700)
- **Cancel Button:** `#374151` (gray-700) background, `#bcc1c7` text
- **Cancel Hover:** `#4b5563` (gray-600)

**Design Philosophy:**
- Background and borders use 50% opacity to appear more subtle than user messages
- This creates visual differentiation between interactive cards and chat messages
- Semi-transparency allows the underlying interface to subtly show through

### Layout
- **Horizontal Margins:** 12px left and right (aligns with assistant message container)
- **Card Width:** `calc(100% - 24px)` - accounts for both left and right margins
- **Margin Top:** 12px (spacing from previous content)
- **Content Padding:** 12px all sides
- **Footer Padding:** 8px vertical, 12px horizontal
- **Border Radius:** 8px for card, 6px for buttons
- **Gap:** 12px between icon and text, 8px between buttons
- **Button Padding:** 6px vertical, 12px horizontal
- **Font Sizes:** 14px title, 12px description, 12px buttons
- **Icon Circle Size:** 24x24px with 14px icon inside

**Alignment:**
- Horizontal margins match assistant message padding (12px)
- Width calculation prevents overflow: `calc(100% - 24px)` subtracts both margins
- Prevents full-width appearance, creates visual hierarchy
- Card stays within container bounds without extending to the right

## Usage

### In utilityActions.tsx

```typescript
import { ConfirmationCard } from '../../components/ConfirmationCard';

export const createConfirmActionHumanInTheLoop = ({ isLight }: UtilityActionDependencies) => ({
  name: 'confirmAction',
  description: 'Ask user to confirm before proceeding with an action',
  parameters: [
    {
      name: 'actionDescription',
      type: 'string',
      description: 'Description of the action that needs confirmation',
      required: true,
    },
  ],
  render: ({ args, status, respond, result }: any) => {
    const actionDescription = args?.actionDescription ?? 'proceed with this action';
    
    return (
      <ConfirmationCard
        actionDescription={actionDescription}
        status={status}
        respond={respond}
        result={result}
      />
    );
  },
});
```

### Direct Usage (if needed elsewhere)

```typescript
import { ConfirmationCard } from '@/components/ConfirmationCard';

// In your component
<ConfirmationCard
  actionDescription="delete this item"
  status="executing"
  respond={(response) => {
    if (response.confirmed) {
      // User clicked Confirm
    } else {
      // User clicked Cancel
    }
  }}
/>
```

## Features

### 1. Theme Reactivity
The component reads theme directly from storage, so it automatically updates when the user changes theme. No need to pass theme as a prop.

```typescript
const { isLight } = useStorage(exampleThemeStorage);
```

### 2. Hover States
Buttons have smooth hover transitions:
- Confirm button darkens on hover
- Cancel button gets subtle gray background on hover
- Uses `onMouseEnter` and `onMouseLeave` for inline style updates

### 3. Accessibility
- Proper semantic structure
- Clickable buttons with cursor pointer
- Color contrast meets WCAG standards
- Clear visual hierarchy

### 4. Icons
Uses inline SVG icons for crisp rendering at any scale:
- **Question mark** (circle with "?") - for confirmation state
- **Checkmark** (filled circle with check) - for confirmed result
- **X mark** (filled circle with x) - for cancelled result

## Component Pattern

The component follows a common pattern in the codebase:

1. **Read theme from storage**
   ```typescript
   const { isLight } = useStorage(exampleThemeStorage);
   ```

2. **Define theme-dependent variables**
   ```typescript
   const cardBackgroundVar = isLight ? '...' : '...';
   const borderColor = isLight ? '...' : '...';
   ```

3. **Conditional rendering based on status**
   ```typescript
   if (status === 'executing' && respond) { return /* ... */ }
   if (status === 'complete' && result) { return /* ... */ }
   ```

4. **Return null for unhandled states**
   ```typescript
   return null;
   ```

This matches how `TaskProgressCard` and `ActionStatus` are structured.

## Benefits

✅ **Maintainability** - UI changes in one file
✅ **Reusability** - Can be used in multiple contexts
✅ **Consistency** - Matches app design system
✅ **Type Safety** - Full TypeScript support
✅ **Theme Support** - Automatic light/dark mode
✅ **Clean Code** - No inline JSX in action definitions

## Testing

### Manual Testing Steps

1. Open the extension
2. Navigate to a page with a form
3. Open the side panel
4. Send message: "Submit this form, but ask for my confirmation first"
5. Verify:
   - Card appears with question mark icon
   - Title says "Confirmation Required"
   - Description mentions the action
   - Two buttons appear (Confirm and Cancel)
   - Buttons have hover effects
   - Theme colors match current mode
6. Click Confirm or Cancel
7. Verify:
   - Result message appears
   - Checkmark shows for confirmed
   - X mark shows for cancelled

### Visual Regression Testing

Compare with:
- **TaskProgressCard** - Similar card background, border, spacing
- **ActionStatus** - Similar text colors, font sizes
- **Other buttons in app** - Similar button styling

## Future Enhancements

Possible improvements:
1. **Keyboard support** - Tab navigation, Enter to confirm, Esc to cancel
2. **Animation** - Fade in/out transitions
3. **Custom icons** - Allow passing custom icons as props
4. **Button variants** - Different button styles for different risk levels
5. **Timeout** - Auto-cancel after X seconds
6. **Sound effects** - Optional audio feedback

## Related Files

- **Action Definition:** `/pages/side-panel/src/actions/copilot/utilityActions.tsx`
- **Integration:** `/pages/side-panel/src/components/ChatInner.tsx`
- **Similar Components:**
  - `/pages/side-panel/src/components/TaskProgressCard.tsx`
  - `/pages/side-panel/src/components/ActionStatus.tsx`
  - `/pages/side-panel/src/components/WaitCountdown.tsx`

## Summary

The `ConfirmationCard` component provides a clean, reusable, and app-consistent way to handle user confirmations in the human-in-the-loop workflow. It follows established patterns, matches the design system, and provides a great user experience.

