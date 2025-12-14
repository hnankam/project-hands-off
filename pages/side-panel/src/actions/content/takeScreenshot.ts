import { debug as baseDebug } from '@extension/shared';
import { COPIOLITKIT_CONFIG } from '../../constants';
import { ensureFirebase, uploadDataUrlToStorage, type FirebaseConfig } from '../../utils/firebaseStorage';

// ============================================================================
// DEBUG UTILITIES
// ============================================================================

/** Timestamp generator for debug logs */
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;

/** Timestamped debug wrappers */
const debug = {
  log: (...args: unknown[]) => baseDebug.log(ts(), ...args),
  warn: (...args: unknown[]) => baseDebug.warn(ts(), ...args),
  error: (...args: unknown[]) => baseDebug.error(ts(), ...args),
} as const;

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum dimension (longest side) for optimized screenshots */
const MAX_SCREENSHOT_DIMENSION = 1024;

/** Maximum file size target in KB */
const MAX_SCREENSHOT_SIZE_KB = 250;

/** Minimum JPEG quality (0-1) */
const MIN_JPEG_QUALITY = 0.4;

/** Maximum JPEG quality (0-1) */
const MAX_JPEG_QUALITY = 0.85;

/** Minimum dimension before stopping downscale */
const MIN_DOWNSCALE_DIMENSION = 320;

/** Downscale factor per iteration */
const DOWNSCALE_FACTOR = 0.85;

/** Quality reduction step for JPEG */
const QUALITY_REDUCTION_STEP = 0.1;

/** Quality reduction step during downscale */
const QUALITY_REDUCTION_STEP_SMALL = 0.05;

// ============================================================================
// TYPES
// ============================================================================

interface OptimizeOptions {
  targetFormat: 'png' | 'jpeg';
  maxDimension: number;
  maxKB: number;
  startQuality: number;
  minQuality: number;
}

interface OptimizeResult {
  dataUrl: string;
  width: number;
  height: number;
  quality?: number;
  outputFormat: 'png' | 'jpeg';
  sizeKB: number;
}

interface ScreenshotDimensions {
  width: number;
  height: number;
  devicePixelRatio?: number;
}

/**
 * Result type for take screenshot operation
 */
export interface TakeScreenshotResult {
  status: 'success' | 'error';
  message: string;
  screenshotInfo?: {
    format: 'png' | 'jpeg';
    dimensions: ScreenshotDimensions;
    sizeKB: number;
    quality?: number;
    isFullPage: boolean;
    dataUrl?: string;
    url?: string;
  };
}

interface AttachmentManifestItem {
  name: string;
  type: string;
  size: number;
  url: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Estimate base64 payload size in KB (excluding the data URL header)
 */
function getBase64SizeKB(dataUrl: string): number {
  try {
    const commaIndex = dataUrl.indexOf(',');
    const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
    const padding = (base64.match(/=+$/) || [''])[0].length;
    const bytes = (base64.length * 3) / 4 - padding;
    return Math.max(1, Math.round(bytes / 1024));
  } catch {
    return Math.max(1, Math.round(dataUrl.length / 1024));
  }
}

/**
 * Downscale and compress a data URL to meet size/dimension targets.
 * Prefers JPEG for large payloads to avoid bloat.
 */
async function optimizeDataUrl(
  dataUrl: string,
  options: OptimizeOptions
): Promise<OptimizeResult> {
  const { targetFormat, maxDimension, maxKB, startQuality, minQuality } = options;

  // Load image
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image for optimization'));
    image.src = dataUrl;
  });

  const originalWidth = img.width;
  const originalHeight = img.height;
  const scale = Math.min(1, maxDimension / Math.max(originalWidth, originalHeight));
  let outW = Math.max(1, Math.round(originalWidth * scale));
  let outH = Math.max(1, Math.round(originalHeight * scale));

  // Create canvas for optimization
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    // Fallback: return original if canvas not available
    return {
      dataUrl,
      width: originalWidth,
      height: originalHeight,
      outputFormat: targetFormat,
      sizeKB: getBase64SizeKB(dataUrl),
    };
  }

  let quality = Math.min(MAX_JPEG_QUALITY, Math.max(minQuality, startQuality));
  let outputFormat: 'png' | 'jpeg' = targetFormat;

  // Encode helper
  const encode = (): string => {
    canvas.width = outW;
    canvas.height = outH;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, outW, outH);
    return outputFormat === 'jpeg'
      ? canvas.toDataURL('image/jpeg', quality)
      : canvas.toDataURL('image/png');
  };

  let optimized = encode();
  let sizeKB = getBase64SizeKB(optimized);

  // If PNG exceeds size, switch to JPEG for better compression
  if (outputFormat === 'png' && sizeKB > maxKB) {
    outputFormat = 'jpeg';
    optimized = encode();
    sizeKB = getBase64SizeKB(optimized);
  }

  // Reduce JPEG quality until size target met
  while (outputFormat === 'jpeg' && sizeKB > maxKB && quality > minQuality + 0.001) {
    quality = Math.max(minQuality, quality - QUALITY_REDUCTION_STEP);
    optimized = encode();
    sizeKB = getBase64SizeKB(optimized);
  }

  // If still too big, progressively downscale
  while (sizeKB > maxKB && Math.max(outW, outH) > MIN_DOWNSCALE_DIMENSION) {
    outW = Math.max(1, Math.round(outW * DOWNSCALE_FACTOR));
    outH = Math.max(1, Math.round(outH * DOWNSCALE_FACTOR));
    optimized = encode();
    sizeKB = getBase64SizeKB(optimized);

    // Also try reducing quality during downscale
    if (outputFormat === 'jpeg' && sizeKB > maxKB && quality > minQuality + 0.001) {
      quality = Math.max(minQuality, quality - QUALITY_REDUCTION_STEP_SMALL);
      optimized = encode();
      sizeKB = getBase64SizeKB(optimized);
    }
  }

  return {
    dataUrl: optimized,
    width: outW,
    height: outH,
    quality: outputFormat === 'jpeg' ? Math.round(quality * 100) : undefined,
    outputFormat,
    sizeKB,
  };
}

/**
 * Upload screenshot to Firebase and build attachment JSON
 */
async function uploadAndBuildManifest(
  optimized: OptimizeResult
): Promise<{ hostedUrl?: string; attachmentJson: string }> {
  let hostedUrl: string | undefined;
  
  try {
    const firebaseConfig = COPIOLITKIT_CONFIG.FIREBASE;
    
    if (COPIOLITKIT_CONFIG.ENABLE_FIREBASE_UPLOADS && firebaseConfig?.storageBucket) {
      const storage = ensureFirebase(firebaseConfig as FirebaseConfig);
      const ext = optimized.outputFormat === 'jpeg' ? 'jpg' : 'png';
      const path = `screenshots/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const contentType = optimized.outputFormat === 'jpeg' ? 'image/jpeg' : 'image/png';
      
      hostedUrl = await uploadDataUrlToStorage(
        storage,
        path,
        optimized.dataUrl,
        contentType,
        firebaseConfig as FirebaseConfig
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    debug.warn('[Screenshot] Firebase upload failed, using dataUrl fallback:', errorMessage);
  }

  // Build attachment JSON in new format expected by backend
  // Format: {"text": "message", "attachments": [...]}
  const attachmentJson = hostedUrl
    ? buildAttachmentJson([{
        name: `screenshot.${optimized.outputFormat === 'jpeg' ? 'jpg' : 'png'}`,
        type: optimized.outputFormat === 'jpeg' ? 'image/jpeg' : 'image/png',
        size: Math.round(optimized.sizeKB * 1024),
        url: hostedUrl,
      }])
    : '';

  return { hostedUrl, attachmentJson };
}

/**
 * Build attachment JSON in backend-expected format
 * Format: {"text": "message", "attachments": [{"url": "...", "filename": "...", "mimeType": "..."}]}
 */
function buildAttachmentJson(items: AttachmentManifestItem[]): string {
  // Note: Backend normalizes both 'filename' and 'name', 'mimeType' and 'type'
  return JSON.stringify({
    text: '',  // Empty text, the base message is separate
    attachments: items.map(item => ({
      url: item.url,
      filename: item.name,  // Backend normalizes to 'name'
      mimeType: item.type,  // Backend normalizes to 'type'
      size: item.size,
    }))
  });
}

/**
 * Get viewport dimensions from tab
 */
async function getViewportDimensions(tabId: number): Promise<ScreenshotDimensions> {
  const result = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    }),
  });

  return result[0]?.result ?? { width: 0, height: 0, devicePixelRatio: 1 };
}

/**
 * Calculate optimization options from user parameters
 */
function getOptimizeOptions(format: 'png' | 'jpeg', quality: number): OptimizeOptions {
  return {
    targetFormat: format,
    maxDimension: MAX_SCREENSHOT_DIMENSION,
    maxKB: MAX_SCREENSHOT_SIZE_KB,
    startQuality: Math.min(MAX_JPEG_QUALITY, Math.max(MIN_JPEG_QUALITY, quality / 100)),
    minQuality: MIN_JPEG_QUALITY,
  };
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Take a screenshot of the current tab's visible viewport.
 * 
 * Note: Full page screenshots are not currently supported due to Chrome API limitations.
 * The `captureFullPage` parameter is reserved for future implementation.
 * 
 * @param captureFullPage - Reserved for future use (currently captures viewport only)
 * @param format - Image format: 'png' or 'jpeg' (default: 'jpeg' for smaller file size)
 * @param quality - JPEG quality 0-100, only applies if format is 'jpeg' (default: 25)
 * @returns Promise with status and screenshot info
 * 
 * @example
 * ```ts
 * const result = await handleTakeScreenshot(false, 'jpeg', 50);
 * if (result.status === 'success') {
 *   console.log('Screenshot URL:', result.screenshotInfo?.url);
 * }
 * ```
 */
export async function handleTakeScreenshot(
  captureFullPage: boolean = false,
  format: 'png' | 'jpeg' = 'jpeg',
  quality: number = 25
): Promise<TakeScreenshotResult> {
  try {
    debug.log('[Screenshot] Taking screenshot:', { captureFullPage, format, quality });

    // Get the current active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    
    if (!tab?.id || !tab?.windowId) {
      return {
        status: 'error',
        message: 'Unable to access current tab',
      };
    }

    const { id: tabId, windowId } = tab;

    // Capture visible viewport
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
      format,
      quality: format === 'jpeg' ? quality : undefined,
    });

    // Optimize the screenshot
    const optimizeOptions = getOptimizeOptions(format, quality);
    const optimized = await optimizeDataUrl(dataUrl, optimizeOptions);

    // Get viewport dimensions
    const viewportDims = await getViewportDimensions(tabId);

    // Upload to Firebase and build attachment JSON
    const { hostedUrl, attachmentJson } = await uploadAndBuildManifest(optimized);

    // Build success message
    const baseMessage = captureFullPage
      ? 'Screenshot captured (visible area). Note: Full page screenshots are not yet supported. Current implementation captures the visible viewport.'
      : 'Screenshot captured successfully.';

    // If we have attachment JSON, wrap the base message in the JSON format
    // Otherwise return base message as plain text
    let message: string;
    if (attachmentJson) {
      const jsonData = JSON.parse(attachmentJson);
      jsonData.text = baseMessage;  // Add the base message to the JSON
      message = JSON.stringify(jsonData);
    } else {
      message = baseMessage;
    }

    return {
      status: 'success',
      message: message,
      screenshotInfo: {
        format: optimized.outputFormat,
        dimensions: {
          width: optimized.width,
          height: optimized.height,
          devicePixelRatio: viewportDims.devicePixelRatio,
        },
        sizeKB: optimized.sizeKB,
        quality: optimized.quality,
        isFullPage: false,
        url: hostedUrl,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    debug.error('[Screenshot] Error taking screenshot:', errorMessage);
    
    return {
      status: 'error',
      message: `Error: ${errorMessage}`,
    };
  }
}
