const COLOR_MAP: Record<number, string> = {
  1: 'oklch(0.65 0.22 25)',
  2: 'oklch(0.72 0.18 145)',
  3: 'oklch(0.70 0.18 240)',
  4: 'oklch(0.90 0.18 95)',
  5: 'oklch(0.72 0.22 330)',
  6: 'oklch(0.72 0.20 55)',
  7: 'oklch(0.80 0.14 200)',
  8: 'oklch(0.65 0.18 280)',
  9: 'oklch(0.85 0.15 80)',
};

function applyColorTags(s: string): string {
  const re = /\[c=(\d+)\]/gi;
  let result = '';
  let last   = 0;
  let open   = false;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    result += s.slice(last, m.index);
    if (open) { result += '</span>'; open = false; }
    const idx = parseInt(m[1], 10);
    if (idx !== 0 && COLOR_MAP[idx]) {
      result += `<span style="color:${COLOR_MAP[idx]}">`;
      open = true;
    }
    last = m.index + m[0].length;
  }
  result += s.slice(last);
  if (open) result += '</span>';
  return result;
}

/**
 * Lightweight markdown parser for chat messages.
 * Escapes all user HTML first, then applies our own safe tags only.
 * Supported: **bold**, *italic*, ***bold italic***, ~~strike~~,
 *            `inline code`, ```code block```, auto-linked URLs, newlines,
 *            [c=N] MSN-style color codes (N 1-9).
 */
export function parseMarkdown(raw: string): string {
  if (!raw) return '';

  // 1. Escape user HTML — only our generated tags will survive
  let s = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // 2. Extract fenced code blocks — protect their contents from further parsing
  const blocks: string[] = [];
  s = s.replace(/```([^\n]*)\n?([\s\S]*?)```/g, (_, _lang, code) => {
    blocks.push(`<pre class="md-pre"><code>${code.trim()}</code></pre>`);
    return `\x00B${blocks.length - 1}\x00`;
  });

  // 3. Extract inline code
  const inline: string[] = [];
  s = s.replace(/`([^`\n]+)`/g, (_, code) => {
    inline.push(`<code class="md-code">${code}</code>`);
    return `\x00I${inline.length - 1}\x00`;
  });

  // 3.5. Color codes — after code extraction so [c=N] inside backticks stays literal
  s = applyColorTags(s);

  // 4. Inline formatting (order matters — bold-italic before bold before italic)
  s = s.replace(/\*\*\*([^*\n]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*\n]+)\*/g,     '<em>$1</em>');
  s = s.replace(/~~([^~\n]+)~~/g,     '<del>$1</del>');

  // 5. Auto-link URLs (only http/https)
  s = s.replace(
    /(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]'])/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>',
  );

  // 6. Newlines → <br> (only in non-code content, which has already been extracted)
  s = s.replace(/\n/g, '<br>');

  // 7. Restore code blocks and inline code
  blocks.forEach((b, i) => { s = s.replace(`\x00B${i}\x00`, b); });
  inline.forEach((c, i) => { s = s.replace(`\x00I${i}\x00`, c); });

  return s;
}

/** True when the raw message contains any markdown syntax we recognise */
export function hasMarkdown(raw: string): boolean {
  return /(\*\*|~~|```|`|\bhttps?:\/\/)/.test(raw);
}
