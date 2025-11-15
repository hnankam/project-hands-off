# Image Gallery Infinite Loop Fix

## 🐛 Problem

The `ImageGalleryCard` component was causing an infinite loop when rendered, freezing the browser/UI.

## 🔍 Root Cause

**Location**: `pages/side-panel/src/components/ImageGalleryCard.tsx` (lines 55-58)

The `onError` handler on the `<img>` elements was causing an infinite loop:

```tsx
onError={(e) => {
  // Fallback if image fails to load
  e.currentTarget.src = 'https://via.placeholder.com/400x300?text=Image+' + (index + 1);
}}
```

### Why This Causes an Infinite Loop

1. Image fails to load → `onError` fires
2. Handler sets a new `src` (fallback URL)
3. If the fallback also fails (network issues, blocked, CORS, etc.) → `onError` fires again
4. Handler sets `src` again → infinite loop
5. React keeps re-rendering → browser freezes

## ✅ Solution Applied

### 1. Temporary Debug Mode (imageActions.tsx)

Replaced the `ImageGalleryCard` component with a simple debug div that:
- Logs the action result to console
- Displays the args and result in a safe, non-looping way
- Uses inline styles (no dependencies)

```tsx
render: ({ args, result }: any) => {
  // DEBUG: Log the action result to console
  console.log('🖼️ generate_images action render:', {
    args,
    result,
    resultType: typeof result,
    isArray: Array.isArray(result),
  });
  
  // TEMPORARY: Return empty div to debug infinite loop
  return (
    <div style={{ padding: '16px', /* ... */ }}>
      <div>🖼️ Generate Images (Debug Mode)</div>
      <div>Prompt: {args?.prompt || 'N/A'}</div>
      <div>Num Images: {args?.num_images || 1}</div>
      <div>Result Type: {typeof result}</div>
      <div>Result: {JSON.stringify(result, null, 2)}</div>
    </div>
  );
}
```

### 2. Fixed ImageGalleryCard Component

Added a flag to prevent repeated error handling:

```tsx
onError={(e) => {
  // Prevent infinite loop by only setting fallback once
  const target = e.currentTarget;
  if (!target.dataset.errorHandled) {
    target.dataset.errorHandled = 'true';
    target.src = 'https://via.placeholder.com/400x300?text=Image+' + (index + 1);
  }
}}
```

The `dataset.errorHandled` flag ensures:
- ✅ Error handler only runs **once** per image
- ✅ If fallback fails, it won't retry
- ✅ No infinite loop

## 🧪 Testing & Debugging

### Current State
The action now renders a **debug div** that shows:
1. Console logs with full result data
2. Visual display of args and result
3. No image loading (safe from loops)

### Check Console Output
When `generate_images` is triggered, you'll see:

```javascript
🖼️ generate_images action render: {
  args: { prompt: "...", num_images: 3 },
  result: ["url1", "url2", "url3"], // or whatever the backend returns
  resultType: "object",
  isArray: true
}
```

### Next Steps to Re-enable Gallery

Once you verify the action is working correctly in debug mode:

1. **Restore the ImageGalleryCard** in `imageActions.tsx`:

```tsx
render: ({ args, result }: any) => {
  // Extract image URLs from result
  let imageUrls: string[] = [];
  
  if (result && Array.isArray(result)) {
    imageUrls = result;
  } else if (result && typeof result === 'object' && Array.isArray(result.urls)) {
    imageUrls = result.urls;
  } else {
    const numImages = args.num_images || 1;
    imageUrls = Array.from({ length: numImages }, (_, i) => 
      `https://via.placeholder.com/400x300?text=Generated+Image+${i + 1}`
    );
  }
  
  return (
    <ImageGalleryCard 
      imageUrls={imageUrls}
      prompt={args.prompt}
      themeColor={themeColor}
    />
  );
}
```

2. **Test with real image URLs** from your backend
3. **Verify no infinite loops** occur

## 📝 Prevention Tips

When working with image `onError` handlers:

❌ **Don't do this:**
```tsx
<img onError={(e) => e.currentTarget.src = fallbackUrl} />
```

✅ **Do this:**
```tsx
<img onError={(e) => {
  if (!e.currentTarget.dataset.errorHandled) {
    e.currentTarget.dataset.errorHandled = 'true';
    e.currentTarget.src = fallbackUrl;
  }
}} />
```

Or use React state:
```tsx
const [hasError, setHasError] = useState(false);
<img 
  src={hasError ? fallbackUrl : originalUrl}
  onError={() => setHasError(true)}
/>
```

## ✅ Status

- ✅ Infinite loop fixed in `ImageGalleryCard.tsx`
- ✅ Debug mode enabled in `imageActions.tsx`
- ✅ Console logging active
- ✅ No linter errors
- ⏳ Ready for testing and re-enabling gallery

## 🔄 Files Modified

1. `pages/side-panel/src/actions/copilot/imageActions.tsx` - Debug mode
2. `pages/side-panel/src/components/ImageGalleryCard.tsx` - Fixed infinite loop

