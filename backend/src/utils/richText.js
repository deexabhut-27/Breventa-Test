import sanitizeHtml from 'sanitize-html';

// Formatting the notes editor can produce. Everything else (scripts, styles, event handlers,
// images, iframes…) is removed before a note is stored.
const OPTIONS = {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'h2', 'h3', 'blockquote', 'code', 'pre', 'a'],
  allowedAttributes: { a: ['href', 'target', 'rel'] }, // target/rel values are always set by transformTags below
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: { a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }) },
};

const EMPTY_PARA = '(?:<p>(?:\\s|&nbsp;|<br\\s*/?>)*</p>)';
const EDGE_EMPTY = new RegExp(`^${EMPTY_PARA}+|${EMPTY_PARA}+$`, 'g');

/** Sanitises editor HTML and drops empty paragraphs at the start and end (left by extra Enter presses). */
export const sanitizeNote = (html) => sanitizeHtml(String(html || ''), OPTIONS).trim().replace(EDGE_EMPTY, '').trim();

/** Plain-text version for previews (cards, live activity). */
export function notePlain(html, max = 280) {
  const text = sanitizeHtml(String(html || '').replace(/<\/(p|li|h2|h3|blockquote)>/gi, ' $&').replace(/<br\s*\/?>/gi, ' '), { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
