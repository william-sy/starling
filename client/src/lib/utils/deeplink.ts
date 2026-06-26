import { IS_TAURI } from './tauri';

export function setupDeepLinks(onAddContact: (pin: string) => void): () => void {
  if (!IS_TAURI) return () => {};

  let unlisten: (() => void) | null = null;

  import('@tauri-apps/api/event').then(({ listen }) => {
    listen<string>('mwt://deep-link', event => {
      const url = event.payload;
      // mwt://add/XXXX-XXXX-XXXX
      const match = url.match(/^mwt:\/\/add\/([A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4})$/i);
      if (match) onAddContact(match[1].toUpperCase());
    }).then(fn => { unlisten = fn; });
  });

  return () => unlisten?.();
}
