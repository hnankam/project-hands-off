/**
 * @fileoverview CSS selector generation utilities
 */

import type { SelectorResult } from './types';

export const generateRobustFallbackSelector = (el: Element): SelectorResult => {
  const tagName = el.tagName.toLowerCase();
  
  // Strategy 1: ID selector
  if (el.id) {
    const idSelector = `#${CSS.escape(el.id)}`;
    const matches = document.querySelectorAll(idSelector);
    if (matches.length === 1 && matches[0] === el) {
      return { selector: idSelector, isUnique: true };
    }
  }
  
  // Strategy 2: Data attributes
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
    
    if (current.className && typeof current.className === 'string') {
      const classes = Array.from(current.classList);
      if (classes.length > 0) {
        const classString = classes.map(cls => CSS.escape(cls)).join('.');
        selector += '.' + classString;
      }
    }
    
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
  
  // Strategy 6: Simple tag + class
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
  
  // Strategy 7: nth-of-type
  const allSameTag = document.querySelectorAll(tagName);
  if (allSameTag.length > 1) {
    const index = Array.from(allSameTag).indexOf(el) + 1;
    const nthSelector = `${tagName}:nth-of-type(${index})`;
    const matches = document.querySelectorAll(nthSelector);
    if (matches.length === 1 && matches[0] === el) {
      return { selector: nthSelector, isUnique: true };
    }
  }
  
  return { selector: tagName, isUnique: false };
};

