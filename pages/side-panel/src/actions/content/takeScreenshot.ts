import { debug as baseDebug } from '@extension/shared';
// import { COPIOLITKIT_CONFIG } from '../../constants';
// import { ensureFirebase, uploadDataUrlToStorage } from '../../utils/firebaseStorage';

// Timestamped debug wrappers
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;
const debug = {
  log: (...args: any[]) => baseDebug.log(ts(), ...args),
  warn: (...args: any[]) => baseDebug.warn(ts(), ...args),
  error: (...args: any[]) => baseDebug.error(ts(), ...args),
} as const;

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

interface OptimizeOptions {
  targetFormat: 'png' | 'jpeg';
  maxDimension: number; // longest side in px
  maxKB: number; // target max size
  startQuality: number; // 0-1 for jpeg
  minQuality: number; // 0-1 for jpeg
}

/**
 * Downscale and compress a data URL to meet size/dimension targets.
 * Always prefers JPEG for large payloads to avoid bloat.
 */
async function optimizeDataUrl(
  dataUrl: string,
  {
    targetFormat,
    maxDimension,
    maxKB,
    startQuality,
    minQuality,
  }: OptimizeOptions,
): Promise<{ dataUrl: string; width: number; height: number; quality?: number; outputFormat: 'png' | 'jpeg'; sizeKB: number }> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });

  const originalWidth = img.width;
  const originalHeight = img.height;
  let scale = Math.min(1, maxDimension / Math.max(originalWidth, originalHeight));
  let outW = Math.max(1, Math.round(originalWidth * scale));
  let outH = Math.max(1, Math.round(originalHeight * scale));

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    // Fallback: return original
    const fallbackKB = getBase64SizeKB(dataUrl);
    return {
      dataUrl,
      width: originalWidth,
      height: originalHeight,
      outputFormat: targetFormat,
      sizeKB: fallbackKB,
    };
  }

  let quality = Math.min(0.9, Math.max(minQuality, startQuality));
  let outputFormat: 'png' | 'jpeg' = targetFormat;

  const encode = (): string => {
    canvas.width = outW;
    canvas.height = outH;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, outW, outH);
    if (outputFormat === 'jpeg') {
      return canvas.toDataURL('image/jpeg', quality);
    }
    return canvas.toDataURL('image/png');
  };

  let optimized = encode();
  let sizeKB = getBase64SizeKB(optimized);

  // If PNG is requested but exceeds size, switch to JPEG for efficiency
  if (outputFormat === 'png' && sizeKB > maxKB) {
    outputFormat = 'jpeg';
    optimized = encode();
    sizeKB = getBase64SizeKB(optimized);
  }

  // First, try lowering JPEG quality
  while (outputFormat === 'jpeg' && sizeKB > maxKB && quality > minQuality + 0.001) {
    quality = Math.max(minQuality, quality - 0.1);
    optimized = encode();
    sizeKB = getBase64SizeKB(optimized);
  }

  // If still too big, progressively downscale
  while (sizeKB > maxKB && Math.max(outW, outH) > 320) {
    outW = Math.max(1, Math.round(outW * 0.85));
    outH = Math.max(1, Math.round(outH * 0.85));
    optimized = encode();
    sizeKB = getBase64SizeKB(optimized);

    if (outputFormat === 'jpeg' && sizeKB > maxKB && quality > minQuality + 0.001) {
      quality = Math.max(minQuality, quality - 0.05);
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
 * Result type for take screenshot operation
 */
interface TakeScreenshotResult {
  status: 'success' | 'error';
  message: string;
  screenshotInfo?: {
    format: 'png' | 'jpeg';
    dimensions: {
      width: number;
      height: number;
      devicePixelRatio?: number;
    };
    sizeKB: number;
    quality?: number;
    isFullPage: boolean;
    dataUrl?: string;
    url?: string;
  };
}

/**
 * Take a screenshot of the current tab (visible area or full page)
 * @param captureFullPage - If true, captures the entire scrollable page. If false, captures only visible viewport (default: true)
 * @param format - Image format: 'png' or 'jpeg' (default: 'jpeg' for smaller file size)
 * @param quality - JPEG quality 0-100, only applies if format is 'jpeg' (default: 25 for optimal compression)
 * @returns Promise with status and message object
 */
export async function handleTakeScreenshot(
  captureFullPage: boolean = true,
  format: 'png' | 'jpeg' = 'jpeg',
  quality: number = 25,
): Promise<TakeScreenshotResult> {
  try {
    debug.log('[Screenshot] Taking screenshot:', { captureFullPage, format, quality });

    // Get the current active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.id || !tabs[0]?.windowId) {
      return {
        status: 'error',
        message: 'Unable to access current tab',
      };
    }

    const tabId = tabs[0].id;
    const windowId = tabs[0].windowId;

    if (captureFullPage) {
      // Full page screenshot - requires scrolling and stitching
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: async (imgFormat: 'png' | 'jpeg', imgQuality: number) => {
          try {
            // Get page dimensions
            const body = document.body;
            const html = document.documentElement;

            const pageWidth = Math.max(
              body.scrollWidth,
              body.offsetWidth,
              html.clientWidth,
              html.scrollWidth,
              html.offsetWidth,
            );

            const pageHeight = Math.max(
              body.scrollHeight,
              body.offsetHeight,
              html.clientHeight,
              html.scrollHeight,
              html.offsetHeight,
            );

            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            // Save current scroll position
            const originalScrollX = window.scrollX;
            const originalScrollY = window.scrollY;

            // Create canvas for full page
            const canvas = document.createElement('canvas');
            canvas.width = pageWidth;
            canvas.height = pageHeight;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
              throw new Error('Could not get canvas context');
            }

            // Show progress indicator
            const progressDiv = document.createElement('div');
            progressDiv.id = '__copilot_screenshot_progress__';
            progressDiv.style.cssText = `
              position: fixed;
              top: 20px;
              right: 20px;
              padding: 16px 24px;
              background: rgba(76, 175, 80, 0.95);
              color: white;
              border-radius: 8px;
              font-family: system-ui, -apple-system, sans-serif;
              font-size: 14px;
              font-weight: 600;
              box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
              z-index: 2147483647;
              pointer-events: none;
            `;
            progressDiv.textContent = '📸 Capturing screenshot...';
            document.body.appendChild(progressDiv);

            // Calculate number of tiles needed
            const cols = Math.ceil(pageWidth / viewportWidth);
            const rows = Math.ceil(pageHeight / viewportHeight);
            const totalTiles = cols * rows;
            let capturedTiles = 0;

            // Capture tiles
            const tiles: Array<{ img: HTMLImageElement; x: number; y: number }> = [];

            for (let row = 0; row < rows; row++) {
              for (let col = 0; col < cols; col++) {
                const x = col * viewportWidth;
                const y = row * viewportHeight;

                // Scroll to position
                window.scrollTo(x, y);

                // Wait for scroll and render
                await new Promise(resolve => setTimeout(resolve, 100));

                // Update progress
                capturedTiles++;
                progressDiv.textContent = `📸 Capturing ${capturedTiles}/${totalTiles}...`;

                // Capture this viewport (we'll request it from background)
                tiles.push({ x, y } as any);
              }
            }

            // Restore scroll position
            window.scrollTo(originalScrollX, originalScrollY);
            progressDiv.remove();

            return {
              success: true,
              fullPage: true,
              dimensions: { width: pageWidth, height: pageHeight, tiles: totalTiles },
              message: `Full page screenshot prepared (${pageWidth}x${pageHeight}px, ${totalTiles} tiles)`,
            };
          } catch (error) {
            return {
              success: false,
              message: `Error preparing full page screenshot: ${(error as Error).message}`,
            };
          }
        },
        args: [format, quality],
      });

      if (result && result[0]?.result?.success) {
        // For full page, we'd need to use chrome.tabs.captureVisibleTab multiple times
        // For now, let's capture visible area and inform user
        const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
          format: format,
          quality: format === 'jpeg' ? quality : undefined,
        });

        const optimized = await optimizeDataUrl(dataUrl, {
          targetFormat: format,
          maxDimension: 1024,
          maxKB: 250,
          startQuality: Math.min(0.85, Math.max(0.4, (quality ?? 25) / 100)),
          minQuality: 0.4,
        });

        const dims = { width: optimized.width, height: optimized.height };

        // Firebase upload disabled for now; keep url undefined
        let hostedUrl: string | undefined = undefined;
        // try {
        //   if (COPIOLITKIT_CONFIG.ENABLE_FIREBASE_UPLOADS && COPIOLITKIT_CONFIG.FIREBASE?.storageBucket) {
        //     const storage = ensureFirebase(COPIOLITKIT_CONFIG.FIREBASE as any);
        //     const ext = optimized.outputFormat === 'jpeg' ? 'jpg' : 'png';
        //     const path = `screenshots/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        //     hostedUrl = await uploadDataUrlToStorage(
        //       storage,
        //       path,
        //       optimized.dataUrl,
        //       optimized.outputFormat === 'jpeg' ? 'image/jpeg' : 'image/png',
        //     );
        //   }
        // } catch (e) {
        //   debug.warn('[Screenshot] Firebase upload failed, using dataUrl fallback');
        // }

        return {
          status: 'success',
          message:
            'Screenshot captured (visible area). Note: Full page screenshots require multiple captures. Current implementation captures the visible viewport.',
          screenshotInfo: {
            format: optimized.outputFormat,
            dimensions: {
              width: dims?.width || 0,
              height: dims?.height || 0,
            },
            sizeKB: optimized.sizeKB,
            quality: optimized.quality,
            isFullPage: false,
            dataUrl: optimized.dataUrl,
            url: hostedUrl,
          },
        };
      }

      return {
        status: 'error',
        message: 'Failed to prepare full page screenshot',
      };
    } else {
      // Simple viewport screenshot
      const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
        format: format,
        quality: format === 'jpeg' ? quality : undefined,
      });

      const optimized = await optimizeDataUrl(dataUrl, {
        targetFormat: format,
        maxDimension: 1024,
        maxKB: 250,
        startQuality: Math.min(0.85, Math.max(0.4, (quality ?? 25) / 100)),
        minQuality: 0.4,
      });

      // Get viewport dimensions
      const dimensions = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => ({
          width: window.innerWidth,
          height: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio,
        }),
      });

      const dims = {
        width: optimized.width,
        height: optimized.height,
        devicePixelRatio: dimensions[0]?.result?.devicePixelRatio,
      } as any;
      const sizeKB = optimized.sizeKB;


      // Firebase upload disabled for now; keep url undefined
      let hostedUrl: string | undefined = undefined;
      // try {
      //   if (COPIOLITKIT_CONFIG.ENABLE_FIREBASE_UPLOADS && COPIOLITKIT_CONFIG.FIREBASE?.storageBucket) {
      //     const storage = ensureFirebase(COPIOLITKIT_CONFIG.FIREBASE as any);
      //     const ext = optimized.outputFormat === 'jpeg' ? 'jpg' : 'png';
      //     const path = `screenshots/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      //     hostedUrl = await uploadDataUrlToStorage(
      //       storage,
      //       path,
      //       optimized.dataUrl,
      //       optimized.outputFormat === 'jpeg' ? 'image/jpeg' : 'image/png',
      //     );
      //   }
      // } catch (e) {
      //   debug.warn('[Screenshot] Firebase upload failed, using dataUrl fallback');
      // }

      return {
        status: 'success',
        message:
          'Screenshot captured successfully. The screenshot has been captured and is available as a data URL. You can use it for analysis or comparison purposes.',
        screenshotInfo: {
          format: optimized.outputFormat,
          dimensions: {
            width: dims?.width || 0,
            height: dims?.height || 0,
            devicePixelRatio: dims?.devicePixelRatio || 1,
          },
          sizeKB: sizeKB,
          quality: optimized.quality,
          isFullPage: false,
          dataUrl: optimized.dataUrl,
          url: hostedUrl,
        },
      };
    }
  } catch (error) {
    debug.error('[Screenshot] Error taking screenshot:', error);
    return {
      status: 'error',
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
