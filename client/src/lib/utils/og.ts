import { invoke } from '@tauri-apps/api/core';

export interface OgMeta {
  url:          string;
  domain:       string;
  title?:       string;
  description?: string;
  image?:       string;
}

const cache    = new Map<string, OgMeta | null>();
const inFlight = new Map<string, Promise<OgMeta | null>>();

const URL_RE = /https?:\/\/[^\s<>"]+[^\s<>".,;:!?()[\]{}'"]/gi;

export function extractFirstUrl(text: string): string | null {
  URL_RE.lastIndex = 0;
  return URL_RE.exec(text)?.[0] ?? null;
}

function domainOf(url: string): string {
  return url.replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '');
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function fetchOgNative(url: string): Promise<OgMeta | null> {
  try {
    return await invoke<OgMeta>('fetch_og', { url });
  } catch (e) {
    console.error('[og] native fetch failed:', e);
    return null;
  }
}

async function fetchOgBrowser(url: string): Promise<OgMeta | null> {
  try {
    const resp = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!resp.ok) return { url, domain: domainOf(url) };
    const html = await resp.text();
    const doc  = new DOMParser().parseFromString(html, 'text/html');
    const attr = (sel: string) => doc.querySelector(sel)?.getAttribute('content') ?? undefined;
    return {
      url,
      domain:      domainOf(url),
      title:       attr('meta[property="og:title"]') ?? (doc.title || undefined),
      description: attr('meta[property="og:description"]') ?? attr('meta[name="description"]'),
      image:       attr('meta[property="og:image"]'),
    };
  } catch {
    // CORS blocked - show bare domain chip
    return { url, domain: domainOf(url) };
  }
}

export async function fetchOg(url: string): Promise<OgMeta | null> {
  if (cache.has(url)) return cache.get(url)!;
  if (inFlight.has(url)) return inFlight.get(url)!;

  const p = (async () => {
    const result = isTauri() ? await fetchOgNative(url) : await fetchOgBrowser(url);
    cache.set(url, result);
    return result;
  })();

  inFlight.set(url, p);
  const result = await p;
  inFlight.delete(url);
  return result;
}
