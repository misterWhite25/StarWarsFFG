/** Normalize imported emphasis before HTML enrichment, keeping dice tags intact. */
export function normalizeBoldTags(value) {
  return String(value ?? '')
    .replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '<strong>$1</strong>')
    .replace(/\[B\]([\s\S]*?)\[b\]/g, '<strong>$1</strong>');
}
