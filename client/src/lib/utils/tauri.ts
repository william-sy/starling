import { invoke as tauriInvoke } from '@tauri-apps/api/core';

export const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// Browser-mode stubs for all Tauri commands.
// These run only when the app is opened in a regular browser (e.g. Chrome for a second test account).
// The real Tauri WebView always takes the IS_TAURI path.

const PIN_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randChar  = () => PIN_ALPHA[Math.floor(Math.random() * PIN_ALPHA.length)];
const fakePin   = () => { const s = () => Array.from({ length: 4 }, randChar).join(''); return `${s()}-${s()}-${s()}-${s()}`; };
const fakeHex   = (n: number) => Array.from({ length: n * 2 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

const WORD_POOL = [
  'abbey','abyss','actor','adapt','admit','adobe','adult','ahead','alarm','album',
  'alert','alien','align','alley','alloy','along','altar','amber','amend','angel',
  'annex','anvil','apple','arbor','arena','arrow','ashen','atlas','attic','audit',
  'azure','badge','baker','banjo','baron','basil','batch','birch','bison','blend',
  'bloom','blunt','braid','brave','brisk','broth','brush','budge','build','burst',
  'cabin','cadet','camel','canal','candy','cargo','cedar','chain','chalk','charm',
  'chess','chief','china','chimp','chord','cider','civic','civil','clamp','clasp',
  'class','clean','clear','clerk','cliff','cling','clock','clone','close','cloth',
  'cloud','clove','comet','comic','coral','crane','crest','crisp','cross','crown',
  'curve','cycle','dance','delta','depot','depth','derby','digit','dingo','disco',
  'ditch','dizzy','dodge','draft','drape','drawl','drift','drill','drink','droop',
  'eager','eagle','early','easel','eight','elder','elite','ember','empty','enact',
  'enjoy','epoch','equip','error','event','exact','exile','extra','fable','facet',
  'faint','fancy','feast','fence','ferry','field','fifth','finch','flame','flask',
  'fleet','flesh','flint','flood','floor','floss','flute','foamy','foggy','forge',
  'forte','forum','frail','frame','frank','fraud','fresh','frisk','frost','froze',
  'gleam','globe','gloom','gloss','glove','grace','grade','grain','grand','grant',
  'graph','grasp','grass','gravel','graze','great','green','greet','grind','groan',
  'happy','harbor','harsh','haven','hazel','heist','herbs','hinge','hippo','hoist',
];

function fakeWords(): string[] {
  const pool = [...WORD_POOL];
  const out: string[] = [];
  while (out.length < 24) {
    const i = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

const STUBS: Record<string, (args: any) => unknown> = {
  generate_account: async () => {
    const { x25519 } = await import('@noble/curves/ed25519.js');
    const pin     = fakePin();
    const privKey = x25519.utils.randomSecretKey() as Uint8Array;
    const pubKey  = x25519.getPublicKey(privKey) as Uint8Array;
    const privHex = Array.from(privKey).map((b: number) => b.toString(16).padStart(2, '0')).join('');
    const pubHex  = Array.from(pubKey).map((b: number) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(`mwt:dh_priv:${pin}`, privHex);
    return { pin, words: fakeWords(), sign_key_hex: fakeHex(32), dh_key_hex: pubHex, dh_priv_hex: privHex };
  },

  verify_phrase_word: ({ words, index, guess }: { words: string[]; index: number; guess: string }) =>
    guess.trim().toLowerCase() === words[index],

  restore_account: async ({ req }: { req: { pin: string; words: string[] } }) => {
    const { x25519 } = await import('@noble/curves/ed25519.js');
    const existing = localStorage.getItem(`mwt:dh_priv:${req.pin}`);
    let privKey: Uint8Array;
    if (existing) {
      privKey = new Uint8Array(existing.match(/.{2}/g)!.map(b => parseInt(b, 16)));
    } else {
      privKey = x25519.utils.randomSecretKey() as Uint8Array;
    }
    const privHex = Array.from(privKey).map((b: number) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(`mwt:dh_priv:${req.pin}`, privHex);
    const pubKey  = x25519.getPublicKey(privKey) as Uint8Array;
    const pubHex  = Array.from(pubKey).map((b: number) => b.toString(16).padStart(2, '0')).join('');
    return { sign_key_hex: fakeHex(32), dh_key_hex: pubHex, dh_priv_hex: privHex };
  },

  load_account: () => {
    try   { const r = localStorage.getItem('mwt:account'); return r ? JSON.parse(r) : null; }
    catch { return null; }
  },

  save_account: ({ account }: { account: unknown }) => {
    localStorage.setItem('mwt:account', JSON.stringify(account));
  },

  export_data: ({ filename, json }: { filename: string; json: string }) => {
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    return filename;
  },
  export_webdav: async ({ url, username, password, filename, json }: { url: string; username: string; password: string; filename: string; json: string }) => {
    const uploadUrl = `${url.replace(/\/$/, '')}/${filename}`;
    const resp = await fetch(uploadUrl, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Basic ' + btoa(`${username}:${password}`) },
      body:    json,
    });
    if (!resp.ok && resp.status !== 201) throw new Error(`WebDAV failed: HTTP ${resp.status}`);
  },
};

export async function invoke<T = void>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (IS_TAURI) return tauriInvoke<T>(cmd, args);
  const stub = STUBS[cmd];
  if (!stub) throw new Error(`[browser] no stub for Tauri command: ${cmd}`);
  return stub(args ?? {}) as T;
}
