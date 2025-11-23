/**
 * @fileoverview Type definitions for Chrome Extension Background Service Worker
 * 
 * This module contains all TypeScript interfaces and types used throughout
 * the background service worker modules.
 * 
 * @module background/types
 */

// ============================================================================
// Offscreen Document Types
// ============================================================================

export interface OffscreenMessage {
  type: 'initialize' | 'embedText' | 'generateEmbeddings';
  text?: string;
  texts?: string[];
  requestId?: string;
  target?: string;
}

export interface OffscreenResponse {
  type: 'offscreenResponse';
  requestId: string;
  success: boolean;
  embedding?: number[];
  embeddings?: number[][];
  error?: string;
}

// ============================================================================
// Page Content Types
// ============================================================================

export interface PageContent {
  url: string;
  title: string;
  textContent: string;
  allDOMContent: DOMContent;
  timestamp: number;
}

export interface DOMContent {
  fullHTML: string;
  shadowContent: ShadowRootInfo[];
  allFormData: FormFieldInfo[];
  clickableElements: ClickableElementInfo[];
  documentInfo: DocumentInfo;
  windowInfo: WindowInfo;
  timestamp: number;
}

export interface ShadowRootInfo {
  hostElement: string;
  hostId: string;
  hostClass: string;
  content: string;
  depth: number;
  path: string;
  hasNestedShadowRoots: boolean;
}

export interface FormFieldInfo {
  tagName: string;
  type: string;
  name: string;
  id: string;
  value: string;
  placeholder: string;
  label: string;
  checked: boolean;
  selected: number;
  textContent: string;
  selectors: string[];
  bestSelector: string;
  elementIndex: number;
  isUnique: boolean;
  isCustomDropdown: boolean;
  foundInShadowDOM: boolean;
  shadowPath?: string;
  shadowDepth?: number;
  shadowHostSelector?: string;
}

export interface ClickableElementInfo {
  selector: string;
  isUnique: boolean;
  tagName: string;
  text: string;
  href: string;
  title: string;
  type: string;
  foundInShadowDOM: boolean;
  shadowPath?: string;
  shadowDepth?: number;
  shadowHostSelector?: string;
}

export interface DocumentInfo {
  title: string;
  url: string;
  referrer: string;
  domain: string;
  lastModified: string;
  readyState: string;
  characterSet: string;
  contentType: string;
}

export interface WindowInfo {
  innerWidth: number;
  innerHeight: number;
  outerWidth: number;
  outerHeight: number;
  scrollX: number;
  scrollY: number;
  location: LocationInfo;
  userAgent: string;
  language: string;
  platform: string;
}

export interface LocationInfo {
  href: string;
  protocol: string;
  host: string;
  hostname: string;
  port: string;
  pathname: string;
  search: string;
  hash: string;
}

// ============================================================================
// Embedding Types
// ============================================================================

export interface EmbeddingResult {
  fullEmbedding: number[];
  chunks: Array<{
    text: string;
    html: string;
    embedding: number[];
  }>;
  formFieldGroupEmbeddings?: Array<{
    groupIndex: number;
    fieldsJSON: string;
    embedding: number[];
  }>;
  clickableElementGroupEmbeddings?: Array<{
    groupIndex: number;
    elementsJSON: string;
    embedding: number[];
  }>;
}

export interface HTMLChunk {
  text: string;
  html: string;
}

// ============================================================================
// Storage Types
// ============================================================================

export interface PageContentData {
  [tabId: string]: {
    content: PageContent;
    timestamp: number;
    url: string;
    title: string;
  };
}

export interface CachedContent {
  content: PageContent;
  timestamp: number;
  size: number;
}

// ============================================================================
// Shadow DOM Types
// ============================================================================

export interface ShadowContext {
  foundInShadowDOM: boolean;
  shadowPath: string;
  shadowDepth: number;
  shadowHostSelector: string;
  shadowRoot: ShadowRoot | null;
}

export interface ShadowRootMetadata {
  host: Element;
  depth: number;
  path: string;
}

// ============================================================================
// Selector Generation Types
// ============================================================================

export interface SelectorResult {
  selector: string;
  isUnique: boolean;
  isGloballyUnique?: boolean;
}

// ============================================================================
// HTML Cleaning Types
// ============================================================================

export interface HTMLCleaningOptions {
  removeScripts?: boolean;
  removeStyles?: boolean;
  removeInlineStyles?: boolean;
  removeEventHandlers?: boolean;
  removeComments?: boolean;
  removeDataURLs?: boolean;
  normalizeWhitespace?: boolean;
  maxSize?: number;
}

export interface HTMLCleaningResult {
  cleanedHtml: string;
  originalSize: number;
  cleanedSize: number;
  reductionPercentage: number;
  originalSample?: string;
  cleanedSample?: string;
}

// ============================================================================
// Text Sanitization Types
// ============================================================================

export interface TextSanitizationOptions {
  trimLines?: boolean;
  collapseSpaces?: boolean;
  collapseNewlines?: boolean;
  maxNewlines?: number;
  trim?: boolean;
  removeZeroWidth?: boolean;
  normalizeUnicode?: boolean;
}

// ============================================================================
// Message Types
// ============================================================================

export type BackgroundMessageType =
  | 'offscreenReady'
  | 'offscreenResponse'
  | 'initializeEmbedding'
  | 'initializeEmbeddingResponse'
  | 'embedPageContent'
  | 'embedPageContentForTab'
  | 'embeddingComplete'
  | 'generateEmbedding'
  | 'generateEmbeddingResponse'
  | 'generateEmbeddings'
  | 'generateEmbeddingsResponse'
  | 'pageContentUpdate'
  | 'pageContentUpdated'
  | 'getPageContent'
  | 'requestPageAnalysis'
  | 'getCurrentTab'
  | 'urlChanged'
  | 'getPageContentOnDemand'
  | 'domContentChanged'
  | 'contentBecameStale'
  | 'CONTEXT_MENU_CLICK_POSITION'
  | 'CONTEXT_MENU_ACTION';

export interface BackgroundMessage {
  type: BackgroundMessageType;
  requestId?: string;
  tabId?: number;
  data?: any;
  content?: any;
  text?: string;
  texts?: string[];
  url?: string;
  timestamp?: number;
  domUpdate?: any;
  position?: { x: number; y: number };
  message?: string;
  context?: any;
}

// ============================================================================
// Context Menu Types
// ============================================================================

export interface ContextMenuAction {
  message: string;
  additionalData?: any;
}

// ============================================================================
// Global Window Types
// ============================================================================

declare global {
  interface Window {
    utils: {
      generateFastSelector: (element: Element, shadowRoot?: ShadowRoot | null) => { selector: string; isUnique: boolean };
      version: string;
    };
  }
}

