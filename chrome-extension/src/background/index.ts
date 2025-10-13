import 'webextension-polyfill';
import { exampleThemeStorage } from '@extension/storage';

// Type declaration for utils library
declare global {
  interface Window {
    utils: {
      generateFastSelector: (element: Element) => { selector: string; isUnique: boolean };
    };
  }
}

exampleThemeStorage.get().then(theme => {
  console.log('theme', theme);
});

// Conditional logging (set to false in production)
const DEBUG = true;
const log = (...args: any[]) => DEBUG && console.log(...args);
const logError = (...args: any[]) => console.error(...args); // Always log errors

log('Background loaded');
log("Edit 'chrome-extension/src/background/index.ts' and save to reload.");

// Interface for page content data (memory-only, not persisted to storage)
interface PageContentData {
  [tabId: string]: {
    content: any;
    timestamp: number;
    url: string;
    title: string;
  };
}

// Store for current page content
let currentPageContent: PageContentData = {};

// Set up side panel behavior - enable auto-open on action click
chrome.runtime.onInstalled.addListener(() => {
  // Enable auto-opening side panel when extension icon is clicked
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  log('Extension installed - side panel auto-open enabled');
});

// Also set on startup to ensure side panel auto-open works
chrome.runtime.onStartup.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  log('Extension startup - side panel auto-open enabled');
});

// Handle messages from content scripts and side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'pageContentUpdate') {
    handlePageContentUpdate(message.data, sender.tab?.id);
    sendResponse({ success: true });
  } else if (message.type === 'getPageContent') {
    const tabId = message.tabId || sender.tab?.id;
    const content = tabId ? currentPageContent[tabId.toString()] : null;
    sendResponse({ content: content?.content || null });
  } else if (message.type === 'requestPageAnalysis') {
    extractPageContent(message.tabId || sender.tab?.id);
    sendResponse({ success: true });
  } else if (message.type === 'getCurrentTab') {
    // Handle request for current tab info
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab) {
        sendResponse({ 
          tabId: activeTab.id, 
          url: activeTab.url, 
          title: activeTab.title 
        });
        
        // Don't automatically broadcast or extract content here
        // Let the side panel decide when to fetch content via getPageContentOnDemand
        // This prevents unnecessary broadcasts and duplicate processing
      } else {
        sendResponse({ tabId: null, url: null, title: null });
      }
    });
  } else if (message.type === 'urlChanged') {
    // Clear cached content when URL changes
    const tabId = sender.tab?.id;
    if (tabId) {
      log('URL changed, clearing cached content for tab:', tabId);
      delete currentPageContent[tabId.toString()];
      
      // Notify side panel about URL change
      chrome.runtime.sendMessage({
        type: 'urlChanged',
        tabId: tabId,
        url: message.url
      }).catch(() => {
        // Side panel might not be open, ignore error
      });
    }
    sendResponse({ success: true });
  } else if (message.type === 'getPageContentOnDemand') {
    // Get fresh page content on demand
    extractPageContent(message.tabId || sender.tab?.id, sendResponse);
    return true; // Keep the message channel open for async response
  } else if (message.type === 'domContentChanged') {
    // Handle DOM change notification from content script
    const tabId = sender.tab?.id;
    if (tabId) {
      log('[Background] DOM changes detected on tab:', tabId);
      
      // Notify side panel with both stale notification AND incremental DOM update
      chrome.runtime.sendMessage({
        type: 'contentBecameStale',
        tabId: tabId,
        url: message.url,
        timestamp: message.timestamp,
        domUpdate: message.domUpdate // Forward the incremental update
      }).catch(() => {
        // Side panel might not be open, ignore error
      });
    }
    sendResponse({ success: true });
  }
  return true;
});

// Handle page content updates from content scripts
async function handlePageContentUpdate(data: any, tabId?: number, skipBroadcast = false) {
  if (!tabId) return;

  const tabIdStr = tabId.toString();
  currentPageContent[tabIdStr] = {
    content: data,
    timestamp: data.timestamp || Date.now(),
    url: data.url,
    title: data.title
  };

  // Only store in memory, do NOT persist to chrome.storage
  // Page content can be large and we don't need to persist it

  // Skip broadcast for on-demand fetches (they get direct response)
  // This prevents duplicate processing in the side panel
  if (!skipBroadcast) {
    log('[Background] Broadcasting pageContentUpdated for tab:', tabId);
    // Notify side panel about the update
    chrome.runtime.sendMessage({
      type: 'pageContentUpdated',
      tabId: tabId,
      data: data
    }).catch(() => {
      // Side panel might not be open, ignore error
    });
  } else {
    log('[Background] Skipping broadcast (on-demand fetch) for tab:', tabId);
  }
}

// Unified page content extraction function (consolidates old requestPageAnalysis + handleGetPageContentOnDemand)
async function extractPageContent(tabId?: number, sendResponse?: (response: any) => void) {
  if (!tabId) {
    sendResponse?.({ success: false, error: 'No tab ID provided' });
    return;
  }

  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab || !tab.url) {
      log('[Background] Skipping tab with no URL:', tab?.url);
      sendResponse?.({ success: false, error: 'Tab has no URL' });
      return;
    }

    // Check for restricted Chrome URLs that cannot be accessed via content scripts
    const isRestrictedURL = tab.url.startsWith('chrome://') || 
                           tab.url.startsWith('chrome-extension://') || 
                           tab.url.startsWith('about:') ||
                           tab.url.startsWith('edge://') ||
                           tab.url.startsWith('moz-extension://');
    
    if (isRestrictedURL) {
      log('[Background] Cannot extract from restricted URL:', tab.url);
      
      // Return basic info for restricted pages
      const basicInfo = {
        url: tab.url,
        title: tab.title || 'Restricted Page',
        textContent: `This is a browser internal page (${tab.url}). Content extraction is not allowed by browser security policies.`,
        allDOMContent: {
          fullHTML: '',
          allFormData: [],
          documentInfo: {
            title: tab.title || 'Restricted Page',
            url: tab.url,
            referrer: '',
            domain: '',
            lastModified: '',
            readyState: 'complete',
            characterSet: 'UTF-8',
            contentType: 'text/html'
          },
          windowInfo: {
            innerWidth: 0,
            innerHeight: 0,
            outerWidth: 0,
            outerHeight: 0,
            scrollX: 0,
            scrollY: 0,
            location: {
              href: tab.url,
              protocol: tab.url.split(':')[0] + ':',
              host: '',
              hostname: '',
              port: '',
              pathname: '',
              search: '',
              hash: ''
            },
            userAgent: '',
            language: '',
            platform: ''
          },
          timestamp: Date.now()
        },
        timestamp: Date.now()
      };
      
      // Skip broadcast if this is an on-demand fetch (has sendResponse)
      await handlePageContentUpdate(basicInfo, tabId, !!sendResponse);
      sendResponse?.({ success: true, content: basicInfo, restricted: true });
      return;
    }

    log('[Background] Extracting page content for:', tab.url);

    // Optimized extraction - only essential data for the AI agent
    try {
      // First inject the utils library
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['utils.js']
      });

      // Then run the content extraction script
      const results = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {

          // Robust fallback selector generation when finder fails
          const generateRobustFallbackSelector = (el: Element): { selector: string; isUnique: boolean } => {
            const tagName = el.tagName.toLowerCase();
            
            // Strategy 1: ID selector (most reliable)
            if (el.id) {
              const idSelector = `#${CSS.escape(el.id)}`;
              const matches = document.querySelectorAll(idSelector);
              if (matches.length === 1 && matches[0] === el) {
                return { selector: idSelector, isUnique: true };
              }
            }
            
            // Strategy 2: Data attributes (testing-friendly)
            const testId = el.getAttribute('data-testid');
            if (testId) {
              const dataSelector = `[data-testid="${CSS.escape(testId)}"]`;
              const matches = document.querySelectorAll(dataSelector);
              if (matches.length === 1 && matches[0] === el) {
                return { selector: dataSelector, isUnique: true };
              }
            }
            
            const dataCy = el.getAttribute('data-cy');
            if (dataCy) {
              const dataSelector = `[data-cy="${CSS.escape(dataCy)}"]`;
              const matches = document.querySelectorAll(dataSelector);
              if (matches.length === 1 && matches[0] === el) {
                return { selector: dataSelector, isUnique: true };
              }
            }
            
            // Strategy 3: Name attribute
            const name = el.getAttribute('name');
            if (name) {
              const nameSelector = `${tagName}[name="${CSS.escape(name)}"]`;
              const matches = document.querySelectorAll(nameSelector);
              if (matches.length === 1 && matches[0] === el) {
                return { selector: nameSelector, isUnique: true };
              }
            }
            
            // Strategy 4: Type + name combination
            const type = el.getAttribute('type');
            if (type && name) {
              const typeNameSelector = `${tagName}[type="${CSS.escape(type)}"][name="${CSS.escape(name)}"]`;
              const matches = document.querySelectorAll(typeNameSelector);
              if (matches.length === 1 && matches[0] === el) {
                return { selector: typeNameSelector, isUnique: true };
              }
            }
            
            // Strategy 5: Hierarchical path with classes
            const path: string[] = [];
            let current: Element | null = el;
            let depth = 0;
            
            while (current && current.nodeType === Node.ELEMENT_NODE && depth < 10) {
              let selector = current.tagName.toLowerCase();
              
              // Add classes if available
              if (current.className && typeof current.className === 'string') {
                const classes = Array.from(current.classList);
                if (classes.length > 0) {
                  const classString = classes.map(cls => CSS.escape(cls)).join('.');
                  selector += '.' + classString;
                }
              }
              
              // Add nth-child for disambiguation
              if (current.parentElement) {
                const siblings = Array.from(current.parentElement.children);
                const matchingSiblings = siblings.filter(child => 
                  child.tagName === current!.tagName
                );
                
                if (matchingSiblings.length > 1) {
                  const index = siblings.indexOf(current) + 1;
                  selector += `:nth-child(${index})`;
                }
              }
              
              path.unshift(selector);
              current = current.parentElement;
              depth++;
            }
            
            const fullSelector = path.join(' > ');
            const matches = document.querySelectorAll(fullSelector);
            if (matches.length === 1 && matches[0] === el) {
              return { selector: fullSelector, isUnique: true };
            }
            
            // Strategy 6: Simple tag + class combination
            if (el.className && typeof el.className === 'string') {
              const classes = Array.from(el.classList);
              if (classes.length > 0) {
                const firstClass = classes[0];
                const classSelector = `${tagName}.${CSS.escape(firstClass)}`;
                const matches = document.querySelectorAll(classSelector);
                if (matches.length === 1 && matches[0] === el) {
                  return { selector: classSelector, isUnique: true };
                }
              }
            }
            
            // Strategy 7: Final fallback - tag with nth-child from body
            const allSameTag = document.querySelectorAll(tagName);
            if (allSameTag.length > 1) {
              const index = Array.from(allSameTag).indexOf(el) + 1;
              const nthSelector = `${tagName}:nth-of-type(${index})`;
              const matches = document.querySelectorAll(nthSelector);
              if (matches.length === 1 && matches[0] === el) {
                return { selector: nthSelector, isUnique: true };
              }
            }
            
            // If all strategies fail, return generic selector as non-unique
            return { selector: tagName, isUnique: false };
          };

          // Extract only the minimal data needed by the AI agent
          const extractPageContent = () => {
            
            // Check for Shadow DOM
            const shadowRoots: Array<{
              hostElement: string;
              hostId: string;
              hostClass: string;
              shadowContentSize: number;
              shadowHTML: string;
              fullContent: string;
              textContent: string;
            }> = [];
            let totalShadowContentSize = 0;
            
            // Find all elements with shadow roots
            document.querySelectorAll('*').forEach(element => {
              if (element.shadowRoot) {
                const shadowHTML = element.shadowRoot.innerHTML;
                const shadowSize = shadowHTML.length;
                totalShadowContentSize += shadowSize;
                
                shadowRoots.push({
                  hostElement: element.tagName,
                  hostId: element.id || 'no-id',
                  hostClass: element.className || 'no-class',
                  shadowContentSize: shadowSize,
                  shadowHTML: shadowHTML, // Full shadow content
                  fullContent: shadowHTML,
                  textContent: element.shadowRoot.textContent || ''
                });
              }
            });
            
            // Log Shadow DOM detection results
            if (shadowRoots.length > 0) {
              console.log(`🔍 [Shadow DOM Detection] Found ${shadowRoots.length} shadow root(s) with total content size: ${totalShadowContentSize} characters`);
              shadowRoots.forEach((root, index) => {
                console.log(`   Shadow Root ${index + 1}:`, {
                  host: `${root.hostElement}${root.hostId ? '#' + root.hostId : ''}${root.hostClass ? '.' + root.hostClass.split(' ')[0] : ''}`,
                  size: `${root.shadowContentSize} chars`,
                  preview: root.shadowHTML
                });
              });
            } else {
              console.log('🔍 [Shadow DOM Detection] No shadow roots detected');
            }
            
            return {
              url: window.location.href,
              title: document.title,
              textContent: document.body.innerText || '',
              
              // ONLY extract what the AI agent actually uses:
              allDOMContent: {
                // 1. Full HTML (for CSS selector extraction)
                  fullHTML: document.documentElement.outerHTML,
                  
                // 2. Shadow DOM content (for content not visible in main DOM)
                  shadowContent: shadowRoots.map(root => ({
                    hostElement: root.hostElement,
                    hostId: root.hostId,
                    hostClass: root.hostClass,
                    content: root.fullContent,
                    textContent: root.textContent
                  })),
                  
                // 2. Form data (for form filling actions) - Enhanced to handle custom dropdowns
                  allFormData: (() => {
                    const formElements: Array<{ element: Element; isCustom: boolean; index: number }> = [];
                    
                    // First, collect traditional form elements
                    const traditionalElements = Array.from(document.querySelectorAll('input, select, textarea'));
                    
                    // Then, collect custom dropdown components (button with role="combobox" or data-slot="select-trigger")
                    const customDropdowns = Array.from(document.querySelectorAll('button[role="combobox"], button[data-slot="select-trigger"], [role="combobox"]'));
                    
                    // Process traditional elements
                    traditionalElements.forEach((input, index) => {
                      // Skip hidden select elements that are part of custom dropdowns
                      if (input.tagName === 'SELECT' && 
                          (input.getAttribute('aria-hidden') === 'true' || 
                           input.getAttribute('tabindex') === '-1' ||
                           (input as HTMLElement).style.position === 'absolute')) {
                        // Check if there's a corresponding custom dropdown trigger
                        const container = input.closest('[data-slot="form-item"]');
                        if (container) {
                          const trigger = container.querySelector('button[role="combobox"], button[data-slot="select-trigger"]');
                          if (trigger) {
                            // Skip this hidden select, we'll handle it with the custom dropdown
                            return;
                          }
                        }
                      }
                      
                      formElements.push({ element: input, isCustom: false, index: formElements.length });
                    });
                    
                    // Process custom dropdowns
                    customDropdowns.forEach((button, index) => {
                      formElements.push({ element: button, isCustom: true, index: formElements.length });
                    });
                    
                    return formElements;
                  })().map((item, index) => {
                    const input = item.element;
                    const id = input.id;
                    const name = input.getAttribute('name') || '';
                    const type = input.getAttribute('type') || '';
                    const placeholder = input.getAttribute('placeholder') || '';
                    const tagName = input.tagName.toLowerCase();
                    const isCustom = item.isCustom;
                    
                    // For custom dropdowns, get the associated hidden select element for value extraction
                    let associatedSelect = null;
                    if (isCustom && tagName === 'button') {
                      const container = input.closest('[data-slot="form-item"]');
                      if (container) {
                        associatedSelect = container.querySelector('select[aria-hidden="true"]');
                      }
                    }
                    
                    // Extract label text (multiple methods for different label patterns)
                    let label = '';
                    
                    // Method 1: <label for="inputId">Label Text</label> (direct ID match)
                    if (id) {
                      const labelElement = document.querySelector(`label[for="${CSS.escape(id)}"]`);
                      if (labelElement) {
                        label = labelElement.textContent?.trim() || '';
                      }
                    }
                    
                    // Method 1.5: Look for label that targets a container with the input inside
                    if (!label) {
                      // Check if input is inside a container that has an ID referenced by a label
                      const container = input.closest('[id]');
                      if (container && container.id) {
                        const labelElement = document.querySelector(`label[for="${CSS.escape(container.id)}"]`);
                        if (labelElement) {
                          label = labelElement.textContent?.trim() || '';
                        }
                      }
                    }
                    
                    // Method 2: <label><input>Label Text</label> (wrapping label)
                    if (!label) {
                      const parentLabel = input.closest('label');
                      if (parentLabel) {
                        label = parentLabel.textContent?.trim() || '';
                        // Remove the input's own text content if it's included
                        if (input.textContent) {
                          label = label.replace(input.textContent, '').trim();
                        }
                      }
                    }
                    
                    // Method 3: Look for nearby text elements (aria-label, aria-labelledby, or preceding text)
                    if (!label) {
                      const ariaLabel = input.getAttribute('aria-label');
                      if (ariaLabel) {
                        label = ariaLabel;
                      } else {
                        const ariaLabelledBy = input.getAttribute('aria-labelledby');
                        if (ariaLabelledBy) {
                          const labelElement = document.getElementById(ariaLabelledBy);
                          if (labelElement) {
                            label = labelElement.textContent?.trim() || '';
                          }
                        }
                      }
                    }
                    
                    // Method 4: Look for preceding text in the same container
                    if (!label) {
                      const parent = input.parentElement;
                      if (parent) {
                        const textNodes = Array.from(parent.childNodes)
                          .filter(node => node.nodeType === Node.TEXT_NODE)
                          .map(node => node.textContent?.trim())
                          .filter((text): text is string => text !== undefined && text.length > 0);
                        
                        if (textNodes.length > 0) {
                          label = textNodes[0];
                        }
                      }
                    }
                    
                    // Method 5: Look for label in the same form item container
                    if (!label) {
                      const formItem = input.closest('[data-slot="form-item"]');
                      if (formItem) {
                        const labelElement = formItem.querySelector('label[data-slot="form-label"]');
                        if (labelElement) {
                          label = labelElement.textContent?.trim() || '';
                        }
                      }
                    }
                    
                    // Generate CSS selectors using our optimized fast generator
                    const generateFormSelector = (el: Element): { selector: string; isUnique: boolean } => {
                      if (!el || el.nodeType !== Node.ELEMENT_NODE) {
                        return { selector: el.tagName.toLowerCase(), isUnique: false };
                      }

                      // Check if utils is available
                      if (typeof window.utils !== 'object' || typeof window.utils.generateFastSelector !== 'function') {
                        return generateRobustFallbackSelector(el);
                      }

                      // Using fast selector generator - tested and confirmed as best performer
                      return window.utils.generateFastSelector(el);
                    };

                    // Generate the best selector using finder
                    const selectorResult = generateFormSelector(input);
                    const bestSelector = selectorResult.selector;
                    const isSelectorUnique = selectorResult.isUnique;
                    
                    // Get value from appropriate source
                    let value = '';
                    if (isCustom && tagName === 'button' && associatedSelect) {
                      // For custom dropdowns, get value from the hidden select
                      value = (associatedSelect as HTMLSelectElement).value || '';
                    } else {
                      // For traditional elements, get value directly
                      value = (input as HTMLInputElement).value || '';
                    }
                    
                    // Get selected index from appropriate source
                    let selected = -1;
                    if (isCustom && tagName === 'button' && associatedSelect) {
                      selected = (associatedSelect as HTMLSelectElement).selectedIndex;
                    } else if (tagName === 'select') {
                      selected = (input as HTMLSelectElement).selectedIndex;
                    }
                    
                    return {
                    tagName: input.tagName,
                      type: isCustom ? 'select' : type, // Treat custom dropdowns as select type
                      name: name,
                      id: id,
                      value: value,
                      placeholder: placeholder,
                      label: label,
                    checked: (input as HTMLInputElement).checked,
                      selected: selected,
                      textContent: input.textContent || '',
                      selectors: [bestSelector], // Use finder-generated selector
                      bestSelector: bestSelector,
                      elementIndex: index,
                      isUnique: isSelectorUnique, // Use actual uniqueness verification
                      isCustomDropdown: isCustom
                    };
                  }),
                  
                // 3. Clickable elements (for clicking actions) - OPTIMIZED MODERN WEB APP SUPPORT
                  clickableElements: (() => {
                    try {
                      // Use finder library for CSS selector generation with robust fallback
                      const generateSelector = (el: Element): string => {
                        if (!el || el.nodeType !== Node.ELEMENT_NODE) {
                          return '';
                        }

                        const tagName = el.tagName.toLowerCase();

                        // Strategy 1: Use ID selector if available (most reliable, skip finder)
                        if (el.id) {
                          const idSelector = `#${CSS.escape(el.id)}`;
                          const matches = document.querySelectorAll(idSelector);
                          if (matches.length === 1 && matches[0] === el) {
                            return idSelector;
                          }
                        }

                        // Strategy 2: Data attributes (testing-friendly)
                        const testId = el.getAttribute('data-testid');
                        if (testId) {
                          const dataSelector = `[data-testid="${CSS.escape(testId)}"]`;
                          const matches = document.querySelectorAll(dataSelector);
                          if (matches.length === 1 && matches[0] === el) {
                            return dataSelector;
                          }
                        }

                        const dataCy = el.getAttribute('data-cy');
                        if (dataCy) {
                          const dataSelector = `[data-cy="${CSS.escape(dataCy)}"]`;
                          const matches = document.querySelectorAll(dataSelector);
                          if (matches.length === 1 && matches[0] === el) {
                            return dataSelector;
                          }
                        }

                        // Strategy 3: Name attribute
                        const name = el.getAttribute('name');
                        if (name) {
                          const nameSelector = `${tagName}[name="${CSS.escape(name)}"]`;
                          const matches = document.querySelectorAll(nameSelector);
                          if (matches.length === 1 && matches[0] === el) {
                            return nameSelector;
                          }
                        }

                        // Strategy 4: Type + name combination
                        const type = el.getAttribute('type');
                        if (type && name) {
                          const typeNameSelector = `${tagName}[type="${CSS.escape(type)}"][name="${CSS.escape(name)}"]`;
                          const matches = document.querySelectorAll(typeNameSelector);
                          if (matches.length === 1 && matches[0] === el) {
                            return typeNameSelector;
                          }
                        }

                        // Check if utils is available
                        if (typeof window.utils !== 'object' || typeof window.utils.generateFastSelector !== 'function') {
                          const fallback = generateRobustFallbackSelector(el);
                          return fallback.selector;
                        }

                        // Use our optimized fast selector generator from utils
                        const result = window.utils.generateFastSelector(el);
                        return result.selector;
                      };
                      
                      // Optimized element collection
                      const elements = new Set<Element>();
                      const selectors = [
                        // Standard HTML elements
                        'button', 'a[href]', 'input[type="button"]', 'input[type="submit"]', 'input[type="reset"]', 'input[type="checkbox"]', 'input[type="radio"]',
                        // ARIA roles (accessibility)
                        '[role="button"]', '[role="link"]', '[role="menuitem"]', '[role="tab"]', '[role="option"]', '[role="checkbox"]', '[role="radio"]', '[role="switch"]',
                        // Event handlers (modern frameworks)
                        '[onclick]', '[onmousedown]', '[onmouseup]', '[ontouchstart]', '[ontouchend]',
                        // Data attributes (testing frameworks)
                        '[data-testid]', '[data-cy]', '[data-test]', '[data-testid*="button"]', '[data-testid*="link"]', '[data-testid*="click"]',
                        // Framework patterns (React/Vue/Angular)
                        '[class*="button"]', '[class*="btn"]', '[class*="link"]', '[class*="clickable"]', '[class*="interactive"]', '[class*="action"]',
                        '[class*="card"]', '[class*="item"]', '[class*="menu"]', '[class*="tab"]', '[class*="option"]', '[class*="select"]',
                        // UI libraries (Ant Design, Element UI, Vuetify, etc.)
                        '[class*="ant-btn"]', '[class*="el-button"]', '[class*="v-btn"]', '[class*="btn-"]', '[class*="button-"]', '[class*="link-"]',
                        // Common interactive patterns
                        '[class*="dropdown"]', '[class*="modal"]', '[class*="dialog"]', '[class*="popup"]', '[class*="tooltip"]'
                      ];
                      
                      // Batch element collection
                      selectors.forEach(selector => {
                        try {
                          document.querySelectorAll(selector).forEach(el => elements.add(el));
                        } catch (e) {
                          // Skip invalid selectors
                        }
                      });
                      
                      // Add cursor pointer elements (optimized - only check elements with common interactive classes)
                      const cursorSelectors = ['[style*="cursor: pointer"]', '[style*="cursor:grab"]', '.cursor-pointer', '.cursor-grab'];
                      cursorSelectors.forEach(selector => {
                        try {
                          document.querySelectorAll(selector).forEach(el => elements.add(el));
                        } catch (e) {
                          // Skip invalid selectors
                        }
                      });
                      
                      // Process elements in single pipeline
                      return Array.from(elements)
                        .filter(el => {
                          const rect = el.getBoundingClientRect();
                          return rect.width > 0 && rect.height > 0;
                        })
                        .map(el => {
                          const rect = el.getBoundingClientRect();
                          const text = el.textContent?.trim() || '';
                          
                          return {
                            selector: generateSelector(el),
                            tagName: el.tagName.toLowerCase(),
                            text: text.substring(0, 100),
                            href: (el as HTMLAnchorElement).href || '',
                            title: el.getAttribute('title')?.substring(0, 100) || '',
                            type: el.getAttribute('type') || ''
                          };
                        })
                        .filter(item => 
                          item.text || item.title || item.href || item.tagName === 'button' || item.tagName === 'a'
                        )
                        .reduce((unique, item) => {
                          if (!unique.find(existing => existing.selector === item.selector)) {
                            unique.push(item);
                          }
                          return unique;
                        }, [] as any[])
                        .slice(0, 200);
                        
                    } catch (error) {
                      console.warn('Clickable elements extraction failed:', error);
                      return [];
                    }
                  })(),
                  
                // 4. Document metadata
                  documentInfo: {
                    title: document.title,
                    url: document.URL,
                    referrer: document.referrer,
                    domain: document.domain,
                    lastModified: document.lastModified,
                    readyState: document.readyState,
                    characterSet: document.characterSet,
                    contentType: document.contentType
                  },
                  
                // 5. Window information
                  windowInfo: {
                    innerWidth: window.innerWidth,
                    innerHeight: window.innerHeight,
                    outerWidth: window.outerWidth,
                    outerHeight: window.outerHeight,
                    scrollX: window.scrollX,
                    scrollY: window.scrollY,
                    location: {
                      href: window.location.href,
                      protocol: window.location.protocol,
                      host: window.location.host,
                      hostname: window.location.hostname,
                      port: window.location.port,
                      pathname: window.location.pathname,
                      search: window.location.search,
                      hash: window.location.hash
                    },
                    userAgent: navigator.userAgent,
                    language: navigator.language,
                    platform: navigator.platform
                  },
                  
                  timestamp: Date.now()
              },
              timestamp: Date.now()
            };
          };
          
          return extractPageContent();
        }
      });

      if (results && results[0] && results[0].result) {
        log('[Background] Content extracted successfully for:', results[0].result.title);
        
        // Store the extracted content
        // Skip broadcast if this is an on-demand fetch (has sendResponse) to prevent duplicate processing
        await handlePageContentUpdate(results[0].result, tabId, !!sendResponse);
        
        sendResponse?.({ success: true, content: results[0].result });
        return;
      } else {
        log('[Background] Failed to extract content - no results returned');
        log('[Background] Results object:', results);
        if (results && results[0]) {
          log('[Background] First result:', results[0]);
        }
      }
    } catch (extractError) {
      logError('[Background] Content extraction failed:', extractError);
    }

    sendResponse?.({ success: false, error: 'Could not extract page content' });
  } catch (error) {
    logError('[Background] Failed to get page content:', error);
    sendResponse?.({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

// Clean up old page content when tabs are closed (memory only)
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const tabIdStr = tabId.toString();
  delete currentPageContent[tabIdStr];
  // No storage cleanup needed - page content is not persisted
});

// No need to load page content on startup - it's memory-only
// Page content will be fetched fresh when needed
