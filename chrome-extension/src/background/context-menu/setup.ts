/**
 * @fileoverview Context Menu Setup for Chrome Extension
 *
 * This module handles the setup and configuration of browser context menus
 * for the AI copilot assistant. It creates a hierarchical menu structure
 * with various options for text selection, page analysis, link analysis,
 * and element inspection.
 *
 * Menu Structure:
 * - Selection context (explain, summarize, translate, ask)
 * - Page context (analyze, summarize)
 * - Link context (analyze link)
 * - Image context (analyze image)
 * - Element context (deep dive analysis)
 * - Open panel (quick access)
 *
 * @module context-menu/setup
 */

import { logger } from '../utils/logger';

/**
 * Setup all context menu items
 * 
 * This function creates a complete hierarchical context menu for the
 * AI copilot assistant. It removes any existing menus first to ensure
 * a clean state, then creates all menu items in the correct order.
 * 
 * The menu includes:
 * - Text selection actions (explain, summarize, translate, ask)
 * - Page-level actions (analyze, summarize)
 * - Link analysis
 * - Image analysis
 * - Element inspection
 * - Quick panel access
 * 
 * @example
 * // Call on extension install
 * chrome.runtime.onInstalled.addListener(() => {
 *   setupContextMenus();
 * });
 */
export function setupContextMenus(): void {
  // Remove all existing context menus first
  chrome.contextMenus.removeAll(() => {
    // Parent menu item
    chrome.contextMenus.create({
      id: 'copilot-parent',
      title: 'Copilot Assistant',
      contexts: ['page', 'selection', 'link', 'image']
    });
    
    // Selection context menus
    chrome.contextMenus.create({
      id: 'copilot-explain',
      parentId: 'copilot-parent',
      title: 'Explain "%s"',
      contexts: ['selection']
    });
    
    chrome.contextMenus.create({
      id: 'copilot-summarize',
      parentId: 'copilot-parent',
      title: 'Summarize "%s"',
      contexts: ['selection']
    });
    
    chrome.contextMenus.create({
      id: 'copilot-translate',
      parentId: 'copilot-parent',
      title: 'Translate "%s"',
      contexts: ['selection']
    });
    
    // Separator
    chrome.contextMenus.create({
      id: 'copilot-separator-1',
      parentId: 'copilot-parent',
      type: 'separator',
      contexts: ['selection']
    });
    
    // Ask about selection
    chrome.contextMenus.create({
      id: 'copilot-ask',
      parentId: 'copilot-parent',
      title: 'Ask about "%s"',
      contexts: ['selection']
    });
    
    // Page context menus
    chrome.contextMenus.create({
      id: 'copilot-analyze-page',
      parentId: 'copilot-parent',
      title: 'Analyze this page',
      contexts: ['page']
    });
    
    chrome.contextMenus.create({
      id: 'copilot-summarize-page',
      parentId: 'copilot-parent',
      title: 'Summarize this page',
      contexts: ['page']
    });
    
    // Link context menu
    chrome.contextMenus.create({
      id: 'copilot-analyze-link',
      parentId: 'copilot-parent',
      title: 'Analyze this link',
      contexts: ['link']
    });
    
    // Image context menu
    chrome.contextMenus.create({
      id: 'copilot-analyze-image',
      parentId: 'copilot-parent',
      title: 'Analyze this image',
      contexts: ['image']
    });
    
    // Separator
    chrome.contextMenus.create({
      id: 'copilot-separator-2',
      parentId: 'copilot-parent',
      type: 'separator',
      contexts: ['page', 'selection', 'link', 'image']
    });
    
    // Analyze element (captures outerHTML of clicked element)
    chrome.contextMenus.create({
      id: 'copilot-analyze-element',
      parentId: 'copilot-parent',
      title: 'Analyze Element (Deep Dive)',
      contexts: ['page', 'selection']
    });
    
    // Open side panel
    chrome.contextMenus.create({
      id: 'copilot-open-panel',
      parentId: 'copilot-parent',
      title: 'Open Copilot Panel',
      contexts: ['page', 'selection', 'link', 'image']
    });
    
    logger.info('[Context Menu] All context menus created successfully');
  });
}

