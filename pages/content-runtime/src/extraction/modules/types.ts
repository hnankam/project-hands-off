/**
 * @fileoverview Type definitions for page content extraction
 */

export interface WindowWithUtils extends Window {
  utils?: {
    generateFastSelector: (element: Element, shadowRoot?: ShadowRoot | null) => { 
      selector: string; 
      isUnique: boolean 
    };
    version: string;
  };
}

export interface SelectorResult {
  selector: string;
  isUnique: boolean;
}

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

export interface CleaningResult {
  cleanedHtml: string;
  originalSize: number;
  cleanedSize: number;
  reductionPercentage: number;
  originalSample: string;
  cleanedSample: string;
}

export interface UniquenessResult {
  selector: string;
  isUnique: boolean;
  isGloballyUnique: boolean;
}

