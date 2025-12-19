# Slack File Download Debugging Guide

## Changes Made to Fix Binary Corruption

### Backend Changes (`workspace.js`)

1. **Changed Response Method**:
   - **Before**: Used `res.send(fileBuffer)` or `res.end(fileBuffer, 'binary')`
   - **After**: Using `res.writeHead()` + `res.end(fileBuffer)`
   
   ```javascript
   res.writeHead(200, {
     'Content-Type': file.mimetype || 'application/octet-stream',
     'Content-Disposition': `attachment; filename="${file.name}"`,
     'Content-Length': fileBuffer.length,
     'Cache-Control': 'no-cache'
   });
   res.end(fileBuffer);
   ```

2. **Why This Matters**:
   - `res.send()` tries to process the buffer and may convert it
   - `res.end(buffer, 'binary')` uses deprecated encoding
   - `res.writeHead()` + `res.end(buffer)` sends raw binary data directly

### Frontend Changes (`CustomInputV2.tsx`)

Added extensive logging to trace the file transfer:
- Response headers (Content-Type, Content-Length)
- Blob size and type after receiving
- File object properties after creation

### Backend Logging (`slack-client.js`)

Added logging to trace:
- Download URL (first 50 chars)
- Buffer size received from Slack
- First 20 bytes of buffer (for verification)

## How to Debug

### 1. Check Backend Logs

When you download a Slack file, you should see:

```
[Slack Client] Downloading file: filename.pdf from https://...
[Slack Client] Successfully downloaded 12345 bytes for filename.pdf
[Workspace] Downloaded file buffer: 12345 bytes, type: object, isBuffer: true
[Workspace] First 20 bytes: <Buffer 25 50 44 46 2d 31 2e 34 0a 25 c3 a4 c3 bc c3 b6 c3 9f 0a 32>
[Workspace] Sending file with mimetype: application/pdf, name: filename.pdf
```

**What to check**:
- `isBuffer: true` - confirms it's a proper Buffer
- First 20 bytes should match the file type:
  - PDF: `25 50 44 46` (%PDF in hex)
  - PNG: `89 50 4e 47` (.PNG signature)
  - JPEG: `ff d8 ff` (JPEG signature)
  - ZIP/DOCX: `50 4b` (PK signature)

### 2. Check Frontend Logs

In the browser console, you should see:

```
[CustomInputV2] Downloading 1 file(s) from Slack message...
[CustomInputV2] Response headers - Content-Type: application/pdf, Content-Length: 12345
[CustomInputV2] Received blob - size: 12345, type: application/pdf
[CustomInputV2] Created file - name: filename.pdf, size: 12345, type: application/pdf
[CustomInputV2] Successfully downloaded file: filename.pdf, attached with preview URL
```

**What to check**:
- Content-Length should match the file size
- Blob size should match Content-Length
- File size should match blob size
- Content-Type should be correct for the file

### 3. Verify File Integrity

If the sizes match but the file is still corrupted:

1. **Check the magic bytes in backend logs**:
   - If the first bytes don't match the file type, the file is corrupted at source (Slack API issue)
   - If they match, corruption happens during transfer

2. **Download the same file directly from Slack**:
   - Open Slack in browser
   - Download the file directly
   - Compare file sizes
   - If sizes match but content differs, it's a transfer issue

3. **Check browser network tab**:
   - Open DevTools → Network
   - Find the `/slack/file/download` request
   - Click on it → Response tab
   - Check if the response size matches
   - Try to view as binary

## Common Issues

### Issue 1: Size Mismatch

**Symptom**: Backend logs show X bytes, frontend shows Y bytes (different)

**Cause**: Middleware or encoding is modifying the response

**Fix**: Ensure no middleware is processing the response after `res.writeHead()`

### Issue 2: Correct Size, Corrupted Content

**Symptom**: All sizes match, but file won't open

**Cause**: Data encoding/decoding issue

**Check**:
1. Backend first 20 bytes - should show correct file signature
2. If backend is correct but frontend corrupted, it's a transfer encoding issue
3. May need to set additional headers or use different transfer method

### Issue 3: Wrong Content-Type

**Symptom**: File downloads but opens as wrong type

**Cause**: Slack's `mimetype` field is incorrect or missing

**Fix**: The code already has fallback to `application/octet-stream`, but you may need to:
- Parse filename extension
- Map to correct MIME type
- Override Slack's mimetype

## Testing Checklist

- [ ] Backend logs show correct buffer size
- [ ] Backend logs show correct file signature (first 20 bytes)
- [ ] Frontend logs show matching Content-Length
- [ ] Frontend blob size matches Content-Length
- [ ] File object size matches blob size
- [ ] Downloaded PDF opens correctly
- [ ] Downloaded image displays correctly
- [ ] Downloaded document opens correctly

## Next Steps If Still Broken

1. **Test with minimal file**:
   - Create a test endpoint that returns a simple PDF buffer
   - If that works, issue is with Slack file download
   - If that fails, issue is with response handling

2. **Try alternative approaches**:
   - Use `res.download()` with temp file
   - Use streaming instead of buffer
   - Try different encoding headers

3. **Check for middleware interference**:
   - Temporarily bypass body-parser/json middleware
   - Add raw response logging
   - Check if CORS is adding unwanted headers

## Current Status

✅ Changed backend to use `res.writeHead()` + `res.end(buffer)`  
✅ Added extensive logging on both sides  
✅ Removed deprecated 'binary' encoding  
⏳ Testing required to verify if issue is resolved  

## File Signatures Reference

For debugging - common file type signatures:

| Type | Extension | Hex Signature |
|------|-----------|---------------|
| PDF | .pdf | 25 50 44 46 (%PDF) |
| PNG | .png | 89 50 4E 47 |
| JPEG | .jpg | FF D8 FF |
| GIF | .gif | 47 49 46 38 |
| ZIP | .zip | 50 4B 03 04 |
| DOCX | .docx | 50 4B 03 04 (it's a ZIP) |
| XLSX | .xlsx | 50 4B 03 04 (it's a ZIP) |
| MP4 | .mp4 | 00 00 00 ?? 66 74 79 70 |

If the backend shows these signatures but the frontend file is corrupted, the corruption happens during HTTP transfer.

