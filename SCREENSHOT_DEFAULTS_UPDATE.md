# Screenshot Defaults Update

## Changes Made

Updated default screenshot parameters for better compression and smaller file sizes.

### Previous Defaults
- **Format**: PNG (lossless, large files)
- **Quality**: 30 (for JPEG when specified)

### New Defaults
- **Format**: JPEG (lossy compression, much smaller files)
- **Quality**: 25 (optimal balance between quality and size)

## Benefits

### File Size Reduction
- **PNG**: Typically 500KB - 2MB for a full page
- **JPEG @ 25**: Typically 50KB - 200KB (80-90% smaller!)

### Quality Trade-off
- Quality 25 is sufficient for:
  - Documentation purposes
  - UI verification
  - Visual bug reports
  - Workflow screenshots
- Still readable text and clear UI elements
- Faster to transmit and process

### Quality Levels Guide
- **15**: High compression, smallest files (~30-100KB), acceptable for quick checks
- **25**: Balanced (default), good quality for most use cases (~50-200KB)
- **50**: Higher quality, larger files (~100-400KB), good for detailed analysis
- **PNG**: Lossless, largest files (~500KB-2MB), use when quality is critical

## Files Modified

1. **`pages/side-panel/src/actions/content/takeScreenshot.ts`**
   - Changed default format from `'png'` to `'jpeg'`
   - Changed default quality from `30` to `25`
   - Updated JSDoc comments

2. **`pages/side-panel/src/components/ChatInner.tsx`**
   - Updated action description examples
   - Updated parameter descriptions
   - Updated handler default values to match

## Agent Usage

### Default Behavior (New)
```typescript
// Agent calls without parameters
takeScreenshot()
// → Captures full page as JPEG quality 25
```

### Override Examples
```typescript
// High quality lossless
takeScreenshot({ format: 'png' })

// Maximum compression
takeScreenshot({ format: 'jpeg', quality: 15 })

// Better quality
takeScreenshot({ format: 'jpeg', quality: 50 })

// Visible area only
takeScreenshot({ captureFullPage: false })
```

## Migration Notes

- No breaking changes - all parameters remain optional
- Existing code will continue to work
- Screenshots will now be smaller by default
- Users can still request PNG for lossless quality

## Testing

Test that screenshots:
1. ✅ Default to JPEG format
2. ✅ Use quality 25 by default
3. ✅ Still support PNG format when requested
4. ✅ Support custom quality values
5. ✅ Produce readable, usable images at quality 25

