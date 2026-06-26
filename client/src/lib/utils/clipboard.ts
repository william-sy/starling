/**
 * Copies text to the clipboard.
 * Tries the modern async Clipboard API first (requires secure context / HTTPS).
 * Falls back to execCommand for plain-HTTP dev environments and older browsers.
 */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // execCommand fallback: works on non-HTTPS origins, must be called from a user gesture
  const el = document.createElement('textarea');
  el.value = text;
  el.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
  document.body.appendChild(el);
  el.focus();
  el.select();
  try { document.execCommand('copy'); } finally { document.body.removeChild(el); }
}
