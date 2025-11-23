/**
 * @fileoverview Form field extraction utilities
 */

import type { WindowWithUtils, ShadowRootMetadata, ShadowContext } from './types';
import { sanitizeText } from './sanitizer';
import { generateRobustFallbackSelector } from './selector-generator';
import { collectElementsRecursively, getShadowContext } from './shadow-dom';
import { ensureUniqueSelector, makeGloballyUniqueSelector } from './uniqueness';

export const extractFormFields = (
  win: WindowWithUtils,
  shadowRootMap: Map<ShadowRoot, ShadowRootMetadata>
) => {
  const formElements: Array<{ element: Element; isCustom: boolean; index: number }> = [];
  
  // Collect traditional form elements
  const traditionalElements = collectElementsRecursively('input, select, textarea', document, shadowRootMap);
  
  // Collect custom dropdown components
  const customDropdowns = collectElementsRecursively(
    'button[role="combobox"], button[data-slot="select-trigger"], [role="combobox"]',
    document,
    shadowRootMap
  );
  
  // Process traditional elements
  traditionalElements.forEach((input) => {
    // Skip hidden select elements that are part of custom dropdowns
    if (input.tagName === 'SELECT' && 
        (input.getAttribute('aria-hidden') === 'true' || 
         input.getAttribute('tabindex') === '-1' ||
         (input as HTMLElement).style.position === 'absolute')) {
      const container = input.closest('[data-slot="form-item"]');
      if (container) {
        const trigger = container.querySelector('button[role="combobox"], button[data-slot="select-trigger"]');
        if (trigger) return;
      }
    }
    
    formElements.push({ element: input, isCustom: false, index: formElements.length });
  });
  
  // Process custom dropdowns
  customDropdowns.forEach((button) => {
    formElements.push({ element: button, isCustom: true, index: formElements.length });
  });
  
  return formElements.map((item, index) => {
    const input = item.element;
    const id = input.id;
    const name = input.getAttribute('name') || '';
    const type = input.getAttribute('type') || '';
    const placeholder = input.getAttribute('placeholder') || '';
    const tagName = input.tagName.toLowerCase();
    const isCustom = item.isCustom;
    
    // For custom dropdowns, get associated hidden select
    let associatedSelect = null;
    if (isCustom && tagName === 'button') {
      const container = input.closest('[data-slot="form-item"]');
      if (container) {
        associatedSelect = container.querySelector('select[aria-hidden="true"]');
      }
    }
    
    // Extract label text (6 methods)
    let label = '';
    
    // Method 1: Direct ID match
    if (id) {
      const labelElement = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (labelElement) {
        label = sanitizeText(labelElement.textContent);
      }
    }
    
    // Method 1.5: Container ID match
    if (!label) {
      const container = input.closest('[id]');
      if (container && container.id) {
        const labelElement = document.querySelector(`label[for="${CSS.escape(container.id)}"]`);
        if (labelElement) {
          label = sanitizeText(labelElement.textContent);
        }
      }
    }
    
    // Method 2: Wrapping label
    if (!label) {
      const parentLabel = input.closest('label');
      if (parentLabel) {
        label = sanitizeText(parentLabel.textContent);
        if (input.textContent) {
          const inputText = sanitizeText(input.textContent);
          label = sanitizeText(label.replace(inputText, ''));
        }
      }
    }
    
    // Method 3: ARIA attributes
    if (!label) {
      const ariaLabel = input.getAttribute('aria-label');
      if (ariaLabel) {
        label = sanitizeText(ariaLabel);
      } else {
        const ariaLabelledBy = input.getAttribute('aria-labelledby');
        if (ariaLabelledBy) {
          const labelElement = document.getElementById(ariaLabelledBy);
          if (labelElement) {
            label = sanitizeText(labelElement.textContent);
          }
        }
      }
    }
    
    // Method 4: Preceding text in container
    if (!label) {
      const parent = input.parentElement;
      if (parent) {
        const textNodes = Array.from(parent.childNodes)
          .filter(node => node.nodeType === Node.TEXT_NODE)
          .map(node => sanitizeText(node.textContent))
          .filter((text): text is string => text !== undefined && text.length > 0);
        
        if (textNodes.length > 0) {
          label = textNodes[0];
        }
      }
    }
    
    // Method 5: Form item container
    if (!label) {
      const formItem = input.closest('[data-slot="form-item"]');
      if (formItem) {
        const labelElement = formItem.querySelector('label[data-slot="form-label"]');
        if (labelElement) {
          label = sanitizeText(labelElement.textContent);
        }
      }
    }
    
    // Get shadow DOM context
    const shadowContext = getShadowContext(input, shadowRootMap);
    
    // Generate CSS selector
    const generateFormSelector = (el: Element, shadowRoot: ShadowRoot | null) => {
      if (!el || el.nodeType !== Node.ELEMENT_NODE) {
        return { selector: el.tagName.toLowerCase(), isUnique: false };
      }
      
      if (typeof win.utils !== 'object' || typeof win.utils.generateFastSelector !== 'function') {
        return generateRobustFallbackSelector(el);
      }
      
      return win.utils.generateFastSelector(el, shadowRoot);
    };
    
    const selectorResult = generateFormSelector(input, shadowContext.shadowRoot);
    const initialSelector = selectorResult.selector;
    
    // Enforce uniqueness
    const uniqueResult = ensureUniqueSelector(input, initialSelector, shadowContext.shadowRoot, shadowRootMap);
    let bestSelector = uniqueResult.selector;
    const isScopedUnique = uniqueResult.isUnique;
    const isGloballyUnique = uniqueResult.isGloballyUnique;
    
    // Make selector globally unique
    bestSelector = makeGloballyUniqueSelector(
      bestSelector,
      isGloballyUnique,
      shadowContext.shadowPath,
      shadowContext.shadowHostSelector,
      shadowContext.foundInShadowDOM
    );
    
    // Get value
    let value = '';
    if (isCustom && tagName === 'button' && associatedSelect) {
      value = (associatedSelect as HTMLSelectElement).value || '';
    } else {
      value = (input as HTMLInputElement).value || '';
    }
    
    // Get selected index
    let selected = -1;
    if (isCustom && tagName === 'button' && associatedSelect) {
      selected = (associatedSelect as HTMLSelectElement).selectedIndex;
    } else if (tagName === 'select') {
      selected = (input as HTMLSelectElement).selectedIndex;
    }
    
    return {
      tagName: input.tagName,
      type: isCustom ? 'select' : type,
      name,
      id,
      value,
      placeholder,
      label,
      checked: (input as HTMLInputElement).checked,
      selected,
      textContent: sanitizeText(input.textContent),
      selectors: [bestSelector],
      bestSelector,
      elementIndex: index,
      isUnique: isGloballyUnique || isScopedUnique,
      isCustomDropdown: isCustom,
      foundInShadowDOM: shadowContext.foundInShadowDOM,
      shadowPath: shadowContext.shadowPath || undefined,
      shadowDepth: shadowContext.shadowDepth || undefined,
      shadowHostSelector: shadowContext.shadowHostSelector || undefined
    };
  });
};

