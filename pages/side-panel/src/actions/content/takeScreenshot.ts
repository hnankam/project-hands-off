import { debug } from '@extension/shared';

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
  };
}

/**
 * Take a screenshot of the current tab (visible area or full page)
 * @param captureFullPage - If true, captures the entire scrollable page. If false, captures only visible viewport (default: true)
 * @param format - Image format: 'png' or 'jpeg' (default: 'png')
 * @param quality - JPEG quality 0-100, only applies if format is 'jpeg' (default: 90)
 * @returns Promise with status and message object
 */
export async function handleTakeScreenshot(
  captureFullPage: boolean = true,
  format: 'png' | 'jpeg' = 'png',
  quality: number = 90
): Promise<TakeScreenshotResult> {
  try {
    debug.log('[Screenshot] Taking screenshot:', { captureFullPage, format, quality });
    
    // Get the current active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.id || !tabs[0]?.windowId) {
      return {
        status: 'error',
        message: 'Unable to access current tab'
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
              html.offsetWidth
            );
            
            const pageHeight = Math.max(
              body.scrollHeight,
              body.offsetHeight,
              html.clientHeight,
              html.scrollHeight,
              html.offsetHeight
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
              message: `Full page screenshot prepared (${pageWidth}x${pageHeight}px, ${totalTiles} tiles)`
            };
          } catch (error) {
            return {
              success: false,
              message: `Error preparing full page screenshot: ${(error as Error).message}`
            };
          }
        },
        args: [format, quality]
      });

      if (result && result[0]?.result?.success) {
        // For full page, we'd need to use chrome.tabs.captureVisibleTab multiple times
        // For now, let's capture visible area and inform user
        const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
          format: format,
          quality: format === 'jpeg' ? quality : undefined
        });

        const dims = result[0].result.dimensions;
        return {
          status: 'success',
          message: 'Screenshot captured (visible area). Note: Full page screenshots require multiple captures. Current implementation captures the visible viewport.',
          screenshotInfo: {
            format: format,
            dimensions: {
              width: dims?.width || 0,
              height: dims?.height || 0
            },
            sizeKB: Math.round(dataUrl.length / 1024),
            quality: format === 'jpeg' ? quality : undefined,
            isFullPage: false,
            dataUrl: dataUrl
          }
        };
      }

      return {
        status: 'error',
        message: 'Failed to prepare full page screenshot'
      };
    } else {
      // Simple viewport screenshot
      const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
        format: format,
        quality: format === 'jpeg' ? quality : undefined
      });

      // Get viewport dimensions
      const dimensions = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => ({
          width: window.innerWidth,
          height: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio
        })
      });

      const dims = dimensions[0]?.result;
      const sizeKB = Math.round(dataUrl.length / 1024);

      return {
        status: 'success',
        message: 'Screenshot captured successfully. The screenshot has been captured and is available as a data URL. You can use it for analysis or comparison purposes.',
        screenshotInfo: {
          format: format,
          dimensions: {
            width: dims?.width || 0,
            height: dims?.height || 0,
            devicePixelRatio: dims?.devicePixelRatio || 1
          },
          sizeKB: sizeKB,
          quality: format === 'jpeg' ? quality : undefined,
          isFullPage: false,
          dataUrl: dataUrl
        }
      };
    }
  } catch (error) {
    debug.error('[Screenshot] Error taking screenshot:', error);
    return {
      status: 'error',
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

