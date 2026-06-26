import { get } from 'svelte/store';
import { contacts } from '$lib/stores/contacts';
import type { Contact } from '$lib/stores/contacts';
import { messages } from '$lib/stores/chats';
import type { Message } from '$lib/stores/chats';

const SYNC_HISTORY_LIMIT = 200; // messages per thread

const SYNC_EK_PRIV_KEY = 'mwt:pending_ek_priv';
const SYNC_INFO        = new TextEncoder().encode('mwt-device-sync');

function hexToBytes(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++)
    arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return arr;
}

async function deriveKey(sharedSecret: Uint8Array, usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
  const km = await crypto.subtle.importKey('raw', sharedSecret as Uint8Array<ArrayBuffer>, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: SYNC_INFO },
    km,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  );
}

export async function encryptSyncPayload(
  dhPrivHex: string,
  ekPubHex:  string,
): Promise<string> {
  const { x25519 } = await import('@noble/curves/ed25519.js');

  const dhPriv       = hexToBytes(dhPrivHex);
  const ekPub        = hexToBytes(ekPubHex);
  const sharedSecret = x25519.getSharedSecret(dhPriv, ekPub);

  const key = await deriveKey(sharedSecret, 'encrypt');

  // Cap each thread to avoid huge payloads over mobile; most recent messages win
  const rawHistory = get(messages);
  const history: Record<string, Message[]> = {};
  for (const [pin, thread] of Object.entries(rawHistory)) {
    history[pin] = thread.slice(-SYNC_HISTORY_LIMIT);
  }

  const payload = JSON.stringify({
    v:        2,
    contacts: get(contacts),
    history,
  });

  const iv         = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(payload),
  );

  const blob = new Uint8Array(12 + ciphertext.byteLength);
  blob.set(iv, 0);
  blob.set(new Uint8Array(ciphertext), 12);

  let binaryStr = '';
  for (let i = 0; i < blob.length; i++) binaryStr += String.fromCharCode(blob[i]);
  return btoa(binaryStr);
}

export function storePendingEkPriv(privHex: string): void {
  localStorage.setItem(SYNC_EK_PRIV_KEY, privHex);
}

export function clearPendingEkPriv(): void {
  localStorage.removeItem(SYNC_EK_PRIV_KEY);
}

export async function decryptAndImportSync(
  ciphertextB64:  string,
  senderDhPubHex: string,
): Promise<boolean> {
  const ekPrivHex = localStorage.getItem(SYNC_EK_PRIV_KEY);
  if (!ekPrivHex) return false;

  try {
    const { x25519 } = await import('@noble/curves/ed25519.js');

    const ekPriv       = hexToBytes(ekPrivHex);
    const senderDhPub  = hexToBytes(senderDhPubHex);
    const sharedSecret = x25519.getSharedSecret(ekPriv, senderDhPub);

    const key = await deriveKey(sharedSecret, 'decrypt');

    const blob = Uint8Array.from(atob(ciphertextB64), c => c.charCodeAt(0));
    const iv   = blob.slice(0, 12);
    const data = blob.slice(12);

    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    const parsed    = JSON.parse(new TextDecoder().decode(plaintext)) as {
      v: number;
      contacts: Contact[];
      history?: Record<string, Message[]>;
    };

    if (parsed.v !== 1 && parsed.v !== 2) return false;

    if (Array.isArray(parsed.contacts)) {
      contacts.merge(parsed.contacts);
    }

    if (parsed.history && typeof parsed.history === 'object') {
      messages.update(current => {
        const merged: Record<string, Message[]> = { ...parsed.history };
        for (const [pin, thread] of Object.entries(current)) {
          const base = merged[pin] ?? [];
          const ids  = new Set(base.map((m: Message) => m.id));
          merged[pin] = [...base, ...thread.filter((m: Message) => !ids.has(m.id))];
        }
        return merged;
      });
    }

    clearPendingEkPriv();
    return true;
  } catch {
    return false;
  }
}
