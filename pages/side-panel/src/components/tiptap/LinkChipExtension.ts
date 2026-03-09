import { Node, mergeAttributes } from '@tiptap/core';

/**
 * LinkChip - atomic node for pasted URLs.
 * Behaves as a single unit: cursor cannot enter it, arrow keys skip over it.
 * Avoids the "empty space" issue when moving cursor backwards into link marks.
 */
export const LinkChip = Node.create({
  name: 'linkChip',

  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      href: {
        default: null,
        parseHTML: (el) => el.getAttribute('href'),
        renderHTML: (attrs) => (attrs.href ? { href: attrs.href } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-link-chip]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const href = node.attrs.href || '#';
    const display = truncateUrl(href);
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-link-chip': '',
        'data-href': href,
        class: 'editor-link-chip',
      }),
      ['a', { href, target: '_blank', rel: 'noopener noreferrer', class: 'editor-link-chip-anchor' }, display],
    ];
  },
});

function truncateUrl(url: string, maxLen = 40): string {
  try {
    const u = new URL(url);
    const host = u.hostname || u.host || '';
    const path = u.pathname + u.search;
    const full = host + path;
    if (full.length <= maxLen) return full;
    return full.slice(0, maxLen - 3) + '...';
  } catch {
    return url.length > maxLen ? url.slice(0, maxLen - 3) + '...' : url;
  }
}
